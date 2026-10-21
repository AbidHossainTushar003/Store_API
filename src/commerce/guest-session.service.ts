import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

const cookieName = 'shopademia_guest';
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class GuestSessionService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {}

  async getOrCreate(request: Request, response: Response): Promise<string> {
    const token = this.readToken(request);
    if (token) {
      const tokenHash = this.hashToken(token);
      const existing = await this.pool.query<{ id: string }>(
        `SELECT id FROM guest_sessions
         WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash],
      );
      if (existing.rows[0]) {
        return existing.rows[0].id;
      }
      await this.pool.query('DELETE FROM guest_sessions WHERE token_hash = $1', [tokenHash]);
    }

    await this.pool.query('DELETE FROM guest_sessions WHERE expires_at <= now()');
    const newToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(newToken);
    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO guest_sessions (token_hash, expires_at)
       VALUES ($1, now() + interval '30 days')
       RETURNING id`,
      [tokenHash],
    );

    response.cookie(cookieName, newToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/v1',
      maxAge: sessionLifetimeMs,
    });

    return created.rows[0].id;
  }

  private readToken(request: Request): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }

    const cookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`));
    const token = cookie?.slice(cookieName.length + 1);
    return token && tokenPattern.test(token) ? token : undefined;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
