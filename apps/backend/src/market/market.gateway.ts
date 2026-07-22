import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataRegistry } from './providers/market-data-registry.service';
import { ACCESS_TOKEN_COOKIE } from '../auth/constants';

interface JwtPayload {
  sub: string;
  username: string;
  email: string;
}

/**
 * Parse the raw Cookie header from the WS handshake. Avoids pulling in
 * the `cookie` package just for this — we only need the access token.
 */
function parseCookieHeader(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:8100' },
  namespace: '/market',
})
export class MarketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MarketGateway.name);

  /** Maps client.id → unsubscribe function */
  private readonly subs = new Map<string, () => void>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: MarketDataRegistry,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Validate the JWT from (in order):
   *   1. `auth.token` (legacy / explicit, mainly for non-browser clients)
   *   2. `Authorization: Bearer ...` header (legacy)
   *   3. `fc_access_token` cookie — the canonical browser path
   *
   * Reject the connection immediately if no valid token is present.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const fromAuth = client.handshake.auth?.token as string | undefined;
      const fromHeader = (
        client.handshake.headers['authorization'] as string | undefined
      )?.replace(/^Bearer\s+/i, '');
      const fromCookie = parseCookieHeader(
        client.handshake.headers.cookie,
        ACCESS_TOKEN_COOKIE,
      );

      const token = fromAuth ?? fromHeader ?? fromCookie;
      if (!token) {
        throw new UnauthorizedException('Missing auth token');
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const data = client.data as { userId?: string; username?: string };
      data.userId = payload.sub;
      data.username = payload.username;

      this.logger.log(`Client connected: ${client.id} (user ${payload.sub})`);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'Invalid authentication token';
      this.logger.warn(`Rejecting WS client ${client.id}: ${reason}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.cleanup(client.id);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    client: Socket,
    payload: { symbol: string; interval: string },
  ) {
    const { symbol, interval } = payload;

    this.cleanup(client.id);

    const symbolRecord = await this.prisma.symbol.findUnique({
      where: { symbol },
    });
    const dataSource = symbolRecord?.dataSource ?? 'binance';
    const provider = this.registry.getProvider(dataSource);

    this.logger.log(
      `Subscribing ${client.id} \u2192 ${symbol}/${interval} via ${dataSource}`,
    );

    const unsubscribe = provider.streamCandles(symbol, interval, (candle) => {
      client.emit('candle', candle);
    });

    this.subs.set(client.id, unsubscribe);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket) {
    this.cleanup(client.id);
    this.logger.log(`Unsubscribed: ${client.id}`);
  }

  private cleanup(clientId: string) {
    const unsub = this.subs.get(clientId);
    if (unsub) {
      unsub();
      this.subs.delete(clientId);
    }
  }

  /**
   * Tear down every active subscription on shutdown. Without this, the
   * provider polling loops (which run as `while(active) await setTimeout`)
   * keep spinning until the next tick. Calling their unsubscribe handler
   * flips `active = false` and the loops exit cleanly.
   */
  onModuleDestroy(): void {
    for (const [clientId, unsub] of this.subs) {
      try {
        unsub();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        this.logger.warn(
          `Error unsubscribing client ${clientId} on shutdown: ${message}`,
        );
      }
    }
    this.subs.clear();
    this.logger.log(`Market gateway shut down; cleared ${this.subs.size} subs`);
  }

  onGatewayInit(): void {
    this.logger.log('Market gateway initialised');
  }

  afterInit(server: Server): void {
    this.logger.log(`Market gateway bound to socket.io server`);
  }
}