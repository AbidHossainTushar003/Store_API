import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Auth0UserInfo {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
}

@Injectable()
export class Auth0ProfileService {
  constructor(private readonly configService: ConfigService) {}

  async getVerifiedEmail(accessToken: string, expectedSub: string): Promise<string> {
    const issuer = this.configService.get<string>('AUTH0_ISSUER_URL');
    if (!issuer) {
      throw new ServiceUnavailableException('Seller identity verification is not configured.');
    }

    const userInfoUrl = new URL('userinfo', issuer.endsWith('/') ? issuer : `${issuer}/`);
    let response: globalThis.Response;
    try {
      response = await fetch(userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException('Applicant identity could not be verified.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('A valid seller identity is required.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Applicant identity could not be verified.');
    }

    let profile: Auth0UserInfo;
    try {
      profile = await response.json() as Auth0UserInfo;
    } catch {
      throw new ServiceUnavailableException('Applicant identity could not be verified.');
    }

    if (
      profile.sub !== expectedSub ||
      profile.email_verified !== true ||
      typeof profile.email !== 'string' ||
      profile.email.trim().length === 0 ||
      profile.email.length > 320
    ) {
      throw new UnauthorizedException('A verified Auth0 email address is required.');
    }

    return profile.email;
  }
}
