import { Module } from '@nestjs/common';
import { Auth0IdentityModule } from '../auth0-identity/auth0-identity.module';
import { DatabaseModule } from '../database/database.module';
import { LocalDemoAuthModule } from '../local-demo-auth/local-demo-auth.module';
import { SellerAccessGuard } from '../seller-access/seller-access.guard';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { GuestSessionService } from './guest-session.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [Auth0IdentityModule, DatabaseModule, LocalDemoAuthModule, SuperAdminModule],
  controllers: [CommerceController, OrdersController],
  providers: [CommerceService, GuestSessionService, OrdersService, SellerAccessGuard],
})
export class CommerceModule {}
