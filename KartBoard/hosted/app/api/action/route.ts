import { applyAction } from '@/db/state-repository';
import { DomainError, toPublicState } from '@/lib/domain';
import { errorResponse, json, requireController } from '@/lib/http';

const MAX_BODY_BYTES = 100_000;

export async function POST(request: Request) {
  try {
    requireController(request);
    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > MAX_BODY_BYTES) throw new DomainError('REQUEST_TOO_LARGE', 'Request body is too large.', 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new DomainError('REQUEST_TOO_LARGE', 'Request body is too large.', 413);
    let body: { action?: unknown; payload?: Record<string, unknown>; expectedRevision?: unknown };
    try { body = text ? JSON.parse(text) : {}; }
    catch { throw new DomainError('INVALID_JSON', 'Request body must be valid JSON.'); }
    const next = await applyAction(body.action, body.payload || {}, body.expectedRevision);
    return json(toPublicState(next));
  } catch (error) {
    return errorResponse(error);
  }
}
