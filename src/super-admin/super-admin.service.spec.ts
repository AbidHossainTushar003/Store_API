import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { SuperAdminService } from './super-admin.service';

describe('SuperAdminService', () => {
  const token = 'A'.repeat(43);
  const tokenHash = createHash('sha256').update(token).digest('hex');

  function makeService(
    query: jest.Mock,
    configValues: Record<string, string | undefined> = {
      SUPER_ADMIN_BOOTSTRAP_TOKEN_SHA256: tokenHash,
    },
  ) {
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const config = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;
    return { service: new SuperAdminService(pool, config), client, pool };
  }

  it('atomically consumes the token and registers the authenticated subject', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ consumed_at: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const { service, client } = makeService(query);

    await expect(service.bootstrap('auth0|first-admin', token))
      .resolves.toEqual({ identity: { subject: 'auth0|first-admin' } });

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      expect.stringContaining('INSERT INTO super_admin_identities'),
      expect.stringContaining('UPDATE super_admin_bootstrap_state'),
      expect.stringContaining('INSERT INTO super_admin_audit_log'),
      'COMMIT',
    ]);
    expect(query.mock.calls.some(([, values]) => values?.includes(token))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('does not touch the database for an invalid one-time token', async () => {
    const query = jest.fn();
    const { service, pool } = makeService(query);

    await expect(service.bootstrap('auth0|first-admin', 'invalid-token'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('fails closed when the token hash is missing or malformed', async () => {
    const query = jest.fn();
    const { service, pool } = makeService(query, {
      SUPER_ADMIN_BOOTSTRAP_TOKEN_SHA256: 'not-a-hash',
    });

    await expect(service.bootstrap('auth0|first-admin', token))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects a bootstrap that was already consumed and rolls back', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ consumed_at: new Date() }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const { service, client } = makeService(query);

    await expect(service.bootstrap('auth0|first-admin', token))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
