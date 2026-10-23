import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  auth,
  UnauthorizedError as Auth0UnauthorizedError,
} from 'express-oauth2-jwt-bearer';
import type { Handler, Request, Response } from 'express';
import { Auth0SessionRegistry } from './auth0-session-registry.service';

export interface AuthenticatedSellerRequest extends Request {
  sellerIdentity?: {
    sub: string;
    sessionId: string;
    accessToken: string;
  };
}

@Injectable()
export class Auth0SessionGuard implements CanActivate {
  private middleware?: Handler;

  constructor(
    private readonly configService: ConfigService,
    private readonly sessionRegistry: Auth0SessionRegistry,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedSellerRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const authorization = request.headers.authorization;
    const accessToken = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    const sessionId = request.headers['x-shopademia-auth0-sid'];

    if (!accessToken || typeof sessionId !== 'string' || sessionId.length > 255) {
      throw new UnauthorizedException('A valid seller session is required.');
    }

    const verifier = this.getVerifier();
    try {
      await new Promise<void>((resolve, reject) => {
        verifier(request, response, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      if (error instanceof Auth0UnauthorizedError) {
        throw new UnauthorizedException('A valid seller session is required.');
      }
      throw new ServiceUnavailableException('Identity verification is temporarily unavailable.');
    }

    const sub = request.auth?.payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      throw new UnauthorizedException('A valid seller identity is required.');
    }

    let activeSubject: string | null;
    try {
      activeSubject = await this.sessionRegistry.getSubject(sessionId);
    } catch {
      throw new ServiceUnavailableException('Seller session verification is temporarily unavailable.');
    }
    if (activeSubject !== sub) {
      throw new UnauthorizedException('A valid seller session is required.');
    }

    request.sellerIdentity = { sub, sessionId, accessToken };
    return true;
  }

  private getVerifier(): Handler {
    if (this.middleware) {
      return this.middleware;
    }

    const issuerBaseURL = this.configService.get<string>('AUTH0_ISSUER_URL');
    const audience = this.configService.get<string>('AUTH0_AUDIENCE');
    if (!issuerBaseURL || !audience) {
      throw new ServiceUnavailableException('Seller identity verification is not configured.');
    }

    try {
      this.middleware = auth({
        issuerBaseURL,
        audience,
        tokenSigningAlg: 'RS256',
      });
    } catch {
      throw new ServiceUnavailableException('Seller identity verification is misconfigured.');
    }
    return this.middleware;
  }
}
