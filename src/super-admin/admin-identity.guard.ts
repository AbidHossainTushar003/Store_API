import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Auth0SessionGuard } from '../seller-applications/auth0-session.guard';
import { LocalDemoAuthService } from '../local-demo-auth/local-demo-auth.service';
import { SuperAdminAuthService, SuperAdminRequest } from './super-admin-auth.service';
import { SuperAdminGuard } from './super-admin.guard';

@Injectable()
export class AdminIdentityGuard implements CanActivate {
  constructor(
    private readonly localDemoAuth: LocalDemoAuthService,
    private readonly auth0SessionGuard: Auth0SessionGuard,
    private readonly superAdminGuard: SuperAdminGuard,
    private readonly superAdminAuth: SuperAdminAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SuperAdminRequest>();
    if (this.localDemoAuth.isEnabled()) {
      const identity = this.localDemoAuth.readIdentity(
        request.headers.cookie,
        Date.now(),
        'admin',
      );
      if (!identity) {
        throw new UnauthorizedException('A local admin sign-in is required.');
      }
      request.adminIdentity = { sub: identity.id, role: 'admin' };
      return true;
    }

    await this.auth0SessionGuard.canActivate(context);
    await this.superAdminGuard.canActivate(context);
    const subject = this.superAdminAuth.assertMfaVerified(request);
    request.adminIdentity = { sub: subject, role: 'super_admin' };
    return true;
  }
}
