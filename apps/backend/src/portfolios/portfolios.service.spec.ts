import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PortfoliosService } from './portfolios.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  prismaMock,
  resetPrismaMock,
  seedUser,
  seedPortfolio,
  seedPosition,
} from '../test/prisma.mock';
import { TransactionType } from './dto/create-transaction.dto';

describe('PortfoliosService.createTransaction', () => {
  let service: PortfoliosService;

  beforeEach(async () => {
    resetPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfoliosService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PortfoliosService>(PortfoliosService);
  });

  // Helper to set up a portfolio owned by a user, with optional held quantity
  function setup(userId = 'u1', portfolioId = 'p1', symbolId = 'sym-AAPL', held = 0) {
    seedUser({ id: userId, email: 'a@b.c', username: 'demo', password: 'x' });
    seedPortfolio({ id: portfolioId, userId });
    if (held > 0) {
      seedPosition({ portfolioId, symbolId, quantity: held, costBasis: held * 100 });
    }
  }

  it('rejects SELL that exceeds held quantity', async () => {
    setup('u1', 'p1', 'sym-AAPL', 2);

    await expect(
      service.createTransaction('p1', 'u1', {
        symbolId: 'sym-AAPL',
        type: TransactionType.SELL,
        quantity: 10,
        price: 50,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects SELL when no position is held', async () => {
    setup('u1', 'p1', 'sym-AAPL', 0);

    await expect(
      service.createTransaction('p1', 'u1', {
        symbolId: 'sym-AAPL',
        type: TransactionType.SELL,
        quantity: 1,
        price: 50,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows SELL up to exactly held quantity (boundary)', async () => {
    setup('u1', 'p1', 'sym-AAPL', 5);

    // Boundary: selling exactly what you hold deletes the position (newQuantity === 0).
    const result = await service.createTransaction('p1', 'u1', {
      symbolId: 'sym-AAPL',
      type: TransactionType.SELL,
      quantity: 5,
      price: 50,
    });

    expect(result).toMatchObject({
      type: TransactionType.SELL,
      quantity: '5',
    });
    expect(result.total).toBeDefined();
  });

  it('allows SELL of a fraction of the held position', async () => {
    setup('u1', 'p1', 'sym-AAPL', 10);

    const result = await service.createTransaction('p1', 'u1', {
      symbolId: 'sym-AAPL',
      type: TransactionType.SELL,
      quantity: 3,
      price: 100,
    });

    expect(result).toMatchObject({
      type: TransactionType.SELL,
      quantity: '3',
    });
  });

  it('computes total = quantity * price + fees for BUY', async () => {
    setup('u1', 'p1', 'sym-AAPL', 0);

    const result = await service.createTransaction('p1', 'u1', {
      symbolId: 'sym-AAPL',
      type: TransactionType.BUY,
      quantity: 2,
      price: 100,
      fees: 10,
    });

    // 2 * 100 + 10 = 210
    expect(Number((result as any).total)).toBe(210);
  });

  it('treats missing fees as 0 in total', async () => {
    setup('u1', 'p1', 'sym-AAPL', 0);

    const result = await service.createTransaction('p1', 'u1', {
      symbolId: 'sym-AAPL',
      type: TransactionType.BUY,
      quantity: 1,
      price: 50,
    });

    // 1 * 50 + 0 = 50
    expect(Number((result as any).total)).toBe(50);
  });

  it('rejects when portfolio does not belong to user (Forbidden)', async () => {
    setup('u1', 'p1', 'sym-AAPL', 0);
    // User "intruder" tries to write to p1 which is owned by u1.

    await expect(
      service.createTransaction('p1', 'intruder', {
        symbolId: 'sym-AAPL',
        type: TransactionType.BUY,
        quantity: 1,
        price: 100,
      }),
    ).rejects.toThrow();
  });

  it('rejects when portfolio does not exist (NotFound)', async () => {
    seedUser({ id: 'u1', email: 'a@b.c', username: 'demo', password: 'x' });

    await expect(
      service.createTransaction('nonexistent', 'u1', {
        symbolId: 'sym-AAPL',
        type: TransactionType.BUY,
        quantity: 1,
        price: 100,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('persists the transaction inside $transaction (atomicity)', async () => {
    setup('u1', 'p1', 'sym-AAPL', 0);

    // Reset call counts on the shared mock before this assertion.
    (prismaMock.transaction.create as jest.Mock).mockClear();
    (prismaMock.position.create as jest.Mock).mockClear();

    await service.createTransaction('p1', 'u1', {
      symbolId: 'sym-AAPL',
      type: TransactionType.BUY,
      quantity: 1,
      price: 100,
    });

    expect(prismaMock.transaction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.position.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});

describe('PortfoliosService.getTransactions pagination', () => {
  let service: PortfoliosService;

  beforeEach(async () => {
    resetPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PortfoliosService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<PortfoliosService>(PortfoliosService);
  });

  it('returns paginated envelope with defaults', async () => {
    seedUser({ id: 'u1', email: 'a@b.c', username: 'demo', password: 'x' });
    seedPortfolio({ id: 'p1', userId: 'u1' });

    const result = await service.getTransactions('p1', 'u1', {});

    expect(result).toMatchObject({
      page: 1,
      limit: 20,
      total: 0,
      hasMore: false,
    });
    expect(result.data).toEqual([]);
  });
});
