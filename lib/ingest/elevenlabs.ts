import { startOfIsoWeek } from '../utils';
import type {
  Agent,
  ErrorCode,
  TelemetryEventInput,
  Workspace,
} from '../types';
import type {
  ConversationSource,
  ElevenLabsAccountSnapshot,
  ElevenLabsAgent,
  ElevenLabsConversation,
} from './elevenlabs-types';

/* -------------------------------------------------------------------------- */
/* Channel classification                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Channels that count as production traffic, and therefore toward M3 Activated.
 *
 * The API reports the channel a conversation arrived on, never whether a real
 * customer was on the other end. Telephony and an embedded widget are only
 * reachable by real end users, so they are treated as production. Every SDK is
 * treated as development: an SDK call is most often the customer's own
 * engineer building the integration, and counting it would hand out M3 to
 * accounts that have never served anyone.
 *
 * The trade-off is deliberate and it under-counts: a customer whose product IS
 * an app with the SDK embedded does serve real users through it. Mis-reporting
 * such an account as M2 is the safer error — it keeps the account visible as
 * an activation target instead of silently marking it won.
 */
const PRODUCTION_SOURCES = new Set<ConversationSource>([
  'widget',
  'sip_trunk',
  'twilio',
  'twilio_sms',
  'exotel',
  'genesys',
  'genesys_bot_connector',
  'avaya',
  'audiocodes',
  'whatsapp',
  'zendesk_integration',
  'slack_integration',
  'telegram_integration',
  'intercom_integration',
  'freshdesk_integration',
  'salesforce_integration',
]);

export function isProductionSource(source: ConversationSource | undefined): boolean {
  return source ? PRODUCTION_SOURCES.has(source) : false;
}

/** Maps a production channel onto the deployment surface shown in the UI. */
export function deploymentSurfaceFor(source: ConversationSource | undefined) {
  switch (source) {
    case 'widget':
      return 'web_widget' as const;
    case 'sip_trunk':
      return 'sip_trunk' as const;
    case 'twilio':
    case 'twilio_sms':
    case 'exotel':
    case 'genesys':
    case 'genesys_bot_connector':
    case 'avaya':
    case 'audiocodes':
      return 'twilio_telephony' as const;
    default:
      return 'none' as const;
  }
}

/* -------------------------------------------------------------------------- */
/* Failure classification                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A conversation the platform stopped on purpose — a configured guardrail
 * firing, or the agent ending the call itself. The call did not break, so it
 * must not be escalated as a platform blocker.
 */
export function isDeliberateStop(reason: string | undefined): boolean {
  if (!reason) return false;
  const text = reason.toLowerCase();
  return text.includes('guardrail') || text.includes('end_call');
}

/**
 * `status: 'failed'` is a transport failure. `call_successful: 'failure'` is the
 * goal evaluation — an agent can complete a call flawlessly and still be scored
 * a failure for not achieving its objective. Only the former is a blocker the
 * rule engine should escalate, so the two are never conflated.
 *
 * A guardrail stop reports as 'failed' too, but it is the customer's own safety
 * rule doing its job. Counting it as breakage would flag working agents as
 * error-blocked and send them a latency runbook they do not need.
 */
export function isTechnicalFailure(conversation: ElevenLabsConversation): boolean {
  if (conversation.status !== 'failed') return false;
  return !isDeliberateStop(conversation.termination_reason);
}

/** Best-effort translation of a termination reason into the error taxonomy. */
export function mapTerminationReason(reason: string | undefined): ErrorCode | undefined {
  if (!reason) return undefined;
  const text = reason.toLowerCase();

  if (text.includes('llm') && text.includes('too long')) return 'LLM Provider Timeout';
  if (text.includes('network error')) return 'WebSocket Disconnect';
  if (text.includes('client disconnected: 1006')) return 'WebSocket Disconnect';
  if (text.includes('sip')) return 'SIP Trunk Timeout';
  if (text.includes('twilio') || text.includes('media stream')) return 'Twilio Media Stream Error';
  if (text.includes('401') || text.includes('unauthor')) return '401 Webhook Auth';
  if (text.includes('429') || text.includes('rate limit')) return '429 Rate Limited';
  if (text.includes('voice') && text.includes('timeout')) return 'ElevenLabs Voice Model Timeout';
  if (text.includes('synthesis') || text.includes('tts')) return 'TTS Synthesis Failure';
  if (text.includes('buffer')) return 'Audio Buffer Underrun';
  if (text.includes('voice id')) return 'Invalid Voice ID';
  return undefined;
}

