import { createHash } from 'node:crypto';
import { Pool, PoolClient, PoolConfig } from 'pg';

export const integrationDatabaseTarget = {
  host: '127.0.0.1',
  port: 55432,
  database: 'shopademia_d7_test',
  user: 'shopademia_d7_test_app',
} as const;

export class IntegrationDatabaseSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationDatabaseSafetyError';
  }
}

export function requireIntegrationDatabaseUrl(
  env: Record<string, string | undefined>,
): string {
  const connectionString = env.SHOPADEMIA_TEST_DATABASE_URL;
  if (!connectionString) {
    throw new IntegrationDatabaseSafetyError(
      'SHOPADEMIA_TEST_DATABASE_URL is required for PostgreSQL integration tests.',
    );
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new IntegrationDatabaseSafetyError(
      'SHOPADEMIA_TEST_DATABASE_URL must be a valid PostgreSQL URL.',
    );
  }

  let username: string;
  let database: string;
  try {
    username = decodeURIComponent(url.username);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new IntegrationDatabaseSafetyError(
      'SHOPADEMIA_TEST_DATABASE_URL contains invalid target encoding.',
    );
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== integrationDatabaseTarget.host ||
    url.port !== String(integrationDatabaseTarget.port) ||
    url.search !== '' ||
    url.hash !== '' ||
    database !== integrationDatabaseTarget.database ||
    username !== integrationDatabaseTarget.user
  ) {
    throw new IntegrationDatabaseSafetyError(
      'SHOPADEMIA_TEST_DATABASE_URL does not identify the approved integration-test target.',
    );
  }

  return connectionString;
}

type PreflightRow = {
  database_name: string;
  role_name: string;
  server_version_num: number;
  role_is_superuser: boolean;
  role_can_create_database: boolean;
  role_can_create_roles: boolean;
  role_can_replicate: boolean;
  role_can_bypass_rls: boolean;
  database_can_connect: boolean;
  database_can_create: boolean;
  schema_can_use: boolean;
  schema_can_create: boolean;
  effective_role_membership_count: string;
  owned_application_objects_count: string;
  guest_session_count: string;
  cart_item_count: string;
  wishlist_item_count: string;
  products_select: boolean;
  products_insert: boolean;
  products_update: boolean;
  products_delete: boolean;
  guest_sessions_select: boolean;
  guest_sessions_insert: boolean;
  guest_sessions_update: boolean;
  guest_sessions_delete: boolean;
  cart_items_select: boolean;
  cart_items_insert: boolean;
  cart_items_update: boolean;
  cart_items_delete: boolean;
  wishlist_items_select: boolean;
  wishlist_items_insert: boolean;
  wishlist_items_update: boolean;
  wishlist_items_delete: boolean;
  products_truncate: boolean;
  products_trigger: boolean;
  products_references: boolean;
  guest_sessions_truncate: boolean;
  guest_sessions_trigger: boolean;
  guest_sessions_references: boolean;
  cart_items_truncate: boolean;
  cart_items_trigger: boolean;
  cart_items_references: boolean;
  wishlist_items_truncate: boolean;
  wishlist_items_trigger: boolean;
  wishlist_items_references: boolean;
};

