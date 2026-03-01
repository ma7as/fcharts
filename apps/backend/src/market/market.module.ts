import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketGateway } from './market.gateway';
import { BinanceProvider } from './providers/binance.provider';
import { YahooFinanceProvider } from './providers/yahoo-finance.provider';
import { AlphaVantageProvider } from './providers/alpha-vantage.provider';
import { FinnhubProvider } from './providers/finnhub.provider';
import { IolProvider } from './providers/iol.provider';
import { MarketDataRegistry } from './providers/market-data-registry.service';

@Module({
  imports: [HttpModule],
  controllers: [MarketController],
  providers: [
    // Data providers
    BinanceProvider,
    YahooFinanceProvider,
    AlphaVantageProvider,
    FinnhubProvider,
    IolProvider,
    // Registry selects the right provider by dataSource
    MarketDataRegistry,
    // Service & gateway
    MarketService,
    MarketGateway,
  ],
  exports: [MarketService, MarketDataRegistry],
})
export class MarketModule {}
