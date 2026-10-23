import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  getRequestId,
  getSafeErrorDiagnostics,
  wasRequestDiagnosticLogged,
} from '../diagnostics/safe-error-diagnostics';

interface ErrorResponsePayload {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}

function getSafeRoutePath(request: Request): string {
  const routePath = request.route?.path;
  return typeof routePath === 'string' ? routePath : 'unmatched';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttpException
      ? exception.getResponse() as Record<string, unknown> | string
      : 'Internal server error';

    const message = !isHttpException
      ? ['Internal server error']
      : typeof payload === 'string'
      ? payload
      : Array.isArray((payload as Record<string, unknown>)?.message)
        ? (payload as Record<string, unknown>).message as string[]
        : typeof (payload as Record<string, unknown>)?.message === 'string'
          ? [(payload as Record<string, unknown>).message as string]
          : [exception.message];

    const errorName = !isHttpException
      ? 'Internal Server Error'
      : typeof payload === 'string'
      ? HttpStatus[status] ?? 'Error'
      : typeof (payload as Record<string, unknown>)?.error === 'string'
        ? (payload as Record<string, unknown>).error as string
        : HttpStatus[status] ?? 'Error';

    const body: ErrorResponsePayload = {
      success: false,
      statusCode: status,
      error: errorName,
      message,
      path: getSafeRoutePath(request),
      timestamp: new Date().toISOString(),
    };

    if (isHttpException) {
      if (!wasRequestDiagnosticLogged(request)) {
        this.logger.warn(`${request.method} ${body.path} -> ${status}`);
      }
    } else {
      const diagnostics = getSafeErrorDiagnostics(exception, getRequestId(request));
      const { requestId } = diagnostics;
      body.requestId = requestId;
      response.setHeader('X-Request-ID', requestId);
      this.logger.error([
        `${request.method} ${body.path} -> ${status}`,
        `requestId=${requestId}`,
        `errorClass=${diagnostics.errorClass}`,
        ...(diagnostics.sqlState ? [`sqlState=${diagnostics.sqlState}`] : []),
      ].join(' '));
    }
    response.status(status).json(body);
  }
}
