import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, PaginatedResult, paginate } from '../common/dto/pagination.dto';
import type { Symbol } from '@prisma/client';

@Injectable()
export class SymbolsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List active symbols with pagination + optional type/search filters.
   * Default page=1, limit=20, max limit=100 (enforced by PaginationDto).
   */
  async findAll(pagination: PaginationDto): Promise<PaginatedResult<Symbol>> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const search = pagination.search?.trim();

    const where = {
      isActive: true,
      ...(pagination.type && { type: pagination.type }),
      ...(search && {
        OR: [
          { symbol: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.symbol.findMany({
        where,
        orderBy: { symbol: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.symbol.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(symbol: string) {
    return this.prisma.symbol.findUnique({
      where: { symbol },
    });
  }
}
