import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SellerAccessGuard } from '../seller-access/seller-access.guard';
import type { SellerAccessRequest } from '../seller-access/seller-access.request';
import { ProductsService } from './products.service';

class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsInt()
  @Min(1)
  @Max(100000000)
  priceBdt!: number;

  @IsInt()
  @Min(1)
  @Max(100000)
  stockQuantity!: number;
}

class UpdateSellerProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000000)
  priceBdt?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  stockQuantity?: number;

  @IsOptional()
  @IsIn(['inactive'])
  status?: 'inactive';
}

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List active non-demo marketplace products' })
  async listProducts() {
    return { products: await this.productsService.listProducts() };
  }

  @Get('seller')
  @UseGuards(SellerAccessGuard)
  @ApiOperation({ summary: 'List products owned by the authenticated seller' })
  async listSellerProducts(@Req() request: SellerAccessRequest) {
    return this.productsService.listSellerProducts(request.sellerAccountId!);
  }

  @Get('seller/:productId')
  @UseGuards(SellerAccessGuard)
  @ApiOperation({ summary: 'Get one product owned by the authenticated seller' })
  async getSellerProduct(
    @Param('productId') productId: string,
    @Req() request: SellerAccessRequest,
  ) {
    return this.productsService.getSellerProduct(request.sellerAccountId!, productId);
  }

  @Post('seller')
  @UseGuards(SellerAccessGuard)
  @ApiOperation({ summary: 'Create a draft product for the authenticated seller' })
  async createSellerProduct(
    @Body() input: CreateProductDto,
    @Req() request: SellerAccessRequest,
  ) {
    return this.productsService.createSellerProduct(request.sellerAccountId!, input);
  }

  @Patch('seller/:productId')
  @UseGuards(SellerAccessGuard)
  @ApiOperation({ summary: 'Adjust a seller listing or pause it' })
  async updateSellerProduct(
    @Param('productId') productId: string,
    @Body() input: UpdateSellerProductDto,
    @Req() request: SellerAccessRequest,
  ) {
    return this.productsService.updateSellerProduct(
      request.sellerAccountId!,
      productId,
      input,
    );
  }
}
