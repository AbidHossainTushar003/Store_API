import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LocalDemoIdentity, LocalDemoRole } from './local-demo-auth.types';

const cookieNames: Record<LocalDemoRole, string> = {
  seller: 'shopademia_local_seller_session',
  admin: 'shopademia_local_admin_session',
};
const legacyCookieName = 'shopademia_local_session';
const sessionDurationSeconds = 12 * 60 * 60;
const demoIdentities = [
  {
    id: 'seller-demo',
    email: 'seller@example.test',
    name: 'Local Demo Seller',
    role: 'seller',
    password: 'SellerDemo!2026',
  },
  {
    id: 'admin-demo',
    email: 'admin@example.test',
    name: 'Local Demo Admin',
    role: 'admin',
    password: 'AdminDemo!2026',
  },
] as const;

@Injectable()
export class LocalDemoAuthService {
  private readonly signingKey = randomBytes(32);

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('LOCAL_DEMO_MODE', false);
  }

  requireEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Local demo identities are disabled.');
    }
  }

  authenticate(
    email: string,
    password: string,
    role: LocalDemoRole,
  ): LocalDemoIdentity | undefined {
    this.requireEnabled();
    const user = demoIdentities.find((candidate) => candidate.role === role);
    if (
      !user ||
      !this.constantTimeEqual(email.trim().toLowerCase(), user.email) ||
      !this.constantTimeEqual(password, user.password)
    ) {
      return undefined;
    }
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  createCookie(identity: LocalDemoIdentity, now = Date.now()): string {
    this.requireEnabled();
    const payload = Buffer.from(JSON.stringify({
      ...identity,
      expiresAt: Math.floor(now / 1000) + sessionDurationSeconds,
    })).toString('base64url');
    const signature = this.sign(payload);
    return `${cookieNames[identity.role]}=${payload}.${signature}; Path=/; Max-Age=${sessionDurationSeconds}; HttpOnly; SameSite=Lax`;
  }

  clearCookie(role?: LocalDemoRole): string[] {
    const names = role
      ? [cookieNames[role]]
      : [...Object.values(cookieNames), legacyCookieName];
    return names.map((name) => `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  }

  readIdentity(
    cookieHeader: string | undefined,
    now = Date.now(),
    expectedRole?: LocalDemoRole,
  ): LocalDemoIdentity | undefined {
    if (!this.isEnabled() || !cookieHeader) {
      return undefined;
    }
    const roles: LocalDemoRole[] = expectedRole
      ? [expectedRole]
      : ['seller', 'admin'];
    const cookies = cookieHeader.split(';').map((part) => part.trim());
    for (const role of roles) {
      const name = cookieNames[role];
      const cookie = cookies.find((part) => part.startsWith(`${name}=`));
      const token = cookie?.slice(name.length + 1);
      const separator = token?.lastIndexOf('.');
      if (!token || separator === undefined || separator < 1) {
        continue;
      }

      const payload = token.slice(0, separator);
      const signature = token.slice(separator + 1);
      if (!this.constantTimeEqual(signature, this.sign(payload))) {
        continue;
      }

      try {
        const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (this.isValidPayload(parsed, Math.floor(now / 1000)) && parsed.role === role) {
          return { id: parsed.id, email: parsed.email, name: parsed.name, role: parsed.role };
        }
      } catch {
        continue;
      }
    }
    return undefined;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.signingKey).update(payload).digest('base64url');
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftHash = createHash('sha256').update(left).digest();
    const rightHash = createHash('sha256').update(right).digest();
    return timingSafeEqual(leftHash, rightHash);
  }

  private isValidPayload(
    value: unknown,
    nowSeconds: number,
  ): value is LocalDemoIdentity & { expiresAt: number } {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('id' in value) ||
      !('email' in value) ||
      !('name' in value) ||
      !('role' in value) ||
      !('expiresAt' in value)
    ) {
      return false;
    }
    return (
      typeof value.id === 'string' &&
      typeof value.email === 'string' &&
      typeof value.name === 'string' &&
      (value.role === 'seller' || value.role === 'admin') &&
      typeof value.expiresAt === 'number' &&
      Number.isInteger(value.expiresAt) &&
      value.expiresAt > nowSeconds &&
      value.expiresAt <= nowSeconds + sessionDurationSeconds
    );
  }
}
