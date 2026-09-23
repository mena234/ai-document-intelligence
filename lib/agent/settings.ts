import { env } from 'cloudflare:workers';
import { DEFAULT_MODEL } from './openrouter';

type Settings = { OPENROUTER_API_KEY?: string; OPENROUTER_MODEL?: string };
export function getAISettings() {
  const settings = env as unknown as Settings;
  return {
    key: settings.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
    model:
      settings.OPENROUTER_MODEL ||
      process.env.OPENROUTER_MODEL ||
      DEFAULT_MODEL,
  };
}
