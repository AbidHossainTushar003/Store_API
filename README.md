# Shopademia API

NestJS modular-monolith backend providing the authoritative platform API and public `/api/v1` contract.

## Purpose
- Identity and permissions
- Seller and inventory management
- Orders, payments, and fulfilment
- Platform operations and reporting

## Demo catalogue, cart, and wishlist

The current commerce endpoints support only the explicitly fictional demo products
inserted by the initial SQL migration. They do not create orders or process payments.

1. Configure `DATABASE_URL` with the restricted runtime PostgreSQL connection and set
   `STOREFRONT_ORIGIN` to the exact storefront origin (for example,
   `http://localhost:3000`). The API runtime uses only `DATABASE_URL`.
2. To run migrations, provide the migration-owner connection as
   `MIGRATION_DATABASE_URL` in the process environment for the explicit
   `npm run db:migrate` command. The migration command does not load the API `.env`
   file and never falls back to `DATABASE_URL`. Do not put the owner connection in the
   runtime `.env`, source, or a tracked file. Supply it through an approved local
   secret manager or other secure local process-environment method.
3. Start the API with `npm run start:dev`. Normal API startup does not run migrations.

The migration command applies the SQL migration in a transaction. Migration history is
not currently tracked, so verify the target and schema state before running it.

The demo cart and wishlist use an expiring, HTTP-only guest cookie. Do not treat these
endpoints or demo items as production commerce, checkout, or payment functionality.

## PostgreSQL integration tests

The normal `npm test` command runs unit and mocked API tests only; it does not require
PostgreSQL. Those tests use a non-routable mock connection URL when no runtime URL is
provided, so they do not fall back to the Windows PostgreSQL service on port 5432.

Real PostgreSQL tests are isolated behind `npm run test:integration`. They require an
explicit `SHOPADEMIA_TEST_DATABASE_URL` identifying all of the following:

- Host `127.0.0.1`
- Port `55432`
- Database `shopademia_d7_test`
- User `shopademia_d7_test_app`

The integration harness checks the URL before opening a connection. It then performs a
read-only identity, privilege, and empty mutable-commerce-state preflight before
constructing the API test application. It rejects the D6 development database,
unexpected targets, PostgreSQL versions other than 17, elevated runtime roles, missing
schema/table privileges, absent commerce tables, or pre-existing guest/cart/wishlist
rows. This empty-state requirement protects the integration suite from the API's
global expired-session cleanup behavior. Run it only against the dedicated target with
no concurrent writers. It never falls back to `DATABASE_URL` or port 5432. Do not put
credentials in source or tracked documentation.

The test role is a runtime role, not the migration owner. It needs `CONNECT` on the test
database, `USAGE` but not `CREATE` on `public`, `SELECT` on `products`, and
`SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the guest-session, cart, and wishlist
tables. This is an explicit least-privilege allowlist: the role must not have product
write privileges, `TRUNCATE`, `TRIGGER`, or `REFERENCES` on any application table, or
`CREATE` on `public`. Effective PostgreSQL privilege checks account for inherited grants;
superuser, database creation, role creation, replication, BYPASSRLS, any role membership,
and ownership of public application objects are rejected. Database/role provisioning
and grants require separate approval. After the test database is confirmed empty, apply
the existing migration manually with the migration-owner credential through the explicit
`npm run db:migrate` command, after separate approval. The test harness never applies
migrations or seeds.

The names `shopademia_d7_test`, `shopademia_d7_test_app`, and
`shopademia_d7_test_owner` are proposed names; their existence has not been verified.
The dedicated test database must remain exclusive to the integration run. No concurrent
application, test, or manual writer may access it during the run. The empty-state
preflight is a point-in-time check and cannot prevent a concurrent writer from changing
the database afterward.

The integration suite tracks only guest-session tokens returned by its own requests,
hashes them, and deletes only the exact matching session rows during cleanup; it never
deletes product rows or truncates tables. Guest-session creation also removes expired
sessions globally, so the target must be a dedicated disposable database. This
implementation does not create database resources. Database provisioning, grant
changes, migration, and live integration execution each require separate explicit
approval.
