import type { Answer, Claim, DocumentId, SourceChunk } from '../types';

const object = <T extends Record<string, unknown>>(properties: T) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export function answerSchema(sourceIds: string[], documentIds: DocumentId[]) {
  const claim = object({
    text: { type: 'string' },
    evidence: {
      type: 'string',
      enum: sourceIds.length ? ['supported', 'not_found'] : ['not_found'],
    },
    sourceIds: sourceIds.length
      ? { type: 'array', items: { type: 'string', enum: sourceIds } }
      : { type: 'array', items: { type: 'string' }, maxItems: 0 },
  });
  return object({
    summary: claim,
    documents: {
      type: 'array',
      items: object({
        documentId: { type: 'string', enum: documentIds },
        paymentTerms: claim,
        terminationTerms: claim,
        renewalTerms: claim,
        liability: claim,
        riskLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'not_assessed'],
        },
        riskReason: claim,
      }),
    },
    findings: {
      type: 'array',
      items: object({ title: { type: 'string' }, claim }),
    },
    highestRiskDocumentId: {
      anyOf: [{ type: 'string', enum: documentIds }, { type: 'null' }],
    },
    recommendation: claim,
  });
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function validateAnswer(
  raw: unknown,
  sources: SourceChunk[],
  ids: DocumentId[],
  operation: Answer['operation'],
): Answer {
  const invalid = () => {
    throw new Error('INVALID_MODEL_OUTPUT');
  };
  if (!isRecord(raw)) return invalid();
  const sourceMap = new Map(sources.map((s) => [s.sourceId, s]));
  const used = new Set<string>();
  const claim = (v: unknown, documentId?: DocumentId): Claim => {
    if (
      !isRecord(v) ||
      typeof v.text !== 'string' ||
      !v.text.trim() ||
      v.text.length > 4000 ||
      !Array.isArray(v.sourceIds) ||
      !['supported', 'not_found'].includes(v.evidence as string) ||
      v.sourceIds.length > 24
    )
      return invalid();
    const sourceIds = [...new Set(v.sourceIds)];
    if (
      sourceIds.some(
        (id) =>
          typeof id !== 'string' ||
          !sourceMap.has(id) ||
          (documentId && sourceMap.get(id)?.documentId !== documentId),
      )
    )
      return invalid();
    if (
      (v.evidence === 'supported' && !sourceIds.length) ||
      (v.evidence === 'not_found' && sourceIds.length > 0)
    )
      return invalid();
    sourceIds.forEach((id) => used.add(id as string));
    // Providers occasionally echo internal IDs despite structured-output instructions.
    // References are rendered from canonical metadata, so remove only known ID tokens.
    let text = v.text;
    for (const id of sourceMap.keys())
      text = text
        .replaceAll(`(${id})`, '')
        .replaceAll(`[${id}]`, '')
        .replaceAll(id, '');
    text = text
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;])/g, '$1')
      .trim();
    if (!text) return invalid();
    return {
      text,
      sourceIds: sourceIds as string[],
      evidence: v.evidence as Claim['evidence'],
    };
  };
  if (
    !Array.isArray(raw.documents) ||
    raw.documents.length > 3 ||
    !Array.isArray(raw.findings) ||
    raw.findings.length > 8
  )
    return invalid();
  const documents = raw.documents.map((d) => {
    if (
      !isRecord(d) ||
      !ids.includes(d.documentId as DocumentId) ||
      !['low', 'medium', 'high', 'not_assessed'].includes(d.riskLevel as string)
    )
      return invalid();
    const id = d.documentId as DocumentId;
    return {
      documentId: id,
      paymentTerms: claim(d.paymentTerms, id),
      terminationTerms: claim(d.terminationTerms, id),
      renewalTerms: claim(d.renewalTerms, id),
      liability: claim(d.liability, id),
      riskLevel: d.riskLevel as Answer['documents'][number]['riskLevel'],
      riskReason: claim(d.riskReason, id),
    };
  });
  if (new Set(documents.map((d) => d.documentId)).size !== documents.length)
    return invalid();
  if (
    operation === 'compare_documents' &&
    documents.length > 0 &&
    ids.some((id) => !documents.some((d) => d.documentId === id))
  )
    return invalid();
  if (
    raw.highestRiskDocumentId !== null &&
    !ids.includes(raw.highestRiskDocumentId as DocumentId)
  )
    return invalid();
  if (
    raw.highestRiskDocumentId !== null &&
    !documents.some(
      (d) =>
        d.documentId === raw.highestRiskDocumentId &&
        d.riskLevel !== 'not_assessed',
    )
  )
    return invalid();
  const answer = {
    operation,
    summary: claim(raw.summary),
    documents,
    findings: raw.findings.map((f) => {
      if (!isRecord(f) || typeof f.title !== 'string' || f.title.length > 150)
        return invalid();
      return { title: f.title, claim: claim(f.claim) };
    }),
    highestRiskDocumentId:
      operation === 'compare_documents' && ids.length > 1
        ? (raw.highestRiskDocumentId as DocumentId | null)
        : null,
    recommendation: claim(raw.recommendation),
    sources: [] as SourceChunk[],
  };
  answer.sources = sources.filter((s) => used.has(s.sourceId));
  if (
    operation === 'compare_documents' &&
    !documents.length &&
    answer.sources.length > 0 &&
    (answer.findings.length < 2 ||
      ids.some((id) => !answer.sources.some((s) => s.documentId === id)))
  )
    return invalid();
  return answer;
}
