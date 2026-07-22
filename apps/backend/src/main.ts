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
      .setDescription('API for financial charts with real-time data')
      .setVersion('1.0')
      .addTag('market')
      .addTag('symbols')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
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