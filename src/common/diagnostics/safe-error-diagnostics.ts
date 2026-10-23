import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

const SAFE_ERROR_CLASSES = new Set([
  'DatabaseError',
  'Error',
  'RangeError',
  'SyntaxError',
  'TypeError',
]);

const SAFE_SQLSTATES = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08P01',
  '23502',
  '23503',
  '23505',
  '23514',
  '40001',
  '40P01',
  '42501',
  '42P01',
  '42703',
  '53300',
]);

const diagnosedRequests = new WeakSet<Request>();

export interface SafeErrorDiagnostics {
  requestId: string;
  errorClass: string;
  sqlState?: string;
}

export function markRequestDiagnosticLogged(request: Request): void {
  diagnosedRequests.add(request);
}

export function wasRequestDiagnosticLogged(request: Request): boolean {
  return diagnosedRequests.has(request);
}

export function getRequestId(request: Request): string {
  const header = request.headers?.['x-request-id'];
  const requestId = typeof header === 'string' ? header : undefined;
  return requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    ? requestId.toLowerCase()
    : randomUUID();
}

export function getSafeErrorDiagnostics(
  exception: unknown,
  requestId: string,
): SafeErrorDiagnostics {
  const errorClass = exception instanceof Error && SAFE_ERROR_CLASSES.has(exception.name)
    ? exception.name
    : 'Error';
  const sqlState = typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    typeof exception.code === 'string' &&
    SAFE_SQLSTATES.has(exception.code)
    ? exception.code
    : undefined;

  return {
    requestId,
    errorClass,
    ...(sqlState ? { sqlState } : {}),
  };
}
