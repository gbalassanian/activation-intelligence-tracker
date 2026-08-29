// Server-only module: generates scenarios and commits them to the telemetry log.
import { createRandom } from './random';
import {
  generateBatch,
  generateWorkspace,
  mergeDatasets,
  type GeneratedDataset,
} from './generator';
import { persistDataset } from '../store';
import type { ScenarioId, ScenarioResult } from '../types';

const SCENARIO_COPY: Record<ScenarioId, string> = {
  HAPPY_PATH: 'Workspace provisioned, agent created, tested, deployed, and graduated to M4 Consuming inside five days via the credit-consumption gate.',
  MULTI_AGENT: 'Workspace with a production agent at M4 Consuming plus a second draft agent blocked by repeated test failures — the workspace keeps its M4 status with an "agent stalled" sub-badge.',
  SHELFWARE: 'Workspace deployed to production weeks ago but never scaled past a trickle of calls — flagged Shelfware by the M3 → M4 rule.',
  ERROR_BLOCKED: 'Workspace whose only agent fails every test conversation — flagged Error Blocked with the ElevenLabs error code attached.',
  BATCH_100: 'One hundred workspaces across the full archetype mix, spread over recent signup cohorts.',
};

/** Generates a scenario and commits it to the local telemetry log. */
export function runScenario(scenario: ScenarioId, seed = Date.now()): ScenarioResult {
  const rnd = createRandom(seed);
  const now = new Date();
  let dataset: GeneratedDataset;

  switch (scenario) {
    case 'HAPPY_PATH':
      dataset = generateWorkspace(rnd, 'HAPPY_PATH_FAST', now);
      break;
    case 'MULTI_AGENT':
      dataset = generateWorkspace(rnd, 'MULTI_AGENT_MIXED', now);
      break;
    case 'SHELFWARE':
      dataset = generateWorkspace(rnd, 'SHELFWARE', now);
      break;
    case 'ERROR_BLOCKED':
      dataset = mergeDatasets(generateWorkspace(rnd, 'ERROR_BLOCKED', now));
      break;
    case 'BATCH_100':
    default:
      dataset = generateBatch(100, seed, now);
      break;
  }

  persistDataset(dataset);

  return {
    scenario,
    workspacesCreated: dataset.workspaces.length,
    agentsCreated: dataset.agents.length,
    eventsEmitted: dataset.events.length,
    summary: SCENARIO_COPY[scenario],
  };
}
