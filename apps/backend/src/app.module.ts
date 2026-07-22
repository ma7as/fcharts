import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { MarketModule } from './market/market.module';
import { SymbolsModule } from './symbols/symbols.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PortfoliosModule } from './portfolios/portfolios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    // Global rate limit: 100 req/min per IP. Individual routes can override
    // via @Throttle({ ... }) decorators.
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1_000, // 1 second window
        limit: 10,
      },
      {
        name: 'long',
        ttl: 60_000, // 1 minute window
        limit: 100,
      },
    ]),
    HttpModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    PortfoliosModule,
    MarketModule,
    SymbolsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
