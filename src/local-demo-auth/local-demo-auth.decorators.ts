import { SetMetadata } from '@nestjs/common';
import type { LocalDemoRole } from './local-demo-auth.types';
import { LOCAL_DEMO_ROLES } from './local-demo-auth.guard';

export const RequireLocalDemoRoles = (...roles: LocalDemoRole[]) =>
  SetMetadata(LOCAL_DEMO_ROLES, roles);
