import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';

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
          take: 50,
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

  async getTransactions(portfolioId: string, userId: string) {
    await this.findOne(portfolioId, userId);

    return this.prisma.transaction.findMany({
      where: { portfolioId },
      include: {
        symbol: true,
      },
      orderBy: {
        executedAt: 'desc',
      },
    });
  }

  async createTransaction(
    portfolioId: string,
    userId: string,
    createTransactionDto: CreateTransactionDto,
  ) {
    await this.findOne(portfolioId, userId);

    const transaction = await this.prisma.transaction.create({
      data: {
        ...createTransactionDto,
        portfolioId,
        total: Number(createTransactionDto.quantity) * Number(createTransactionDto.price) + Number(createTransactionDto.fees || 0),
      },
      include: {
        symbol: true,
      },
    });

    // Update or create position
    await this.updatePosition(portfolioId, createTransactionDto.symbolId, transaction);

    return transaction;
  }

  private async updatePosition(
    portfolioId: string,
    symbolId: string,
    transaction: any,
  ) {
    const existingPosition = await this.prisma.position.findUnique({
      where: {
        portfolioId_symbolId: {
          portfolioId,
          symbolId,
        },
      },
    });

    if (transaction.type === 'BUY') {
      if (existingPosition) {
        const newQuantity = Number(existingPosition.quantity) + Number(transaction.quantity);
        const newCostBasis = Number(existingPosition.costBasis) + Number(transaction.total);
        const newAveragePrice = newCostBasis / newQuantity;

        await this.prisma.position.update({
          where: {
            portfolioId_symbolId: {
              portfolioId,
              symbolId,
            },
          },
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
        await this.prisma.position.create({
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
    } else if (transaction.type === 'SELL' && existingPosition) {
      const newQuantity = Number(existingPosition.quantity) - Number(transaction.quantity);
      
      if (newQuantity <= 0) {
        await this.prisma.position.delete({
          where: {
            portfolioId_symbolId: {
              portfolioId,
              symbolId,
            },
          },
        });
      } else {
        const costReduction = (Number(transaction.quantity) / Number(existingPosition.quantity)) * Number(existingPosition.costBasis);
        const newCostBasis = Number(existingPosition.costBasis) - costReduction;

        await this.prisma.position.update({
          where: {
            portfolioId_symbolId: {
              portfolioId,
              symbolId,
            },
          },
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
