import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataRegistry } from './providers/market-data-registry.service';

interface JwtPayload {
  sub: string;
  username: string;
  email: string;
}

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:8100' },
  namespace: '/market',
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
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
   * Validate the JWT in the `auth.token` handshake field. Reject the
   * connection immediately if invalid — anonymous clients must not be
   * able to open upstream provider streams or exhaust quotas.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers['authorization'] as string | undefined)?.replace(
          /^Bearer\s+/i,
          '',
        );

      if (!token) {
        throw new UnauthorizedException('Missing auth token');
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      // Attach user info for downstream handlers
      (client.data as { userId?: string; username?: string }).userId = payload.sub;
      (client.data as { userId?: string; username?: string }).username =
        payload.username;

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

    // Cancel any existing stream for this client
    this.cleanup(client.id);

    // Resolve dataSource from DB; fallback to binance
    const symbolRecord = await this.prisma.symbol.findUnique({
      where: { symbol },
    });
    const dataSource = symbolRecord?.dataSource ?? 'binance';
    const provider = this.registry.getProvider(dataSource);

    this.logger.log(
      `Subscribing ${client.id} → ${symbol}/${interval} via ${dataSource}`,
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
}
