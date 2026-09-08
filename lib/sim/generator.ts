import { DAY_MS, HOUR_MS, startOfIsoWeek } from '../utils';
import { createRandom, type Random } from './random';
import {
  AGENT_NAMES,
  COMPANY_PREFIXES,
  COMPANY_SUFFIXES,
  DEPLOY_PHASE_ERRORS,
  LATENCY_PRESET_WEIGHTS,
  LLM_WEIGHTS,
  OWNERS,
  REGION_WEIGHTS,
  TEST_PHASE_ERRORS,
  TIER_QUOTAS,
  TIER_SEATS,
  TIER_WEIGHTS,
  USE_CASES,
  VOICES,
} from './fixtures';
import type {
  Agent,
  DeploymentSurface,
  ErrorCode,
  EventMetadata,
  EventStatus,
  EventType,
  Milestone,
  TelemetryEvent,
  Tier,
  Workspace,
} from '../types';

export interface GeneratedDataset {
  workspaces: Workspace[];
  agents: Agent[];
  events: TelemetryEvent[];
}

export function emptyDataset(): GeneratedDataset {
  return { workspaces: [], agents: [], events: [] };
}

export function mergeDatasets(...datasets: GeneratedDataset[]): GeneratedDataset {
  return {
    workspaces: datasets.flatMap((d) => d.workspaces),
    agents: datasets.flatMap((d) => d.agents),
    events: datasets.flatMap((d) => d.events),
  };
}

/**
 * Behavioural archetypes. Each one produces a workspace whose derived state is
 * a specific, recognisable point in the ElevenLabs onboarding funnel.
 */
