import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapAccount,
  isProductionSource,
  isTechnicalFailure,
  isDeliberateStop,
  mapTerminationReason,
} from '../elevenlabs';
import type { ElevenLabsAccountSnapshot, ElevenLabsConversation } from '../elevenlabs-types';
import { evaluateWorkspace } from '../../engine/health';
import type { Agent, TelemetryEvent } from '../../types';

const DAY = 86_400;
const NOW = Math.floor(Date.UTC(2026, 8, 11) / 1000);

function conversation(
  over: Partial<ElevenLabsConversation> & Pick<ElevenLabsConversation, 'agent_id'>,
): ElevenLabsConversation {
  return {
    conversation_id: `conv_${Math.random().toString(36).slice(2, 10)}`,
    start_time_unix_secs: NOW - 10 * DAY,
    call_duration_secs: 120,
    status: 'done',
    conversation_initiation_source: 'react_sdk',
    ...over,
  };
}

/** Runs the mapper and then the real engine, exactly as the app would. */
function derive(snapshot: ElevenLabsAccountSnapshot) {
  const mapped = mapAccount(snapshot);
  const events: TelemetryEvent[] = mapped.events.map((e, i) => ({
    id: `evt_${i}`,
    workspaceId: e.workspaceId,
    agentId: e.agentId ?? null,
    milestone: e.milestone,
    eventType: e.eventType,
    status: e.status ?? 'success',
    metadata: e.metadata ?? {},
    timestamp: e.timestamp!,
  }));
  const health = evaluateWorkspace(
    mapped.workspace,
    mapped.agents as Agent[],
    events,
    new Date(NOW * 1000),
  );
  return { mapped, health };
}

test('SDK traffic alone never reaches M3, however much of it there is', () => {
  const { health } = derive({
    workspaceId: 'ws_a',
    workspaceName: 'Account A',
    agents: [{ agent_id: 'agent_1', name: 'Intake', voice_id: 'v1', created_at_unix_secs: NOW - 40 * DAY }],
    conversations: Array.from({ length: 25 }, (_, i) =>
      conversation({ agent_id: 'agent_1', start_time_unix_secs: NOW - (30 - i) * DAY }),
    ),
  });
  assert.equal(health.milestone, 'M2_TESTED', 'SDK volume must not be mistaken for production');
});

test('widget traffic past the activation gate reaches M3', () => {
  const { health } = derive({
    workspaceId: 'ws_b',
    workspaceName: 'Account B',
    agents: [{ agent_id: 'agent_1', name: 'Support', voice_id: 'v1', created_at_unix_secs: NOW - 40 * DAY }],
    conversations: [
      conversation({ agent_id: 'agent_1', start_time_unix_secs: NOW - 30 * DAY }),
      ...Array.from({ length: 6 }, (_, i) =>
        conversation({
          agent_id: 'agent_1',
          conversation_initiation_source: 'widget',
          start_time_unix_secs: NOW - (20 - i) * DAY,
        }),
      ),
    ],
  });
  assert.equal(health.milestone, 'M3_ACTIVATED');
  assert.equal(health.agents[0].agent.deploymentSurface, 'web_widget');
});

test('telephony counts as production', () => {
  const { health } = derive({
    workspaceId: 'ws_c',
    workspaceName: 'Account C',
    agents: [{ agent_id: 'agent_1', name: 'Line', voice_id: 'v1', created_at_unix_secs: NOW - 40 * DAY }],
    conversations: Array.from({ length: 6 }, (_, i) =>
      conversation({
        agent_id: 'agent_1',
        conversation_initiation_source: 'sip_trunk',
        start_time_unix_secs: NOW - (20 - i) * DAY,
      }),
    ),
  });
  assert.equal(health.milestone, 'M3_ACTIVATED');
  assert.equal(health.agents[0].agent.deploymentSurface, 'sip_trunk');
});

test('an agent that never held a conversation rests at M1', () => {
  const { health } = derive({
    workspaceId: 'ws_d',
    workspaceName: 'Account D',
    agents: [{ agent_id: 'agent_1', name: 'Unused', voice_id: 'v1', created_at_unix_secs: NOW - 20 * DAY }],
    conversations: [],
  });
  assert.equal(health.milestone, 'M1_CREATED');
});

test('a goal-evaluation failure is not a technical failure', () => {
  // call_successful: 'failure' with status 'done' means the agent missed its
  // objective on a call that ran fine. It must not be escalated as a blocker.
  const quality = conversation({ agent_id: 'a', status: 'done', call_successful: 'failure' });
  const broken = conversation({ agent_id: 'a', status: 'failed', call_successful: 'failure' });
  assert.equal(isTechnicalFailure(quality), false);
  assert.equal(isTechnicalFailure(broken), true);
});

