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
} from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('portfolios')
@Controller('api/v1/portfolios')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new portfolio' })
  create(@Request() req, @Body() createPortfolioDto: CreatePortfolioDto) {
    return this.portfoliosService.create(req.user.userId, createPortfolioDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all portfolios for current user' })
  findAll(@Request() req) {
    return this.portfoliosService.findAllByUser(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get portfolio by ID' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.portfoliosService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update portfolio' })
  update(
    @Param('id') id: string,
    @Request() req,
    @Body() updatePortfolioDto: UpdatePortfolioDto,
  ) {
    return this.portfoliosService.update(id, req.user.userId, updatePortfolioDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete portfolio' })
  remove(@Param('id') id: string, @Request() req) {
    return this.portfoliosService.remove(id, req.user.userId);
  }

  @Get(':id/positions')
  @ApiOperation({ summary: 'Get all positions in portfolio' })
  getPositions(@Param('id') id: string, @Request() req) {
    return this.portfoliosService.getPositions(id, req.user.userId);
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Get all transactions in portfolio' })
  getTransactions(@Param('id') id: string, @Request() req) {
    return this.portfoliosService.getTransactions(id, req.user.userId);
  }

  @Post(':id/transactions')
  @ApiOperation({ summary: 'Add transaction to portfolio' })
  createTransaction(
    @Param('id') id: string,
    @Request() req,
    @Body() createTransactionDto: CreateTransactionDto,
  ) {
    return this.portfoliosService.createTransaction(
      id,
      req.user.userId,
      createTransactionDto,
    );
  }

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get portfolio performance history' })
  getPerformance(@Param('id') id: string, @Request() req) {
    return this.portfoliosService.getPerformance(id, req.user.userId);
  }
}
