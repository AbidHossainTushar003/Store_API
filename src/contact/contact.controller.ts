import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SubmitContactRequestDto } from './dto/submit-contact-request.dto';
import { ContactService } from './contact.service';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Save a support request and attempt an SMTP notification' })
  async submit(
    @Body() input: SubmitContactRequestDto,
    @Req() request: Request,
  ) {
    if (input.website?.trim()) {
      throw new BadRequestException('The support request could not be accepted.');
    }

    return this.contactService.submit(
      input,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
  }
}
