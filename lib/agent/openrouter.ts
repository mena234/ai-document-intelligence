export const DEFAULT_MODEL = 'z-ai/glm-5.3-flash';

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};
export type AssistantMessage = {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
  reasoning_details?: unknown[];
};

// Server transport only. Secrets come from Sites runtime bindings, never UI input.
export async function callOpenRouter(
  payload: Record<string, unknown>,
  signal: AbortSignal,
  settings: { key?: string; model: string },
  fetcher: typeof fetch = fetch,
): Promise<AssistantMessage> {
  if (!settings.key) throw new Error('AI_NOT_CONFIGURED');
  const response = await fetcher(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.key}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': 'AI Document Intelligence Agent',
      },
      body: JSON.stringify({
        ...payload,
        model: settings.model,
        stream: false,
        provider: { require_parameters: true, sort: 'throughput' },
        reasoning: { effort: 'low' },
      }),
      signal,
    },
  );
  if (!response.ok) {
    const code =
      response.status === 429
        ? 'AI_CAPACITY'
        : response.status === 401 || response.status === 403
          ? 'AI_AUTH_FAILED'
          : response.status === 402
            ? 'AI_CREDITS_REQUIRED'
            : response.status === 404
              ? 'AI_MODEL_UNAVAILABLE'
              : 'AI_REQUEST_FAILED';
    throw new Error(code);
  }
  const data = (await response.json()) as {
    error?: unknown;
    choices?: { finish_reason?: string; message?: AssistantMessage }[];
  };
  const choice = data?.choices?.[0];
  const message = choice?.message;
  if (
    data?.error ||
    !message ||
    message.role !== 'assistant' ||
    !['stop', 'tool_calls'].includes(choice?.finish_reason || '') ||
    (message.content !== null && typeof message.content !== 'string')
  ) {
    throw new Error('INVALID_MODEL_OUTPUT');
  }
  return message;
}
