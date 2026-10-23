import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { LocalDemoAuthService } from '../local-demo-auth/local-demo-auth.service';
import { SellerAccessGuard } from '../seller-access/seller-access.guard';
import type { SellerAccessRequest } from '../seller-access/seller-access.request';
import { AdminIdentityGuard } from '../super-admin/admin-identity.guard';
import { GuestSessionService } from './guest-session.service';
import { OrdersService } from './orders.service';
import { PlaceOrderDto } from './dto/place-order.dto';

@ApiTags('Orders')
@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly guestSessionService: GuestSessionService,
    private readonly localDemoAuthService: LocalDemoAuthService,
  ) {}

  @Post('orders')
  @ApiOperation({ summary: 'Place a locally persisted cash-on-delivery order' })
  async placeOrder(
    @Body() input: PlaceOrderDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!this.localDemoAuthService.isEnabled()) {
      throw new ServiceUnavailableException(
        'Checkout is disabled until delivery-fee collection and order fulfilment are configured.',
      );
    }
    const guestSessionId = await this.guestSessionService.getOrCreate(request, response);
    return this.ordersService.placeOrder(guestSessionId, input);
  }

  @Get('orders')
  @ApiOperation({ summary: 'List orders for the current guest checkout session' })
  async listCustomerOrders(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const guestSessionId = await this.guestSessionService.getOrCreate(request, response);
    return this.ordersService.listCustomerOrders(guestSessionId);
  }

  @Get('seller/orders')
  @UseGuards(SellerAccessGuard)
  @ApiOperation({ summary: 'List orders belonging to the authenticated seller' })
  async listSellerOrders(@Req() request: SellerAccessRequest) {
    return this.ordersService.listSellerOrders(request.sellerAccountId!);
  }

  @Post('seller/orders/:orderId/confirm')
  @UseGuards(SellerAccessGuard)
  @ApiOperation({ summary: 'Confirm a COD order as its seller' })
  async confirmSellerOrder(
    @Param('orderId') orderId: string,
    @Req() request: SellerAccessRequest,
  ) {
    return this.ordersService.confirmBySeller(orderId, request.sellerAccountId!);
  }

  @Get('admin/orders')
  @UseGuards(AdminIdentityGuard)
  @ApiOperation({ summary: 'List COD orders for an authorized administrator' })
  async listAdminOrders() {
    return this.ordersService.listAdminOrders();
  }

  @Post('admin/orders/:orderId/confirm')
  @UseGuards(AdminIdentityGuard)
  @ApiOperation({ summary: 'Finalize a seller-confirmed COD order as an authorized administrator' })
  async confirmAdminOrder(@Param('orderId') orderId: string) {
    return this.ordersService.confirmByAdmin(orderId);
  }
}
