import { loadState } from '@/db/state-repository';
import { toPublicState } from '@/lib/domain';
import { errorResponse, json } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const state = await loadState();
    const etag = `"kartboard-${state.revision}"`;
    if (request.headers.get('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-store' } });
    }
    return json(toPublicState(state), 200, { ETag: etag });
  } catch (error) {
    return errorResponse(error);
  }
}
