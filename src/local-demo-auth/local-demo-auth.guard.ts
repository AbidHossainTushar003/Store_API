import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LocalDemoAuthService } from './local-demo-auth.service';
import type { LocalDemoRequest, LocalDemoRole } from './local-demo-auth.types';

export const LOCAL_DEMO_ROLES = 'localDemoRoles';

@Injectable()
export class LocalDemoAuthGuard implements CanActivate {
  constructor(
    private readonly authService: LocalDemoAuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    this.authService.requireEnabled();
    const request = context.switchToHttp().getRequest<LocalDemoRequest>();
    const roles = this.reflector.getAllAndOverride<LocalDemoRole[]>(LOCAL_DEMO_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    const identity = this.authService.readIdentity(
      request.headers.cookie,
      Date.now(),
      roles?.length === 1 ? roles[0] : undefined,
    );
    if (!identity) {
      throw new UnauthorizedException('A local demo sign-in is required.');
    }
    if (roles && !roles.includes(identity.role)) {
      throw new UnauthorizedException('This local demo identity does not have access.');
    }
    request.localDemoIdentity = identity;
    return true;
  }
}
