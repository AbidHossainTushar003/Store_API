import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminOperationsService } from './admin-operations.service';

@Module({
  imports: [DatabaseModule, SuperAdminModule],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService],
})
export class AdminOperationsModule {}