const preflightQuery = `
  SELECT
    current_database() AS database_name,
    current_user AS role_name,
    current_setting('server_version_num')::integer AS server_version_num,
    r.rolsuper AS role_is_superuser,
    r.rolcreatedb AS role_can_create_database,
    r.rolcreaterole AS role_can_create_roles,
    r.rolreplication AS role_can_replicate,
    r.rolbypassrls AS role_can_bypass_rls,
    has_database_privilege(current_user, current_database(), 'CONNECT') AS database_can_connect,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_can_create,
    has_schema_privilege(current_user, 'public', 'USAGE') AS schema_can_use,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_can_create,
    (
      SELECT count(*)::text
      FROM pg_roles inherited_role
      WHERE inherited_role.oid <> r.oid
        AND pg_has_role(r.oid, inherited_role.oid, 'MEMBER')
    ) AS effective_role_membership_count,
    (
      SELECT count(*)::text FROM (
        SELECT 1
        FROM pg_class owned
        JOIN pg_namespace namespace ON namespace.oid = owned.relnamespace
        WHERE namespace.nspname = 'public'
          AND owned.relkind IN ('r', 'p', 'S', 'v', 'm')
          AND owned.relowner = r.oid
        UNION ALL
        SELECT 1
        FROM pg_proc routine
        JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname = 'public'
          AND routine.proowner = r.oid
        UNION ALL
        SELECT 1
        FROM pg_type object_type
        JOIN pg_namespace namespace ON namespace.oid = object_type.typnamespace
        WHERE namespace.nspname = 'public'
          AND object_type.typowner = r.oid
        UNION ALL
        SELECT 1
        FROM pg_namespace owned_schema
        WHERE owned_schema.nspname = 'public'
          AND owned_schema.nspowner = r.oid
      ) owned_objects
    ) AS owned_application_objects_count,
    (SELECT count(*)::text FROM public.guest_sessions) AS guest_session_count,
    (SELECT count(*)::text FROM public.cart_items) AS cart_item_count,
    (SELECT count(*)::text FROM public.wishlist_items) AS wishlist_item_count,
    COALESCE(has_table_privilege(current_user, to_regclass('public.products'), 'SELECT'), false) AS products_select,
    COALESCE(has_table_privilege(current_user, to_regclass('public.products'), 'INSERT'), false) AS products_insert,
    COALESCE(has_table_privilege(current_user, to_regclass('public.products'), 'UPDATE'), false) AS products_update,
    COALESCE(has_table_privilege(current_user, to_regclass('public.products'), 'DELETE'), false) AS products_delete,
    COALESCE(has_table_privilege(current_user, to_regclass('public.guest_sessions'), 'SELECT'), false) AS guest_sessions_select,
    COALESCE(has_table_privilege(current_user, to_regclass('public.guest_sessions'), 'INSERT'), false) AS guest_sessions_insert,
    COALESCE(has_table_privilege(current_user, to_regclass('public.guest_sessions'), 'UPDATE'), false) AS guest_sessions_update,
    COALESCE(has_table_privilege(current_user, to_regclass('public.guest_sessions'), 'DELETE'), false) AS guest_sessions_delete,
    COALESCE(has_table_privilege(current_user, to_regclass('public.cart_items'), 'SELECT'), false) AS cart_items_select,
    COALESCE(has_table_privilege(current_user, to_regclass('public.cart_items'), 'INSERT'), false) AS cart_items_insert,
    COALESCE(has_table_privilege(current_user, to_regclass('public.cart_items'), 'UPDATE'), false) AS cart_items_update,
    COALESCE(has_table_privilege(current_user, to_regclass('public.cart_items'), 'DELETE'), false) AS cart_items_delete,
    COALESCE(has_table_privilege(current_user, to_regclass('public.wishlist_items'), 'SELECT'), false) AS wishlist_items_select,
    COALESCE(has_table_privilege(current_user, to_regclass('public.wishlist_items'), 'INSERT'), false) AS wishlist_items_insert,
    COALESCE(has_table_privilege(current_user, to_regclass('public.wishlist_items'), 'UPDATE'), false) AS wishlist_items_update,
    COALESCE(has_table_privilege(current_user, to_regclass('public.wishlist_items'), 'DELETE'), false) AS wishlist_items_delete,
    COALESCE(has_table_privilege(current_user, to_regclass('public.products'), 'TRUNCATE'), false) AS products_truncate,
    COALESCE(has_table_privilege(current_user, to_regclass('public.products'), 'TRIGGER'), false) AS products_trigger,
    COALESCE(has_table_privilege(current_user, to_regclass('public.products'), 'REFERENCES'), false) AS products_references,
    COALESCE(has_table_privilege(current_user, to_regclass('public.guest_sessions'), 'TRUNCATE'), false) AS guest_sessions_truncate,
    COALESCE(has_table_privilege(current_user, to_regclass('public.guest_sessions'), 'TRIGGER'), false) AS guest_sessions_trigger,
    COALESCE(has_table_privilege(current_user, to_regclass('public.guest_sessions'), 'REFERENCES'), false) AS guest_sessions_references,
    COALESCE(has_table_privilege(current_user, to_regclass('public.cart_items'), 'TRUNCATE'), false) AS cart_items_truncate,
    COALESCE(has_table_privilege(current_user, to_regclass('public.cart_items'), 'TRIGGER'), false) AS cart_items_trigger,
    COALESCE(has_table_privilege(current_user, to_regclass('public.cart_items'), 'REFERENCES'), false) AS cart_items_references,
    COALESCE(has_table_privilege(current_user, to_regclass('public.wishlist_items'), 'TRUNCATE'), false) AS wishlist_items_truncate,
    COALESCE(has_table_privilege(current_user, to_regclass('public.wishlist_items'), 'TRIGGER'), false) AS wishlist_items_trigger,
    COALESCE(has_table_privilege(current_user, to_regclass('public.wishlist_items'), 'REFERENCES'), false) AS wishlist_items_references
  FROM pg_roles r
  WHERE r.rolname = current_user
`;

