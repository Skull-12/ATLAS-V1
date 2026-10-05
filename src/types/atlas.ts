export type AICoreState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type KnowledgeSourceType = 'ai_knowledge' | 'web_search' | 'local_system';

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ActionLink {
  label: string;
  url: string;
  domain: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'atlas';
  text: string;
  timestamp: string;
  sourceType?: KnowledgeSourceType;
  sources?: GroundingSource[];
  searchQueries?: string[];
  commandCategory?: string;
  actionLink?: ActionLink;
  calculationResult?: {
    expression: string;
    result: string;
  };
  isError?: boolean;
}

export interface VoiceSettings {
  voiceURI: string;
  rate: number;
  pitch: number;
  autoSpeak: boolean;
  darkMode: boolean;
  webSearchEnabled: boolean;
}

export interface SystemHealthStatus {
  online: boolean;
  aiConfigured: boolean;
  model: string;
  searchAvailable: boolean;
}

export interface CommandPreset {
  id: string;
  label: string;
  prompt: string;
  category: 'time' | 'date' | 'search' | 'explain' | 'calculate' | 'joke' | 'open' | 'summary' | 'capabilities';
  description: string;
}

export interface CommandExecutionResult {
  handledLocally: boolean;
  reply?: string;
  sourceType?: KnowledgeSourceType;
  commandCategory?: string;
  forceSearch?: boolean;
  transformedPrompt?: string;
  actionLink?: ActionLink;
  calculationResult?: {
    expression: string;
    result: string;
  };
  uiAction?: 'open_settings' | 'open_conversation' | 'clear_conversation' | 'toggle_dark_mode';
}
