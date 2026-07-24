import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { MetricsStubModule } from '../metrics/metrics.stub.module';

/**
 * Global so MarketService, SymbolsService, MarketGateway and any future
 * consumer can inject CacheService without re-importing the module per
 * feature module. Same pattern as RedisModule (PR1).
 */
@Global()
@Module({
  imports: [MetricsStubModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}