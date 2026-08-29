/**
 * CLI seeder: `npm run seed [count]`.
 *
 * The app also seeds itself on first read, so this is only needed to reseed a
 * reset database or to generate a larger dataset for load testing.
 */
import { countWorkspaces } from '../lib/db/repository';
import { insertAgents, insertEvents, insertWorkspaces, syncStalledRules } from '../lib/db/repository';
import { generateBatch, generateSeedDataset } from '../lib/sim/generator';
import { DB_PATH } from '../lib/db/client';

const requested = Number.parseInt(process.argv[2] ?? '', 10);
const dataset = Number.isFinite(requested) && requested > 0
  ? generateBatch(requested)
  : generateSeedDataset();

syncStalledRules();
insertWorkspaces(dataset.workspaces);
insertAgents(dataset.agents);
insertEvents(dataset.events);

console.log(`Seeded ${DB_PATH}`);
console.log(
  `  +${dataset.workspaces.length} workspaces, +${dataset.agents.length} agents, +${dataset.events.length} telemetry events`,
);
console.log(`  ${countWorkspaces()} workspaces total`);
