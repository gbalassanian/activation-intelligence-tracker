'use server';

import { revalidatePath } from 'next/cache';
import { truncateAll } from '@/lib/db/client';
import { recordIntervention } from '@/lib/db/repository';
import { dispatchTarget } from '@/lib/engine/interventions';
import { PLAYBOOKS_BY_ID } from '@/lib/engine/rules';
import { runScenario } from '@/lib/sim/runner';
import { ensureSeeded, getWorkspaceHealths } from '@/lib/store';
import { INTERVENTION_IDS, SCENARIOS, type InterventionId, type ScenarioId } from '@/lib/types';

const ACTOR = 'adoption.strategist@elevenlabs.io';

function revalidateAll(): void {
  revalidatePath('/dashboard/funnel');
  revalidatePath('/dashboard/live-feed');
  revalidatePath('/dashboard/interventions');
  revalidatePath('/simulator');
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * One-click action simulator: dispatches a mock webhook/email/Slack event for a
 * playbook and appends the delivery to the immutable audit log.
 */
export async function dispatchInterventionAction(
  interventionId: string,
  workspaceId: string,
  reason: string,
): Promise<ActionResult> {
  if (!INTERVENTION_IDS.includes(interventionId as InterventionId)) {
    return { ok: false, message: `Unknown playbook: ${interventionId}` };
  }

  ensureSeeded();
  const health = getWorkspaceHealths().find((item) => item.workspace.id === workspaceId);
  if (!health) {
    return { ok: false, message: `Unknown workspace: ${workspaceId}` };
  }

  const playbook = PLAYBOOKS_BY_ID[interventionId];
  const target = dispatchTarget(interventionId as InterventionId, workspaceId);

  recordIntervention({
    workspaceId,
    workspaceName: health.workspace.name,
    interventionId: interventionId as InterventionId,
    channel: playbook.channel,
    status: 'dispatched',
    target,
    note: reason || playbook.trigger,
    actor: ACTOR,
  });

  revalidateAll();
  return {
    ok: true,
    message: `${playbook.title} dispatched to ${health.workspace.name} via ${playbook.channel}.`,
  };
}

/** Dispatches a playbook to every workspace currently routed to it. */
export async function dispatchPlaybookBatchAction(
  interventionId: string,
  entries: Array<{ workspaceId: string; reason: string }>,
): Promise<ActionResult> {
  if (!INTERVENTION_IDS.includes(interventionId as InterventionId)) {
    return { ok: false, message: `Unknown playbook: ${interventionId}` };
  }

  ensureSeeded();
  const healths = getWorkspaceHealths();
  const playbook = PLAYBOOKS_BY_ID[interventionId];
  let sent = 0;

  for (const entry of entries) {
    const health = healths.find((item) => item.workspace.id === entry.workspaceId);
    if (!health) continue;
    recordIntervention({
      workspaceId: entry.workspaceId,
      workspaceName: health.workspace.name,
      interventionId: interventionId as InterventionId,
      channel: playbook.channel,
      status: 'dispatched',
      target: dispatchTarget(interventionId as InterventionId, entry.workspaceId),
      note: entry.reason || playbook.trigger,
      actor: ACTOR,
    });
    sent += 1;
  }

  revalidateAll();
  return {
    ok: sent > 0,
    message:
      sent > 0
        ? `${playbook.title} dispatched to ${sent} workspace${sent === 1 ? '' : 's'}.`
        : 'Nothing to dispatch — every target was already contacted this week.',
  };
}

/** Generates a synthetic scenario and commits its telemetry. */
export async function runScenarioAction(scenario: string): Promise<ActionResult> {
  if (!SCENARIOS.includes(scenario as ScenarioId)) {
    return { ok: false, message: `Unknown scenario: ${scenario}` };
  }

  ensureSeeded();
  const result = runScenario(scenario as ScenarioId);
  revalidateAll();

  return {
    ok: true,
    message: `${result.workspacesCreated} workspace${result.workspacesCreated === 1 ? '' : 's'}, ${result.agentsCreated} agent${result.agentsCreated === 1 ? '' : 's'} and ${result.eventsEmitted} telemetry events ingested. ${result.summary}`,
  };
}

/** Wipes the local dataset; the baseline seed is regenerated on next read. */
export async function resetDatasetAction(): Promise<ActionResult> {
  truncateAll();
  ensureSeeded();
  revalidateAll();
  return { ok: true, message: 'Dataset reset and reseeded from the baseline generator.' };
}
