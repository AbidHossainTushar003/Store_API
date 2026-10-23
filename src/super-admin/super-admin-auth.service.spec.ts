import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { SuperAdminAuthService, SuperAdminRequest } from './super-admin-auth.service';

describe('SuperAdminAuthService', () => {
  const request = {
    sellerIdentity: {
      sub: 'auth0|admin',
      sessionId: 'session-id',
      accessToken: 'verified-access-token',
    },
    auth: {
      payload: {
        sub: 'auth0|admin',
        'https://shopademia.example/claims/mfa_verified': true,
      },
    },
  } as unknown as SuperAdminRequest;

  it('requires a configured Auth0 claim proving the required MFA flow', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const auth = new SuperAdminAuthService({ query: jest.fn() } as unknown as Pool, config);

    expect(() => auth.assertMfaVerified(request))
      .toThrow(ServiceUnavailableException);
  });

  it('rejects a token that does not prove MFA verification', () => {
    const config = {
      get: jest.fn().mockReturnValue('https://shopademia.example/claims/mfa_verified'),
    } as unknown as ConfigService;
    const auth = new SuperAdminAuthService({ query: jest.fn() } as unknown as Pool, config);
    const requestWithoutMfa = {
      ...request,
      auth: { payload: { sub: 'auth0|admin' } },
    } as unknown as SuperAdminRequest;

    expect(() => auth.assertMfaVerified(requestWithoutMfa))
      .toThrow(ForbiddenException);
  });

  it('accepts only the explicitly configured MFA claim', () => {
    const config = {
      get: jest.fn().mockReturnValue('https://shopademia.example/claims/mfa_verified'),
    } as unknown as ConfigService;
    const auth = new SuperAdminAuthService({ query: jest.fn() } as unknown as Pool, config);

    expect(auth.assertMfaVerified(request)).toBe('auth0|admin');
  });

  it('checks the persisted Super Admin allowlist', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ auth0_sub: 'auth0|admin' }] });
    const config = { get: jest.fn() } as unknown as ConfigService;
    const auth = new SuperAdminAuthService({ query } as unknown as Pool, config);

    await expect(auth.isSuperAdmin('auth0|admin')).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM super_admin_identities'),
      ['auth0|admin'],
    );
  });
});
