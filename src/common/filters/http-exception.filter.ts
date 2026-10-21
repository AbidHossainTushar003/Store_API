import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponsePayload {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
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
      path: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
    };

    const safeRequestPath = request.path || '/';
    const logMessage = `${request.method} ${safeRequestPath} -> ${status}`;
    if (isHttpException) {
      this.logger.warn(logMessage);
    } else {
      this.logger.error('Unexpected request failure.');
      this.logger.warn(logMessage);
    }
    response.status(status).json(body);
  }
}
