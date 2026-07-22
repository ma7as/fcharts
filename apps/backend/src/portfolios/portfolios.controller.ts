import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { PortfoliosService } from './portfolios.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequestWithUser } from '../auth/types/request-with-user';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ACCESS_TOKEN_COOKIE } from '../auth/constants';

@ApiTags('portfolios')
@Controller('api/v1/portfolios')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearerAuth')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@ApiResponse({ status: 401, description: 'Missing or invalid auth token' })
@ApiResponse({
  status: 403,
  description: 'Portfolio belongs to another user',
})
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new portfolio',
    description:
      'Creates an empty portfolio for the current user. The user becomes ' +
      'the owner; ownership cannot be transferred.',
  })
  @ApiBody({ type: CreatePortfolioDto })
  @ApiResponse({ status: 201, description: 'Portfolio created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  create(
    @Request() req: RequestWithUser,
    @Body() createPortfolioDto: CreatePortfolioDto,
  ) {
    return this.portfoliosService.create(req.user.userId, createPortfolioDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all portfolios for current user' })
  @ApiResponse({ status: 200, description: 'List of portfolios (ordered by isDefault desc)' })
  findAll(@Request() req: RequestWithUser) {
    return this.portfoliosService.findAllByUser(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get portfolio by ID',
    description:
      'Returns the portfolio with a 10-row preview of recent transactions. ' +
      'Use the /transactions endpoint with pagination for full history.',
  })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiResponse({ status: 200, description: 'Portfolio details' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.portfoliosService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update portfolio metadata (name, description, currency)' })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiBody({ type: UpdatePortfolioDto })
  @ApiResponse({ status: 200, description: 'Portfolio updated' })
  update(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Body() updatePortfolioDto: UpdatePortfolioDto,
  ) {
    return this.portfoliosService.update(id, req.user.userId, updatePortfolioDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete portfolio (cascades to positions and transactions)',
  })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiResponse({ status: 200, description: 'Portfolio deleted' })
  remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.portfoliosService.remove(id, req.user.userId);
  }

  @Get(':id/positions')
  @ApiOperation({
    summary: 'Get all positions in portfolio (ordered by marketValue desc)',
  })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiResponse({ status: 200, description: 'List of positions' })
  getPositions(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.portfoliosService.getPositions(id, req.user.userId);
  }

  @Get(':id/transactions')
  @ApiOperation({
    summary: 'Get transactions in portfolio (paginated, newest first)',
  })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiResponse({
    status: 200,
    description:
      'Paginated envelope: { data, total, page, limit, hasMore }. Page size is ' +
      '1-100 (defaults to 20).',
  })
  getTransactions(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.portfoliosService.getTransactions(
      id,
      req.user.userId,
      pagination,
    );
  }

  @Post(':id/transactions')
  @ApiOperation({
    summary: 'Add transaction to portfolio',
    description:
      'Creates a transaction and updates the matching position atomically ' +
      '(both in a single Prisma `$transaction`). For SELL transactions, the ' +
      'service validates that the user holds enough quantity and rejects ' +
      'with 400 if not.',
  })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiBody({ type: CreateTransactionDto })
  @ApiResponse({ status: 201, description: 'Transaction created; position updated' })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed OR SELL quantity exceeds held position ' +
      '(`"Cannot sell X units; only Y held"`).',
  })
  createTransaction(
    @Param('id') id: string,
    @Request() req: RequestWithUser,
    @Body() createTransactionDto: CreateTransactionDto,
  ) {
    return this.portfoliosService.createTransaction(
      id,
      req.user.userId,
      createTransactionDto,
    );
  }

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get portfolio performance history (latest 100 snapshots)' })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiResponse({ status: 200, description: 'Performance snapshots' })
  getPerformance(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.portfoliosService.getPerformance(id, req.user.userId);
  }
}
