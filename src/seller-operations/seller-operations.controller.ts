import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SellerAccessGuard } from '../seller-access/seller-access.guard';
import type { SellerAccessRequest } from '../seller-access/seller-access.request';
import { SellerOperationsService } from './seller-operations.service';

@ApiTags('Local seller operations')
@Controller('seller')
@UseGuards(SellerAccessGuard)
export class SellerOperationsController {
  constructor(private readonly operations: SellerOperationsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get local seller listing, stock, and order counts' })
  getSummary(@Req() request: SellerAccessRequest) {
    return this.operations.getSummary(request.sellerAccountId!);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get local order and low-stock notifications' })
  getNotifications(@Req() request: SellerAccessRequest) {
    return this.operations.getNotifications(request.sellerAccountId!);
  }
}
