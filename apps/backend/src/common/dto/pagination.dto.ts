import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SymbolType } from '@prisma/client';

/**
 * Standard pagination query params.
 * Cap at 100 items per page so a single request can't pull the whole table.
 *
 * Includes an optional `type` filter for the symbols endpoint. Other endpoints
 * simply ignore it.
 */
export class PaginationDto {
  @ApiProperty({ example: 1, minimum: 1, default: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({ example: 20, minimum: 1, maximum: 100, default: 20, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  /**
   * Free-text search; interpretation is the caller's responsibility
   * (LIKE on the relevant columns).
   */
  @ApiProperty({ example: 'AAPL', required: false })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Optional asset-type filter (only used by the symbols endpoint for now).
   */
  @ApiProperty({
    enum: SymbolType,
    example: 'crypto',
    required: false,
  })
  @IsOptional()
  @IsEnum(SymbolType)
  type?: SymbolType;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function paginate<T>(
  rows: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data: rows,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}
