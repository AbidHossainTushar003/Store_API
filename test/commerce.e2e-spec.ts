import { HttpStatus, INestApplication, Logger, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { POSTGRES_POOL } from '../src/database/database.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Demo commerce API (mocked PostgreSQL pool)', () => {
  let app: INestApplication;
  let query: jest.Mock;

  beforeAll(async () => {
    query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM guest_sessions')) {
        return { rows: [{ id: 'session-id' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO guest_sessions')) {
        return { rows: [{ id: 'session-id' }], rowCount: 1 };
      }
      if (sql.includes('FROM products') && sql.includes('ORDER BY id')) {
        return {
          rows: [{
            id: 'sample-notebook',
            title: 'Everyday notebook',
            description: 'An example.',
            category: 'Books & stationery',
            brand: 'Northstar Studio',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO cart_items')) {
        return { rows: [{ product_id: 'sample-notebook', quantity: 1 }], rowCount: 1 };
      }
      if (sql.includes('FROM cart_items ci')) {
        return {
          rows: [{
            id: 'sample-notebook',
            title: 'Everyday notebook',
            description: 'An example.',
            category: 'Books & stationery',
            brand: 'Northstar Studio',
            quantity: 1,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const pool = { query, end: jest.fn() } as unknown as Pool;
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists only explicitly demo products', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body.products[0]).toEqual(expect.objectContaining({
          id: 'sample-notebook',
          isDemo: true,
        }));
      });
  });

  it('returns a generic 500 response when a database query fails', async () => {
      const driverDetails = 'raw-driver-sentinel test-user test-password';
      const loggedErrors: string[] = [];
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation((message) => {
        loggedErrors.push(String(message));
      });
      query.mockRejectedValueOnce(new Error(driverDetails));

      try {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .expect(HttpStatus.INTERNAL_SERVER_ERROR);

        expect(JSON.stringify(response.body)).not.toContain(driverDetails);
        expect(JSON.stringify(response.body)).not.toContain('raw-driver-sentinel');
        expect(JSON.stringify(response.body)).not.toContain('test-password');
        expect(loggedErrors.join(' ')).not.toContain(driverDetails);
        expect(loggedErrors.join(' ')).not.toContain('raw-driver-sentinel');
        expect(loggedErrors.join(' ')).not.toContain('test-password');
      } finally {
        loggerSpy.mockRestore();
      }
  });

  it('adds a product to a guest cart and issues a protected session cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productId: 'sample-notebook' })
      .expect(HttpStatus.CREATED);

    expect(response.body).toEqual({
      success: true,
      item: { product_id: 'sample-notebook', quantity: 1 },
    });
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('Path=/api/v1');
  });

  it('returns guest cart items', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Cookie', `shopademia_guest=${'a'.repeat(43)}`)
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body.totalQuantity).toBe(1);
        expect(body.items[0].id).toBe('sample-notebook');
      });
  });

  it('rejects an invalid cart quantity', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productId: 'sample-notebook', quantity: 0 })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('removes an item from the guest cart', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/cart/items/sample-notebook')
      .set('Cookie', `shopademia_guest=${'a'.repeat(43)}`)
      .expect(HttpStatus.OK)
      .expect({ success: true });

    expect(query).toHaveBeenCalledWith(
      'DELETE FROM cart_items WHERE guest_session_id = $1 AND product_id = $2',
      ['session-id', 'sample-notebook'],
    );
  });

  it('removes an item from the guest wishlist', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/wishlist/items/sample-notebook')
      .set('Cookie', `shopademia_guest=${'a'.repeat(43)}`)
      .expect(HttpStatus.OK)
      .expect({ success: true });

    expect(query).toHaveBeenCalledWith(
      'DELETE FROM wishlist_items WHERE guest_session_id = $1 AND product_id = $2',
      ['session-id', 'sample-notebook'],
    );
  });

  it('accepts an explicit valid cart quantity', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productId: 'sample-notebook', quantity: 3 })
      .expect(HttpStatus.CREATED);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cart_items'),
      ['session-id', 'sample-notebook', 3],
    );
  });

  it('rejects cart quantities above the supported maximum', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productId: 'sample-notebook', quantity: 100 })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
  });
});
