import { HttpStatus, INestApplication, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { POSTGRES_POOL } from '../../src/database/database.module';
import {
  createVerifiedIntegrationPool,
  deleteTrackedGuestSessions,
  hashGuestSessionToken,
} from './database-safety';

describe('real PostgreSQL commerce integration', () => {
  let app: INestApplication;
  let pool: Pick<Pool, 'connect' | 'end' | 'query'>;
  const sessionHashes = new Set<string>();
  const originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    STOREFRONT_ORIGIN: process.env.STOREFRONT_ORIGIN,
  };

  function trackSessionCookie(
    setCookie: string | string[] | undefined,
    required = true,
  ): void {
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .find((value) => value?.startsWith('shopademia_guest='));
    const token = cookie?.match(/^shopademia_guest=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
    if (!token) {
      if (!required && !cookie) {
        return;
      }
      throw new Error(
        'A test-created guest session could not be tracked for exact cleanup; no broad cleanup will be attempted.',
      );
    }
    sessionHashes.add(hashGuestSessionToken(token));
  }

  beforeAll(async () => {
    pool = await createVerifiedIntegrationPool(process.env);
    process.env.DATABASE_URL = process.env.SHOPADEMIA_TEST_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.STOREFRONT_ORIGIN = 'http://localhost:3000';

    try {
      const { AppModule } = await import('../../src/app.module');
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(POSTGRES_POOL)
        .useValue(pool)
        .compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        exceptionFactory: (errors) => new UnprocessableEntityException({
          success: false,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
          message: errors.flatMap((error) => Object.values(error.constraints ?? {})),
        }),
      }));
      app.useGlobalFilters(new HttpExceptionFilter());
      await app.init();
    } catch {
      throw new Error('The integration API test application could not be initialized safely.');
    }
  });

  afterAll(async () => {
    try {
      if (pool) {
        await deleteTrackedGuestSessions(pool, sessionHashes);
      }
    } finally {
      try {
        if (app) {
          await app.close();
        } else if (pool) {
          await pool.end();
        }
      } finally {
        if (originalEnvironment.DATABASE_URL === undefined) {
          delete process.env.DATABASE_URL;
        } else {
          process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
        }
        if (originalEnvironment.NODE_ENV === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = originalEnvironment.NODE_ENV;
        }
        if (originalEnvironment.STOREFRONT_ORIGIN === undefined) {
          delete process.env.STOREFRONT_ORIGIN;
        } else {
          process.env.STOREFRONT_ORIGIN = originalEnvironment.STOREFRONT_ORIGIN;
        }
      }
    }
  });

  it('persists cart changes across independent HTTP requests', async () => {
    const agent = request.agent(app.getHttpServer());
    const added = await agent
      .post('/api/v1/cart/items')
      .send({ productId: 'sample-notebook', quantity: 2 });
    trackSessionCookie(added.headers['set-cookie']);
    expect(added.status).toBe(HttpStatus.CREATED);

    const cart = await agent
      .get('/api/v1/cart')
      .expect(HttpStatus.OK);
    expect(cart.body).toEqual(expect.objectContaining({
      totalQuantity: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ id: 'sample-notebook', quantity: 2 }),
      ]),
    }));

    await agent
      .delete('/api/v1/cart/items/sample-notebook')
      .expect(HttpStatus.OK);
    await agent
      .get('/api/v1/cart')
      .expect(HttpStatus.OK)
      .expect(({ body }) => expect(body.items).toEqual([]));
  });

  it('persists wishlist changes across independent HTTP requests', async () => {
    const agent = request.agent(app.getHttpServer());
    const added = await agent
      .post('/api/v1/wishlist/items')
      .send({ productId: 'sample-desk-organizer' });
    trackSessionCookie(added.headers['set-cookie']);
    expect(added.status).toBe(HttpStatus.CREATED);

    const wishlist = await agent
      .get('/api/v1/wishlist')
      .expect(HttpStatus.OK);
    expect(wishlist.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'sample-desk-organizer' }),
    ]));

    await agent
      .delete('/api/v1/wishlist/items/sample-desk-organizer')
      .expect(HttpStatus.OK);
    await agent
      .get('/api/v1/wishlist')
      .expect(HttpStatus.OK)
      .expect(({ body }) => expect(body.items).toEqual([]));
  });

  it('lists exactly the four fictional demo products', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/products')
      .expect(HttpStatus.OK);

    expect(response.body.products.map((product: { id: string }) => product.id).sort())
      .toEqual([
        'sample-cable-case',
        'sample-canvas-bag',
        'sample-desk-organizer',
        'sample-notebook',
      ]);
    expect(response.body.products.every((product: { isDemo: boolean }) => product.isDemo))
      .toBe(true);
  });

  it('rejects unknown cart and wishlist product IDs', async () => {
    const agent = request.agent(app.getHttpServer());
    const cartResponse = await agent
      .post('/api/v1/cart/items')
      .send({ productId: 'missing-demo-product' });
    trackSessionCookie(cartResponse.headers['set-cookie']);
    expect(cartResponse.status).toBe(HttpStatus.NOT_FOUND);
    expect(cartResponse.body.message).toContain('Demo product not found.');

    const wishlistResponse = await agent
      .post('/api/v1/wishlist/items')
      .send({ productId: 'missing-demo-product' });
    expect(wishlistResponse.status).toBe(HttpStatus.NOT_FOUND);
    expect(wishlistResponse.body.message).toContain('Demo product not found.');
  });

  it('replaces an expired test-owned guest session without retaining its cart', async () => {
    const agent = request.agent(app.getHttpServer());
    const created = await agent
      .post('/api/v1/cart/items')
      .send({ productId: 'sample-notebook', quantity: 2 });
    trackSessionCookie(created.headers['set-cookie']);
    expect(created.status).toBe(HttpStatus.CREATED);

    const setCookie = (Array.isArray(created.headers['set-cookie'])
      ? created.headers['set-cookie']
      : [created.headers['set-cookie']])
      .find((value: string | undefined) => value?.startsWith('shopademia_guest='));
    const token = setCookie?.match(/^shopademia_guest=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
    if (!token) {
      throw new Error('The test-owned session cookie could not be identified for expiry control.');
    }
    const tokenHash = hashGuestSessionToken(token);
    const expired = await pool.query(
      `UPDATE guest_sessions
       SET expires_at = now() - interval '1 second'
       WHERE token_hash = $1
       RETURNING id`,
      [tokenHash],
    );
    expect(expired.rowCount).toBe(1);

    const cartAfterExpiry = await agent.get('/api/v1/cart').expect(HttpStatus.OK);
    expect(cartAfterExpiry.body.items).toEqual([]);
    trackSessionCookie(cartAfterExpiry.headers['set-cookie']);

    const replacement = (Array.isArray(cartAfterExpiry.headers['set-cookie'])
      ? cartAfterExpiry.headers['set-cookie']
      : [cartAfterExpiry.headers['set-cookie']])
      .find((value: string | undefined) => value?.startsWith('shopademia_guest='));
    const replacementToken = replacement?.match(
      /^shopademia_guest=([A-Za-z0-9_-]{43})(?:;|$)/,
    )?.[1];
    expect(replacementToken).toBeDefined();
    expect(replacementToken).not.toBe(token);
  });

  it('keeps cart and wishlist data isolated between guests', async () => {
    const guestA = request.agent(app.getHttpServer());
    const guestB = request.agent(app.getHttpServer());

    const cartCreated = await guestA
      .post('/api/v1/cart/items')
      .send({ productId: 'sample-cable-case' });
    trackSessionCookie(cartCreated.headers['set-cookie']);
    expect(cartCreated.status).toBe(HttpStatus.CREATED);

    const wishlistCreated = await guestA
      .post('/api/v1/wishlist/items')
      .send({ productId: 'sample-canvas-bag' });
    expect(wishlistCreated.status).toBe(HttpStatus.CREATED);

    const guestBCart = await guestB.get('/api/v1/cart');
    trackSessionCookie(guestBCart.headers['set-cookie']);
    expect(guestBCart.status).toBe(HttpStatus.OK);
    expect(guestBCart.body.items).toEqual([]);
    await guestB.get('/api/v1/wishlist')
      .expect(HttpStatus.OK)
      .expect(({ body }) => expect(body.items).toEqual([]));

    await guestA.get('/api/v1/cart')
      .expect(HttpStatus.OK)
      .expect(({ body }) => expect(body.items.map((item: { id: string }) => item.id))
        .toContain('sample-cable-case'));
    await guestA.get('/api/v1/wishlist')
      .expect(HttpStatus.OK)
      .expect(({ body }) => expect(body.items.map((item: { id: string }) => item.id))
        .toContain('sample-canvas-bag'));
  });

  it('rejects invalid quantities without changing a guest cart', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/cart/items')
      .send({ productId: 'sample-notebook', quantity: 0 })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    const cart = await agent.get('/api/v1/cart').expect(HttpStatus.OK);
    trackSessionCookie(cart.headers['set-cookie']);
    expect(cart.body.items).toEqual([]);
  });
});
