import { allChunks } from './contracts';
import type { DocumentId, SourceChunk } from '../types';

const stop = new Set(
  'the a an and or of to for in on is are what which these this me tell across contract contracts agreement agreements compare summarize please'.split(
    ' ',
  ),
);
const topics = {
  payment: [
    'payment',
    'pay',
    'invoice',
    'invoices',
    'pricing',
    'price',
    'fees',
    'net',
    'cash',
    'billing',
    'cost',
  ],
  termination: [
    'termination',
    'terminate',
    'cancellation',
    'cancel',
    'exit',
    'notice',
    'nonrenewal',
    'breach',
  ],
  renewal: [
    'renewal',
    'renew',
    'automatic',
    'automatically',
    'monthly',
    'annual',
    'commitment',
  ],
  liability: [
    'liability',
    'liable',
    'cap',
    'capped',
    'indemnity',
    'exposure',
    'damages',
    'confidentiality',
  ],
  sla: [
    'sla',
    'availability',
    'uptime',
    'support',
    'outage',
    'credits',
    'service levels',
  ],
};
const tokenize = (s: string) =>
  s
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((t) => t.length > 1 && !stop.has(t)) || [];
export function retrieveRelevantChunks(
  query: string,
  documentIds: DocumentId[],
  options: { broad?: boolean; perDocument?: number } = {},
  sourceChunks: SourceChunk[] = allChunks,
): SourceChunk[] {
  const words = new Set(tokenize(query));
  const broad =
    options.broad || /risk|summari[sz]|overview/.test(query.toLowerCase());
  for (const [topic, synonyms] of Object.entries(topics))
    if (broad || synonyms.some((w) => words.has(w))) {
      words.add(topic);
      synonyms.forEach((w) => words.add(w));
    }
  if (words.size === 0) return [];
  const corpus = sourceChunks
    .filter((c) => documentIds.includes(c.documentId))
    .map((chunk) => ({
      chunk,
      tokens: tokenize(chunk.section + ' ' + chunk.text),
    }));
  const average =
    corpus.reduce((sum, c) => sum + c.tokens.length, 0) / corpus.length;
  const frequencies = new Map(
    [...words].map((w) => [
      w,
      corpus.filter((c) => c.tokens.includes(w)).length,
    ]),
  );
  return documentIds.flatMap((documentId) =>
    corpus
      .filter((c) => c.chunk.documentId === documentId)
      .map(({ chunk, tokens }) => {
        const score = [...words].reduce((sum, word) => {
          const frequency = tokens.filter((t) => t === word).length;
          if (!frequency) return sum;
          const df = frequencies.get(word) || 0;
          const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
          return (
            sum +
            (idf * (frequency * 2.2)) /
              (frequency + 1.2 * (0.25 + (0.75 * tokens.length) / average)) +
            (tokenize(chunk.section).includes(word) ? 1.8 : 0)
          );
        }, 0);
        return { chunk, score };
      })
      .filter((c) => c.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.chunk.sourceId.localeCompare(b.chunk.sourceId),
      )
      .slice(0, options.perDocument ?? (broad ? 6 : 4))
      .map((c) => c.chunk),
  );
}
