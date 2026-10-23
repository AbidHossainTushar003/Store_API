import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth0SessionGuard } from '../seller-applications/auth0-session.guard';
import { BootstrapSuperAdminDto } from './dto/bootstrap-super-admin.dto';
import {
  SuperAdminAuthService,
  SuperAdminRequest,
} from './super-admin-auth.service';
import { SuperAdminGuard, SuperAdminMfaGuard } from './super-admin.guard';
import { SuperAdminService } from './super-admin.service';

@ApiTags('Super Admin identity')
@ApiBearerAuth()
@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly authService: SuperAdminAuthService,
    private readonly superAdminService: SuperAdminService,
  ) {}

  @Post('bootstrap')
  @UseGuards(Auth0SessionGuard, SuperAdminMfaGuard)
  @ApiOperation({ summary: 'Consume the one-time token to bootstrap the first Super Admin' })
  bootstrap(
    @Body() input: BootstrapSuperAdminDto,
    @Req() request: SuperAdminRequest,
  ) {
    return this.superAdminService.bootstrap(
      this.authService.assertMfaVerified(request),
      input.token,
    );
  }

  @Get('me')
  @UseGuards(Auth0SessionGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Return the authenticated Super Admin identity' })
  getIdentity(@Req() request: SuperAdminRequest) {
    return {
      identity: {
        subject: request.sellerIdentity!.sub,
        role: 'super_admin',
      },
    };
  }
}
