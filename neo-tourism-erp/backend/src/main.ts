import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  allowedOrigins,
  isProduction,
  validateProductionSecurityConfig,
} from './common/security-config';

async function bootstrap() {
  validateProductionSecurityConfig();
  const app = await NestFactory.create(AppModule);

  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProduction() ? undefined : false,
      strictTransportSecurity: isProduction() ? undefined : false,
    }),
  );

  app.enableCors({
    origin: allowedOrigins(),
    exposedHeaders: ['X-Request-ID'],
  });

  const httpLogger = new Logger('HTTP');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = `REQ-${randomUUID().slice(0, 8).toUpperCase()}`;
    const startedAt = Date.now();
    response.setHeader('X-Request-ID', requestId);
    response.on('finish', () => {
      httpLogger.log(
        `${requestId} ${request.method} ${request.path} ${response.statusCode} ${Date.now() - startedAt}ms`,
      );
    });
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.ENABLE_API_DOCS !== 'false'
  ) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Neo Tourism ERP API')
      .setDescription(
        'Development API reference for the Neo Tourism internal ERP.',
      )
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
