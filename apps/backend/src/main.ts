import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // Parse cookies for the httpOnly auth-token strategy.
  app.use(cookieParser());

  // CORS: only the configured origin may call us with credentials.
  // credentials: true is required so the browser sends the httpOnly cookies.
  const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:8100';
  app.enableCors({
    origin: allowedOrigin,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger documentation — disabled in production to avoid leaking the
  // entire API surface (routes, models, payloads) to anyone who hits /api/docs.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Financial Charts API')
      .setDescription(
        'API for the fcharts financial dashboard.\n\n' +
          '**Auth:** Most endpoints require an httpOnly cookie session set by ' +
          'POST /auth/login. Bearer tokens are also accepted for non-browser ' +
          'clients. The `Try it out` button in this UI sends credentials.\n\n' +
          '**Rate limits:** Auth endpoints are throttled (see per-endpoint docs).',
      )
      .setVersion('1.0.0')
      .addTag('auth', 'Registration, login, refresh, logout, profile')
      .addTag('symbols', 'Trading symbols catalog (paginated)')
      .addTag('market', 'OHLC, indicators and CCL calculations')
      .addTag('portfolios', 'User portfolios, positions, transactions, performance')
      .addTag('users', 'User CRUD (admin)')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearerAuth',
      )
      .addCookieAuth(
        'fc_access_token',
        { type: 'apiKey', in: 'cookie', name: 'fc_access_token' },
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        // Keep credentials so the cookie auth works in the browser.
        persistAuthorization: true,
        // Try it out is collapsed by default to keep the UI clean.
        docExpansion: 'none',
        defaultModelsExpandDepth: -1,
      },
    });
  }

  const port = process.env.PORT || 8101;
  await app.listen(port);

  logger.log(`Backend is running on: http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
    logger.log(`CORS origin (with credentials): ${allowedOrigin}`);
  }
}

void bootstrap();