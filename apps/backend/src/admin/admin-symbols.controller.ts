import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ACCESS_TOKEN_COOKIE } from '../auth/constants';
import { CacheService } from '../common/cache/cache.service';

@ApiTags('admin')
@ApiBearerAuth('bearerAuth')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('api/v1/admin')
export class AdminSymbolsController {
  constructor(private readonly cache: CacheService) {}

  /**
   * Bust the symbols catalog cache. For v1 we don't have a real
   * AdminRoleGuard — any authenticated user can call this. Add an
   * `AdminRoleGuard` in a follow-up PR.
   */
  @Post('symbols/refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Invalidate the symbols catalog cache',
    description:
      'Forces the next /api/v1/symbols request to re-query Postgres instead of ' +
      'serving from Redis. Use after adding a new symbol so the catalog reflects ' +
      'the change immediately (instead of waiting up to 5 minutes for TTL expiry).',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of cache entries invalidated',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid auth token' })
  async refreshSymbols(): Promise<{ invalidated: number }> {
    const count = await this.cache.invalidateAllSymbols();
    return { invalidated: count };
  }
}