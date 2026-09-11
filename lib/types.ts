/**
 * Core domain model for the ElevenLabs Adoption & Operations Control Center.
 *
 * Entity relationship: a Workspace (customer account) has 1:N ElevenLabs Agents.
 * Milestones are linear and monotonic per agent; a workspace's funnel stage is
 * the MAX milestone achieved by any of its agents.
 */

/* -------------------------------------------------------------------------- */
/* Milestones                                                                  */
/* -------------------------------------------------------------------------- */

export const MILESTONES = [
  'M0_PROVISIONED',
  'M1_CREATED',
  'M2_TESTED',
  'M3_ACTIVATED',
  'M4_CONSUMING',
] as const;

export type Milestone = (typeof MILESTONES)[number];

/** Ordinal rank used for MAX(agent_milestone) resolution and drop-off math. */
export const MILESTONE_RANK: Record<Milestone, number> = {
  M0_PROVISIONED: 0,
  M1_CREATED: 1,
  M2_TESTED: 2,
  M3_ACTIVATED: 3,
  M4_CONSUMING: 4,
};

export const MILESTONE_LABEL: Record<Milestone, string> = {
  M0_PROVISIONED: 'Provisioned',
  M1_CREATED: 'Created',
  M2_TESTED: 'Tested',
  M3_ACTIVATED: 'Activated',
  M4_CONSUMING: 'Consuming',
};

export const MILESTONE_SHORT: Record<Milestone, string> = {
  M0_PROVISIONED: 'M0',
  M1_CREATED: 'M1',
  M2_TESTED: 'M2',
  M3_ACTIVATED: 'M3',
  M4_CONSUMING: 'M4',
};

export const MILESTONE_DESCRIPTION: Record<Milestone, string> = {
  M0_PROVISIONED:
    'Workspace created, subscription tier selected, and API keys generated.',
  M1_CREATED:
    'First Conversational Agent created — Voice ID assigned, system prompt configured, LLM provider and latency preset selected.',
  M2_TESTED:
    'Aha moment: first successful test conversation in the Web Simulator or SDK test bench (>10s, zero synthesis or WebSocket errors).',
  M3_ACTIVATED:
    'Technical value: agent deployed to production via Web Widget, React SDK, or SIP/Twilio telephony with at least 5 live conversations.',
  M4_CONSUMING:
    'Business value and habit: sustained usage in any trailing 30-day window — 50+ live conversations across 3+ distinct active days, or >40% voice tier credit consumption.',
};

/* -------------------------------------------------------------------------- */
/* Workspace                                                                   */
/* -------------------------------------------------------------------------- */

export const TIERS = ['Free', 'Starter', 'Pro', 'Scale', 'Enterprise'] as const;
export type Tier = (typeof TIERS)[number];

export const REGIONS = ['NA', 'EMEA', 'APAC', 'LATAM'] as const;
export type Region = (typeof REGIONS)[number];

/**
 * Where a workspace's telemetry came from. The engine treats both identically —
 * this exists so aggregate metrics are never silently computed over a blend of
 * fabricated and real accounts.
 */
export const WORKSPACE_SOURCES = ['synthetic', 'elevenlabs'] as const;
export type WorkspaceSource = (typeof WORKSPACE_SOURCES)[number];

/** Selector state for scoping every view. */
export const SOURCE_SCOPES = ['all', 'synthetic', 'elevenlabs'] as const;
export type SourceScope = (typeof SOURCE_SCOPES)[number];

export const SOURCE_SCOPE_LABEL: Record<SourceScope, string> = {
  all: 'All sources',
  synthetic: 'Synthetic',
  elevenlabs: 'Real workspaces',
};

export interface Workspace {
  id: string;
  name: string;
  /** 'synthetic' for generated data, 'elevenlabs' for a connected account. */
  source: WorkspaceSource;
  /**
   * Null when the source system does not report it. The ElevenLabs API exposes
   * no subscription tier, region or seat count, and guessing one would put an
   * invented plan on a real customer.
   */
  tier: Tier | null;
  region: Region | null;
  /** Primary use case declared at signup, e.g. "Customer Support Deflection". */
  useCase: string;
  /** Named adoption strategist / SE owning the account. */
  owner: string;
  /** ISO-8601. M0 timestamp — the origin for all TTFV math. */
  createdAt: string;
  /** ISO-8601 Monday of the signup week; the cohort bucket key. */
  cohortWeek: string;
  /** Monthly voice credits included in the tier. */
  creditQuota: number;
  seats: number | null;
}

