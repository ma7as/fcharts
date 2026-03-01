import { Injectable } from '@nestjs/common';
import { IMarketDataProvider } from './market-data-provider.interface';
import { BinanceProvider } from './binance.provider';
import { YahooFinanceProvider } from './yahoo-finance.provider';
import { AlphaVantageProvider } from './alpha-vantage.provider';
import { FinnhubProvider } from './finnhub.provider';
import { IolProvider } from './iol.provider';

export type DataSourceKey = 'binance' | 'yahoo' | 'alphavantage' | 'finnhub' | 'iol';

/**
 * Central registry that maps a dataSource string to the correct IMarketDataProvider.
 * MarketService and MarketGateway use this to remain agnostic of the underlying API.
 */
@Injectable()
export class MarketDataRegistry {
  private readonly map: Record<DataSourceKey, IMarketDataProvider>;

  constructor(
    private readonly binance: BinanceProvider,
    private readonly yahoo: YahooFinanceProvider,
    private readonly alphaVantage: AlphaVantageProvider,
    private readonly finnhub: FinnhubProvider,
    private readonly iol: IolProvider,
  ) {
    this.map = {
      binance: this.binance,
      yahoo: this.yahoo,
      alphavantage: this.alphaVantage,
      finnhub: this.finnhub,
      iol: this.iol,
    };
  }

  /**
   * Returns the provider for the given dataSource key.
   * Falls back to binance if the key is unknown.
   */
  getProvider(dataSource: string): IMarketDataProvider {
    return this.map[dataSource as DataSourceKey] ?? this.binance;
  }

  /**
   * Returns all registered provider keys.
   */
  availableSources(): DataSourceKey[] {
    return Object.keys(this.map) as DataSourceKey[];
  }
}
