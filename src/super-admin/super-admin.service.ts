import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

@Injectable()
export class SuperAdminService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {}

  async bootstrap(subject: string, token: string): Promise<{ identity: { subject: string } }> {
    const expectedHash = this.configService.get<string>('SUPER_ADMIN_BOOTSTRAP_TOKEN_SHA256');
    if (!expectedHash || !/^[a-fA-F0-9]{64}$/.test(expectedHash)) {
      throw new ServiceUnavailableException('Super Admin bootstrap is not configured.');
    }

    const suppliedHash = createHash('sha256').update(token, 'utf8').digest();
    const expectedDigest = Buffer.from(expectedHash, 'hex');
    if (!timingSafeEqual(suppliedHash, expectedDigest)) {
      throw new UnauthorizedException('The one-time bootstrap token is invalid.');
    }

    const client = await this.pool.connect();
    let transactionActive = false;
    try {
      await client.query('BEGIN');
      transactionActive = true;

      const bootstrapState = await client.query<{ consumed_at: Date | null }>(
        `SELECT consumed_at
         FROM super_admin_bootstrap_state
         WHERE singleton = true
         FOR UPDATE`,
      );
      if (bootstrapState.rows.length !== 1) {
        throw new ServiceUnavailableException('Super Admin bootstrap state is not initialized.');
      }
      if (bootstrapState.rows[0].consumed_at) {
        throw new ConflictException('Super Admin bootstrap has already been consumed.');
      }

      await client.query(
        `INSERT INTO super_admin_identities (auth0_sub, created_by)
         VALUES ($1, $1)`,
        [subject],
      );
      const consumed = await client.query(
        `UPDATE super_admin_bootstrap_state
         SET consumed_at = now(), consumed_by = $1
         WHERE singleton = true AND consumed_at IS NULL`,
        [subject],
      );
      if (consumed.rowCount !== 1) {
        throw new ConflictException('Super Admin bootstrap has already been consumed.');
      }
      await client.query(
        `INSERT INTO super_admin_audit_log
           (actor_sub, action, target_type, target_id)
         VALUES ($1, 'super_admin_bootstrap', 'super_admin_identity', $1)`,
        [subject],
      );

      await client.query('COMMIT');
      transactionActive = false;
      return { identity: { subject } };
    } catch (error) {
      if (transactionActive) {
        await client.query('ROLLBACK');
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('This identity is already registered as Super Admin.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505';
  }
}
