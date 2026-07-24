import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, PaginatedResult, paginate } from '../common/dto/pagination.dto';
import { CacheService } from '../common/cache/cache.service';
import type { Symbol } from '@prisma/client';

@Injectable()
export class SymbolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * List active symbols with pagination + optional type/search filters.
   * Default page=1, limit=20, max limit=100 (enforced by PaginationDto).
   *
   * Cache-aside + NX-lock stampede protection (design.md §6).
   */
  async findAll(pagination: PaginationDto): Promise<PaginatedResult<Symbol>> {
    const cacheKey = this.buildCacheKey(pagination);

    // 1. Fast path: cache hit.
    const cached = await this.cache.getSymbols<Symbol>(cacheKey);
    if (cached) return this.fromPaginatedLike(cached);

    // 2. Stampede protection: try to acquire the lock.
    const lockKey = cacheKey;
    const acquired = await this.cache.tryAcquireSymbolsLock(lockKey);

    if (!acquired) {
      // Another process is populating. Brief wait then re-check.
      await new Promise((r) => setTimeout(r, 50));
      const retry = await this.cache.getSymbols<Symbol>(cacheKey);
      if (retry) return this.fromPaginatedLike(retry);
    }

    // 3. Cache miss + we own the lock (or lock contention cleared): run the DB query.
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

    const result = paginate(data, total, page, limit);

    // 4. Store with jittered TTL and release the lock.
    await this.cache.setSymbols(cacheKey, result, this.cache.jitterTtl(300));
    if (acquired) await this.cache.releaseSymbolsLock(lockKey);

    return result;
  }

  async findOne(symbol: string) {
    return this.prisma.symbol.findUnique({
      where: { symbol },
    });
  }

  private buildCacheKey(p: PaginationDto): string {
    const normalized = {
      page: p.page ?? 1,
      limit: p.limit ?? 20,
      type: p.type ?? null,
      search: p.search?.trim() ?? null,
    };
    return createHash('sha1')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Cache stores the PaginatedResult-like shape via JSON round-trip; we
   * already have the same shape from paginate(), so this is mostly a
   * type-cast with an empty-array default to satisfy hasMore. The cache
   * payload only needs to round-trip `data`, `total`, `page`, `limit`,
   * and `hasMore`. If hasMore was lost in JSON serialization we recompute
   * it from page*limit < total.
   */
  private fromPaginatedLike<T>(
    hit: {
      data: T[];
      total: number;
      page: number;
      limit: number;
      hasMore?: boolean;
    },
  ): PaginatedResult<T> {
    return {
      data: hit.data,
      total: hit.total,
      page: hit.page,
      limit: hit.limit,
      // Recompute if the cached payload didn't carry hasMore (older
      // entries or external callers). Default to the conservative
      // "more pages may exist" when neither is known.
      hasMore:
        hit.hasMore !== undefined
          ? hit.hasMore
          : hit.page * hit.limit < hit.total,
    };
  }
}