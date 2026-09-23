import {
  PDF_LIMITS,
  documentFromPages,
  safeFilename,
} from '@/lib/documents/ingestion';
import {
  storage,
  ownerOf,
  sessionToken,
  sessionCookie,
  hash,
  ownDocuments,
  cleanupExpired,
  uploadError,
} from '@/lib/server/uploads';
import { consumeQuota } from '@/lib/server/rate-limit';
export async function GET(request: Request) {
  try {
    const token =
      sessionToken(request) ||
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
    await cleanupExpired();
    return Response.json(
      { documents: await ownDocuments(await hash(token)) },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': sessionCookie(token),
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: uploadError(error) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: 'Upload from this site only.' },
      { status: 403 },
    );
  const owner = await ownerOf(request);
  if (!owner)
    return Response.json(
      { error: uploadError(new Error('SESSION_REQUIRED')) },
      { status: 401 },
    );
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
    return Response.json({ error: 'Send a PDF file.' }, { status: 415 });
  try {
    await consumeQuota(request, true);
    const maxBody = PDF_LIMITS.bytes + 500000;
    if (Number(request.headers.get('content-length')) > maxBody)
      throw new Error('PDF_SIZE');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('PDF_INVALID');
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBody) {
        await reader.cancel();
        throw new Error('PDF_SIZE');
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type')! },
    })
      .formData()
      .catch(() => {
        throw new Error('PDF_INVALID');
      });
    const file = form.get('file'),
      pages = form.get('pages');
    if (!(file instanceof File) || typeof pages !== 'string')
      throw new Error('PDF_INVALID');
    if (!/\.pdf$/i.test(file.name)) throw new Error('PDF_TYPE');
    if (!file.size || file.size > PDF_LIMITS.bytes) throw new Error('PDF_SIZE');
    const pdf = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder().decode(pdf.slice(0, 1024)).includes('%PDF-'))
      throw new Error('PDF_INVALID');
    if (pages.length > 400000) throw new Error('PDF_TEXT_LIMIT');
    const filename = safeFilename(file.name),
      digest = await hash(pdf);
    const { db, files } = storage();
    await cleanupExpired();
    const stale = await db
      .prepare(
        'SELECT id FROM uploaded_documents WHERE owner = ? AND digest = ? AND expires_at <= ?',
      )
      .bind(owner, digest, Date.now())
      .first<{ id: string }>();
    if (stale) {
      await files.delete(`${owner}/${stale.id}.pdf`);
      await db
        .prepare('DELETE FROM uploaded_documents WHERE id = ? AND owner = ?')
        .bind(stale.id, owner)
        .run();
    }
    const existing = await db
      .prepare(
        'SELECT content, state FROM uploaded_documents WHERE owner = ? AND digest = ?',
      )
      .bind(owner, digest)
      .first<{ content: string; state: string }>();
    if (existing?.state === 'ready')
      return Response.json({
        document: JSON.parse(existing.content),
        duplicate: true,
      });
    if (existing)
      return Response.json(
        {
          error:
            'This PDF is already being saved. Wait a moment, then refresh your list.',
        },
        { status: 409 },
      );
    const id = `upload_${crypto.randomUUID()}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(pages);
    } catch {
      throw new Error('PDF_INVALID');
    }
    const document = {
      ...documentFromPages(id, filename, parsed),
      expiresAt: Date.now() + 86400000,
      byteSize: pdf.length,
    };
    const reserved = await db
      .prepare(
        "INSERT INTO uploaded_documents (id, owner, digest, filename, byte_size, created_at, expires_at, state, content) SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', ? WHERE (SELECT COUNT(*) FROM uploaded_documents WHERE owner = ? AND expires_at > ? AND (state = 'ready' OR created_at > ?)) < ? RETURNING id",
      )
      .bind(
        id,
        owner,
        digest,
        filename,
        pdf.length,
        Date.now(),
        document.expiresAt,
        JSON.stringify(document),
        owner,
        Date.now(),
        Date.now() - 300000,
        PDF_LIMITS.documents,
      )
      .first()
      .catch(async (error) => {
        const other = await db
          .prepare(
            'SELECT id FROM uploaded_documents WHERE owner = ? AND digest = ?',
          )
          .bind(owner, digest)
          .first();
        if (other) throw new Error('UPLOAD_PENDING');
        throw error;
      });
    if (!reserved) throw new Error('UPLOAD_LIMIT');
    const key = `${owner}/${id}.pdf`;
    try {
      await files.put(key, pdf, {
        httpMetadata: { contentType: 'application/pdf' },
      });
      await db
        .prepare(
          "UPDATE uploaded_documents SET state = 'ready' WHERE id = ? AND owner = ?",
        )
        .bind(id, owner)
        .run();
    } catch (error) {
      try {
        await files.delete(key);
        await db
          .prepare('DELETE FROM uploaded_documents WHERE id = ? AND owner = ?')
          .bind(id, owner)
          .run();
      } catch {
        /* Retain pending metadata so bounded cleanup can retry both stores. */
      }
      throw error;
    }
    return Response.json(
      { document },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return Response.json(
      { error: uploadError(error) },
      {
        status:
          code === 'UPLOAD_PENDING'
            ? 409
            : code === 'RATE_LIMIT'
              ? 429
              : code === 'PDF_SIZE'
                ? 413
                : code.startsWith('PDF_') || code === 'UPLOAD_LIMIT'
                  ? 400
                  : 503,
      },
    );
  }
}
