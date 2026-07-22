import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { CreateTransactionDto, TransactionType } from './dto/create-transaction.dto';
import { PaginationDto, PaginatedResult, paginate } from '../common/dto/pagination.dto';

/**
 * Shape of a transaction row reduced to the fields updatePosition cares about.
 * `quantity`/`price`/`total` are Prisma's Decimal class on disk but they
 * quack like numbers for the arithmetic done here.
 */
interface PositionDelta {
  type: TransactionType;
  quantity: number;
  price: number;
  total: number;
}

@Injectable()
export class PortfoliosService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createPortfolioDto: CreatePortfolioDto) {
    return this.prisma.portfolio.create({
      data: {
        ...createPortfolioDto,
        userId,
      },
      include: {
        positions: {
          include: {
            symbol: true,
          },
        },
        _count: {
          select: {
            positions: true,
            transactions: true,
          },
        },
      },
    });
  }

  async findAllByUser(userId: string) {
    return this.prisma.portfolio.findMany({
      where: { userId },
      include: {
        positions: {
          include: {
            symbol: true,
          },
        },
        _count: {
          select: {
            positions: true,
            transactions: true,
          },
        },
      },
      orderBy: {
        isDefault: 'desc',
      },
    });
  }

  async findOne(id: string, userId: string) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id },
      include: {
        positions: {
          include: {
            symbol: true,
          },
        },
        transactions: {
          include: {
            symbol: true,
          },
          orderBy: {
            executedAt: 'desc',
          },
          // Lightweight preview — clients use getTransactions() with
          // pagination params for the full history.
          take: 10,
        },
        performanceSnaps: {
          orderBy: {
            timestamp: 'desc',
          },
          take: 30,
        },
        _count: {
          select: {
            positions: true,
            transactions: true,
          },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException(`Portfolio with ID ${id} not found`);
    }

    if (portfolio.userId !== userId) {
      throw new ForbiddenException('You do not have access to this portfolio');
    }

    return portfolio;
  }

  async update(id: string, userId: string, updatePortfolioDto: UpdatePortfolioDto) {
    await this.findOne(id, userId);

    return this.prisma.portfolio.update({
      where: { id },
      data: updatePortfolioDto,
      include: {
        positions: {
          include: {
            symbol: true,
          },
        },
        _count: {
          select: {
            positions: true,
            transactions: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    return this.prisma.portfolio.delete({
      where: { id },
    });
  }

  async getPositions(portfolioId: string, userId: string) {
    await this.findOne(portfolioId, userId);

    return this.prisma.position.findMany({
      where: { portfolioId },
      include: {
        symbol: true,
      },
      orderBy: {
        marketValue: 'desc',
      },
    });
  }

  async getTransactions(
    portfolioId: string,
    userId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<unknown>> {
    await this.findOne(portfolioId, userId);

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { portfolioId },
        include: { symbol: true },
        orderBy: { executedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where: { portfolioId } }),
    ]);

    return paginate(data, total, page, limit);
  }

  async createTransaction(
    portfolioId: string,
    userId: string,
    createTransactionDto: CreateTransactionDto,
  ) {
    await this.findOne(portfolioId, userId);

    const total =
      Number(createTransactionDto.quantity) * Number(createTransactionDto.price) +
      Number(createTransactionDto.fees ?? 0);

    // Pre-flight check for SELL: reject if the user is trying to sell more
    // than they currently hold. Without this guard, quantity can go negative
    // (or a position is deleted prematurely when newQuantity === 0).
    if (createTransactionDto.type === TransactionType.SELL) {
      const held = await this.prisma.position.findUnique({
        where: {
          portfolioId_symbolId: {
            portfolioId,
            symbolId: createTransactionDto.symbolId,
          },
        },
        select: { quantity: true },
      });
      const heldQty = held ? Number(held.quantity) : 0;
      if (Number(createTransactionDto.quantity) > heldQty) {
        throw new BadRequestException(
          `Cannot sell ${createTransactionDto.quantity} units; only ${heldQty} held`,
        );
      }
    }

    // Both the transaction row and the position mutation must succeed or
    // fail together — otherwise a crash mid-flight leaves a transaction
    // row without the matching position update (ledger inconsistency).
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          ...createTransactionDto,
          portfolioId,
          total,
        },
        include: { symbol: true },
      });

      await this.updatePosition(
        tx,
        portfolioId,
        createTransactionDto.symbolId,
        {
          type: transaction.type as TransactionType,
          quantity: Number(transaction.quantity),
          price: Number(transaction.price),
          total: Number(transaction.total),
        },
      );

      return transaction;
    });
  }

  private async updatePosition(
    tx: Prisma.TransactionClient,
    portfolioId: string,
    symbolId: string,
    transaction: PositionDelta,
  ) {
    const existingPosition = await tx.position.findUnique({
      where: { portfolioId_symbolId: { portfolioId, symbolId } },
    });

    if (transaction.type === TransactionType.BUY) {
      if (existingPosition) {
        const newQuantity =
          Number(existingPosition.quantity) + Number(transaction.quantity);
        const newCostBasis =
          Number(existingPosition.costBasis) + Number(transaction.total);
        const newAveragePrice = newCostBasis / newQuantity;

        await tx.position.update({
          where: { portfolioId_symbolId: { portfolioId, symbolId } },
          data: {
            quantity: newQuantity,
            averagePrice: newAveragePrice,
            costBasis: newCostBasis,
            currentPrice: transaction.price,
            marketValue: newQuantity * Number(transaction.price),
            lastUpdated: new Date(),
          },
        });
      } else {
        await tx.position.create({
          data: {
            portfolioId,
            symbolId,
            quantity: transaction.quantity,
            averagePrice: transaction.price,
            costBasis: transaction.total,
            currentPrice: transaction.price,
            marketValue: Number(transaction.quantity) * Number(transaction.price),
          },
        });
      }
    } else if (transaction.type === TransactionType.SELL && existingPosition) {
      const newQuantity =
        Number(existingPosition.quantity) - Number(transaction.quantity);

      if (newQuantity <= 0) {
        await tx.position.delete({
          where: { portfolioId_symbolId: { portfolioId, symbolId } },
        });
      } else {
        const costReduction =
          (Number(transaction.quantity) / Number(existingPosition.quantity)) *
          Number(existingPosition.costBasis);
        const newCostBasis = Number(existingPosition.costBasis) - costReduction;

        await tx.position.update({
          where: { portfolioId_symbolId: { portfolioId, symbolId } },
          data: {
            quantity: newQuantity,
            costBasis: newCostBasis,
            currentPrice: transaction.price,
            marketValue: newQuantity * Number(transaction.price),
            lastUpdated: new Date(),
          },
        });
      }
    }
  }

  async getPerformance(portfolioId: string, userId: string) {
    await this.findOne(portfolioId, userId);

    return this.prisma.performanceSnapshot.findMany({
      where: { portfolioId },
      orderBy: {
        timestamp: 'desc',
      },
      take: 100,
    });
  }
}
