import { ownerOf, resolveDocuments } from '@/lib/server/uploads';
import { sealTicket, openTicket } from '@/lib/server/analysis-ticket';
import type { Emit } from '@/lib/agent/tools';
import { runAgent, type PreparedAnalysis } from '@/lib/agent/orchestrator';
import { getAISettings } from '@/lib/agent/settings';
import { consumeQuota } from '@/lib/server/rate-limit';
import type { DocumentId } from '@/lib/types';
const messages: Record<string, string> = {
  DOCUMENT_UNAVAILABLE:
    'A selected document was removed, expired or belongs to another browser session. Refresh your document list.',
  INVALID_TICKET: 'This analysis session expired. Please retry your question.',
  AI_NOT_CONFIGURED:
    'AI analysis is awaiting secure activation by the site owner. You can still explore every demo contract.',
  AI_CAPACITY: 'The AI service is busy. Please wait a minute and retry.',
  AI_AUTH_FAILED:
    'The AI connection needs attention from the site owner. You can still explore the contracts.',
  AI_CREDITS_REQUIRED:
    'AI analysis is temporarily unavailable while the site owner replenishes demo credits.',
  AI_MODEL_UNAVAILABLE:
    'The configured AI model is temporarily unavailable. Please try again later.',
  AI_REQUEST_FAILED:
    'The AI service could not complete this analysis. Please try again.',
  INVALID_MODEL_OUTPUT:
    'The generated answer did not pass source validation. Please retry the analysis.',
  INVALID_TOOL:
    'The agent could not resolve the document request. Try naming a contract or choosing an example.',
  NO_SOURCES:
    'No relevant passages were found. Try asking about payment, termination, renewal, liability or service levels.',
  RATE_LIMIT:
    'The demo request limit has been reached. Please try again later.',
  STORAGE_UNAVAILABLE:
    'The demo usage service is temporarily unavailable. Please try again shortly.',
};
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: 'Requests must come from this site.' },
      { status: 403 },
    );
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return Response.json({ error: 'Send a JSON question.' }, { status: 415 });
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let size = 0;
    let text = '';
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 30000) {
        await reader.cancel();
        return Response.json(
          { error: 'The question is too long.' },
          { status: 413 },
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    body = JSON.parse(text);
  } catch {
    return Response.json(
      { error: 'The question could not be read. Please try again.' },
      { status: 400 },
    );
  }
  const data = body as {
    question?: unknown;
    documentIds?: unknown;
    phase?: unknown;
    ticket?: unknown;
  };
  const isAnswer =
    data?.phase === 'answer' &&
    typeof data?.ticket === 'string' &&
    data.ticket.length <= 24000;
  if (
    !isAnswer &&
    (!data ||
      typeof data.question !== 'string' ||
      !data.question.trim() ||
      data.question.length > 1200 ||
      !Array.isArray(data.documentIds) ||
      !data.documentIds.length ||
      data.documentIds.length > 3 ||
      data.documentIds.some(
        (id) =>
          typeof id !== 'string' ||
          !/^(acme|nova|apex|upload_[0-9a-f-]{36})$/.test(id),
      ) ||
      new Set(data.documentIds).size !== data.documentIds.length)
  )
    return Response.json(
      {
        error:
          'Enter a question of 1–1,200 characters and select 1–3 documents.',
      },
      { status: 400 },
    );
  if (!getAISettings().key)
    return Response.json(
      { error: messages.AI_NOT_CONFIGURED },
      { status: 503 },
    );
  try {
    await consumeQuota(request);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return Response.json(
      { error: messages[code] || messages.STORAGE_UNAVAILABLE },
      {
        status: code === 'RATE_LIMIT' ? 429 : 503,
        headers: code === 'RATE_LIMIT' ? { 'Retry-After': '60' } : {},
      },
    );
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener('abort', onAbort);
  const timer = setTimeout(() => controller.abort(), 180000);
  const events: Parameters<Emit>[0][] = [];
  const owner = await ownerOf(request);
  try {
    if (isAnswer) {
      const context = (await openTicket(
        data.ticket as string,
        getAISettings().key!,
      )) as PreparedAnalysis;
      if (
        context.documentIds.some((id) => id.startsWith('upload_')) &&
        context.owner !== owner
      )
        throw new Error('DOCUMENT_UNAVAILABLE');
      const library = await resolveDocuments(context.documentIds, owner);
      await runAgent(
        context.question,
        context.documentIds,
        (event) => events.push(event),
        controller.signal,
        context,
        false,
        library,
      );
      return Response.json(
        { events },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const library = await resolveDocuments(data.documentIds as string[], owner);
    const context = await runAgent(
      data.question as string,
      data.documentIds as DocumentId[],
      (event) => events.push(event),
      controller.signal,
      undefined,
      true,
      library,
    );
    if (!context) throw new Error('INVALID_MODEL_OUTPUT');
    return Response.json(
      {
        events,
        ticket: await sealTicket({ ...context, owner }, getAISettings().key!),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const code =
      error instanceof SyntaxError
        ? 'INVALID_MODEL_OUTPUT'
        : error instanceof Error
          ? error.message
          : '';
    // Log only a controlled category: no questions, document text, provider output or secrets.
    console.error('agent_request_failed', {
      phase: isAnswer ? 'answer' : 'prepare',
      code: messages[code] ? code : 'UNEXPECTED_FAILURE',
    });
    return Response.json(
      {
        events,
        error: controller.signal.aborted
          ? 'The analysis took too long. Please retry.'
          : messages[code] ||
            'The analysis could not be completed. Please try again.',
      },
      {
        status: code === 'INVALID_TICKET' ? 400 : 502,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', onAbort);
  }
}
