import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
import { MarketModule } from './market/market.module';
import { SymbolsModule } from './symbols/symbols.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CacheModule } from './common/cache/cache.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { REDIS_CLIENT } from './redis/redis.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { PortfoliosModule } from './portfolios/portfolios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    // Global rate limit: 100 req/min per IP. Individual routes can override
    // via @Throttle({ ... }) decorators.
    //
    // ⚠️ TTL-UNIT GOTCHA (AC-24):
    // `ThrottlerModule` declares throttler.ttl in **milliseconds**,
    // but `ThrottlerStorageRedisService` v5 stores keys with TTLs in
    // **seconds**. The adapter accepts the throttler.ttl value as-is
    // and divides internally — DO NOT pre-divide here. The integration
    // test (PR2 task 2.8) verifies the global 100/min limit fires at
    // request 101 within a 60s window.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: 1_000, limit: 10 },
          { name: 'long', ttl: 60_000, limit: 100 },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    HttpModule,
    PrismaModule,
    RedisModule,
    CacheModule,
    MetricsModule,
    ScheduleModule.forRoot(),
    UsersModule,
    AuthModule,
    AdminModule,
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

