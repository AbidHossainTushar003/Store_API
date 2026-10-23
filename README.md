# Shopademia API

NestJS modular-monolith backend providing the authoritative platform API and public `/api/v1` contract.

## Purpose
- Identity and permissions
- Seller and inventory management
- Orders, payments, and fulfilment
- Platform operations and reporting

## Catalogue, cart, and wishlist

The public catalogue includes only non-demo listings that are active, in stock, explicitly
approved for publication, and owned by an approved seller. Demo products remain
non-purchasable; guest cart and wishlist endpoints are available for local testing.

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

The migration command applies all eight ordered SQL migrations in a transaction. Migration history is
not currently tracked, so verify the target and schema state before running it.

The guest cart and wishlist use an expiring, HTTP-only cookie. Demo products cannot be
ordered.

## Health checks

- `GET /api/v1/health` is a liveness check and does not depend on PostgreSQL.
- `GET /api/v1/health/ready` checks PostgreSQL access and the required columns for
  the product, cart, wishlist, order, seller-application, Super Admin, and support
  schemas. It returns `503` when the database cannot be queried or required columns
  are absent, without exposing schema details in the response.

The readiness check verifies connectivity and required column presence, including
publication approval and the publication and seller-application audit tables. It does
not establish migration history, validate constraints or indexes, or replace
migration-state review.
In production, `STOREFRONT_ORIGIN` must be explicitly set to the public HTTPS storefront
origin; the API refuses to start with the local development default or an HTTP origin.

## Unexpected API errors

Unexpected server errors return a generic message and a request ID for correlation.
The response path uses the matched route pattern rather than the request URL, so query
strings and path parameters are not echoed. Server logs include the method, route pattern,
status, request ID, a safe error class, and only recognized PostgreSQL SQLSTATE values.
They intentionally exclude exception messages, SQL text, parameters, request bodies,
credentials, and stack traces.

## Local-only COD workflow

The local workflow is intentionally separate from production authentication and payments.
It is available only when `LOCAL_DEMO_MODE=true`, `NODE_ENV=development`, and `HOST` is
`127.0.0.1`, `localhost`, or `::1`. Environment validation refuses to start the API in
this mode on a non-loopback host or in production. Start the API with
`HOST=127.0.0.1` and `LOCAL_DEMO_MODE=true`; do not expose the development portals to
other machines.

Local test identities:

- Seller: `seller@example.test` / `SellerDemo!2026`
- Admin: `admin@example.test` / `AdminDemo!2026`

The API issues separate signed, HTTP-only seller and admin development cookies so both
portals can stay signed in within the same localhost browser. Signing out of one portal
clears only that role's cookie. The signing key is generated in memory at API startup, so
restarting the API invalidates local sessions. The seller can create a priced draft, an
admin must activate it, then a guest can place a cash-on-delivery order, the seller must
confirm it, and the admin can finalize it. Each order is limited to one shop. The workflow
stores test contact/address details in the configured database and decrements stock
transactionally. Use fictional test data only.

Seller inventory supports owner-scoped stock updates and pausing active listings. New
listings remain drafts and only an Admin can activate or reactivate them. Seller workspace
counts and order/low-stock notices are derived from current data. Admin-only routes provide
product status moderation, derived category/seller/customer views, daily COD analytics, a
recent activity feed, and seller-application status decisions. These routes use the fixed
local admin role in local mode and the Auth0 Super Admin boundary in configured mode.
Approved Auth0 seller applications grant access to seller-owned API routes; they do not
provision a separate shop entity. The activity feed is not an immutable audit log.

Production checkout is disabled until delivery-fee collection and order fulfilment are
configured. The system does not provide real payment processing, shipping labels,
delivered notifications, or production readiness. Never use the local test credentials
or workflow for a public deployment.

## Seller applications

The seller application endpoints require a valid Auth0 access token, a matching active
server-managed Auth0 session in the shared Redis store, and the verified Auth0 email
returned by the configured tenant's UserInfo endpoint:

- `POST /api/v1/seller-applications` submits one application per Auth0 subject.
- `GET /api/v1/seller-applications/me` returns only the authenticated subject's application.

Applicant name and application details are supplied by the user; email and ownership
identity are derived server-side. A duplicate submission returns `409`. The application starts as `pending`; an authenticated Super Admin can approve or reject
it with a reason. An approved Auth0 subject can use seller-owned API routes; approval
does not provision a separate shop entity. An approved seller can be suspended with a
reason; this revokes that seller's existing publication approvals and records both the
seller decision and product revocations atomically. Restoring seller eligibility does
not republish products; each listing requires a separate publication review.

Configure `AUTH0_ISSUER_URL`, `AUTH0_AUDIENCE`, `REDIS_URL`, and
`SUPER_ADMIN_MFA_CLAIM` for the API. Production startup requires an HTTPS issuer and MFA
claim, an audience, and a TLS-enabled `rediss://` session registry. This verifies the
presence and URL form of these settings; it does not prove that the Auth0 tenant issues
the MFA claim only after the required MFA flow. Configure
the matching Auth0 tenant as `AUTH0_DOMAIN`, the same audience, and the same Redis URL
for the seller BFF. The Redis session key namespace is `shopademia:auth0:*`. The BFF stores its
Auth0 session data encrypted with AES-256-GCM using a separate
`AUTH0_SESSION_ENCRYPTION_KEY`; the API checks only the active session-to-subject index.
Use private network access and TLS for Redis outside local development.

