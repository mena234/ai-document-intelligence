// An authenticated, encrypted continuation keeps model reasoning off the client.
// The key is derived in memory from the server secret; no extra storage is needed.
async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('analysis-ticket-v1:' + secret),
  );
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function sealTicket(context: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(
    JSON.stringify({ context, expires: Date.now() + 300000 }),
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await encryptionKey(secret),
      plain,
    ),
  );
  const bytes = new Uint8Array(iv.length + ciphertext.length);
  bytes.set(iv);
  bytes.set(ciphertext, iv.length);
  const ticket = btoa(String.fromCharCode(...bytes));
  if (ticket.length > 24000) throw new Error('INVALID_MODEL_OUTPUT');
  return ticket;
}
export async function openTicket(
  ticket: string,
  secret: string,
): Promise<unknown> {
  try {
    if (ticket.length > 24000) throw new Error();
    const bytes = Uint8Array.from(atob(ticket), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await encryptionKey(secret),
      bytes.slice(12),
    );
    const data = JSON.parse(new TextDecoder().decode(plain));
    if (!data || typeof data.expires !== 'number' || data.expires < Date.now())
      throw new Error();
    return data.context;
  } catch {
    throw new Error('INVALID_TICKET');
  }
}
