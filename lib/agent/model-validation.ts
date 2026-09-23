import type { AssistantMessage } from './openrouter';

export function readToolSelection(
  selection: AssistantMessage,
  allowedIds: string[],
) {
  const call = selection.tool_calls?.[0];
  if (
    selection.tool_calls?.length !== 1 ||
    call?.type !== 'function' ||
    typeof call.id !== 'string' ||
    !call.id ||
    !['search_documents', 'summarize_document', 'compare_documents'].includes(
      call.function?.name,
    ) ||
    typeof call.function?.arguments !== 'string'
  )
    throw new Error('INVALID_TOOL');
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    throw new Error('INVALID_TOOL');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('INVALID_TOOL');
  const ids =
    call.function.name === 'summarize_document'
      ? [args.documentId]
      : args.documentIds;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 3 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string' || !allowedIds.includes(id))
  )
    throw new Error('INVALID_TOOL');
  return { call, args };
}

// One shared recovery budget across both phases: never an unbounded agent loop.
export async function recoverModelOutput<T>(
  attempt: (repair: boolean) => Promise<T>,
  budget: { used: boolean },
  onRetry: () => void,
): Promise<T> {
  try {
    return await attempt(false);
  } catch (error) {
    const malformed =
      error instanceof SyntaxError ||
      (error instanceof Error &&
        ['INVALID_MODEL_OUTPUT', 'INVALID_TOOL'].includes(error.message));
    if (!malformed) throw error;
    if (budget.used) throw new Error('INVALID_MODEL_OUTPUT');
    budget.used = true;
    onRetry();
    try {
      return await attempt(true);
    } catch (retryError) {
      if (retryError instanceof SyntaxError)
        throw new Error('INVALID_MODEL_OUTPUT');
      throw retryError;
    }
  }
}
