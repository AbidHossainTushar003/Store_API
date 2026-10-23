import { Module } from '@nestjs/common';
import { Auth0SessionGuard } from '../seller-applications/auth0-session.guard';
import { Auth0SessionRegistry } from '../seller-applications/auth0-session-registry.service';

@Module({
  providers: [Auth0SessionGuard, Auth0SessionRegistry],
  exports: [Auth0SessionGuard, Auth0SessionRegistry],
})
export class Auth0IdentityModule {}
