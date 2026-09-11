import type { InterventionPlaybook, StalledRule } from '../types';

/**
 * Thresholds for the stalled-account detector. Centralised so the UI can show
 * the exact rule definitions alongside the signals they produce.
 */
export const RULE_THRESHOLDS = {
  /** Hours without milestone progress before an account is considered stalled. */
  noProgressHours: 48,
  /** Consecutive failed test conversations that mark an agent error-blocked. */
  consecutiveTestFailures: 3,
  /** Days at M3 without reaching M4 before an account is shelfware. */
  activatedNotConsumingDays: 14,
  /** Hours at M0 without a first agent before the account is flagged. */
  provisionedNoAgentHours: 48,
  /** Days of total silence before an account is treated as churned. */
  dormantDays: 30,
  /** M3 gate: live conversations required for activation. */
  activationConversations: 5,
  /** M4 gate: live conversations across the sustained-usage window. */
  consumingConversations: 50,
  /** M4 gate: distinct active days required in the window. */
  consumingActiveDays: 3,
  /**
   * M4 gate: length of the sustained-usage window, in days. The window is
   * trailing rather than pinned to the signup date — an account that ramps
   * late still has to clear the same bar, but it is no longer measured
   * against a stretch of calendar it has already passed.
   */
  consumingWindowDays: 30,
  /** M4 alternative gate: share of tier voice credits consumed. */
  consumingCreditPct: 0.4,
  /** M2 gate: minimum successful test-conversation duration. */
  testDurationSeconds: 10,
} as const;

export const STALLED_RULES: StalledRule[] = [
  {
    id: 'CONSECUTIVE_TEST_FAILURES',
    name: 'Repeated test call failures',
    definition: `${RULE_THRESHOLDS.consecutiveTestFailures}+ consecutive failed test conversations on the same agent with no successful run since.`,
    severity: 'critical',
    status: 'ERROR_BLOCKED',
    interventionId: 'LATENCY_OPTIMIZATION_GUIDE',
  },
  {
    id: 'DORMANT_30D',
    name: 'Dormant account',
    definition: `No telemetry of any kind for ${RULE_THRESHOLDS.dormantDays}+ days while below M4 Consuming.`,
    severity: 'critical',
    status: 'CHURNED',
    interventionId: 'REACTIVATION_CAMPAIGN',
  },
  {
    id: 'ACTIVATED_NOT_CONSUMING_14D',
    name: 'Activated without consumption',
    definition: `Reached M3 Activated more than ${RULE_THRESHOLDS.activatedNotConsumingDays} days ago but never graduated to M4 Consuming.`,
    severity: 'high',
    status: 'SHELFWARE',
    interventionId: 'TELEPHONY_SCALING_GUIDE',
  },
  {
    id: 'PROVISIONED_NO_AGENT',
    name: 'Provisioned without an agent',
    definition: `Workspace provisioned more than ${RULE_THRESHOLDS.provisionedNoAgentHours}h ago with no Conversational Agent created.`,
    severity: 'high',
    status: 'STALLED',
    interventionId: 'ONBOARDING_AGENT_BUILDER',
  },
  {
    id: 'NO_PROGRESS_48H',
    name: 'No milestone progress',
    definition: `More than ${RULE_THRESHOLDS.noProgressHours}h since the last milestone advance while below M3 Activated. Above M3 the governing rule is ACTIVATED_NOT_CONSUMING_14D.`,
    severity: 'medium',
    status: 'STALLED',
    interventionId: 'TEST_SIMULATOR_NUDGE',
  },
];

export const STALLED_RULES_BY_ID: Record<string, StalledRule> = Object.fromEntries(
  STALLED_RULES.map((rule) => [rule.id, rule]),
);

/**
 * Remediation playbooks, mapped one-to-one onto the ElevenLabs blockers the
 * detector can identify. `ruleIds` is the routing key from signal to playbook.
 */
