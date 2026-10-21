import { Pool, PoolClient } from 'pg';
import {
  createVerifiedIntegrationPool,
  deleteTrackedGuestSessions,
  hashGuestSessionToken,
  IntegrationDatabaseSafetyError,
  requireIntegrationDatabaseUrl,
  verifyIntegrationDatabase,
} from './database-safety';

const targetUrl =
  'postgresql://shopademia_d7_test_app@127.0.0.1:55432/shopademia_d7_test';

function validPreflightRow() {
  return {
    database_name: 'shopademia_d7_test',
    role_name: 'shopademia_d7_test_app',
    server_version_num: 170011,
    role_is_superuser: false,
    role_can_create_database: false,
    role_can_create_roles: false,
    role_can_replicate: false,
    role_can_bypass_rls: false,
    database_can_connect: true,
    database_can_create: false,
    schema_can_use: true,
    schema_can_create: false,
    effective_role_membership_count: '0',
    owned_application_objects_count: '0',
    guest_session_count: '0',
    cart_item_count: '0',
    wishlist_item_count: '0',
    products_select: true,
    products_insert: false,
    products_update: false,
    products_delete: false,
    guest_sessions_select: true,
    guest_sessions_insert: true,
    guest_sessions_update: true,
    guest_sessions_delete: true,
    cart_items_select: true,
    cart_items_insert: true,
    cart_items_update: true,
    cart_items_delete: true,
    wishlist_items_select: true,
    wishlist_items_insert: true,
    wishlist_items_update: true,
    wishlist_items_delete: true,
    products_truncate: false,
    products_trigger: false,
    products_references: false,
    guest_sessions_truncate: false,
    guest_sessions_trigger: false,
    guest_sessions_references: false,
    cart_items_truncate: false,
    cart_items_trigger: false,
    cart_items_references: false,
    wishlist_items_truncate: false,
    wishlist_items_trigger: false,
    wishlist_items_references: false,
  };
}

