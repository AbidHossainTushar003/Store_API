import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  auth,
  UnauthorizedError as Auth0UnauthorizedError,
} from 'express-oauth2-jwt-bearer';
import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Auth0SessionGuard, AuthenticatedSellerRequest } from './auth0-session.guard';
import { Auth0SessionRegistry } from './auth0-session-registry.service';

jest.mock('express-oauth2-jwt-bearer', () => ({
  auth: jest.fn(),
  UnauthorizedError: class extends Error {},
}));

describe('Auth0SessionGuard', () => {
  const sessionRegistry = {
    getSubject: jest.fn(),
  } as unknown as Auth0SessionRegistry;
  const request: Partial<AuthenticatedSellerRequest> = {
    headers: {
      authorization: 'Bearer valid-token',
      'x-shopademia-auth0-sid': 'auth0-session-123',
    },
  };
  const response = {} as Response;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    request.auth = undefined;
    jest.clearAllMocks();
  });

  it('fails closed if the Auth0 API is not configured', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const guard = new Auth0SessionGuard(config, sessionRegistry);

    await expect(guard.canActivate(context))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('requires the active Redis session to belong to the verified token subject', async () => {
    const config = {
      get: jest.fn((key: string) => ({
        AUTH0_ISSUER_URL: 'https://shopademia-test.us.auth0.com/',
        AUTH0_AUDIENCE: 'https://api.shopademia.example',
      }[key])),
    } as unknown as ConfigService;
    const verifier = auth as jest.MockedFunction<typeof auth>;
    verifier.mockImplementation(() => (
      (req: Request, _res: Response, next: (error?: Error) => void) => {
        req.auth = {
          payload: { sub: 'auth0|seller-123' },
          header: {},
          token: 'valid-token',
        };
        next();
      }
    ));
    (sessionRegistry.getSubject as jest.Mock).mockResolvedValue('auth0|seller-123');
    const guard = new Auth0SessionGuard(config, sessionRegistry);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.sellerIdentity).toEqual({
      sub: 'auth0|seller-123',
      sessionId: 'auth0-session-123',
      accessToken: 'valid-token',
    });
  });

  it('rejects expired or revoked Redis sessions', async () => {
    const config = {
      get: jest.fn((key: string) => ({
        AUTH0_ISSUER_URL: 'https://shopademia-test.us.auth0.com/',
        AUTH0_AUDIENCE: 'https://api.shopademia.example',
      }[key])),
    } as unknown as ConfigService;
    const verifier = auth as jest.MockedFunction<typeof auth>;
    verifier.mockImplementation(() => (
      (req: Request, _res: Response, next: (error?: Error) => void) => {
        req.auth = {
          payload: { sub: 'auth0|seller-123' },
          header: {},
          token: 'valid-token',
        };
        next();
      }
    ));
    (sessionRegistry.getSubject as jest.Mock).mockResolvedValue(null);
    const guard = new Auth0SessionGuard(config, sessionRegistry);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('maps invalid bearer tokens to an unauthorized response', async () => {
    const config = {
      get: jest.fn((key: string) => ({
        AUTH0_ISSUER_URL: 'https://shopademia-test.us.auth0.com/',
        AUTH0_AUDIENCE: 'https://api.shopademia.example',
      }[key])),
    } as unknown as ConfigService;
    const verifier = auth as jest.MockedFunction<typeof auth>;
    verifier.mockImplementation(() => (
      (_req: Request, _res: Response, next: (error?: Error) => void) => {
        next(new Auth0UnauthorizedError('invalid token'));
      }
    ));
    const guard = new Auth0SessionGuard(config, sessionRegistry);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
