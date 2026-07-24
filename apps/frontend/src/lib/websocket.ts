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
  /**
   * Tracks the (symbol, interval) pair we have actually emitted to the
   * server. The previous implementation re-emitted on every reconnect
   * because it also kept `currentSymbol` set — which caused the backend
   * to open a fresh upstream WS into Binance before the previous one had
   * finished its handshake, surfacing as
   * "WebSocket was closed before the connection was established".
   */
  private pendingSubscription: { symbol: string; interval: string } | null = null;
  private serverSubscription: { symbol: string; interval: string } | null = null;

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
      // Re-subscribe ONLY if the server thinks we don't have an active
      // subscription for the symbol we want. If the upstream is still
      // alive this is a no-op; if the underlying socket was actually
      // torn down on the server side, the subscription is restored.
      this.flushPending();
    });

    this.socket.on('reconnect_attempt', (attempt: number) => {
      this.reconnectAttempts = attempt;
    });

    // If the server disconnects, our server-side subscription is gone.
    // Mark it so the next `connect` re-emits.
    this.socket.on('disconnect', () => {
      this.serverSubscription = null;
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
    this.pendingSubscription = null;
    this.serverSubscription = null;
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

    // Replace the candle listener up-front so we never receive a tick
    // for the previous symbol after the user has switched.
    this.socket.off('candle');
    this.socket.on('candle', callback);

    this.pendingSubscription = { symbol, interval };
    this.flushPending();
  }

  unsubscribe() {
    if (this.socket.connected) {
      this.socket.emit('unsubscribe');
    }
    this.socket.off('candle');
    this.currentSymbol = null;
    this.currentInterval = null;
    this.currentCallback = null;
    this.pendingSubscription = null;
    this.serverSubscription = null;
  }

  /**
   * Emit `subscribe` only when:
   *   1. the socket is actually connected, AND
   *   2. the server hasn't already been notified for this pair.
   *
   * This eliminates the race where `subscribe` was emitted before
   * `connect` (so socket.io buffered it and re-emitted on connect),
   * producing a duplicate upstream WS into Binance.
   */
  private flushPending() {
    if (!this.socket.connected || !this.pendingSubscription) return;
    const { symbol, interval } = this.pendingSubscription;
    if (
      this.serverSubscription &&
      this.serverSubscription.symbol === symbol &&
      this.serverSubscription.interval === interval
    ) {
      return;
    }
    this.socket.emit('subscribe', { symbol, interval });
    this.serverSubscription = { symbol, interval };
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