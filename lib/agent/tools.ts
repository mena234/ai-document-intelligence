import { contracts } from '../documents/contracts';
import { retrieveRelevantChunks } from '../documents/retrieval';
import type {
  ActivityEvent,
  Answer,
  Contract,
  DocumentId,
  SourceChunk,
} from '../types';
export function summaryChunks(chunks: SourceChunk[], maximum = 18) {
  return chunks.length <= maximum
    ? chunks
    : Array.from(
        { length: maximum },
        (_, i) => chunks[Math.floor((i * (chunks.length - 1)) / (maximum - 1))],
      );
}
export type Emit = (
  event:
    | { type: 'activity'; event: ActivityEvent }
    | { type: 'sources'; sources: SourceChunk[] }
    | { type: 'answer'; answer: Answer }
    | { type: 'error'; message: string },
) => void;
export function toolDefinitions(documentIds: DocumentId[]) {
  const list = { type: 'array', items: { type: 'string', enum: documentIds } };
  return [
    {
      type: 'function',
      name: 'search_documents',
      description:
        'Find specific facts or clauses in one or more selected documents. Use for targeted Q&A.',
      strict: true,
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, documentIds: list },
        required: ['query', 'documentIds'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'summarize_document',
      description:
        'Retrieve up to 18 representative passages from one document for a grounded summary. Choose this when asked to summarize a named document.',
      strict: true,
      parameters: {
        type: 'object',
        properties: { documentId: { type: 'string', enum: documentIds } },
        required: ['documentId'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'compare_documents',
      description:
        'Retrieve relevant passages from each selected document for a comparison or risk ranking. Use for any comparison or highest-risk question.',
      strict: true,
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' }, documentIds: list },
        required: ['question', 'documentIds'],
        additionalProperties: false,
      },
    },
  ];
}
export function executeTool(
  name: string,
  args: Record<string, unknown>,
  question: string,
  allowedIds: DocumentId[],
  emit: Emit,
  started: number,
  library: Contract[] = contracts,
): {
  sources: SourceChunk[];
  ids: DocumentId[];
  operation: Answer['operation'];
} {
  if (
    !['search_documents', 'summarize_document', 'compare_documents'].includes(
      name,
    )
  )
    throw new Error('INVALID_TOOL');
  const operation = name as Answer['operation'];
  const ids = (
    name === 'summarize_document' ? [args.documentId] : args.documentIds
  ) as DocumentId[];
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 3 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !allowedIds.includes(id))
  )
    throw new Error('INVALID_TOOL');
  const sources = ids.flatMap((id) => {
    const doc = library.find((d) => d.documentId === id);
    if (!doc) throw new Error('DOCUMENT_UNAVAILABLE');
    const event = {
      id: `search-${id}`,
      label: `Searching ${doc.kind === 'upload' ? doc.filename : doc.shortName + ' Agreement'}`,
      elapsedMs: Date.now() - started,
    };
    emit({ type: 'activity', event: { ...event, status: 'running' } });
    let chunks =
      name === 'summarize_document'
        ? summaryChunks(doc.chunks)
        : retrieveRelevantChunks(
            question +
              ' ' +
              (typeof args.query === 'string' ? args.query.slice(0, 1200) : ''),
            [id],
            {
              broad: name === 'compare_documents',
              perDocument: name === 'compare_documents' ? 6 : 4,
            },
            library.flatMap((d) => d.chunks),
          );
    if (!chunks.length && name === 'compare_documents')
      chunks = summaryChunks(doc.chunks, 6);
    emit({
      type: 'activity',
      event: {
        ...event,
        status: 'done',
        detail: `${chunks.length} passages matched`,
        elapsedMs: Date.now() - started,
      },
    });
    return chunks;
  });
  // An empty search is a valid tool result for the model to assess, not a failure.
  emit({ type: 'sources', sources });
  return { sources, ids, operation };
}
