import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * Global so MarketService, SymbolsService, MarketGateway and any future
 * consumer can inject CacheService without re-importing the module per
 * feature module. Same pattern as RedisModule (PR1).
 */
@Global()
@Module({
  imports: [MetricsModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}