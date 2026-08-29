import type { ErrorCode, LatencyPreset, LlmModel, Region, Tier } from '../types';

export const COMPANY_PREFIXES = [
  'Northwind', 'Helio', 'Corvus', 'Lumen', 'Arcadia', 'Vantage', 'Solstice', 'Meridian',
  'Halcyon', 'Torrent', 'Cobalt', 'Verdant', 'Anvil', 'Kestrel', 'Foundry', 'Beacon',
  'Quanta', 'Aurora', 'Tessera', 'Basalt', 'Cascade', 'Ember', 'Fathom', 'Granite',
  'Ionic', 'Juniper', 'Keystone', 'Lattice', 'Monolith', 'Nimbus', 'Obsidian', 'Pinnacle',
  'Quarry', 'Ridgeline', 'Sable', 'Thicket', 'Umbra', 'Vertex', 'Windrow', 'Zenith',
];

export const COMPANY_SUFFIXES = [
  'Health', 'Logistics', 'Retail', 'Financial', 'Robotics', 'Systems', 'Labs', 'Mobility',
  'Insurance', 'Telecom', 'Energy', 'Travel', 'Commerce', 'Support', 'Networks', 'Dynamics',
];

export const USE_CASES = [
  'Customer Support Deflection',
  'Inbound Sales Qualification',
  'Appointment Scheduling',
  'Outbound Collections',
  'Field Technician Dispatch',
  'Insurance Claims Intake',
  'Order Status & Returns',
  'Patient Intake & Triage',
  'Restaurant Reservations',
  'Roadside Assistance',
  'Tier-1 IT Helpdesk',
  'Loan Application Screening',
];

export const OWNERS = [
  'A. Ferreira', 'M. Okonkwo', 'J. Lindqvist', 'R. Nakamura', 'D. Castellanos',
  'S. Rahman', 'T. Kowalski', 'L. Moreau', 'P. Venkatesan', 'C. Byrne',
];

export const AGENT_NAMES = [
  'Support Concierge', 'Booking Assistant', 'Triage Line', 'Sales Qualifier',
  'Order Tracker', 'Renewal Agent', 'Dispatch Router', 'Claims Intake',
  'After-Hours Line', 'Onboarding Guide', 'Escalation Handler', 'Callback Agent',
  'Payment Reminder', 'Feedback Collector',
];

export const VOICES: Array<{ id: string; name: string }> = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam' },
  { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya' },
];

export const TIER_WEIGHTS: ReadonlyArray<[Tier, number]> = [
  ['Free', 26],
  ['Starter', 24],
  ['Pro', 26],
  ['Scale', 15],
  ['Enterprise', 9],
];

export const TIER_QUOTAS: Record<Tier, number> = {
  Free: 10_000,
  Starter: 30_000,
  Pro: 100_000,
  Scale: 500_000,
  Enterprise: 2_000_000,
};

export const TIER_SEATS: Record<Tier, [number, number]> = {
  Free: [1, 2],
  Starter: [1, 5],
  Pro: [3, 15],
  Scale: [10, 60],
  Enterprise: [25, 400],
};

export const REGION_WEIGHTS: ReadonlyArray<[Region, number]> = [
  ['NA', 46],
  ['EMEA', 31],
  ['APAC', 16],
  ['LATAM', 7],
];

export const LLM_WEIGHTS: ReadonlyArray<[LlmModel, number]> = [
  ['gemini-2.0-flash', 28],
  ['gpt-4o', 22],
  ['claude-sonnet-4', 20],
  ['gpt-4o-mini', 14],
  ['claude-haiku-3.5', 10],
  ['gemini-1.5-pro', 6],
];

export const LATENCY_PRESET_WEIGHTS: ReadonlyArray<[LatencyPreset, number]> = [
  ['balanced', 52],
  ['low_latency', 33],
  ['quality', 15],
];

/** Failure modes grouped by the stage of onboarding they realistically hit. */
export const TEST_PHASE_ERRORS: readonly ErrorCode[] = [
  'ElevenLabs Voice Model Timeout',
  'WebSocket Disconnect',
  'Audio Buffer Underrun',
  'TTS Synthesis Failure',
  'LLM Provider Timeout',
  'Invalid Voice ID',
];

export const DEPLOY_PHASE_ERRORS: readonly ErrorCode[] = [
  'SIP Trunk Timeout',
  '401 Webhook Auth',
  'Twilio Media Stream Error',
  '429 Rate Limited',
  'WebSocket Disconnect',
];