export const ARCHETYPES = [
  'HAPPY_PATH_FAST',
  'STEADY_CONSUMER',
  'ACTIVATED_RAMPING',
  'SHELFWARE',
  'TESTED_NOT_DEPLOYED',
  'CREATED_NO_TEST',
  'ERROR_BLOCKED',
  'PROVISIONED_ONLY',
  'CHURNED',
  'MULTI_AGENT_MIXED',
  'NEW_IN_PROGRESS',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** Realistic mix used by the batch generator. */
const ARCHETYPE_WEIGHTS: ReadonlyArray<[Archetype, number]> = [
  ['STEADY_CONSUMER', 13],
  ['HAPPY_PATH_FAST', 6],
  ['ACTIVATED_RAMPING', 11],
  ['SHELFWARE', 12],
  ['TESTED_NOT_DEPLOYED', 12],
  ['CREATED_NO_TEST', 13],
  ['ERROR_BLOCKED', 10],
  ['PROVISIONED_ONLY', 7],
  ['CHURNED', 6],
  ['MULTI_AGENT_MIXED', 6],
  ['NEW_IN_PROGRESS', 4],
];

/**
 * Valid workspace age (days since signup) for each archetype. Old cohorts have
 * necessarily resolved into consuming / shelfware / churned states, while the
 * early-funnel archetypes only exist in recent cohorts.
 */
const ARCHETYPE_AGE_RANGE: Record<Archetype, [number, number]> = {
  HAPPY_PATH_FAST: [6, 12],
  STEADY_CONSUMER: [14, 70],
  ACTIVATED_RAMPING: [8, 20],
  SHELFWARE: [24, 70],
  TESTED_NOT_DEPLOYED: [5, 26],
  CREATED_NO_TEST: [3, 22],
  ERROR_BLOCKED: [3, 18],
  PROVISIONED_ONLY: [3, 20],
  CHURNED: [38, 70],
  MULTI_AGENT_MIXED: [22, 70],
  NEW_IN_PROGRESS: [0, 2],
};

/** Archetypes that can plausibly explain a workspace of the given age. */
function archetypesForAge(rnd: Random, ageDays: number): Archetype {
  const eligible = ARCHETYPE_WEIGHTS.filter(([archetype]) => {
    const [min, max] = ARCHETYPE_AGE_RANGE[archetype];
    return ageDays >= min && ageDays <= max;
  });
  if (eligible.length === 0) return rnd.weighted(ARCHETYPE_WEIGHTS);
  return rnd.weighted(eligible);
}

type UsageProfile = 'none' | 'low' | 'healthy' | 'heavy';

interface JourneySpec {
  /** Highest milestone this agent should reach. */
  target: Milestone;
  /** Hours after workspace creation when the agent is created. */
  createdAtOffsetHours: number;
  /** Hours after agent creation before the first test conversation. */
  testDelayHours: number;
  /** Failed test attempts before the first success. */
  failuresBeforeSuccess: number;
  /** Trailing failures with no success after them (drives ERROR_BLOCKED). */
  trailingFailures: number;
  /** Hours after the first successful test before deployment. */
  deployDelayHours: number;
  usage: UsageProfile;
  surface: DeploymentSurface;
  name: string;
}

const USAGE_SETTINGS: Record<
  UsageProfile,
  { callsPerDay: [number, number]; activeDaysPerWeek: [number, number]; creditPct: [number, number] }
> = {
  none: { callsPerDay: [0, 0], activeDaysPerWeek: [0, 0], creditPct: [0, 0] },
  low: { callsPerDay: [1, 3], activeDaysPerWeek: [1, 2], creditPct: [0.01, 0.08] },
  healthy: { callsPerDay: [5, 14], activeDaysPerWeek: [3, 5], creditPct: [0.12, 0.34] },
  heavy: { callsPerDay: [14, 48], activeDaysPerWeek: [5, 7], creditPct: [0.46, 0.88] },
};

/* -------------------------------------------------------------------------- */
/* Identity helpers                                                            */
/* -------------------------------------------------------------------------- */

function hex(rnd: Random, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += rnd.int(0, 15).toString(16);
  return out;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Journey construction                                                        */
/* -------------------------------------------------------------------------- */

interface JourneyOutput {
  agent: Agent;
  events: TelemetryEvent[];
}

function buildAgentJourney(
  rnd: Random,
  workspace: Workspace,
  spec: JourneySpec,
  nowMs: number,
): JourneyOutput {
  const events: TelemetryEvent[] = [];
  const workspaceStart = Date.parse(workspace.createdAt);
  const agentId = `agt_${hex(rnd, 10)}`;
  const voice = rnd.pick(VOICES);
  const llmModel = rnd.weighted(LLM_WEIGHTS);
  const latencyPreset = rnd.weighted(LATENCY_PRESET_WEIGHTS);
  const createdAt = Math.min(nowMs, workspaceStart + spec.createdAtOffsetHours * HOUR_MS);

  const baseLatency =
    latencyPreset === 'low_latency' ? 380 : latencyPreset === 'quality' ? 920 : 610;
  const latency = () => Math.round(rnd.float(baseLatency * 0.75, baseLatency * 1.6));

  const emit = (
    at: number,
    milestone: Milestone,
    eventType: EventType,
    status: EventStatus,
    metadata: EventMetadata,
  ) => {
    if (at > nowMs) return;
    events.push({
      id: `evt_${hex(rnd, 16)}`,
      workspaceId: workspace.id,
      agentId,
      milestone,
      eventType,
      status,
      metadata,
      timestamp: iso(at),
    });
  };

  /* M1 — agent created, voice assigned, prompt configured. */
  emit(createdAt, 'M1_CREATED', 'agent_created', 'success', { llmModel, voiceId: voice.id });
  emit(createdAt + rnd.int(2, 25) * 60_000, 'M1_CREATED', 'voice_assigned', 'success', {
    voiceId: voice.id,
    voiceName: voice.name,
  });
  emit(createdAt + rnd.int(8, 70) * 60_000, 'M1_CREATED', 'prompt_configured', 'success', {
    llmModel,
    latencyPreset,
  });

  let liveConversations = 0;
  let distinctActiveDays = 0;
  let creditConsumptionPct = 0;
  let deployed = false;
  const latencies: number[] = [];

  const wantsTest = spec.target !== 'M1_CREATED' || spec.trailingFailures > 0;
  let firstSuccessAt: number | null = null;

  if (wantsTest) {
    let cursor = createdAt + spec.testDelayHours * HOUR_MS;

    for (let i = 0; i < spec.failuresBeforeSuccess; i += 1) {
      const ms = latency();
      latencies.push(ms);
      emit(cursor, 'M2_TESTED', 'test_conversation', 'error', {
        voiceId: voice.id,
        llmModel,
        latencyMs: ms,
        durationSeconds: rnd.int(1, 8),
        errorDetails: rnd.pick(TEST_PHASE_ERRORS) as ErrorCode,
      });
      cursor += rnd.float(0.4, 6) * HOUR_MS;
    }

    if (spec.target !== 'M1_CREATED') {
      const ms = latency();
      latencies.push(ms);
      emit(cursor, 'M2_TESTED', 'test_conversation', 'success', {
        voiceId: voice.id,
        llmModel,
        latencyMs: ms,
        durationSeconds: rnd.int(14, 180),
      });
      firstSuccessAt = cursor;
      cursor += rnd.float(0.5, 4) * HOUR_MS;

      emit(cursor, 'M2_TESTED', 'simulator_session', 'success', {
        voiceId: voice.id,
        llmModel,
        latencyMs: latency(),
        durationSeconds: rnd.int(20, 240),
      });
    }

    // Trailing failures leave the agent blocked with no success after them.
    for (let i = 0; i < spec.trailingFailures; i += 1) {
      const ms = Math.round(latency() * rnd.float(1.4, 2.6));
      latencies.push(ms);
      emit(cursor, 'M2_TESTED', 'test_conversation', 'error', {
        voiceId: voice.id,
        llmModel,
        latencyMs: ms,
        durationSeconds: rnd.int(1, 9),
        errorDetails: rnd.pick(TEST_PHASE_ERRORS) as ErrorCode,
      });
      cursor += rnd.float(0.3, 9) * HOUR_MS;
    }
  }

  /* M3 — deployment plus live traffic. */
  const wantsDeploy =
    spec.target === 'M3_ACTIVATED' || spec.target === 'M4_CONSUMING';

  if (wantsDeploy && firstSuccessAt !== null) {
    const deployAt = firstSuccessAt + spec.deployDelayHours * HOUR_MS;
    if (deployAt <= nowMs) {
      deployed = true;
      emit(deployAt, 'M3_ACTIVATED', 'deployment', 'success', {
        deploymentSurface: spec.surface,
        latencyMs: latency(),
      });

      // Telephony surfaces occasionally throw a webhook auth error post-deploy.
      if (
        (spec.surface === 'sip_trunk' || spec.surface === 'twilio_telephony') &&
        rnd.bool(0.35)
      ) {
        emit(deployAt + rnd.float(1, 20) * HOUR_MS, 'M3_ACTIVATED', 'webhook_delivery', 'error', {
          errorDetails: rnd.pick(DEPLOY_PHASE_ERRORS) as ErrorCode,
          deploymentSurface: spec.surface,
        });
      }

      /* Daily live-conversation rollups from deployment to today. */
      const settings = USAGE_SETTINGS[spec.usage];
      const firstDay = Math.floor(deployAt / DAY_MS) * DAY_MS;
      const activeDaysPerWeek = rnd.int(...settings.activeDaysPerWeek);
      const weekDayCounter = new Map<number, number>();

      for (let day = firstDay; day <= nowMs; day += DAY_MS) {
        const weekIndex = Math.floor((day - firstDay) / (7 * DAY_MS));
        const usedThisWeek = weekDayCounter.get(weekIndex) ?? 0;
        if (usedThisWeek >= activeDaysPerWeek) continue;
        if (spec.usage === 'none') continue;
        // Spread active days across the week rather than front-loading them.
        if (rnd.bool(0.25) && usedThisWeek > 0) continue;
        weekDayCounter.set(weekIndex, usedThisWeek + 1);

        const count = rnd.int(...settings.callsPerDay);
        if (count <= 0) continue;
        const at = day + rnd.int(9, 19) * HOUR_MS;
        if (at <= deployAt || at > nowMs) continue;

        const ms = latency();
        latencies.push(ms);
        liveConversations += count;
        distinctActiveDays += 1;
        emit(at, 'M3_ACTIVATED', 'live_conversation', 'success', {
          conversationCount: count,
          deploymentSurface: spec.surface,
          latencyMs: ms,
          durationSeconds: rnd.int(35, 400),
        });
      }

      /* Weekly credit-consumption rollups. */
      if (spec.usage !== 'none') {
        const targetPct = rnd.float(...settings.creditPct);
        const weeks = Math.max(1, Math.floor((nowMs - deployAt) / (7 * DAY_MS)));
        for (let w = 1; w <= weeks; w += 1) {
          const at = deployAt + w * 7 * DAY_MS;
          if (at > nowMs) break;
          const pct = (targetPct * w) / weeks;
          creditConsumptionPct = Math.max(creditConsumptionPct, pct);
          emit(at, 'M4_CONSUMING', 'credit_consumption', 'success', {
            creditsUsed: Math.round(workspace.creditQuota * pct),
            conversationCount: liveConversations,
          });
        }
        // Fast-ramp accounts book a consumption rollup before the first full week.
        if (weeks === 1 && spec.usage === 'heavy') {
          const at = Math.min(nowMs, deployAt + 3 * DAY_MS);
          creditConsumptionPct = Math.max(creditConsumptionPct, targetPct);
          emit(at, 'M4_CONSUMING', 'credit_consumption', 'success', {
            creditsUsed: Math.round(workspace.creditQuota * targetPct),
            conversationCount: liveConversations,
          });
        }
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const agent: Agent = {
    id: agentId,
    workspaceId: workspace.id,
    name: spec.name,
    voiceId: voice.id,
    voiceName: voice.name,
    llmModel,
    latencyPreset,
    deploymentSurface: deployed ? spec.surface : 'none',
    createdAt: iso(createdAt),
    liveConversations,
    distinctActiveDays,
    creditConsumptionPct,
    medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    isDraft: !deployed,
  };

  return { agent, events };
}

/* -------------------------------------------------------------------------- */
/* Workspace construction                                                      */
/* -------------------------------------------------------------------------- */

function buildWorkspace(
  rnd: Random,
  ageDays: number,
  nowMs: number,
  tierOverride?: Tier,
): { workspace: Workspace; events: TelemetryEvent[] } {
  const tier = tierOverride ?? rnd.weighted(TIER_WEIGHTS);
  const createdAtMs = nowMs - ageDays * DAY_MS - rnd.int(0, 20) * HOUR_MS;
  const createdAt = iso(createdAtMs);
  const id = `ws_${hex(rnd, 10)}`;
  const [minSeats, maxSeats] = TIER_SEATS[tier];

  const workspace: Workspace = {
    id,
    name: `${rnd.pick(COMPANY_PREFIXES)} ${rnd.pick(COMPANY_SUFFIXES)}`,
    source: 'synthetic',
    tier,
    region: rnd.weighted(REGION_WEIGHTS),
    useCase: rnd.pick(USE_CASES),
    owner: rnd.pick(OWNERS),
    createdAt,
    cohortWeek: startOfIsoWeek(createdAt),
    creditQuota: TIER_QUOTAS[tier],
    seats: rnd.int(minSeats, maxSeats),
  };

  const events: TelemetryEvent[] = [
    {
      id: `evt_${hex(rnd, 16)}`,
      workspaceId: id,
      agentId: null,
      milestone: 'M0_PROVISIONED',
      eventType: 'workspace_provisioned',
      status: 'success',
      metadata: { tier, region: workspace.region },
      timestamp: createdAt,
    },
    {
      id: `evt_${hex(rnd, 16)}`,
      workspaceId: id,
      agentId: null,
      milestone: 'M0_PROVISIONED',
      eventType: 'api_key_generated',
      status: 'success',
      metadata: { keyPrefix: `sk_${hex(rnd, 6)}` },
      timestamp: iso(Math.min(nowMs, createdAtMs + rnd.int(3, 240) * 60_000)),
    },
  ];

  return { workspace, events };
}

function surfaceFor(rnd: Random, tier: Tier): DeploymentSurface {
  if (tier === 'Enterprise' || tier === 'Scale') {
    return rnd.weighted<DeploymentSurface>([
      ['twilio_telephony', 34],
      ['sip_trunk', 30],
      ['react_sdk', 22],
      ['web_widget', 14],
    ]);
  }
  return rnd.weighted<DeploymentSurface>([
    ['web_widget', 42],
    ['react_sdk', 33],
    ['twilio_telephony', 15],
    ['sip_trunk', 10],
  ]);
}

/* -------------------------------------------------------------------------- */
/* Archetype specs                                                             */
/* -------------------------------------------------------------------------- */

interface ArchetypeBlueprint {
  ageDays: number;
  journeys: JourneySpec[];
}

function blueprintFor(
  rnd: Random,
  archetype: Archetype,
  tier: Tier,
  ageDaysOverride?: number,
): ArchetypeBlueprint {
  const surface = surfaceFor(rnd, tier);
  const name = () => rnd.pick(AGENT_NAMES);
  const [minAge, maxAge] = ARCHETYPE_AGE_RANGE[archetype];
  // Clamp any requested age into the archetype's valid window so the derived
  // milestone still matches the archetype's intent.
  const age =
    ageDaysOverride === undefined
      ? rnd.int(minAge, maxAge)
      : Math.min(maxAge, Math.max(minAge, Math.round(ageDaysOverride)));

  switch (archetype) {
    case 'HAPPY_PATH_FAST':
      // M0 -> M4 in five days: graduates through the credit-consumption gate.
      return {
        ageDays: age,
        journeys: [
          {
            target: 'M4_CONSUMING',
            createdAtOffsetHours: rnd.float(0.5, 4),
            testDelayHours: rnd.float(0.3, 3),
            failuresBeforeSuccess: rnd.bool(0.3) ? 1 : 0,
            trailingFailures: 0,
            deployDelayHours: rnd.float(6, 30),
            usage: 'heavy',
            surface,
            name: name(),
          },
        ],
      };

    case 'STEADY_CONSUMER':
      return {
        ageDays: age,
        journeys: [
          {
            target: 'M4_CONSUMING',
            createdAtOffsetHours: rnd.float(1, 30),
            testDelayHours: rnd.float(0.5, 20),
            failuresBeforeSuccess: rnd.int(0, 2),
            trailingFailures: 0,
            deployDelayHours: rnd.float(12, 96),
            usage: 'heavy',
            surface,
            name: name(),
          },
        ],
      };

    case 'ACTIVATED_RAMPING':
      return {
        ageDays: age,
        journeys: [
          {
            target: 'M3_ACTIVATED',
            createdAtOffsetHours: rnd.float(1, 26),
            testDelayHours: rnd.float(0.5, 18),
            failuresBeforeSuccess: rnd.int(0, 2),
            trailingFailures: 0,
            deployDelayHours: rnd.float(10, 70),
            usage: 'healthy',
            surface,
            name: name(),
          },
        ],
      };

    case 'SHELFWARE':
      return {
        ageDays: age,
        journeys: [
          {
            target: 'M3_ACTIVATED',
            createdAtOffsetHours: rnd.float(1, 30),
            testDelayHours: rnd.float(1, 24),
            failuresBeforeSuccess: rnd.int(0, 1),
            trailingFailures: 0,
            deployDelayHours: rnd.float(20, 110),
            usage: 'low',
            surface,
            name: name(),
          },
        ],
      };

    case 'TESTED_NOT_DEPLOYED':
      return {
        ageDays: age,
        journeys: [
          {
            target: 'M2_TESTED',
            createdAtOffsetHours: rnd.float(1, 30),
            testDelayHours: rnd.float(1, 26),
            failuresBeforeSuccess: rnd.int(0, 2),
            trailingFailures: 0,
            deployDelayHours: 0,
            usage: 'none',
            surface: 'none',
            name: name(),
          },
        ],
      };

    case 'CREATED_NO_TEST':
      return {
        ageDays: age,
        journeys: [
          {
            target: 'M1_CREATED',
            createdAtOffsetHours: rnd.float(1, 34),
            testDelayHours: 0,
            failuresBeforeSuccess: 0,
            trailingFailures: 0,
            deployDelayHours: 0,
            usage: 'none',
            surface: 'none',
            name: name(),
          },
        ],
      };

    case 'ERROR_BLOCKED':
      return {
        ageDays: age,
        journeys: [
          {
            target: 'M1_CREATED',
            createdAtOffsetHours: rnd.float(1, 20),
            testDelayHours: rnd.float(1, 16),
            failuresBeforeSuccess: 0,
            trailingFailures: rnd.int(3, 7),
            deployDelayHours: 0,
            usage: 'none',
            surface: 'none',
            name: name(),
          },
        ],
      };

    case 'PROVISIONED_ONLY':
      return { ageDays: age, journeys: [] };

    case 'CHURNED':
      return {
        ageDays: age,
        journeys: [
          {
            target: rnd.bool(0.5) ? 'M1_CREATED' : 'M2_TESTED',
            createdAtOffsetHours: rnd.float(1, 20),
            testDelayHours: rnd.float(1, 12),
            failuresBeforeSuccess: rnd.int(0, 2),
            trailingFailures: 0,
            deployDelayHours: 0,
            usage: 'none',
            surface: 'none',
            name: name(),
          },
        ],
      };

    case 'MULTI_AGENT_MIXED':
      // One agent consuming in production, a second stuck in draft with failures.
      return {
        ageDays: age,
        journeys: [
          {
            target: 'M4_CONSUMING',
            createdAtOffsetHours: rnd.float(1, 20),
            testDelayHours: rnd.float(0.5, 12),
            failuresBeforeSuccess: rnd.int(0, 1),
            trailingFailures: 0,
            deployDelayHours: rnd.float(10, 60),
            usage: 'heavy',
            surface,
            name: name(),
          },
          {
            target: 'M1_CREATED',
            createdAtOffsetHours: rnd.float(240, 420),
            testDelayHours: rnd.float(2, 40),
            failuresBeforeSuccess: 0,
            trailingFailures: rnd.int(3, 5),
            deployDelayHours: 0,
            usage: 'none',
            surface: 'none',
            name: name(),
          },
        ],
      };

    case 'NEW_IN_PROGRESS':
    default:
      return {
        ageDays: age,
        journeys: [
          {
            target: rnd.bool(0.5) ? 'M2_TESTED' : 'M1_CREATED',
            createdAtOffsetHours: rnd.float(0.2, 3),
            testDelayHours: rnd.float(0.2, 4),
            failuresBeforeSuccess: rnd.int(0, 1),
            trailingFailures: 0,
            deployDelayHours: 0,
            usage: 'none',
            surface: 'none',
            name: name(),
          },
        ],
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Public generators                                                           */
/* -------------------------------------------------------------------------- */

export function generateWorkspace(
  rnd: Random,
  archetype: Archetype,
  now: Date = new Date(),
  tierOverride?: Tier,
  ageDaysOverride?: number,
): GeneratedDataset {
  const nowMs = now.getTime();
  const tier = tierOverride ?? rnd.weighted(TIER_WEIGHTS);
  const blueprint = blueprintFor(rnd, archetype, tier, ageDaysOverride);
  const { workspace, events: workspaceEvents } = buildWorkspace(
    rnd,
    blueprint.ageDays,
    nowMs,
    tier,
  );

  const agents: Agent[] = [];
  const events: TelemetryEvent[] = [...workspaceEvents];

  for (const spec of blueprint.journeys) {
    const journey = buildAgentJourney(rnd, workspace, spec, nowMs);
    agents.push(journey.agent);
    events.push(...journey.events);
  }

  return { workspaces: [workspace], agents, events };
}

const COHORT_WEEKS = 10;

/** Spreads `count` workspaces across the last ten signup cohorts. */
function generateAcrossCohorts(rnd: Random, count: number, now: Date): GeneratedDataset[] {
  const datasets: GeneratedDataset[] = [];
  for (let i = 0; i < count; i += 1) {
    const week = i % COHORT_WEEKS;
    const ageDays = week * 7 + rnd.int(0, 6);
    datasets.push(generateWorkspace(rnd, archetypesForAge(rnd, ageDays), now, undefined, ageDays));
  }
  return datasets;
}

export function generateBatch(
  count: number,
  seed = Date.now(),
  now: Date = new Date(),
): GeneratedDataset {
  const rnd = createRandom(seed);
  return mergeDatasets(...generateAcrossCohorts(rnd, count, now));
}

/**
 * Baseline dataset seeded on first run: a spread of cohorts wide enough for the
 * weekly TTFV matrix, with every risk status represented.
 */
export function generateSeedDataset(seed = 20260829, now: Date = new Date()): GeneratedDataset {
  const rnd = createRandom(seed);
  const datasets: GeneratedDataset[] = [];

  // Guaranteed coverage of each archetype so every UI state is populated.
  for (const archetype of ARCHETYPES) {
    datasets.push(generateWorkspace(rnd, archetype, now));
    datasets.push(generateWorkspace(rnd, archetype, now));
  }

  // Two high-touch accounts to exercise the escalation playbook.
  datasets.push(generateWorkspace(rnd, 'ERROR_BLOCKED', now, 'Enterprise'));
  datasets.push(generateWorkspace(rnd, 'SHELFWARE', now, 'Scale'));

  datasets.push(...generateAcrossCohorts(rnd, 96, now));

  return mergeDatasets(...datasets);
}