describe('integration database safety', () => {
  it('requires the explicit integration URL without falling back to DATABASE_URL', () => {
    expect(() => requireIntegrationDatabaseUrl({
      DATABASE_URL: 'postgresql://user@127.0.0.1:55432/shopademia_d7_test',
    })).toThrow('SHOPADEMIA_TEST_DATABASE_URL is required');
  });

  it.each([
    'postgresql://shopademia_d7_test_app@localhost:55432/shopademia_d7_test',
    'postgresql://shopademia_d7_test_app@127.0.0.1:5432/shopademia_d7_test',
    'postgresql://shopademia_d7_test_app@127.0.0.1:55432/shopademia_d6_disposable',
    'postgresql://shopademia_d6_app@127.0.0.1:55432/shopademia_d7_test',
    'mysql://shopademia_d7_test_app@127.0.0.1:55432/shopademia_d7_test',
    'postgresql://shopademia_d7_test_app@127.0.0.1:55432/shopademia_d7_test?host=example.com',
    'postgresql://shopademia_d7_test_app@127.0.0.1:55432/shopademia_d7_test#other',
  ])('rejects an unexpected or unsafe target URL', (url) => {
    expect(() => requireIntegrationDatabaseUrl({ SHOPADEMIA_TEST_DATABASE_URL: url }))
      .toThrow(IntegrationDatabaseSafetyError);
  });

  it('accepts only the approved explicit database identity', () => {
    expect(requireIntegrationDatabaseUrl({
      SHOPADEMIA_TEST_DATABASE_URL: targetUrl,
    })).toBe(targetUrl);
  });

  it('does not expose the URL or password in target validation errors', () => {
    const secretUrl = 'postgresql://private-user:do-not-report@localhost:5432/other';
    let thrown: unknown;
    try {
      requireIntegrationDatabaseUrl({ SHOPADEMIA_TEST_DATABASE_URL: secretUrl });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IntegrationDatabaseSafetyError);
    expect((thrown as Error).message).not.toContain(secretUrl);
    expect((thrown as Error).message).not.toContain('do-not-report');
  });

  it('accepts a passing mocked read-only identity and privilege preflight', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [validPreflightRow()] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    } as unknown as PoolClient;

    await expect(verifyIntegrationDatabase(client)).resolves.toBeUndefined();
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN READ ONLY');
    expect(client.query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    { database_name: 'unexpected_database' },
    { role_name: 'unexpected_role' },
    { server_version_num: 160000 },
    { role_is_superuser: true },
    { role_can_create_database: true },
    { role_can_create_roles: true },
    { role_can_replicate: true },
    { role_can_bypass_rls: true },
    { database_can_connect: false },
    { database_can_create: true },
    { schema_can_use: false },
    { schema_can_create: true },
    { effective_role_membership_count: '1' },
    { owned_application_objects_count: '1' },
    { guest_session_count: '1' },
    { cart_item_count: '1' },
    { wishlist_item_count: '1' },
    { products_select: false },
    { guest_sessions_insert: false },
    { guest_sessions_delete: false },
    { cart_items_update: false },
    { wishlist_items_delete: false },
    { products_truncate: true },
    { cart_items_trigger: true },
    { wishlist_items_references: true },
    { guest_sessions_truncate: true },
  ])('rejects an unsafe identity or privilege result', async (overrides) => {
    const row = { ...validPreflightRow(), ...overrides };
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    } as unknown as PoolClient;

    await expect(verifyIntegrationDatabase(client))
      .rejects.toThrow('identity or runtime privileges');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('uses effective privilege and transitive membership checks in the read-only preflight', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [validPreflightRow()] })
      .mockResolvedValueOnce({ rows: [] });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;

    await verifyIntegrationDatabase(client);

    const preflightSql = query.mock.calls[1][0] as string;
    expect(preflightSql).toContain("has_table_privilege(current_user, to_regclass('public.products'), 'TRUNCATE')");
    expect(preflightSql).toContain("has_table_privilege(current_user, to_regclass('public.cart_items'), 'TRIGGER')");
    expect(preflightSql).toContain("has_table_privilege(current_user, to_regclass('public.wishlist_items'), 'REFERENCES')");
    expect(preflightSql).toContain("pg_has_role(r.oid, inherited_role.oid, 'MEMBER')");
  });

  it('closes the pool when the mocked preflight fails', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...validPreflightRow(), role_is_superuser: true }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
      end: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };

    await expect(createVerifiedIntegrationPool(
      { SHOPADEMIA_TEST_DATABASE_URL: targetUrl },
      () => pool as unknown as Pool,
    )).rejects.toThrow('identity or runtime privileges');
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('closes the pool and reports a safe error when connection acquisition fails', async () => {
    const pool = {
      connect: jest.fn().mockRejectedValue(new Error('sensitive connection detail')),
      end: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };

    await expect(createVerifiedIntegrationPool(
      { SHOPADEMIA_TEST_DATABASE_URL: targetUrl },
      () => pool as unknown as Pool,
    )).rejects.toThrow('connection could not be verified');
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('hashes guest tokens without retaining the raw token', () => {
    const token = 'a'.repeat(43);
    const hash = hashGuestSessionToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
  });

  it('cleans only explicitly tracked guest-session hashes', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const hash = 'a'.repeat(64);

    await deleteTrackedGuestSessions({ query } as unknown as Pick<Pool, 'query'>, [hash]);

    expect(query).toHaveBeenCalledWith(
      'DELETE FROM guest_sessions WHERE token_hash = ANY($1::char(64)[])',
      [[hash]],
    );
    expect(query.mock.calls[0][0]).not.toContain('products');
    expect(query.mock.calls[0][0]).not.toMatch(/TRUNCATE/i);
  });

  it('deduplicates cleanup hashes and refuses malformed ownership identifiers', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 2 });
    const firstHash = 'a'.repeat(64);
    const secondHash = 'b'.repeat(64);

    await deleteTrackedGuestSessions(
      { query } as unknown as Pick<Pool, 'query'>,
      [firstHash, firstHash, secondHash],
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM guest_sessions WHERE token_hash = ANY'),
      [[firstHash, secondHash]],
    );

    query.mockClear();
    await expect(deleteTrackedGuestSessions(
      { query } as unknown as Pick<Pool, 'query'>,
      ['not-a-session-hash'],
    )).rejects.toThrow('invalid session hash');
    expect(query).not.toHaveBeenCalled();
  });

  it('does not issue cleanup SQL when no sessions were tracked', async () => {
    const query = jest.fn();
    await deleteTrackedGuestSessions({ query } as unknown as Pick<Pool, 'query'>, []);
    expect(query).not.toHaveBeenCalled();
  });
});
