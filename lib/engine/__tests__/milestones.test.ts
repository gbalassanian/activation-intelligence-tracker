import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveAgent } from '../milestones';
import { RULE_THRESHOLDS } from '../rules';
import type { Agent, TelemetryEvent, Workspace } from '../../types';

const DAY_MS = 86_400_000;
const SIGNUP = Date.UTC(2026, 0, 1);

function at(dayOffset: number, hour = 12): string {
  return new Date(SIGNUP + dayOffset * DAY_MS + hour * 3_600_000).toISOString();
}

const workspace: Workspace = {
  id: 'ws_1',
  name: 'Test Workspace',
  source: 'synthetic',
  tier: 'Pro',
  region: 'NA',
  useCase: 'Customer Support Deflection',
  owner: 'Test Owner',
  createdAt: at(0, 0),
  cohortWeek: '2025-12-29',
  creditQuota: 1_000_000,
  seats: 5,
};

const agent: Agent = {
  id: 'ag_1',
  workspaceId: 'ws_1',
  name: 'Test Agent',
  voiceId: 'voice_1',
  voiceName: 'Test Voice',
  llmModel: 'gpt-4o',
  latencyPreset: 'balanced',
  deploymentSurface: 'web_widget',
  createdAt: at(0, 1),
  liveConversations: 0,
  distinctActiveDays: 0,
  creditConsumptionPct: 0,
  medianLatencyMs: null,
  isDraft: false,
};

let sequence = 0;
function event(
  eventType: TelemetryEvent['eventType'],
  timestamp: string,
  metadata: TelemetryEvent['metadata'] = {},
): TelemetryEvent {
  sequence += 1;
  return {
    id: `evt_${sequence}`,
    workspaceId: workspace.id,
    agentId: agent.id,
    milestone: 'M0_PROVISIONED',
    eventType,
    status: 'success',
    metadata,
    timestamp,
  };
}

/** Events that carry an agent from M0 through M3 within the first few days. */
function throughActivation(): TelemetryEvent[] {
  return [
    event('agent_created', at(0, 1)),
    event('test_conversation', at(0, 2), { durationSeconds: 45 }),
    event('deployment', at(1), { deploymentSurface: 'web_widget' }),
    event('live_conversation', at(1, 13), { conversationCount: 5 }),
  ];
}

/**
 * `count` conversations spread across `days` consecutive days, one event per
 * day, starting at `startDay`.
 */
function spread(startDay: number, days: number, count: number): TelemetryEvent[] {
  const perDay = Math.ceil(count / days);
  return Array.from({ length: days }, (_, i) =>
    event('live_conversation', at(startDay + i, 14), { conversationCount: perDay }),
  );
}

test('M4 fires on sustained usage that starts long after signup', () => {
  // Day 200 is far outside any window anchored to the signup date.
  const events = [...throughActivation(), ...spread(200, 4, RULE_THRESHOLDS.consumingConversations)];
  const derivation = deriveAgent(agent, workspace, events);
  assert.equal(derivation.milestone, 'M4_CONSUMING');
});

test('M4 fires on sustained usage inside the first week', () => {
  const events = [...throughActivation(), ...spread(2, 4, RULE_THRESHOLDS.consumingConversations)];
  const derivation = deriveAgent(agent, workspace, events);
  assert.equal(derivation.milestone, 'M4_CONSUMING');
});

test('volume spread wider than the window does not reach M4', () => {
  // 60 conversations, but no trailing 30-day window holds 50 of them.
  const events = [
    ...throughActivation(),
    ...spread(100, 3, 30),
    ...spread(200, 3, 30),
  ];
  const derivation = deriveAgent(agent, workspace, events);
  assert.equal(derivation.milestone, 'M3_ACTIVATED');
});

test('volume concentrated in too few days does not reach M4', () => {
  const events = [
    ...throughActivation(),
    ...spread(40, RULE_THRESHOLDS.consumingActiveDays - 1, 200),
  ];
  const derivation = deriveAgent(agent, workspace, events);
  assert.equal(derivation.milestone, 'M3_ACTIVATED');
});

test('M4 still requires M3 first', () => {
  // Never deployed, so the activation gate never closes however high volume runs.
  const events = [
    event('agent_created', at(0, 1)),
    event('test_conversation', at(0, 2), { durationSeconds: 45 }),
    ...spread(2, 5, 500),
  ];
  const derivation = deriveAgent(agent, workspace, events);
  assert.equal(derivation.milestone, 'M2_TESTED');
});

test('the credit path to M4 is unaffected by the usage window', () => {
  const events = [
    ...throughActivation(),
    event('credit_consumption', at(300), {
      creditsUsed: workspace.creditQuota * (RULE_THRESHOLDS.consumingCreditPct + 0.1),
    }),
  ];
  const derivation = deriveAgent(agent, workspace, events);
  assert.equal(derivation.milestone, 'M4_CONSUMING');
});

test('milestones never regress once usage stops', () => {
  const events = [
    ...throughActivation(),
    ...spread(10, 4, RULE_THRESHOLDS.consumingConversations),
    // A year of silence, then a single call: still M4, and the reported
    // active-day count reflects the current window, not the peak.
    event('live_conversation', at(400), { conversationCount: 1 }),
  ];
  const derivation = deriveAgent(agent, workspace, events);
  assert.equal(derivation.milestone, 'M4_CONSUMING');
  assert.equal(derivation.distinctActiveDays, 1);
});
