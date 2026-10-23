import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Auth0ProfileService } from './auth0-profile.service';

describe('Auth0ProfileService', () => {
  const config = {
    get: jest.fn().mockReturnValue('https://shopademia-test.us.auth0.com/'),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns only the verified email for the matching Auth0 subject', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sub: 'auth0|seller-123',
      email: 'seller@example.com',
      email_verified: true,
    }), { status: 200 }));
    const service = new Auth0ProfileService(config);

    await expect(service.getVerifiedEmail('access-token', 'auth0|seller-123'))
      .resolves.toBe('seller@example.com');
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://shopademia-test.us.auth0.com/userinfo'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token' },
      }),
    );
  });

  it('rejects unverified addresses and subject mismatches', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sub: 'auth0|someone-else',
      email: 'seller@example.com',
      email_verified: false,
    }), { status: 200 }));
    const service = new Auth0ProfileService(config);

    await expect(service.getVerifiedEmail('access-token', 'auth0|seller-123'))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not accept an Auth0 identity response without a verified email', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sub: 'auth0|seller-123',
      email: 'seller@example.com',
      email_verified: false,
    }), { status: 200 }));
    const service = new Auth0ProfileService(config);

    await expect(service.getVerifiedEmail('access-token', 'auth0|seller-123'))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
