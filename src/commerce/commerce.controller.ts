import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CartItemDto } from './dto/cart-item.dto';
import { WishlistItemDto } from './dto/wishlist-item.dto';
import { CommerceService } from './commerce.service';
import { GuestSessionService } from './guest-session.service';

@ApiTags('Demo commerce')
@Controller()
export class CommerceController {
  constructor(
    private readonly commerceService: CommerceService,
    private readonly guestSessionService: GuestSessionService,
  ) {}

  @Get('cart')
  @ApiOperation({ summary: 'Read the current guest demo cart' })
  async getCart(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const sessionId = await this.guestSessionService.getOrCreate(request, response);
    return this.commerceService.getCart(sessionId);
  }

  @Post('cart/items')
  @ApiOperation({ summary: 'Add a demo product to the guest cart' })
  async addCartItem(
    @Body() body: CartItemDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = await this.guestSessionService.getOrCreate(request, response);
    const item = await this.commerceService.addCartItem(
      sessionId,
      body.productId,
      body.quantity ?? 1,
    );
    return { success: true, item };
  }

  @Delete('cart/items/:productId')
  @ApiOperation({ summary: 'Remove a demo product from the guest cart' })
  async removeCartItem(
    @Param('productId') productId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = await this.guestSessionService.getOrCreate(request, response);
    await this.commerceService.removeCartItem(sessionId, productId);
    return { success: true };
  }

  @Get('wishlist')
  @ApiOperation({ summary: 'Read the current guest demo wishlist' })
  async getWishlist(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = await this.guestSessionService.getOrCreate(request, response);
    return this.commerceService.getWishlist(sessionId);
  }

  @Post('wishlist/items')
  @ApiOperation({ summary: 'Add a demo product to the guest wishlist' })
  async addWishlistItem(
    @Body() body: WishlistItemDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = await this.guestSessionService.getOrCreate(request, response);
    const item = await this.commerceService.addWishlistItem(sessionId, body.productId);
    return { success: true, item };
  }

  @Delete('wishlist/items/:productId')
  @ApiOperation({ summary: 'Remove a demo product from the guest wishlist' })
  async removeWishlistItem(
    @Param('productId') productId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = await this.guestSessionService.getOrCreate(request, response);
    await this.commerceService.removeWishlistItem(sessionId, productId);
    return { success: true };
  }
}
