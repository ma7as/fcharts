import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { MarketModule } from './market/market.module';
import { SymbolsModule } from './symbols/symbols.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PortfoliosModule } from './portfolios/portfolios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    HttpModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    PortfoliosModule,
    MarketModule,
    SymbolsModule,
  ],
})
export class AppModule {}