export const INTERVENTION_PLAYBOOKS: InterventionPlaybook[] = [
  {
    id: 'TEST_SIMULATOR_NUDGE',
    title: 'Interactive 60s Test Simulator & Starter Voice Prompts',
    trigger: 'No test call after M1 Created',
    description:
      'Agent is configured but has never held a conversation. Send a one-click Web Simulator link pre-loaded with the workspace agent plus three starter system prompts tuned to the declared use case.',
    asset: 'elevenlabs.io/app/simulator?agent={agent_id} + Starter Prompt Pack',
    channel: 'email',
    severity: 'medium',
    ownerRole: 'Adoption Strategist',
    ruleIds: ['NO_PROGRESS_48H'],
    expectedLiftPct: 0.34,
  },
  {
    id: 'LATENCY_OPTIMIZATION_GUIDE',
    title: 'Voice Latency, Audio Buffer & Prompt Optimization Guide',
    trigger: 'Repeated test call failures, agent held at M1',
    description:
      'Agent test conversations are failing repeatedly. Dispatch the latency calibration runbook covering audio buffer sizing, WebSocket keep-alive, LLM provider timeout tuning, and voice model fallback selection.',
    asset: 'Voice Latency Runbook + Recommended latency preset diff',
    channel: 'in_app',
    severity: 'critical',
    ownerRole: 'Solutions Engineer',
    ruleIds: ['CONSECUTIVE_TEST_FAILURES'],
    expectedLiftPct: 0.51,
  },
  {
    id: 'PRODUCTION_DEPLOYMENT_GUIDE',
    title: 'Production Deployment Quickstart — Widget, React SDK & Telephony',
    trigger: 'Tested but never deployed (M2 → M3)',
    description:
      'Agent has a working test conversation but has never gone live. Send the deployment quickstart covering embed snippet generation, React SDK session tokens, and the SIP/Twilio number-provisioning path for the declared use case.',
    asset: 'Deployment Quickstart + copy-paste widget embed snippet',
    channel: 'in_app',
    severity: 'high',
    ownerRole: 'Solutions Engineer',
    ruleIds: ['NO_PROGRESS_48H'],
    expectedLiftPct: 0.29,
  },
  {
    id: 'TELEPHONY_SCALING_GUIDE',
    title: 'Twilio/SIP Telephony Scaling & Production Webhook Best Practices',
    trigger: 'Activated without consumption (M3 → M4)',
    description:
      'Agent is live but traffic never scaled. Deliver the telephony scaling guide: SIP trunk concurrency limits, Twilio media stream tuning, webhook signature verification, and retry/backoff patterns for production load.',
    asset: 'Telephony Scaling Guide + Production Webhook Checklist',
    channel: 'webhook',
    severity: 'high',
    ownerRole: 'Solutions Engineer',
    ruleIds: ['ACTIVATED_NOT_CONSUMING_14D'],
    expectedLiftPct: 0.42,
  },
  {
    id: 'ENTERPRISE_SE_ESCALATION',
    title: 'Escalate to Solutions Engineer / Forward Deployed Strategist',
    trigger: 'Enterprise or Scale account stalled',
    description:
      'High-value account has stalled. Page the assigned Forward Deployed Strategist for a live working session, with the full blocker timeline and agent configuration attached to the escalation.',
    asset: 'Escalation ticket + 45min FDE working session',
    channel: 'slack',
    severity: 'critical',
    ownerRole: 'Forward Deployed Strategist',
    ruleIds: ['NO_PROGRESS_48H', 'CONSECUTIVE_TEST_FAILURES', 'ACTIVATED_NOT_CONSUMING_14D'],
    expectedLiftPct: 0.63,
  },
  {
    id: 'ONBOARDING_AGENT_BUILDER',
    title: 'Guided Agent Builder & Voice Selection Walkthrough',
    trigger: 'Provisioned without creating an agent',
    description:
      'Workspace has API keys but no agent. Send the guided builder flow: voice library shortlist for the use case, a system prompt template, and LLM provider selection guidance.',
    asset: 'Guided Agent Builder + Voice Library shortlist',
    channel: 'email',
    severity: 'high',
    ownerRole: 'Adoption Strategist',
    ruleIds: ['PROVISIONED_NO_AGENT'],
    expectedLiftPct: 0.38,
  },
  {
    id: 'REACTIVATION_CAMPAIGN',
    title: 'Dormant Workspace Reactivation Campaign',
    trigger: 'No telemetry for 30+ days',
    description:
      'Account has gone silent before reaching sustained usage. Enrol in the reactivation sequence with a changelog digest, refreshed credits offer, and a direct booking link to an onboarding clinic.',
    asset: 'Reactivation sequence + credit refresh offer',
    channel: 'email',
    severity: 'medium',
    ownerRole: 'Adoption Strategist',
    ruleIds: ['DORMANT_30D'],
    expectedLiftPct: 0.19,
  },
];

export const PLAYBOOKS_BY_ID: Record<string, InterventionPlaybook> = Object.fromEntries(
  INTERVENTION_PLAYBOOKS.map((playbook) => [playbook.id, playbook]),
);
