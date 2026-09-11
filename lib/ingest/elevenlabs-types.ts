/**
 * Shapes returned by the ElevenLabs Conversational AI API, narrowed to the
 * fields this tracker consumes. Transcript and summary fields are deliberately
 * absent: milestone derivation never needs conversation content, so the adapter
 * does not carry it.
 */

/** `conversation_initiation_source` — the channel a conversation arrived on. */
export type ConversationSource =
  | 'unknown'
  | 'android_sdk'
  | 'node_js_sdk'
  | 'react_native_sdk'
  | 'react_sdk'
  | 'js_sdk'
  | 'python_sdk'
  | 'swift_sdk'
  | 'flutter_sdk'
  | 'widget'
  | 'sip_trunk'
  | 'twilio'
  | 'twilio_sms'
  | 'exotel'
  | 'genesys'
  | 'genesys_bot_connector'
  | 'avaya'
  | 'audiocodes'
  | 'whatsapp'
  | 'zendesk_integration'
  | 'slack_integration'
  | 'telegram_integration'
  | 'intercom_integration'
  | 'freshdesk_integration'
  | 'salesforce_integration'
  | 'template_preview'
  | 'subagent_tool';

export interface ElevenLabsAgent {
  agent_id: string;
  name: string;
  voice_id: string;
  tags?: string[];
  created_at_unix_secs: number;
  last_call_time_unix_secs?: number;
  last_7_day_call_count?: number;
  archived?: boolean;
}

export interface ElevenLabsConversation {
  conversation_id: string;
  agent_id: string;
  agent_name?: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  message_count?: number;
  /** Transport-level outcome. 'failed' means the call broke, not that it missed its goal. */
  status: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed';
  /** Goal evaluation, NOT a technical failure. Kept separate on purpose. */
  call_successful?: 'success' | 'failure' | 'unknown' | 'error';
  termination_reason?: string;
  conversation_initiation_source?: ConversationSource;
  main_language?: string;
}

/** Everything the adapter needs about one connected account. */
export interface ElevenLabsAccountSnapshot {
  /** Stable identifier for the connected workspace. */
  workspaceId: string;
  workspaceName: string;
  agents: ElevenLabsAgent[];
  conversations: ElevenLabsConversation[];
  /** Optional: the real signup date, if the operator supplies one. */
  signupAtIso?: string;
}
