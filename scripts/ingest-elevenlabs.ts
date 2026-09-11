/**
 * Ingests a connected ElevenLabs account into the local telemetry log.
 *
 *   ELEVENLABS_API_KEY=sk_... npm run ingest:elevenlabs -- [--dry-run] [--signup 2026-07-01]
 *
 * Reads agents and conversation metadata only — never transcripts or summaries
 * (`summary_mode=exclude`), because milestone derivation needs timing, duration,
 * channel and failure status, and nothing about what was said.
 */
import { mapAccount } from '../lib/ingest/elevenlabs';
import type {
  ElevenLabsAccountSnapshot,
  ElevenLabsAgent,
  ElevenLabsConversation,
} from '../lib/ingest/elevenlabs-types';
import { insertAgents, insertEvents, insertWorkspaces, syncStalledRules } from '../lib/db/repository';

const API = 'https://api.elevenlabs.io/v1/convai';
const KEY = process.env.ELEVENLABS_API_KEY;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const signupAtIso = (() => {
  const i = args.indexOf('--signup');
  if (i === -1) return undefined;
  const raw = args[i + 1];
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isNaN(parsed)) {
    console.error(`--signup expects an ISO date, got: ${raw ?? '(nothing)'}`);
    process.exit(1);
  }
  return new Date(parsed).toISOString();
})();

if (!KEY) {
  console.error('Set ELEVENLABS_API_KEY to ingest. Find it under ElevenLabs → Profile → API keys.');
  process.exit(1);
}

async function getPage<T>(path: string, params: Record<string, string>): Promise<{ items: T[]; cursor?: string; key: string }> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'xi-api-key': KEY as string } });
  if (!res.ok) {
    throw new Error(`${path} → HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const key = Array.isArray(body.agents) ? 'agents' : 'conversations';
  return { items: (body[key] ?? []) as T[], cursor: body.next_cursor as string | undefined, key };
}

/** Walks every page, guarding against a cursor that never advances. */
async function getAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  let seen = new Set<string>();
  for (;;) {
    const page = await getPage<T>(path, { ...params, ...(cursor ? { cursor } : {}) });
    out.push(...page.items);
    if (!page.cursor || page.items.length === 0) break;
    if (seen.has(page.cursor)) {
      console.warn('  cursor stopped advancing; ending pagination early');
      break;
    }
    seen.add(page.cursor);
    cursor = page.cursor;
    process.stdout.write(`\r  fetched ${out.length} from ${path}…`);
  }
  if (out.length > 0) process.stdout.write('\r');
  return out;
}

async function main() {
  console.log('Fetching agents…');
  const agents = await getAll<ElevenLabsAgent>('/agents', { page_size: '100' });
  console.log(`  ${agents.length} agents`);

  console.log('Fetching conversation metadata (no transcripts)…');
  const conversations = await getAll<ElevenLabsConversation>('/conversations', {
    page_size: '100',
    summary_mode: 'exclude',
  });
  console.log(`  ${conversations.length} conversations`);

  const snapshot: ElevenLabsAccountSnapshot = {
    workspaceId: 'ws_elevenlabs',
    workspaceName: 'Connected ElevenLabs workspace',
    agents,
    conversations,
    signupAtIso,
  };

  const mapped = mapAccount(snapshot);

  const bySource = new Map<string, number>();
  for (const c of conversations) {
    const k = c.conversation_initiation_source ?? 'unknown';
    bySource.set(k, (bySource.get(k) ?? 0) + 1);
  }

  console.log('\nChannels seen:');
  for (const [channel, n] of [...bySource].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${channel.padEnd(24)} ${String(n).padStart(4)}`);
  }

  console.log('\nMapped:');
  console.log(`  ${mapped.agents.length} agents, ${mapped.events.length} telemetry events`);
  for (const note of mapped.notes) console.log(`  note: ${note}`);

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  syncStalledRules();
  insertWorkspaces([mapped.workspace]);
  insertAgents(mapped.agents);
  insertEvents(mapped.events);
  console.log('\nWritten. Open the dashboard and switch the source selector to "Real".');
}

main().catch((error) => {
  console.error('\nIngest failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
