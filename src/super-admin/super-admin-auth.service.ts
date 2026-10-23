import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

export interface SuperAdminRequest extends Request {
  sellerIdentity?: {
    sub: string;
    sessionId: string;
    accessToken: string;
  };
  adminIdentity?: {
    sub: string;
    role: 'admin' | 'super_admin';
  };
}

@Injectable()
export class SuperAdminAuthService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {}

  assertMfaVerified(request: SuperAdminRequest): string {
    const claimName = this.configService.get<string>('SUPER_ADMIN_MFA_CLAIM');
    if (!claimName) {
      throw new ServiceUnavailableException('Super Admin MFA verification is not configured.');
    }
    const payload = request.auth?.payload;
    if (!payload || payload[claimName] !== true) {
      throw new ForbiddenException('Complete the required Super Admin MFA challenge.');
    }

    const subject = request.sellerIdentity?.sub;
    if (!subject) {
      throw new ForbiddenException('A verified Super Admin identity is required.');
    }
    return subject;
  }

  async isSuperAdmin(subject: string): Promise<boolean> {
    const result = await this.pool.query<{ auth0_sub: string }>(
      `SELECT auth0_sub
       FROM super_admin_identities
       WHERE auth0_sub = $1`,
      [subject],
    );
    return result.rows.length === 1;
  }
}
