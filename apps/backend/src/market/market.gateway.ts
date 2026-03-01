import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataRegistry } from './providers/market-data-registry.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/market',
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MarketGateway.name);

  /** Maps client.id → unsubscribe function */
  private readonly subs = new Map<string, () => void>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: MarketDataRegistry,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
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
