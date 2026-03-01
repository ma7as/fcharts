export interface CandleData {
  timestamp: number; // Unix ms
  date: string;      // ISO 8601 string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed?: boolean; // true when candle is complete (WS streams)
}
