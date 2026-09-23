import type { Contract, SourceChunk } from '../types';
export const PDF_LIMITS = {
  bytes: 10 * 1024 * 1024,
  pages: 25,
  characters: 100000,
  documents: 5,
};
export type ExtractedPage = { page: number; text: string };
export function safeFilename(name: string) {
  // Strip control and bidi characters from untrusted filenames.
  return (
    name
      .replace(/.*[\\/]/, '')
      // oxlint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim()
      .slice(0, 120) || 'Document.pdf'
  );
}
export function validatePages(raw: unknown): ExtractedPage[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > PDF_LIMITS.pages)
    throw new Error('PDF_PAGES');
  let total = 0;
  const pages = raw.map((item, index) => {
    if (!item || item.page !== index + 1 || typeof item.text !== 'string')
      throw new Error('PDF_INVALID');
    const text = item.text
      .replaceAll(String.fromCharCode(0), '')
      .replace(/\r\n/g, '\n')
      .trim();
    total += text.length;
    if (total > PDF_LIMITS.characters) throw new Error('PDF_TEXT_LIMIT');
    return { page: index + 1, text };
  });
  if (
    pages.reduce(
      (n, p) => n + (p.text.match(/[\p{L}\p{N}]/gu)?.length || 0),
      0,
    ) < 20
  )
    throw new Error('PDF_NO_TEXT');
  return pages;
}
export function documentFromPages(
  id: string,
  filename: string,
  raw: unknown,
): Contract {
  const pages = validatePages(raw);
  const chunks: SourceChunk[] = [];
  for (const page of pages) {
    if (!page.text) continue;
    let start = 0,
      part = 1;
    while (start < page.text.length) {
      let end = Math.min(start + 1600, page.text.length);
      if (end < page.text.length) {
        const boundary = page.text.lastIndexOf(' ', end);
        if (boundary > start + 1000) end = boundary;
      }
      chunks.push({
        documentId: id,
        filename,
        page: page.page,
        section: `Page ${page.page} · Passage ${part}`,
        sourceId: `${id}-p${page.page}-c${part}`,
        text: page.text.slice(start, end).trim(),
      });
      if (end === page.text.length) break;
      start = end - 160;
      part++;
    }
  }
  const empty = pages.filter((p) => !p.text.trim()).map((p) => p.page);
  const warnings = empty.length
    ? [
        `No readable text on page${empty.length === 1 ? '' : 's'} ${empty.join(', ')}. These pages are excluded; OCR may be needed.`,
      ]
    : [];
  return {
    documentId: id,
    filename,
    shortName: filename.replace(/\.pdf$/i, ''),
    pages: pages.length,
    effectiveDate: '',
    chunks,
    kind: 'upload',
    warnings,
  };
}