function hasRequiredPrivileges(row: PreflightRow): boolean {
  // These checks use PostgreSQL's effective privilege functions, including grants
  // inherited through role membership. Permit only the API's required privileges.
  const requiredTablePrivileges: (keyof PreflightRow)[] = [
    'products_select',
    'guest_sessions_select', 'guest_sessions_insert', 'guest_sessions_update', 'guest_sessions_delete',
    'cart_items_select', 'cart_items_insert', 'cart_items_update', 'cart_items_delete',
    'wishlist_items_select', 'wishlist_items_insert', 'wishlist_items_update', 'wishlist_items_delete',
  ];
  const forbiddenTablePrivileges: (keyof PreflightRow)[] = [
    'products_insert', 'products_update', 'products_delete',
    'products_truncate', 'products_trigger', 'products_references',
    'guest_sessions_truncate', 'guest_sessions_trigger', 'guest_sessions_references',
    'cart_items_truncate', 'cart_items_trigger', 'cart_items_references',
    'wishlist_items_truncate', 'wishlist_items_trigger', 'wishlist_items_references',
  ];

  return (
    row.database_can_connect &&
    !row.database_can_create &&
    row.schema_can_use &&
    !row.schema_can_create &&
    forbiddenTablePrivileges.every((privilege) => row[privilege] === false) &&
    requiredTablePrivileges.every((privilege) => row[privilege] === true)
  );
}

function matchesExpectedIdentity(row: PreflightRow): boolean {
  return (
    row.database_name === integrationDatabaseTarget.database &&
    row.role_name === integrationDatabaseTarget.user &&
    row.server_version_num >= 170000 &&
    row.server_version_num < 180000 &&
    !row.role_is_superuser &&
    !row.role_can_create_database &&
    !row.role_can_create_roles &&
    !row.role_can_replicate &&
    !row.role_can_bypass_rls &&
    row.effective_role_membership_count === '0' &&
    row.owned_application_objects_count === '0' &&
    row.guest_session_count === '0' &&
    row.cart_item_count === '0' &&
    row.wishlist_item_count === '0' &&
    hasRequiredPrivileges(row)
  );
}

export async function verifyIntegrationDatabase(
  client: Pick<PoolClient, 'query' | 'release'>,
): Promise<void> {
  let transactionStarted = false;
  let failure: IntegrationDatabaseSafetyError | undefined;
  try {
    await client.query('BEGIN READ ONLY');
    transactionStarted = true;
    const result = await client.query<PreflightRow>(preflightQuery);
    if (result.rows.length !== 1 || !matchesExpectedIdentity(result.rows[0])) {
      failure = new IntegrationDatabaseSafetyError(
        'The connected database identity or runtime privileges do not match the approved test target.',
      );
    }
  } catch {
    failure = new IntegrationDatabaseSafetyError(
      'The integration database read-only preflight could not be completed.',
    );
  } finally {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        failure ??= new IntegrationDatabaseSafetyError(
          'The integration database read-only preflight could not be closed safely.',
        );
      }
    }
    client.release();
  }

  if (failure) {
    throw failure;
  }
}

export type IntegrationPoolFactory = (config: PoolConfig) => Pick<Pool, 'connect' | 'end' | 'query'>;

export async function createVerifiedIntegrationPool(
  env: Record<string, string | undefined>,
  poolFactory: IntegrationPoolFactory = (config) => new Pool(config),
): Promise<Pick<Pool, 'connect' | 'end' | 'query'>> {
  const connectionString = requireIntegrationDatabaseUrl(env);
  const pool = poolFactory({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 5000,
  });
  try {
    const client = await pool.connect();
    await verifyIntegrationDatabase(client);
    return pool;
  } catch (error) {
    try {
      await pool.end();
    } catch {
      throw new IntegrationDatabaseSafetyError(
        'The integration database preflight failed and its pool could not be closed safely.',
      );
    }
    if (error instanceof IntegrationDatabaseSafetyError) {
      throw error;
    }
    throw new IntegrationDatabaseSafetyError(
      'The integration database connection could not be verified.',
    );
  }
}

export function hashGuestSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function deleteTrackedGuestSessions(
  pool: Pick<Pool, 'query'>,
  tokenHashes: Iterable<string>,
): Promise<void> {
  const hashes = [...new Set(tokenHashes)];
  if (hashes.length === 0) {
    return;
  }
  if (hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
    throw new IntegrationDatabaseSafetyError(
      'Tracked guest-session cleanup received an invalid session hash.',
    );
  }

  try {
    await pool.query(
      'DELETE FROM guest_sessions WHERE token_hash = ANY($1::char(64)[])',
      [hashes],
    );
  } catch {
    throw new IntegrationDatabaseSafetyError(
      'Tracked guest-session cleanup failed; no broader cleanup was attempted.',
    );
  }
}
