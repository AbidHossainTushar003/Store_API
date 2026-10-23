import { ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { HttpExceptionFilter } from './http-exception.filter';

function createHost(request: Partial<Request>) {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('HttpExceptionFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a generic response and logs only a request id and allowlisted diagnostics', () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const logWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { host, response } = createHost({
      method: 'GET',
      originalUrl: '/products?token=private-token',
      route: { path: '/products' } as Request['route'],
    });
    const exception = Object.assign(
      new Error('postgres://private-password SELECT private-data'),
      { code: '42703' },
    );

    new HttpExceptionFilter().catch(exception, host);

    const body = response.json.mock.calls[0][0] as Record<string, unknown>;
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual(expect.objectContaining({
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: ['Internal server error'],
      path: '/products',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }));
    expect(JSON.stringify(body)).not.toContain('private');
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain('errorClass=Error sqlState=42703');
    expect(logError.mock.calls[0][0]).not.toContain('private');
    expect(logWarning).not.toHaveBeenCalled();
  });

  it('omits unrecognized SQLSTATE values and does not include raw request paths', () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, response } = createHost({
      method: 'GET',
      originalUrl: '/customers/person@example.test?secret=value',
      route: undefined,
    });
    const exception = Object.assign(new Error('private details'), { code: 'SECRET' });

    new HttpExceptionFilter().catch(exception, host);

    expect(response.json.mock.calls[0][0]).toEqual(expect.objectContaining({
      path: 'unmatched',
    }));
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain('errorClass=Error');
    expect(logError.mock.calls[0][0]).not.toContain('sqlState=');
    expect(logError.mock.calls[0][0]).not.toContain('person@example.test');
    expect(logError.mock.calls[0][0]).not.toContain('private');
  });

  it('preserves HTTP exception status and message semantics', () => {
    const logWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, response } = createHost({
      method: 'GET',
      route: { path: '/restricted' } as Request['route'],
    });

    new HttpExceptionFilter().catch(
      new HttpException('Access denied.', HttpStatus.FORBIDDEN),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(response.json.mock.calls[0][0]).toEqual(expect.objectContaining({
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Access denied.',
      path: '/restricted',
    }));
    expect(logWarning).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });
});
