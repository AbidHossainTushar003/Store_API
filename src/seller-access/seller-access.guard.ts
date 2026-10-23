import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';
import { LocalDemoAuthGuard } from '../local-demo-auth/local-demo-auth.guard';
import { LocalDemoAuthService } from '../local-demo-auth/local-demo-auth.service';
import { Auth0SessionGuard } from '../seller-applications/auth0-session.guard';
import type { SellerAccessRequest } from './seller-access.request';

@Injectable()
export class SellerAccessGuard implements CanActivate {
  constructor(
    private readonly localDemoAuthService: LocalDemoAuthService,
    private readonly localDemoAuthGuard: LocalDemoAuthGuard,
    private readonly auth0SessionGuard: Auth0SessionGuard,
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SellerAccessRequest>();
    if (this.localDemoAuthService.isEnabled()) {
      await this.localDemoAuthGuard.canActivate(context);
      if (request.localDemoIdentity?.role !== 'seller') {
        throw new ForbiddenException('Seller access is required.');
      }
      request.sellerAccountId = request.localDemoIdentity.id;
      return true;
    }

    await this.auth0SessionGuard.canActivate(context);
    const subject = request.sellerIdentity?.sub;
    if (!subject) {
      throw new ForbiddenException('An approved seller account is required.');
    }
    const application = await this.pool.query(
      `SELECT 1
       FROM seller_applications
       WHERE applicant_sub = $1 AND status = 'approved'
       LIMIT 1`,
      [subject],
    );
    if (application.rowCount !== 1) {
      throw new ForbiddenException('Seller access is available only to approved applicants.');
    }
    request.sellerAccountId = subject;
    return true;
  }
}
