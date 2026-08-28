import { env } from 'cloudflare:workers';
import { DomainError } from './domain';

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

export function errorResponse(error: unknown) {
  const domain = error instanceof DomainError ? error : new DomainError('INTERNAL_ERROR', 'Kart Board could not complete the request.', 500);
  if (!(error instanceof DomainError)) console.error(error);
  return json({ error: { code: domain.code, message: domain.message } }, domain.status);
}

export function requireController(request: Request) {
  const configured = env.KARTBOARD_CONTROL_KEY;
  const supplied = request.headers.get('X-KartBoard-Key');
  if (!configured || !supplied || !constantTimeEqual(supplied, configured)) {
    throw new DomainError('CONTROL_AUTH_REQUIRED', 'Enter the Kart Board controller access code.', 401);
  }
}

function constantTimeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