/* -------------------------------------------------------------------------- */
/* Agent                                                                       */
/* -------------------------------------------------------------------------- */

export const LLM_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'claude-sonnet-4',
  'claude-haiku-3.5',
  'gpt-4o',
  'gpt-4o-mini',
] as const;
export type LlmModel = (typeof LLM_MODELS)[number];

export const DEPLOYMENT_SURFACES = [
  'web_widget',
  'react_sdk',
  'sip_trunk',
  'twilio_telephony',
  'none',
] as const;
export type DeploymentSurface = (typeof DEPLOYMENT_SURFACES)[number];

export const DEPLOYMENT_LABEL: Record<DeploymentSurface, string> = {
  web_widget: 'Web Widget',
  react_sdk: 'React SDK',
  sip_trunk: 'SIP Trunk',
  twilio_telephony: 'Twilio Telephony',
  none: 'Not deployed',
};

export const LATENCY_PRESETS = ['balanced', 'low_latency', 'quality'] as const;
export type LatencyPreset = (typeof LATENCY_PRESETS)[number];

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  /** ElevenLabs Voice ID assigned to the agent. */
  voiceId: string;
  /** Null when the source system did not report it (e.g. an ingested account). */
  voiceName: string | null;
  llmModel: LlmModel | null;
  latencyPreset: LatencyPreset | null;
  deploymentSurface: DeploymentSurface;
  /** ISO-8601 — when the agent record itself was created (M1 for the first agent). */
  createdAt: string;
  /** Denormalised counters maintained by the telemetry engine. */
  liveConversations: number;
  distinctActiveDays: number;
  creditConsumptionPct: number;
  /** Median end-to-end voice latency observed across test/live calls, in ms. */
  medianLatencyMs: number | null;
  isDraft: boolean;
}

/* -------------------------------------------------------------------------- */
/* Telemetry events (immutable append-only log)                                */
/* -------------------------------------------------------------------------- */

