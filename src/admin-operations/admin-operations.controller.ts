import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminIdentityGuard } from '../super-admin/admin-identity.guard';
import type { SuperAdminRequest } from '../super-admin/super-admin-auth.service';
import { AdminOperationsService } from './admin-operations.service';

class UpdateStatusDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}

class ReviewApplicationDto {
  @IsIn(['approved', 'rejected', 'suspended'])
  status!: 'approved' | 'rejected' | 'suspended';

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

class UpdateProductPublicationDto {
  @IsBoolean()
  approved!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

@ApiTags('Local admin operations')
@Controller('admin')
@UseGuards(AdminIdentityGuard)
export class AdminOperationsController {
  constructor(private readonly operations: AdminOperationsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get local marketplace operational counts' })
  getSummary() {
    return this.operations.getSummary();
  }

  @Get('products')
  @ApiOperation({ summary: 'List locally persisted marketplace products' })
  getProducts() {
    return this.operations.getProducts();
  }

  @Patch('products/:productId/status')
  @ApiOperation({ summary: 'Activate or deactivate a local seller listing' })
  updateProductStatus(
    @Param('productId') productId: string,
    @Body() input: UpdateStatusDto,
  ) {
    return this.operations.updateProductStatus(productId, input.status);
  }

  @Patch('products/:productId/publication')
  @ApiOperation({ summary: 'Approve or revoke public publication for a product' })
  updateProductPublication(
    @Param('productId') productId: string,
    @Body() input: UpdateProductPublicationDto,
    @Req() request: SuperAdminRequest,
  ) {
    return this.operations.updateProductPublication(
      productId,
      input.approved,
      input.reason,
      request.adminIdentity!.sub,
    );
  }

  @Get('categories')
  @ApiOperation({ summary: 'List categories derived from persisted catalogue records' })
  getCategories() {
    return this.operations.getCategories();
  }

  @Get('sellers')
  @ApiOperation({ summary: 'List local seller identities and their listing counts' })
  getSellers() {
    return this.operations.getSellers();
  }

  @Get('customers')
  @ApiOperation({ summary: 'List guest customers derived from local COD orders' })
  getCustomers() {
    return this.operations.getCustomers();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get local COD order counts and order values by day' })
  getAnalytics() {
    return this.operations.getAnalytics();
  }

  @Get('activity')
  @ApiOperation({ summary: 'List recent local order and listing activity' })
  getActivity() {
    return this.operations.getActivity();
  }

  @Get('seller-applications')
  @ApiOperation({ summary: 'List persisted seller applications for local review' })
  getApplications() {
    return this.operations.getApplications();
  }

  @Patch('seller-applications/:applicationId/status')
    @ApiOperation({ summary: 'Review or suspend seller eligibility' })
  reviewApplication(
    @Param('applicationId') applicationId: string,
    @Body() input: ReviewApplicationDto,
    @Req() request: SuperAdminRequest,
  ) {
    return this.operations.reviewApplication(
      applicationId,
      input.status,
      input.reason,
      request.adminIdentity!.sub,
    );
  }
}
