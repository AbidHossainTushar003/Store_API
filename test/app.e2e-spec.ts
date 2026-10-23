import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, Logger, ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { POSTGRES_POOL } from '../src/database/database.module';
import { Pool } from 'pg';

class ValidationTestDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

@Controller('test')
class ValidationTestController {
  @Post('validation')
  validate(@Body() body: ValidationTestDto) {
    return { ok: true, payload: body };
  }

  @Get('server-error')
  failWithSensitiveDetails(): never {
    throw new Error('database-secret-details');
  }
}

@Module({
  controllers: [ValidationTestController],
})
class ValidationTestModule {}

describe('Shopademia API foundation', () => {
  let app: INestApplication;
  let databaseQuery: jest.Mock;

  beforeAll(async () => {
    databaseQuery = jest.fn();
    const pool = { query: databaseQuery, end: jest.fn() } as unknown as Pool;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, ValidationTestModule],
    })
      .overrideProvider(POSTGRES_POOL)
      .useValue(pool)
      .compile();


    app = moduleFixture.createNestApplication();
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

    const config = new DocumentBuilder()
      .setTitle('Shopademia API')
      .setDescription('OpenAPI for the Shopademia API foundation.')
      .setVersion('1.0.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    databaseQuery.mockClear();
  });

  it('does not issue database queries or run migrations during normal startup', () => {
    expect(databaseQuery).not.toHaveBeenCalled();
  });

  it('/api/v1/health should return a 200 response', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(HttpStatus.OK);

    expect(response.body).toEqual(expect.objectContaining({
      status: 'ok',
      service: 'shopademia-api',
    }));
  });

  it('/api/v1/health/ready should report a complete database schema', async () => {
    databaseQuery.mockResolvedValueOnce({ rows: [{ missingColumns: [] }] });

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(HttpStatus.OK);

    expect(response.body).toEqual(expect.objectContaining({
      status: 'ok',
      service: 'shopademia-api',
      database: 'ready',
    }));
  });

  it('/api/v1/health/ready should fail when required schema is missing', async () => {
    databaseQuery.mockResolvedValueOnce({
      rows: [{ missingColumns: ['products.price_bdt'] }],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(HttpStatus.SERVICE_UNAVAILABLE);

    expect(response.body.message).toContain('API dependencies are not ready.');
    expect(JSON.stringify(response.body)).not.toContain('products.price_bdt');
  });

  it('/api/v1/health/ready should fail closed without exposing database errors', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const logWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const failure = Object.assign(
      new Error('database-secret-details SELECT private-query with-secret'),
      { code: '42703' },
    );
    databaseQuery.mockRejectedValueOnce(failure);

    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .set('x-request-id', 'd7e5d6c7-65a4-4f77-9b24-1234567890ab')
      .expect(HttpStatus.SERVICE_UNAVAILABLE);

    expect(response.body.message).toContain('API dependencies are not ready.');
    expect(JSON.stringify(response.body)).not.toMatch(/database-secret-details|private-query|with-secret|42703/);
    expect(response.headers['x-request-id']).toBe('d7e5d6c7-65a4-4f77-9b24-1234567890ab');
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain(
      'requestId=d7e5d6c7-65a4-4f77-9b24-1234567890ab errorClass=Error sqlState=42703',
    );
    expect(logError.mock.calls[0][0]).not.toMatch(/database-secret-details|private-query|with-secret|SELECT/);
    expect(failure.stack).toBeDefined();
    expect(logError.mock.calls[0][0]).not.toContain(failure.stack);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it('/api/v1/seller-applications/me should reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/seller-applications/me')
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('/api/v1/test/validation should reject invalid payloads', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/test/validation')
      .send({ notName: 'invalid' })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }));
  });

  it('/api/v1/test/server-error should not expose internal exception details', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test/server-error')
      .expect(HttpStatus.INTERNAL_SERVER_ERROR);

    expect(response.body.message).toEqual(['Internal server error']);
    expect(JSON.stringify(response.body)).not.toContain('database-secret-details');
  });

  it('/api/v1/contact should reject a line break in the email subject', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/contact')
      .send({
        name: 'Test Visitor',
        email: 'visitor@example.test',
        category: 'general',
        subject: 'Question\r\nBcc: outsider@example.test',
        message: 'A synthetic message used only to verify input validation.',
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(databaseQuery).not.toHaveBeenCalled();
  });

  it('/api/v1/contact should remain unavailable when support is not explicitly enabled', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/contact')
      .send({
        name: 'Test Visitor',
        email: 'visitor@example.test',
        category: 'general',
        subject: 'A synthetic question',
        message: 'A synthetic message used only to verify the disabled contact service.',
      })
      .expect(HttpStatus.SERVICE_UNAVAILABLE);

    expect(response.body.message).toContainEqual(
      expect.stringContaining('request was not saved or emailed'),
    );
    expect(databaseQuery).not.toHaveBeenCalled();
  });
});
