import {
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = Number(configService.get<number>('PORT', 3001));
  const host = configService.get<string>('HOST', '0.0.0.0');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid integer between 1 and 65535.');
  }

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    errorHttpStatusCode: 422,
    exceptionFactory: (errors) => new UnprocessableEntityException({
      statusCode: 422,
      success: false,
      error: 'Unprocessable Entity',
      message: errors.flatMap((error) => Object.values(error.constraints ?? {})),
    }),
  }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: [
      configService.getOrThrow<string>('STOREFRONT_ORIGIN'),
      ...(configService.get<boolean>('LOCAL_DEMO_MODE')
        ? ['http://localhost:3201', 'http://localhost:3202']
        : []),
    ],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Shopademia API')
    .setDescription('Public API for the Shopademia marketplace.')
    .setVersion('1.0.0')
    .addServer('http://localhost:' + port)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, host);
  console.log(`Shopademia API listening on http://${host}:${port}`);
}

bootstrap();
