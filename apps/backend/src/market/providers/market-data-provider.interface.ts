import { CandleData } from './candle-data.type';

/**
 * Common interface for all market data providers.
 * Implementations: BinanceProvider, YahooFinanceProvider,
 * AlphaVantageProvider, FinnhubProvider, IolProvider.
 */
export interface IMarketDataProvider {
  /**
   * Fetch historical OHLC candles.
   * @param symbol  Ticker as understood by the provider (e.g. "AAPL", "AAPL.BA", "BTCUSDT")
   * @param interval Candle width: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w"
   * @param from    Start of range (optional)
   * @param to      End of range (optional)
   * @param limit   Max number of candles to return
   */
  getHistoricalOhlc(
    symbol: string,
    interval: string,
    from?: Date,
    to?: Date,
    limit?: number,
  ): Promise<CandleData[]>;

  /**
   * Get the latest traded price for the symbol.
   */
  getLatestPrice(symbol: string): Promise<number>;

  /**
   * Subscribe to a real-time stream of candles.
   * Returns an unsubscribe function that stops the stream.
   * Providers without native WebSocket support implement polling.
   */
  streamCandles(
    symbol: string,
    interval: string,
    onCandle: (candle: CandleData) => void,
  ): () => void;
}
