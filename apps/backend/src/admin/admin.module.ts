import { Module } from '@nestjs/common';
import { AdminSymbolsController } from './admin-symbols.controller';

@Module({
  controllers: [AdminSymbolsController],
})
export class AdminModule {}