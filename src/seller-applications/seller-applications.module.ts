import { Module } from '@nestjs/common';
import { Auth0IdentityModule } from '../auth0-identity/auth0-identity.module';
import { DatabaseModule } from '../database/database.module';
import { Auth0ProfileService } from './auth0-profile.service';
import { SellerApplicationsController } from './seller-applications.controller';
import { SellerApplicationsService } from './seller-applications.service';

@Module({
  imports: [DatabaseModule, Auth0IdentityModule],
  controllers: [SellerApplicationsController],
  providers: [Auth0ProfileService, SellerApplicationsService],
  exports: [Auth0IdentityModule],
})
export class SellerApplicationsModule {}
