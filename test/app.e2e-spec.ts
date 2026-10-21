import { Body, Controller, Module, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
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
});