export const EVENT_TYPES = [
  'workspace_provisioned',
  'api_key_generated',
  'agent_created',
  'voice_assigned',
  'prompt_configured',
  'test_conversation',
  'simulator_session',
  'deployment',
  'live_conversation',
  'webhook_delivery',
  'credit_consumption',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type EventStatus = 'success' | 'error' | 'warning';

/** ElevenLabs-specific failure taxonomy surfaced in diagnostics. */
export const ERROR_CODES = [
  '401 Webhook Auth',
  '429 Rate Limited',
  'ElevenLabs Voice Model Timeout',
  'WebSocket Disconnect',
  'SIP Trunk Timeout',
  'Audio Buffer Underrun',
  'TTS Synthesis Failure',
  'LLM Provider Timeout',
  'Invalid Voice ID',
  'Twilio Media Stream Error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface EventMetadata {
  voiceId?: string;
  llmModel?: LlmModel;
  latencyMs?: number;
  durationSeconds?: number;
  errorDetails?: ErrorCode;
  deploymentSurface?: DeploymentSurface;
  creditsUsed?: number;
  conversationCount?: number;
  [key: string]: unknown;
}

export interface TelemetryEvent {
  id: string;
  workspaceId: string;
  agentId: string | null;
  milestone: Milestone;
  eventType: EventType;
  status: EventStatus;
  metadata: EventMetadata;
  /** ISO-8601. */
  timestamp: string;
}

/** Shape accepted by the ingestion API — id and timestamp are optional. */
export interface TelemetryEventInput {
  id?: string;
  workspaceId: string;
  agentId?: string | null;
  milestone: Milestone;
  eventType: EventType;
  status?: EventStatus;
  metadata?: EventMetadata;
  timestamp?: string;
}

/* -------------------------------------------------------------------------- */
/* Derived health / risk model                                                 */
/* -------------------------------------------------------------------------- */

export const RISK_STATUSES = [
  'OPTIMAL',
  'STALLED',
  'ERROR_BLOCKED',
  'SHELFWARE',
  'CHURNED',
] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const RISK_LABEL: Record<RiskStatus, string> = {
  OPTIMAL: 'Optimal',
  STALLED: 'Stalled (>48h)',
  ERROR_BLOCKED: 'Error Blocked',
  SHELFWARE: 'Shelfware',
  CHURNED: 'Churned',
};

export const STALLED_RULE_IDS = [
  'NO_PROGRESS_48H',
  'CONSECUTIVE_TEST_FAILURES',
  'ACTIVATED_NOT_CONSUMING_14D',
  'PROVISIONED_NO_AGENT',
  'DORMANT_30D',
] as const;
export type StalledRuleId = (typeof STALLED_RULE_IDS)[number];

export interface StalledRule {
  id: StalledRuleId;
  name: string;
  /** Human-readable rule definition shown in the UI. */
  definition: string;
  severity: 'critical' | 'high' | 'medium';
  /** Risk status applied to the workspace when the rule fires. */
  status: RiskStatus;
  interventionId: InterventionId;
}

/** A fired rule, bound to the workspace/agent that tripped it. */
export interface RiskSignal {
  ruleId: StalledRuleId;
  ruleName: string;
  severity: StalledRule['severity'];
  status: RiskStatus;
  /** Monospace root-cause string, e.g. "3x test call failures — SIP Trunk Timeout". */
  diagnostic: string;
  agentId: string | null;
  agentName: string | null;
  interventionId: InterventionId;
}

export interface AgentHealth {
  agent: Agent;
  milestone: Milestone;
  /** ISO-8601 of the most recent event of any kind. */
  lastEventAt: string | null;
  hoursSinceLastEvent: number;
  consecutiveTestFailures: number;
  lastErrorCode: ErrorCode | null;
  /** Per-milestone first-achievement timestamps (ISO-8601). */
  milestoneTimestamps: Partial<Record<Milestone, string>>;
  isStalled: boolean;
}

export interface WorkspaceHealth {
  workspace: Workspace;
  agents: AgentHealth[];
  /** MAX(agent_milestone) across all agents — the workspace funnel stage. */
  milestone: Milestone;
  status: RiskStatus;
  signals: RiskSignal[];
  /** Secondary badge text such as "Active (1 agent stalled)". */
  subStatus: string | null;
  /** Hours from workspace creation to the first agent being created (M1). */
  timeToFirstAgentHours: number | null;
  /** Hours from workspace creation to the first agent reaching M2_TESTED. */
  ttfvHours: number | null;
  /** Hours from workspace creation to the first agent reaching M3_ACTIVATED. */
  timeToActivationHours: number | null;
  /** Hours from workspace creation to the first agent reaching M4_CONSUMING. */
  timeToConsumingHours: number | null;
  hoursSinceLastEvent: number;
  lastEventAt: string | null;
  ageHours: number;
  totalLiveConversations: number;
  stalledAgentCount: number;
  activeAgentCount: number;
  draftAgentCount: number;
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                     */
/* -------------------------------------------------------------------------- */

export interface FunnelStage {
  milestone: Milestone;
  label: string;
  short: string;
  description: string;
  /** Workspaces that reached this milestone or beyond. */
  reached: number;
  /** Workspaces whose furthest milestone is exactly this one. */
  restingHere: number;
  /** reached / total workspaces. */
  conversionFromStart: number;
  /** reached / previous stage reached. */
  conversionFromPrevious: number;
  /** 1 - conversionFromPrevious. */
  dropOffRate: number;
  /** Count lost between the previous stage and this one. */
  dropOffCount: number;
  /**
   * The drop-off split by whether it is real. A workspace resting at the
   * previous stage with a fired rule is genuinely stuck; one with no fired rule
   * is simply still moving through the funnel and has not arrived yet. Counting
   * both as loss overstates the leak, most of all at M4 where the consumption
   * gate spans a 30-day window.
   */
  dropOffStalled: number;
  dropOffInFlight: number;
  /** Median hours from M0 to reaching this stage. */
  medianHoursFromStart: number | null;
  /** Dominant blocker among workspaces resting at this stage. */
  topBlocker: string | null;
}

export interface CohortRow {
  /** ISO date of the cohort's Monday. */
  week: string;
  label: string;
  workspaces: number;
  medianTtfvHours: number | null;
  p90TtfvHours: number | null;
  medianTimeToActivationHours: number | null;
  medianTimeToConsumingHours: number | null;
  testedRate: number;
  activationRate: number;
  consumingRate: number;
  atRisk: number;
  /** Delta in median TTFV vs. the previous cohort (negative = faster). */
  ttfvDeltaHours: number | null;
}

export interface ExecutiveMetrics {
  totalWorkspaces: number;
  medianTtfvHours: number | null;
  p90TtfvHours: number | null;
  /**
   * Median hours from M0 to the first agent reaching M3 Activated. Tracked
   * beside TTFV because the two measure different things: TTFV is friction in
   * the product itself, while time-to-production also carries the customer's
   * own deploy timeline.
   */
  medianTimeToActivationHours: number | null;
  /** M0 -> M3 conversion. */
  fullActivationRate: number;
  /** M0 -> M4 conversion. */
  consumingGraduationRate: number;
  atRiskCount: number;
  atRiskRate: number;
  totalAgents: number;
  stalledAgents: number;
  /** Workspaces whose TTFV landed inside the current week. */
  newlyActivatedThisWeek: number;
  statusCounts: Record<RiskStatus, number>;
  tierBreakdown: Array<{ tier: Tier; workspaces: number; activationRate: number; atRisk: number }>;
  /** Workspaces whose tier the source system never reported. */
  unknownTierWorkspaces: number;
}

/* -------------------------------------------------------------------------- */
/* Interventions                                                               */
/* -------------------------------------------------------------------------- */

export const INTERVENTION_IDS = [
  'TEST_SIMULATOR_NUDGE',
  'LATENCY_OPTIMIZATION_GUIDE',
  'PRODUCTION_DEPLOYMENT_GUIDE',
  'TELEPHONY_SCALING_GUIDE',
  'ENTERPRISE_SE_ESCALATION',
  'ONBOARDING_AGENT_BUILDER',
  'REACTIVATION_CAMPAIGN',
] as const;
export type InterventionId = (typeof INTERVENTION_IDS)[number];

export type InterventionChannel = 'email' | 'webhook' | 'in_app' | 'slack';

export interface InterventionPlaybook {
  id: InterventionId;
  title: string;
  /** The ElevenLabs blocker this playbook is mapped to. */
  trigger: string;
  description: string;
  /** Concrete asset dispatched to the customer. */
  asset: string;
  channel: InterventionChannel;
  severity: 'critical' | 'high' | 'medium';
  ownerRole: string;
  /** Rules that route into this playbook. */
  ruleIds: StalledRuleId[];
  expectedLiftPct: number;
}

export interface InterventionCandidate {
  playbook: InterventionPlaybook;
  workspaces: WorkspaceHealth[];
  /** Signals that routed each workspace here, keyed by workspace id. */
  reasons: Record<string, string>;
}

export type InterventionOutcome = 'dispatched' | 'failed';

export interface InterventionRecord {
  id: string;
  workspaceId: string;
  workspaceName: string;
  interventionId: InterventionId;
  channel: InterventionChannel;
  status: InterventionOutcome;
  /** Mock webhook/email target the dispatch was delivered to. */
  target: string;
  note: string;
  actor: string;
  dispatchedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Simulator                                                                   */
/* -------------------------------------------------------------------------- */

export const SCENARIOS = [
  'HAPPY_PATH',
  'MULTI_AGENT',
  'SHELFWARE',
  'ERROR_BLOCKED',
  'BATCH_100',
] as const;
export type ScenarioId = (typeof SCENARIOS)[number];

export interface ScenarioResult {
  scenario: ScenarioId;
  workspacesCreated: number;
  agentsCreated: number;
  eventsEmitted: number;
  summary: string;
}