The seller-application and local COD schemas are in
`src/database/002-seller-applications.sql` and `src/database/003-local-commerce.sql`.
The explicit migration runner applies all eight migrations in one transaction. Migration
`005-seller-access.sql` widens seller identity columns for Auth0 subjects. No migrations
are run automatically.
Migration history is not tracked. Inspect the exact target and schema state and obtain
separate approval before running `npm run db:migrate`; this implementation does not
apply migrations or provision databases.

## Contact requests

Support intake is disabled by default. When `SUPPORT_CONTACT_ENABLED=true`,
`SUPPORT_RETENTION_POLICY_APPROVED=true`, and every required `SUPPORT_SMTP_*`,
`SUPPORT_EMAIL_FROM`, `SUPPORT_EMAIL_TO`, and `SUPPORT_TICKET_RETENTION_DAYS` setting is
valid, the API configures SMTP delivery and starts expired-ticket cleanup. Otherwise,
the contact endpoint returns `503` without saving or emailing the request. The policy
flag is an operator attestation, not evidence of approval by itself. Do not set either
enablement flag until the applicable retention/privacy policy is approved and covers
the ticket database, email copies, logs, backups, and exports. No approved policy or
retention duration is established by this repository.

Before enabling intake, obtain separate approval for the exact database target and apply
`006-support-tickets.sql` through the explicit migration process. The migration runner
applies all eight SQL files in one transaction, has no migration-history table, and does
not run at API startup. Migration state must be verified against the target before use.
Do not run `npm run db:migrate` against shared or production data without separate
approval.

`007-product-publication.sql` adds a publication-approval state that defaults existing
and new records to unapproved, plus a durable publication audit table. Applying the
migration is a separate operational action; no database or backfill has been run here.
Admin approval and revocation include a reason and commit with the audit record in one
transaction. Material listing changes suspend existing approval and write an audit
record atomically. The readiness endpoint checks required publication columns and audit
table columns, but does not validate indexes, constraints, or migration history.

`008-seller-publication-suspension.sql` adds the suspended seller-application state and
durable application-decision audit records. Suspending an approved seller atomically
revokes that seller's currently approved product publications and records each product
revocation. Restoring seller eligibility does not republish products; each product
requires a separate publication review. Seller decisions and product revocations require
a reason and are committed with their audit records atomically. Applying this migration
remains a separate operational action.

After the service is enabled, `POST /api/v1/contact` validates fields, applies a
per-process rate limit, inserts the ticket, and then attempts an SMTP notification. The
response's `notificationSent` flag means the configured SMTP service accepted at least
one recipient; it does not prove final recipient delivery. SMTP failure does not undo an
inserted ticket. A notification-status update failure is logged without exposing error
details; operators may need to review the ticket reference directly in the approved
database. There is no notification retry queue or request idempotency key. If a client
loses the response after a possible insert, do not submit again until an authorized
operator checks whether the ticket was stored.
The browser disables the form after an indeterminate outcome and records a per-tab
session marker so the same tab remains locked after reload; the marker contains no form
content. This is only a client-side safeguard. The endpoint has no idempotency key, so a
different tab or browser can still create a duplicate. A durable retry/idempotency design
would require a separately approved API/schema change.

The hourly cleanup task attempts to remove expired ticket database rows. This does not
delete email copies, logs, backups, or exports, and it is not a guarantee that deletion
has completed. Select `SUPPORT_TICKET_RETENTION_DAYS` only from an approved policy.
SMTP credentials must remain server-side and must not be committed.

The `.env.example` contains placeholders only. SMTP status and support flags should be
reported as configured/not configured without printing values. No local mail sink is
included or configured in this repository. The API rate limiter is in-memory and per
process. If the API is behind a reverse proxy, configure Express to trust only the known
proxy hops so the client address is derived correctly; do not trust arbitrary forwarded
headers. Deployments with multiple instances must also enforce appropriate rate limits
at their trusted ingress.

The focused support tests use mocked PostgreSQL and SMTP clients. They do not prove a
real migration, database write, SMTP connection, or recipient delivery.

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

## Super Admin identity bootstrap

The API includes a fail-closed Auth0-backed Super Admin identity boundary. The first
identity can be registered only by an authenticated Auth0 session that proves a
configured MFA claim and presents a one-time token whose SHA-256 digest matches
`SUPER_ADMIN_BOOTSTRAP_TOKEN_SHA256`. Registration, token consumption, and the audit
entry are committed atomically. The raw token is never stored or logged, and the
bootstrap state is single-use.

Before enabling this in a real environment:

1. Configure Auth0 email/password sign-in, required passkey MFA, and TOTP recovery.
   Configure the Auth0 tenant to issue the configured `SUPER_ADMIN_MFA_CLAIM` only
   after the required MFA policy succeeds. The API does not itself enroll factors or
   prove a specific factor; an unverified or incorrectly issued custom claim is not
   acceptable.
2. Generate a high-entropy one-time bootstrap token locally, keep the token and its
   SHA-256 hex digest in approved secret storage, and set only the digest in the API
   runtime environment. Never commit either value or send the token in chat.
3. Apply `src/database/004-super-admin-security.sql` only after verifying the exact
   database target and obtaining separate approval. The normal API start does not
   apply it.
4. Use a dedicated Admin Auth0 application/BFF that establishes the active Redis
   session required by the API guard. The current Admin portal still uses the
   loopback-only local test sign-in and is not yet wired to this Super Admin API.

Until the migration, Auth0 MFA claim policy, bootstrap secrets, and Admin BFF are
configured and independently verified, no production administrator can bootstrap or
use these routes. Production API startup now fails closed if its MFA claim, Auth0
issuer/audience, or TLS Redis configuration is absent or malformed. Local demo identities
do not satisfy this boundary.
