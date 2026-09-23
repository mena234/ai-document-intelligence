import { contracts } from '@/lib/documents/contracts';
export async function GET() {
  return Response.json(
    { documents: contracts },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
