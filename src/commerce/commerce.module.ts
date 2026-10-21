import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { GuestSessionService } from './guest-session.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CommerceController],
  providers: [CommerceService, GuestSessionService],
})
export class CommerceModule {}
