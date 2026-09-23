import { ownerOf, storage } from '@/lib/server/uploads';
async function lookup(request: Request, id: string) {
  const owner = await ownerOf(request);
  if (!owner || !/^upload_[0-9a-f-]{36}$/.test(id)) return null;
  const { db } = storage();
  const row = await db
    .prepare(
      "SELECT filename FROM uploaded_documents WHERE id = ? AND owner = ? AND state = 'ready' AND expires_at > ?",
    )
    .bind(id, owner, Date.now())
    .first<{ filename: string }>();
  return row ? { ...row, owner } : null;
}
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params,
      doc = await lookup(request, id);
    if (!doc)
      return Response.json(
        { error: 'Document not found or expired.' },
        { status: 404 },
      );
    const obj = await storage().files.get(`${doc.owner}/${id}.pdf`);
    if (!obj)
      return Response.json(
        { error: 'The original PDF is unavailable.' },
        { status: 404 },
      );
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  } catch {
    return Response.json(
      { error: 'The PDF could not be downloaded. Please retry.' },
      { status: 503 },
    );
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: 'Use this site to remove documents.' },
      { status: 403 },
    );
  try {
    const { id } = await context.params,
      doc = await lookup(request, id);
    if (!doc) return Response.json({ removed: true });
    const { db, files } = storage();
    await db
      .prepare(
        'UPDATE uploaded_documents SET expires_at = 0 WHERE id = ? AND owner = ?',
      )
      .bind(id, doc.owner)
      .run();
    await files.delete(`${doc.owner}/${id}.pdf`);
    await db
      .prepare('DELETE FROM uploaded_documents WHERE id = ? AND owner = ?')
      .bind(id, doc.owner)
      .run();
    return Response.json({ removed: true });
  } catch {
    return Response.json(
      { error: 'Removal could not finish. Please refresh and retry.' },
      { status: 503 },
    );
  }
}
