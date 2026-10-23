import { ConfigService } from '@nestjs/config';
import { LocalDemoAuthService } from './local-demo-auth.service';

describe('LocalDemoAuthService', () => {
  it('authenticates only the identity matching the requested role', () => {
    const config = { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService;
    const service = new LocalDemoAuthService(config);

    expect(service.authenticate('seller@example.test', 'SellerDemo!2026', 'seller'))
      .toEqual({
        id: 'seller-demo',
        email: 'seller@example.test',
        name: 'Local Demo Seller',
        role: 'seller',
      });
    expect(service.authenticate('seller@example.test', 'SellerDemo!2026', 'admin'))
      .toBeUndefined();
    expect(service.authenticate('seller@example.test', 'wrong-password', 'seller'))
      .toBeUndefined();
  });

  it('signs an expiring role cookie and rejects tampering or expired sessions', () => {
    const config = { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService;
    const service = new LocalDemoAuthService(config);
    const identity = service.authenticate(
      'admin@example.test',
      'AdminDemo!2026',
      'admin',
    )!;
    const now = 1_000_000;
    const cookie = service.createCookie(identity, now);
    const cookieHeader = cookie.split(';')[0];

    expect(service.readIdentity(cookieHeader, now)).toEqual(identity);
    expect(service.readIdentity(`${cookieHeader}tampered`, now)).toBeUndefined();
    expect(service.readIdentity(cookieHeader, now + 13 * 60 * 60 * 1000)).toBeUndefined();
  });

  it('keeps seller and admin sessions independent in a shared localhost browser', () => {
    const config = { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService;
    const service = new LocalDemoAuthService(config);
    const now = 1_000_000;
    const seller = service.authenticate('seller@example.test', 'SellerDemo!2026', 'seller')!;
    const admin = service.authenticate('admin@example.test', 'AdminDemo!2026', 'admin')!;
    const cookieHeader = [
      service.createCookie(seller, now).split(';')[0],
      service.createCookie(admin, now).split(';')[0],
    ].join('; ');

    expect(service.readIdentity(cookieHeader, now, 'seller')).toEqual(seller);
    expect(service.readIdentity(cookieHeader, now, 'admin')).toEqual(admin);
    expect(service.clearCookie()).toHaveLength(3);
    expect(service.clearCookie('seller')).toHaveLength(1);
    expect(service.clearCookie('seller')[0]).toContain('shopademia_local_seller_session=');
    expect(service.clearCookie('admin')[0]).toContain('shopademia_local_admin_session=');
  });

  it('rejects local sign-in while local demo mode is disabled', () => {
    const config = { get: jest.fn().mockReturnValue(false) } as unknown as ConfigService;
    const service = new LocalDemoAuthService(config);

    expect(() => service.authenticate(
      'seller@example.test',
      'SellerDemo!2026',
      'seller',
    )).toThrow('Local demo identities are disabled.');
  });
});
