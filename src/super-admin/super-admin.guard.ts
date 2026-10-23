import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SuperAdminAuthService, SuperAdminRequest } from './super-admin-auth.service';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly authService: SuperAdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SuperAdminRequest>();
    const subject = this.authService.assertMfaVerified(request);
    if (!(await this.authService.isSuperAdmin(subject))) {
      throw new ForbiddenException('An active Super Admin identity is required.');
    }
    return true;
  }
}

@Injectable()
export class SuperAdminMfaGuard implements CanActivate {
  constructor(private readonly authService: SuperAdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SuperAdminRequest>();
    this.authService.assertMfaVerified(request);
    return true;
  }
}
