import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Pool } from 'pg';
import { LocalDemoAuthGuard } from '../local-demo-auth/local-demo-auth.guard';
import { LocalDemoAuthService } from '../local-demo-auth/local-demo-auth.service';
import { Auth0SessionGuard } from '../seller-applications/auth0-session.guard';
import { SellerAccessGuard } from './seller-access.guard';
import type { SellerAccessRequest } from './seller-access.request';

describe('SellerAccessGuard', () => {
  const request = {} as SellerAccessRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  let localMode: jest.Mock;
  let localGuard: jest.Mock;
  let auth0Guard: jest.Mock;
  let query: jest.Mock;
  let guard: SellerAccessGuard;

  beforeEach(() => {
    Object.keys(request).forEach((key) => delete (request as unknown as Record<string, unknown>)[key]);
    localMode = jest.fn().mockReturnValue(false);
    localGuard = jest.fn();
    auth0Guard = jest.fn();
    query = jest.fn();
    guard = new SellerAccessGuard(
      { isEnabled: localMode } as unknown as LocalDemoAuthService,
      { canActivate: localGuard } as unknown as LocalDemoAuthGuard,
      { canActivate: auth0Guard } as unknown as Auth0SessionGuard,
      { query } as unknown as Pool,
    );
  });

  it('allows the authenticated local seller without querying the production application table', async () => {
    localMode.mockReturnValue(true);
    localGuard.mockImplementation(() => {
      request.localDemoIdentity = {
        id: 'seller-demo',
        email: 'seller@example.test',
        name: 'Local Seller',
        role: 'seller',
      };
      return true;
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.sellerAccountId).toBe('seller-demo');
    expect(auth0Guard).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a local admin identity from Seller routes', async () => {
    localMode.mockReturnValue(true);
    localGuard.mockImplementation(() => {
      request.localDemoIdentity = {
        id: 'admin-demo',
        email: 'admin@example.test',
        name: 'Local Admin',
        role: 'admin',
      };
      return true;
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows only Auth0 identities with an approved seller application', async () => {
    auth0Guard.mockImplementation(() => {
      request.sellerIdentity = {
        sub: 'auth0|seller-1',
        sessionId: 'session-1',
        accessToken: 'token',
      };
      return true;
    });
    query.mockResolvedValue({ rowCount: 1, rows: [{ '?column?': 1 }] });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'approved'"),
      ['auth0|seller-1'],
    );
    expect(request.sellerAccountId).toBe('auth0|seller-1');
  });

  it('denies Auth0 identities without an approved application', async () => {
    auth0Guard.mockImplementation(() => {
      request.sellerIdentity = {
        sub: 'auth0|pending-seller',
        sessionId: 'session-1',
        accessToken: 'token',
      };
      return true;
    });
    query.mockResolvedValue({ rowCount: 0, rows: [] });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
