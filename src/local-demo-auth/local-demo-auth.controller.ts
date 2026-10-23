import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { RequireLocalDemoRoles } from './local-demo-auth.decorators';
import { LocalDemoAuthGuard } from './local-demo-auth.guard';
import { LocalDemoAuthService } from './local-demo-auth.service';
import type { LocalDemoRequest, LocalDemoRole } from './local-demo-auth.types';

class LocalDemoLoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsIn(['seller', 'admin'])
  role!: LocalDemoRole;
}

class LocalDemoLogoutDto {
  @IsOptional()
  @IsIn(['seller', 'admin'])
  role?: LocalDemoRole;
}

@Controller('local-auth')
export class LocalDemoAuthController {
  constructor(private readonly authService: LocalDemoAuthService) {}

  @Post('login')
  login(
    @Body() input: LocalDemoLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = this.authService.authenticate(input.email, input.password, input.role);
    if (!identity) {
      throw new UnauthorizedException('The local demo credentials are invalid.');
    }
    response.setHeader('Set-Cookie', this.authService.createCookie(identity));
    return { identity, localOnly: true };
  }

  @Get('me')
  @UseGuards(LocalDemoAuthGuard)
  getIdentity(@Req() request: LocalDemoRequest) {
    return { identity: request.localDemoIdentity, localOnly: true };
  }

  @Get('me/seller')
  @UseGuards(LocalDemoAuthGuard)
  @RequireLocalDemoRoles('seller')
  getSellerIdentity(@Req() request: LocalDemoRequest) {
    return { identity: request.localDemoIdentity, localOnly: true };
  }

  @Get('me/admin')
  @UseGuards(LocalDemoAuthGuard)
  @RequireLocalDemoRoles('admin')
  getAdminIdentity(@Req() request: LocalDemoRequest) {
    return { identity: request.localDemoIdentity, localOnly: true };
  }

  @Post('logout')
  logout(
    @Body() input: LocalDemoLogoutDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Set-Cookie', this.authService.clearCookie(input.role));
    return { success: true, localOnly: true };
  }
}
