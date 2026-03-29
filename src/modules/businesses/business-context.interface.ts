export interface EvolutionConfig {
  instance: string;
  url: string;
  key: string;
}

export interface BusinessContext {
  sucursalId: string;
  nombre: string;
  agentName: string;
  personality: string;
  timezone: string;
  greeting?: string;
  customPrompt?: string;
  evolution: EvolutionConfig;
  llm: {
    provider: 'openai' | 'anthropic' | 'google';
    model?: string;
    apiKey?: string; // if null, falls back to global ProviderService key
  };
}
