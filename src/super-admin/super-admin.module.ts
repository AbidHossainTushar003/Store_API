import { Module } from '@nestjs/common';
import { Auth0IdentityModule } from '../auth0-identity/auth0-identity.module';
import { DatabaseModule } from '../database/database.module';
import { LocalDemoAuthModule } from '../local-demo-auth/local-demo-auth.module';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminAuthService } from './super-admin-auth.service';
import { AdminIdentityGuard } from './admin-identity.guard';
import { SuperAdminGuard, SuperAdminMfaGuard } from './super-admin.guard';
import { SuperAdminService } from './super-admin.service';

@Module({
  imports: [Auth0IdentityModule, DatabaseModule, LocalDemoAuthModule],
  controllers: [SuperAdminController],
  providers: [
    SuperAdminAuthService,
    SuperAdminGuard,
    SuperAdminMfaGuard,
    SuperAdminService,
    AdminIdentityGuard,
  ],
  exports: [
    AdminIdentityGuard,
    SuperAdminAuthService,
    SuperAdminGuard,
    Auth0IdentityModule,
    LocalDemoAuthModule,
  ],
})
export class SuperAdminModule {}