test('repeated technical failures surface as an error-blocked agent', () => {
  const { health } = derive({
    workspaceId: 'ws_e',
    workspaceName: 'Account E',
    agents: [{ agent_id: 'agent_1', name: 'Broken', voice_id: 'v1', created_at_unix_secs: NOW - 12 * DAY }],
    conversations: Array.from({ length: 4 }, (_, i) =>
      conversation({
        agent_id: 'agent_1',
        status: 'failed',
        call_duration_secs: 5,
        termination_reason: 'Generating the LLM response took too long.',
        start_time_unix_secs: NOW - (10 - i) * DAY,
      }),
    ),
  });
  assert.equal(health.status, 'ERROR_BLOCKED');
  assert.match(health.signals[0].diagnostic, /LLM Provider Timeout/);
});

test('a guardrail stop is not a platform failure', () => {
  // The API reports a guardrail stop as status 'failed', but it is the
  // customer's own safety rule doing its job — not breakage to escalate.
  const guardrail = conversation({
    agent_id: 'a',
    status: 'failed',
    termination_reason: "Conversation was stopped because the 'no_pricing' custom guardrail was triggered",
  });
  assert.equal(isDeliberateStop(guardrail.termination_reason), true);
  assert.equal(isTechnicalFailure(guardrail), false);
});

test('repeated guardrail stops never mark an agent error-blocked', () => {
  const { health } = derive({
    workspaceId: 'ws_guard',
    workspaceName: 'Guarded',
    agents: [{ agent_id: 'agent_1', name: 'Guarded', voice_id: 'v1', created_at_unix_secs: NOW - 30 * DAY }],
    conversations: [
      conversation({ agent_id: 'agent_1', start_time_unix_secs: NOW - 25 * DAY }),
      ...Array.from({ length: 5 }, (_, i) =>
        conversation({
          agent_id: 'agent_1',
          status: 'failed',
          termination_reason: "Conversation was stopped because the 'no_pricing' custom guardrail was triggered",
          start_time_unix_secs: NOW - (20 - i) * DAY,
        }),
      ),
    ],
  });
  assert.notEqual(health.status, 'ERROR_BLOCKED');
});

test('workspace milestone is the max across agents, not the average', () => {
  const { health } = derive({
    workspaceId: 'ws_f',
    workspaceName: 'Account F',
    agents: [
      { agent_id: 'live', name: 'Live', voice_id: 'v1', created_at_unix_secs: NOW - 40 * DAY },
      { agent_id: 'idle', name: 'Idle', voice_id: 'v2', created_at_unix_secs: NOW - 10 * DAY },
    ],
    conversations: Array.from({ length: 6 }, (_, i) =>
      conversation({
        agent_id: 'live',
        conversation_initiation_source: 'twilio',
        start_time_unix_secs: NOW - (20 - i) * DAY,
      }),
    ),
  });
  assert.equal(health.milestone, 'M3_ACTIVATED');
  assert.equal(health.agents.find((a) => a.agent.id === 'idle')?.milestone, 'M1_CREATED');
});

test('termination reasons map onto the error taxonomy', () => {
  assert.equal(mapTerminationReason('Generating the LLM response took too long.'), 'LLM Provider Timeout');
  assert.equal(mapTerminationReason('Client disconnected: 1006'), 'WebSocket Disconnect');
  assert.equal(
    mapTerminationReason('No user message received for a long period of time - probably a network error occurred.'),
    'WebSocket Disconnect',
  );
  assert.equal(mapTerminationReason('Client disconnected: 1000'), undefined);
});

test('channel classification splits development from production', () => {
  for (const dev of ['react_sdk', 'js_sdk', 'python_sdk', 'template_preview', 'unknown'] as const) {
    assert.equal(isProductionSource(dev), false, `${dev} must be development`);
  }
  for (const prod of ['widget', 'sip_trunk', 'twilio', 'whatsapp'] as const) {
    assert.equal(isProductionSource(prod), true, `${prod} must be production`);
  }
});

test('the M0 fallback is reported, not hidden', () => {
  const { mapped } = derive({
    workspaceId: 'ws_g',
    workspaceName: 'Account G',
    agents: [{ agent_id: 'a', name: 'A', voice_id: 'v', created_at_unix_secs: NOW - 5 * DAY }],
    conversations: [],
  });
  assert.ok(mapped.notes.some((n) => /No workspace creation date/.test(n)));
});
