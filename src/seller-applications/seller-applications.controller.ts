import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedSellerRequest } from './auth0-session.guard';
import { Auth0SessionGuard } from './auth0-session.guard';
import { SubmitSellerApplicationDto } from './dto/submit-seller-application.dto';
import { SellerApplicationsService } from './seller-applications.service';

@ApiTags('Seller applications')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Shopademia-Auth0-Sid',
  description: 'Active Auth0 session identifier forwarded by the authenticated seller BFF.',
  required: true,
})
@Controller('seller-applications')
@UseGuards(Auth0SessionGuard)
export class SellerApplicationsController {
  constructor(private readonly applicationsService: SellerApplicationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Read the authenticated applicant’s application' })
  getOwnApplication(@Req() request: AuthenticatedSellerRequest) {
    return this.applicationsService.getForApplicant(request.sellerIdentity!.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Submit one seller application for the authenticated account' })
  submit(
    @Body() input: SubmitSellerApplicationDto,
    @Req() request: AuthenticatedSellerRequest,
  ) {
    const identity = request.sellerIdentity!;
    return this.applicationsService.submit(identity.sub, identity.accessToken, input);
  }
}
