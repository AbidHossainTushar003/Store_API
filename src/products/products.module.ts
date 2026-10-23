import { Module } from '@nestjs/common';
import { Auth0IdentityModule } from '../auth0-identity/auth0-identity.module';
import { DatabaseModule } from '../database/database.module';
import { LocalDemoAuthModule } from '../local-demo-auth/local-demo-auth.module';
import { SellerAccessGuard } from '../seller-access/seller-access.guard';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [Auth0IdentityModule, DatabaseModule, LocalDemoAuthModule],
  controllers: [ProductsController],
  providers: [ProductsService, SellerAccessGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
