import { env } from 'cloudflare:workers';
import { contracts } from '../documents/contracts';
import type { Contract } from '../types';
export function storage() {
  const bindings = env as unknown as { DB?: D1Database; FILES?: R2Bucket };
  if (!bindings.DB || !bindings.FILES) throw new Error('UPLOAD_STORAGE');
  return { db: bindings.DB, files: bindings.FILES };
}
export function sessionToken(request: Request) {
  const token = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)document_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token || null;
}
export async function hash(value: string | Uint8Array) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : new Uint8Array(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function ownerOf(request: Request) {
  const token = sessionToken(request);
  return token ? hash(token) : null;
}
export function sessionCookie(token: string) {
  return `document_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`;
}
export async function cleanupExpired() {
  const { db, files } = storage();
  const rows = await db
    .prepare(
      "SELECT id, owner FROM uploaded_documents WHERE expires_at <= ? OR (state = 'pending' AND created_at < ?) LIMIT 10",
    )
    .bind(Date.now(), Date.now() - 300000)
    .all<{ id: string; owner: string }>();
  for (const row of rows.results) {
    await files.delete(`${row.owner}/${row.id}.pdf`);
    await db
      .prepare('DELETE FROM uploaded_documents WHERE id = ? AND owner = ?')
      .bind(row.id, row.owner)
      .run();
  }
}
export async function ownDocuments(owner: string): Promise<Contract[]> {
  const { db } = storage();
  const rows = await db
    .prepare(
      "SELECT content FROM uploaded_documents WHERE owner = ? AND state = 'ready' AND expires_at > ? ORDER BY created_at",
    )
    .bind(owner, Date.now())
    .all<{ content: string }>();
  return rows.results.map((r) => JSON.parse(r.content) as Contract);
}
export async function resolveDocuments(ids: string[], owner: string | null) {
  let available = contracts;
  if (ids.some((id) => !contracts.some((d) => d.documentId === id))) {
    if (!owner) throw new Error('DOCUMENT_UNAVAILABLE');
    available = [...contracts, ...(await ownDocuments(owner))];
  }
  return ids.map((id) => {
    const doc = available.find((d) => d.documentId === id);
    if (!doc) throw new Error('DOCUMENT_UNAVAILABLE');
    return doc;
  });
}
export function uploadError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    UPLOAD_PENDING:
      'This PDF is already being saved in another request. Wait a moment, then retry the same file or refresh your list.',
    PDF_PAGES:
      'PDFs must contain 1–25 pages. Split this document into smaller PDFs.',
    PDF_INVALID:
      'This file could not be read as a PDF. Export a new PDF and try again.',
    PDF_TEXT_LIMIT:
      'This PDF contains too much text for the demo. Split it into smaller files.',
    PDF_NO_TEXT:
      'No readable text was found. Use OCR to make this scanned PDF searchable, then upload it again.',
    PDF_SIZE: 'Choose a non-empty PDF smaller than 10 MB.',
    PDF_TYPE: 'Only PDF files are supported.',
    UPLOAD_LIMIT:
      'Your workspace holds up to 5 uploaded PDFs. Remove one before adding another.',
    UPLOAD_STORAGE: 'File storage is temporarily unavailable. Please retry.',
    SESSION_REQUIRED:
      'Your upload session is unavailable. Refresh the page and allow this site’s cookies.',
    RATE_LIMIT: 'The upload limit has been reached. Please try again later.',
    DOCUMENT_UNAVAILABLE:
      'This document was removed or expired. Refresh your document list.',
  };
  return messages[code] || 'The upload could not be saved. Please try again.';
}