/** Human-readable reason for a stop that was intentional rather than a fault. */
export function describeDeliberateStop(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const text = reason.toLowerCase();
  if (text.includes('guardrail')) return 'Stopped by a configured guardrail';
  if (text.includes('end_call')) return 'Agent ended the call';
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

/** A test conversation only clears M2 when it ran long enough and did not break. */
const TEST_MIN_DURATION_SECONDS = 10;

function iso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

export interface MappedAccount {
  workspace: Workspace;
  agents: Agent[];
  events: TelemetryEventInput[];
  /** Facts the operator should know about how this account was interpreted. */
  notes: string[];
}

/**
 * Translates one connected ElevenLabs account into the tracker's domain model.
 *
 * Pure: no network, no database. The CLI fetches, this decides.
 */
export function mapAccount(snapshot: ElevenLabsAccountSnapshot): MappedAccount {
  const notes: string[] = [];
  const events: TelemetryEventInput[] = [];
  const workspaceId = snapshot.workspaceId;

  const liveAgents = snapshot.agents.filter((agent) => !agent.archived);

  /* ---- M0: the API exposes no account creation date -------------------- */
  const earliestAgent = liveAgents.reduce<number | null>(
    (earliest, agent) =>
      earliest === null ? agent.created_at_unix_secs : Math.min(earliest, agent.created_at_unix_secs),
    null,
  );
  const provisionedAtIso =
    snapshot.signupAtIso ??
    (earliestAgent !== null ? iso(earliestAgent) : new Date().toISOString());

  if (!snapshot.signupAtIso) {
    notes.push(
      'No workspace creation date is exposed by the API, so M0 falls back to the earliest agent creation. ' +
        'TTFV is therefore measured from first agent, not from signup, and the M0 → M1 leg reads as zero. ' +
        'Pass a real signup date to measure it properly.',
    );
  }

  events.push({
    workspaceId,
    milestone: 'M0_PROVISIONED',
    eventType: 'workspace_provisioned',
    timestamp: provisionedAtIso,
    metadata: { ingestedFrom: 'elevenlabs' },
  });

  /* ---- Conversations grouped by agent ---------------------------------- */
  const byAgent = new Map<string, ElevenLabsConversation[]>();
  for (const conversation of snapshot.conversations) {
    const bucket = byAgent.get(conversation.agent_id) ?? [];
    bucket.push(conversation);
    byAgent.set(conversation.agent_id, bucket);
  }

  const agents: Agent[] = [];
  let productionTotal = 0;

  for (const source of liveAgents) {
    const conversations = (byAgent.get(source.agent_id) ?? []).sort(
      (a, b) => a.start_time_unix_secs - b.start_time_unix_secs,
    );

    /* M1 — the agent exists. */
    events.push({
      workspaceId,
      agentId: source.agent_id,
      milestone: 'M1_CREATED',
      eventType: 'agent_created',
      timestamp: iso(source.created_at_unix_secs),
      metadata: { voiceId: source.voice_id, tags: source.tags ?? [] },
    });

    let productionForAgent = 0;
    let deploymentEmitted = false;
    let surface: ReturnType<typeof deploymentSurfaceFor> = 'none';
    const latencies: number[] = [];

    for (const conversation of conversations) {
      const at = iso(conversation.start_time_unix_secs);
      const production = isProductionSource(conversation.conversation_initiation_source);
      const technicalFailure = isTechnicalFailure(conversation);
      const errorDetails = technicalFailure
        ? mapTerminationReason(conversation.termination_reason)
        : undefined;

      if (production) {
        /* First production traffic implies the agent is deployed on that surface. */
        if (!deploymentEmitted) {
          surface = deploymentSurfaceFor(conversation.conversation_initiation_source);
          events.push({
            workspaceId,
            agentId: source.agent_id,
            milestone: 'M3_ACTIVATED',
            eventType: 'deployment',
            timestamp: at,
            metadata: { deploymentSurface: surface },
          });
          deploymentEmitted = true;
        }
        productionForAgent += 1;
        productionTotal += 1;
        events.push({
          workspaceId,
          agentId: source.agent_id,
          milestone: 'M3_ACTIVATED',
          eventType: 'live_conversation',
          status: technicalFailure ? 'error' : 'success',
          timestamp: at,
          metadata: {
            conversationCount: 1,
            deploymentSurface: surface,
            durationSeconds: conversation.call_duration_secs,
            ...(errorDetails ? { errorDetails } : {}),
          },
        });
      } else {
        /* Development channels count as testing, never as production value. */
        const passes =
          !technicalFailure && conversation.call_duration_secs >= TEST_MIN_DURATION_SECONDS;
        events.push({
          workspaceId,
          agentId: source.agent_id,
          milestone: 'M2_TESTED',
          eventType: 'test_conversation',
          status: passes ? 'success' : technicalFailure ? 'error' : 'warning',
          timestamp: at,
          metadata: {
            durationSeconds: conversation.call_duration_secs,
            channel: conversation.conversation_initiation_source,
            ...(errorDetails ? { errorDetails } : {}),
          },
        });
      }
    }

    agents.push({
      id: source.agent_id,
      workspaceId,
      name: source.name,
      voiceId: source.voice_id,
      // The agent list endpoint reports none of these. Leaving them null makes
      // the UI show "—" rather than presenting a guess as configuration.
      voiceName: null,
      llmModel: null,
      latencyPreset: null,
      deploymentSurface: surface,
      createdAt: iso(source.created_at_unix_secs),
      liveConversations: productionForAgent,
      distinctActiveDays: 0,
      creditConsumptionPct: 0,
      medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
      isDraft: !deploymentEmitted,
    });
  }

  if (productionTotal === 0 && snapshot.conversations.length > 0) {
    notes.push(
      `All ${snapshot.conversations.length} conversations arrived on development channels (SDK or simulator), ` +
        'so none counted toward M3 Activated. The workspace rests at M2 Tested.',
    );
  }

  notes.push(
    'Credit consumption is not read, so the M4 credit gate never fires; only the sustained-volume gate applies.',
  );

  const workspace: Workspace = {
    id: workspaceId,
    name: snapshot.workspaceName,
    source: 'elevenlabs',
    // The API reports no subscription tier or region for the workspace.
    tier: null,
    region: null,
    useCase: 'Connected ElevenLabs account',
    owner: '—',
    createdAt: provisionedAtIso,
    cohortWeek: startOfIsoWeek(provisionedAtIso),
    creditQuota: 0,
    seats: null,
  };

  return { workspace, agents, events, notes };
}
