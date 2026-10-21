import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Pool } from 'pg';
import { GuestSessionService } from './guest-session.service';

describe('GuestSessionService', () => {
  it('creates an HTTP-only guest cookie and stores only its hash', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'session-id' }] });
    const pool = { query } as unknown as Pool;
    const config = { get: jest.fn().mockReturnValue('development') } as unknown as ConfigService;
    const service = new GuestSessionService(pool, config);
    const request = { headers: {} } as Request;
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    await expect(service.getOrCreate(request, response)).resolves.toBe('session-id');

    const token = cookie.mock.calls[0][1] as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const insertCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO guest_sessions'));
    expect(insertCall?.[1][0]).not.toBe(token);
    expect(cookie).toHaveBeenCalledWith('shopademia_guest', token, expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/v1',
    }));
  });

  it('reuses a valid guest session without issuing a new cookie', async () => {
    const token = 'a'.repeat(43);
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'existing-session' }] });
    const pool = { query } as unknown as Pool;
    const config = { get: jest.fn() } as unknown as ConfigService;
    const service = new GuestSessionService(pool, config);
    const request = { headers: { cookie: `other=x; shopademia_guest=${token}` } } as Request;
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    await expect(service.getOrCreate(request, response)).resolves.toBe('existing-session');
    expect(cookie).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('deletes only the expired cookie session and issues a replacement', async () => {
    const expiredToken = 'b'.repeat(43);
    const expectedHash = createHash('sha256').update(expiredToken).digest('hex');
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'replacement-session' }], rowCount: 1 });
    const pool = { query } as unknown as Pool;
    const config = { get: jest.fn().mockReturnValue('development') } as unknown as ConfigService;
    const service = new GuestSessionService(pool, config);
    const request = {
      headers: { cookie: `shopademia_guest=${expiredToken}` },
    } as Request;
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    await expect(service.getOrCreate(request, response)).resolves.toBe('replacement-session');

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('expires_at > now()'),
      [expectedHash],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM guest_sessions WHERE token_hash = $1',
      [expectedHash],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM guest_sessions WHERE expires_at <= now()',
    );
    expect(cookie).toHaveBeenCalledWith(
      'shopademia_guest',
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.objectContaining({ httpOnly: true, path: '/api/v1' }),
    );
    expect(cookie.mock.calls[0][1]).not.toBe(expiredToken);
  });
});
