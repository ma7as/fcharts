import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8101';

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 3000;

/**
 * Market WebSocket wrapper.
 *
 * Auth: the httpOnly access cookie is sent automatically with the
 * upgrade request because socket.io runs over an HTTP handshake and
 * browsers include cookies on same-origin requests by default. For
 * cross-origin (frontend :8100 vs backend :8101) we need
 * `withCredentials: true` so the browser attaches the cookie to the
 * upgrade request.
 *
 * No token ever lives in JavaScript — the gateway reads the cookie
 * from the handshake headers.
 */
export class MarketWebSocket {
  private socket: Socket;
  private currentSymbol: string | null = null;
  private currentInterval: string | null = null;
  private currentCallback: ((data: any) => void) | null = null;
  private reconnectAttempts = 0;

  constructor() {
    this.socket = io(`${WS_URL}/market`, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY_MS,
      withCredentials: true,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      if (this.currentSymbol && this.currentInterval && this.currentCallback) {
        this.socket.emit('subscribe', {
          symbol: this.currentSymbol,
          interval: this.currentInterval,
        });
      }
    });

    this.socket.on('reconnect_attempt', (attempt: number) => {
      this.reconnectAttempts = attempt;
    });
  }

  connect() {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  disconnect() {
    this.currentSymbol = null;
    this.currentInterval = null;
    this.currentCallback = null;
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }

  subscribe(
    symbol: string,
    interval: string,
    callback: (data: any) => void,
  ) {
    this.currentSymbol = symbol;
    this.currentInterval = interval;
    this.currentCallback = callback;

    this.socket.emit('subscribe', { symbol, interval });
    this.socket.off('candle');
    this.socket.on('candle', callback);
  }

  unsubscribe() {
    this.socket.emit('unsubscribe');
    this.socket.off('candle');
    this.currentSymbol = null;
    this.currentInterval = null;
    this.currentCallback = null;
  }

  onConnect(callback: () => void) {
    this.socket.on('connect', callback);
  }

  onDisconnect(callback: () => void) {
    this.socket.on('disconnect', callback);
  }

  onError(callback: (error: any) => void) {
    this.socket.on('connect_error', callback);
    this.socket.on('error', callback);
  }

  get isConnected(): boolean {
    return this.socket.connected;
  }
}