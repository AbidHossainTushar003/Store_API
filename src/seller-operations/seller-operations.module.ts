import { Module } from '@nestjs/common';
import { Auth0IdentityModule } from '../auth0-identity/auth0-identity.module';
import { DatabaseModule } from '../database/database.module';
import { LocalDemoAuthModule } from '../local-demo-auth/local-demo-auth.module';
import { SellerAccessGuard } from '../seller-access/seller-access.guard';
import { SellerOperationsController } from './seller-operations.controller';
import { SellerOperationsService } from './seller-operations.service';

@Module({
  imports: [Auth0IdentityModule, DatabaseModule, LocalDemoAuthModule],
  controllers: [SellerOperationsController],
  providers: [SellerOperationsService, SellerAccessGuard],
})
export class SellerOperationsModule {}
