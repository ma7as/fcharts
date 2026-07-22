import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SymbolsService } from './symbols.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('symbols')
@Controller('api/v1/symbols')
export class SymbolsController {
  constructor(private readonly symbolsService: SymbolsService) {}

  @Get()
  @ApiOperation({
    summary: 'List active symbols',
    description:
      'Paginated. Optional filters: `type` (crypto|stock|cedear|cedear_underlying|etf|bond|index) ' +
      'and `search` (case-insensitive substring of symbol or name). Page size is 1-100.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated envelope: { data, total, page, limit, hasMore }',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (e.g. invalid `type` or `limit > 100`)',
  })
  async findAll(@Query() pagination: PaginationDto) {
    return this.symbolsService.findAll(pagination);
  }

  @Get(':symbol')
  @ApiOperation({ summary: 'Get symbol by ticker' })
  @ApiParam({
    name: 'symbol',
    example: 'BTCUSDT',
    description: 'The unique symbol string',
  })
  @ApiResponse({ status: 200, description: 'Symbol metadata' })
  @ApiResponse({ status: 404, description: 'Symbol not found' })
  async findOne(@Param('symbol') symbol: string) {
    return this.symbolsService.findOne(symbol);
  }
}
