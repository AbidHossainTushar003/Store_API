import { Module } from '@nestjs/common';
import { LocalDemoAuthController } from './local-demo-auth.controller';
import { LocalDemoAuthGuard } from './local-demo-auth.guard';
import { LocalDemoAuthService } from './local-demo-auth.service';

@Module({
  controllers: [LocalDemoAuthController],
  providers: [LocalDemoAuthService, LocalDemoAuthGuard],
  exports: [LocalDemoAuthGuard, LocalDemoAuthService],
})
export class LocalDemoAuthModule {}
