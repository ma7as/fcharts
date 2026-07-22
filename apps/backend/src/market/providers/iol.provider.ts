import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { IMarketDataProvider } from './market-data-provider.interface';
import { CandleData } from './candle-data.type';

interface IolTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * IOL (Invertir Online) provider — BYMA market data in ARS.
 * Used for: Argentine stocks (MERVAL panel) and CEDEARs priced in pesos.
 *
 * Authentication: OAuth2 password grant against https://api.invertironline.com/token
 * Requires: IOL_USERNAME and IOL_PASSWORD env vars (free account at invertironline.com).
 *
 * BYMA market hours: Mon–Fri 11:00–17:00 ART (UTC-3).
 * No WebSocket available — real-time is emulated via polling every 60 seconds.
 *
 * Token storage: in-memory singleton with TTL. For multi-instance deployments
 * this would need Redis; for the current single-instance dev setup it's fine
 * because tokens are tied to the process anyway (revoking on another node
 * wouldn't help if all nodes share the same IOL user).
 */
@Injectable()
export class IolProvider implements IMarketDataProvider, OnModuleDestroy {
  private readonly logger = new Logger(IolProvider.name);
  private readonly BASE_URL: string;

  private tokens: IolTokenSet | null = null;
  /** In-flight auth promise so concurrent requests share one round-trip. */
  private inflightAuth: Promise<string> | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.BASE_URL =
      this.config.get<string>('IOL_BASE_URL') ?? 'https://api.invertironline.com';
  }

  onModuleDestroy(): void {
    // Drop token state. The polling loops live inside streamCandles closures,
    // not as module-level timers, so there's nothing else to cancel here.
    this.tokens = null;
    this.inflightAuth = null;
    this.logger.log('IOL token cache cleared on shutdown');
  }

  // ─── Authentication ──────────────────────────────────────────────

  /**
   * Force a clean re-authentication (clears any cached tokens first).
   * Called when the refresh path fails — likely because the refresh
   * token itself expired or was revoked server-side.
   */
  async clearCache(): Promise<void> {
    this.tokens = null;
    this.inflightAuth = null;
  }

  private async authenticate(): Promise<IolTokenSet> {
    const username = this.config.get<string>('IOL_USERNAME');
    const password = this.config.get<string>('IOL_PASSWORD');

    if (!username || !password) {
      throw new Error(
        'IOL credentials not configured. Set IOL_USERNAME and IOL_PASSWORD env vars.',
      );
    }

    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.BASE_URL}/token`,
        `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&grant_type=password`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      // Subtract 60s of slack so we re-auth before the server rejects us.
      expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000),
    };
  }

  private async refreshAccessToken(prev: IolTokenSet): Promise<IolTokenSet> {
    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.BASE_URL}/token`,
        `refresh_token=${encodeURIComponent(prev.refreshToken)}&grant_type=refresh_token`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000),
    };
  }

  /**
   * Resolve a valid access token. Concurrent calls share one auth round-trip.
   * Falls back to a fresh password-grant if the refresh token is rejected.
   */
  private async getToken(): Promise<string> {
    // Fast path: cached token still valid
    if (this.tokens && this.tokens.expiresAt > new Date()) {
      return this.tokens.accessToken;
    }

    // Single in-flight promise so 5 simultaneous requests cause 1 auth round-trip
    if (this.inflightAuth) return this.inflightAuth;

    this.inflightAuth = this.fetchToken().finally(() => {
      this.inflightAuth = null;
    });
    return this.inflightAuth;
  }

  private async fetchToken(): Promise<string> {
    if (this.tokens) {
      try {
        this.tokens = await this.refreshAccessToken(this.tokens);
        return this.tokens.accessToken;
      } catch (err) {
        const status =
          err instanceof Error && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        this.logger.warn(
          `IOL refresh failed (status=${status}); falling back to password grant`,
        );
        // Refresh failed — likely the refresh token expired server-side.
        // Clear cache and re-authenticate from scratch.
        await this.clearCache();
      }
    }
    this.tokens = await this.authenticate();
    return this.tokens.accessToken;
  }

  // ─── Interval mapping ────────────────────────────────────────────

  /** App interval → IOL periodo */
  private iolPeriodo(interval: string): string {
    const map: Record<string, string> = {
      '1m': 'minuto1',
      '5m': 'minuto5',
      '15m': 'minuto15',
      '30m': 'minuto30',
      '1h': 'hora',
      '4h': 'hora',
      '1d': 'dia',
      '1w': 'semana',
      '1mo': 'mes',
    };
    return map[interval] ?? 'dia';
  }

  // ─── IMarketDataProvider ─────────────────────────────────────────

  async getHistoricalOhlc(
    symbol: string,
    interval: string,
    from?: Date,
    to?: Date,
    limit = 200,
  ): Promise<CandleData[]> {
    let token: string;
    try {
      token = await this.getToken();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown';
      this.logger.warn(
        `IOL auth failed (${symbol}): ${message}. Returning empty data.`,
      );
      return [];
    }
    const toDate = to ?? new Date();
    const fromDate = from ?? new Date(toDate.getTime() - limit * 86_400_000);

    const { data } = await firstValueFrom(
      this.httpService.get(`${this.BASE_URL}/api/v2/Titular/Cotizaciones/Historico`, {
        params: {
          simbolo: symbol,
          mercado: 'BCBA',
          fechaDesde: fromDate.toISOString().split('T')[0],
          fechaHasta: toDate.toISOString().split('T')[0],
          ajustada: 'ajustada',
          periodo: this.iolPeriodo(interval),
        },
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    return (data as any[]).map((c) => ({
      timestamp: new Date(c.fechaHora).getTime(),
      date: new Date(c.fechaHora).toISOString(),
      open: Number(c.apertura),
      high: Number(c.maximo),
      low: Number(c.minimo),
      close: Number(c.cierre),
      volume: Number(c.volumen),
    }));
  }

  async getLatestPrice(symbol: string): Promise<number> {
    let token: string;
    try {
      token = await this.getToken();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown';
      this.logger.warn(`IOL auth failed (${symbol}): ${message}`);
      return 0;
    }
    const { data } = await firstValueFrom(
      this.httpService.get(
        `${this.BASE_URL}/api/v2/Titular/Cotizaciones/${symbol}/BCBA`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );
    return Number(data?.ultimoPrecio ?? 0);
  }

  streamCandles(
    symbol: string,
    interval: string,
    onCandle: (candle: CandleData) => void,
  ): () => void {
    // BYMA has no public WebSocket — poll every 60 seconds during market hours
    let active = true;

    const isMarketOpen = (): boolean => {
      const art = new Date(
        new Date().toLocaleString('en-US', {
          timeZone: 'America/Argentina/Buenos_Aires',
        }),
      );
      const h = art.getHours();
      const day = art.getDay(); // 0=Sun, 6=Sat
      return day >= 1 && day <= 5 && h >= 11 && h < 17;
    };

    const poll = async () => {
      while (active) {
        if (isMarketOpen()) {
          try {
            const candles = await this.getHistoricalOhlc(
              symbol, interval, undefined, undefined, 1,
            );
            if (candles.length > 0) {
              onCandle({ ...candles.at(-1)!, isClosed: false });
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : 'unknown';
            this.logger.warn(`IOL poll error (${symbol}): ${message}`);
          }
        }
        await new Promise((r) => setTimeout(r, 60_000));
      }
    };

    poll();
    return () => {
      active = false;
    };
  }
}
