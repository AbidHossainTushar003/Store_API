import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.validation';
import { CommerceModule } from './commerce/commerce.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ProductsModule } from './products/products.module';
import { SellerApplicationsModule } from './seller-applications/seller-applications.module';
import { LocalDemoAuthModule } from './local-demo-auth/local-demo-auth.module';
import { AdminOperationsModule } from './admin-operations/admin-operations.module';
import { SellerOperationsModule } from './seller-operations/seller-operations.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { ContactModule } from './contact/contact.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    ProductsModule,
    SellerApplicationsModule,
    CommerceModule,
    LocalDemoAuthModule,
    AdminOperationsModule,
    SellerOperationsModule,
    SuperAdminModule,
    ContactModule,
  ],
})
export class AppModule {}
