import { env } from 'cloudflare:workers';
export async function consumeQuota(request: Request, upload = false) {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('STORAGE_UNAVAILABLE');
  // Cloudflare supplies this header; no raw IP is persisted or logged.
  const identity = request.headers.get('cf-connecting-ip') || 'unknown';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const limits = upload
    ? [
        { key: `upload:hour:${hash}`, seconds: 3600, max: 20 },
        { key: 'upload:global:day', seconds: 86400, max: 100 },
      ]
    : [
        { key: `minute:${hash}`, seconds: 60, max: 8 },
        { key: `hour:${hash}`, seconds: 3600, max: 40 },
        { key: 'global:day', seconds: 86400, max: 300 },
      ];
  // Each conditional UPSERT is atomic across Worker isolates; batch is transactional.
  const result = await db.batch(
    limits.map((l) => {
      const window = Math.floor(Date.now() / 1000 / l.seconds);
      return db
        .prepare(
          `INSERT INTO usage_buckets (key, window, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN usage_buckets.window = excluded.window THEN usage_buckets.count + 1 ELSE 1 END, window = excluded.window WHERE usage_buckets.window != excluded.window OR usage_buckets.count < ? RETURNING count`,
        )
        .bind(l.key, window, l.max);
    }),
  );
  if (result.some((r) => !r.results?.length)) throw new Error('RATE_LIMIT');
}
