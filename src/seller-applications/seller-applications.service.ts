import {
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';
import { Auth0ProfileService } from './auth0-profile.service';
import { SubmitSellerApplicationDto } from './dto/submit-seller-application.dto';

export interface SellerApplication {
  id: string;
  applicantName: string;
  email: string;
  shopName: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  submittedAt: string;
}

interface SellerApplicationRow {
  id: string;
  applicant_name: string;
  applicant_email: string;
  shop_name: string;
  description: string;
  status: SellerApplication['status'];
  submitted_at: Date;
}

@Injectable()
export class SellerApplicationsService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly auth0ProfileService: Auth0ProfileService,
  ) {}

  async getForApplicant(sub: string): Promise<{ application: SellerApplication | null }> {
    const result = await this.pool.query<SellerApplicationRow>(
      `SELECT id, applicant_name, applicant_email, shop_name, description, status, submitted_at
       FROM seller_applications
       WHERE applicant_sub = $1`,
      [sub],
    );
    return { application: result.rows[0] ? this.mapRow(result.rows[0]) : null };
  }

  async submit(
    sub: string,
    accessToken: string,
    input: SubmitSellerApplicationDto,
  ): Promise<{ application: SellerApplication }> {
    const email = await this.auth0ProfileService.getVerifiedEmail(accessToken, sub);

    let result;
    try {
      result = await this.pool.query<SellerApplicationRow>(
        `INSERT INTO seller_applications
           (applicant_sub, applicant_name, applicant_email, shop_name, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, applicant_name, applicant_email, shop_name, description, status, submitted_at`,
        [sub, input.applicantName.trim(), email, input.shopName.trim(), input.description.trim()],
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException('An application already exists for this account.');
      }
      throw error;
    }

    return { application: this.mapRow(result.rows[0]) };
  }

  private mapRow(row: SellerApplicationRow): SellerApplication {
    return {
      id: row.id,
      applicantName: row.applicant_name,
      email: row.applicant_email,
      shopName: row.shop_name,
      description: row.description,
      status: row.status,
      submittedAt: row.submitted_at.toISOString(),
    };
  }
}
