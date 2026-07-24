import { PrismaClient, SymbolType, Currency, Market, DataSource } from '@prisma/client';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from root
dotenv.config({ path: resolve(__dirname, '../../../.env') });

// Verify DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

const prisma = new PrismaClient({});

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Cryptocurrencies (Binance) ──────────────────────────────────────────
  const cryptos = await Promise.all([
    upsert('BTCUSDT',  'Bitcoin',        'Binance', SymbolType.crypto,  Currency.USD,   Market.BINANCE, DataSource.binance),
    upsert('ETHUSDT',  'Ethereum',       'Binance', SymbolType.crypto,  Currency.USD,   Market.BINANCE, DataSource.binance),
    upsert('BNBUSDT',  'Binance Coin',   'Binance', SymbolType.crypto,  Currency.USD,   Market.BINANCE, DataSource.binance),
    upsert('SOLUSDT',  'Solana',         'Binance', SymbolType.crypto,  Currency.USD,   Market.BINANCE, DataSource.binance),
  ]);
  console.log(`✅ ${cryptos.length} crypto symbols`);

  // ─── CEDEAR Subyacentes — cotización en USD (NYSE / NASDAQ) ─────────────
  // type: "cedear_underlying" | dataSource: "finnhub"
  const underlyings = await Promise.all([
    upsert('AAPL',  'Apple Inc.',             'NASDAQ',   SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'Technology'),
    upsert('MSFT',  'Microsoft Corporation',  'NASDAQ',   SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'Technology'),
    upsert('AMZN',  'Amazon.com Inc.',        'NASDAQ',   SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'Consumer Technology'),
    upsert('GOOGL', 'Alphabet Inc.',          'NASDAQ',   SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'Technology'),
    upsert('TSLA',  'Tesla Inc.',             'NASDAQ',   SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'Automotive'),
    upsert('NVDA',  'NVIDIA Corporation',     'NASDAQ',   SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'Semiconductors'),
    upsert('META',  'Meta Platforms Inc.',    'NASDAQ',   SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'Technology'),
    upsert('MELI',  'MercadoLibre Inc.',      'NASDAQ',   SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'E-Commerce'),
    upsert('BABA',  'Alibaba Group',          'NYSE',     SymbolType.cedear_underlying, Currency.USD, Market.NYSE,     DataSource.finnhub, 'E-Commerce'),
    upsert('WMT',   'Walmart Inc.',           'NYSE',     SymbolType.cedear_underlying, Currency.USD, Market.NYSE,     DataSource.finnhub, 'Consumer Staples'),
    upsert('XOM',   'ExxonMobil Corp.',       'NYSE',     SymbolType.cedear_underlying, Currency.USD, Market.NYSE,     DataSource.finnhub, 'Energy'),
    upsert('KO',    'Coca-Cola Company',      'NYSE',     SymbolType.cedear_underlying, Currency.USD, Market.NYSE,     DataSource.finnhub, 'Consumer Staples'),
    upsert('SPY',   'SPDR S&P 500 ETF',       'NYSE Arca',SymbolType.cedear_underlying, Currency.USD, Market.NYSE,     DataSource.finnhub, 'Index Fund'),
    upsert('QQQ',   'Invesco QQQ (Nasdaq 100)','NASDAQ',  SymbolType.cedear_underlying, Currency.USD, Market.NASDAQ,   DataSource.finnhub, 'Index Fund'),
    upsert('GLD',   'SPDR Gold Shares',       'NYSE Arca',SymbolType.cedear_underlying, Currency.USD, Market.NYSE,     DataSource.finnhub, 'Commodities'),
  ]);
  console.log(`✅ ${underlyings.length} CEDEAR underlying symbols (USD)`);

  // ─── CEDEARs en BYMA — cotización en ARS ────────────────────────────────
  // type: "cedear" | dataSource: "iol" | currency: "ARS"
  // Ratio: cuántos CEDEARs equivalen a 1 acción del subyacente
  const cedears = await Promise.all([
    upsertCedear('AAPL',  'Apple Inc. (CEDEAR)',             'BYMA', Currency.ARS, 'AAPL',  10, 'Technology'),
    upsertCedear('MSFT',  'Microsoft Corp. (CEDEAR)',        'BYMA', Currency.ARS, 'MSFT',  10, 'Technology'),
    upsertCedear('AMZN',  'Amazon.com Inc. (CEDEAR)',        'BYMA', Currency.ARS, 'AMZN',   9, 'Consumer Technology'),
    upsertCedear('GOOGL', 'Alphabet Inc. (CEDEAR)',          'BYMA', Currency.ARS, 'GOOGL', 33, 'Technology'),
    upsertCedear('TSLA',  'Tesla Inc. (CEDEAR)',             'BYMA', Currency.ARS, 'TSLA',  10, 'Automotive'),
    upsertCedear('NVDA',  'NVIDIA Corp. (CEDEAR)',           'BYMA', Currency.ARS, 'NVDA',  10, 'Semiconductors'),
    upsertCedear('META',  'Meta Platforms (CEDEAR)',         'BYMA', Currency.ARS, 'META',  12, 'Technology'),
    upsertCedear('MELI',  'MercadoLibre (CEDEAR)',           'BYMA', Currency.ARS, 'MELI',   1, 'E-Commerce'),
    upsertCedear('BABA',  'Alibaba Group (CEDEAR)',          'BYMA', Currency.ARS, 'BABA',   4, 'E-Commerce'),
    upsertCedear('WMT',   'Walmart Inc. (CEDEAR)',           'BYMA', Currency.ARS, 'WMT',   10, 'Consumer Staples'),
    upsertCedear('XOM',   'ExxonMobil (CEDEAR)',             'BYMA', Currency.ARS, 'XOM',   10, 'Energy'),
    upsertCedear('KO',    'Coca-Cola (CEDEAR)',              'BYMA', Currency.ARS, 'KO',    10, 'Consumer Staples'),
    upsertCedear('SPY',   'SPDR S&P 500 ETF (CEDEAR)',       'BYMA', Currency.ARS, 'SPY',   10, 'Index Fund'),
    upsertCedear('QQQ',   'Invesco QQQ ETF (CEDEAR)',        'BYMA', Currency.ARS, 'QQQ',   10, 'Index Fund'),
    upsertCedear('GLD',   'SPDR Gold Shares (CEDEAR)',       'BYMA', Currency.ARS, 'GLD',   10, 'Commodities'),
  ]);
  // Note: CEDEARs must use a distinct symbol key from their USD underlying.
  // Convention used: append 'D' suffix (BYMA uses this for lote D, e.g. "AAPLD").
  // We store them with the .BA Yahoo suffix for identification.
  console.log(`✅ ${cedears.length} CEDEAR symbols (ARS)`);

  // ─── Acciones Argentinas (MERVAL / Panel General BYMA vía Yahoo Finance) ──
  // type: "stock" | dataSource: "yahoo" (sufijo .BA) | currency: "ARS"
  // Yahoo Finance expone los tickers BYMA con sufijo .BA; cubre Panel Líder
  // y los papeles más líquidos del Panel General. Re-ejecutar `pnpm db:seed`
  // para incorporar nuevos tickers (upsert los agrega sin duplicar).
  const arStocks = await Promise.all([
    upsert('AGRO.BA', 'Adecoagro S.A.',                  'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Agropecuario'),
    upsert('ALUA.BA', 'Aluar Aluminio Argentino S.A.',   'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Materiales'),
    upsert('BBAR.BA', 'BBVA Argentina S.A.',             'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Financiero'),
    upsert('BHIP.BA', 'Banco Hipotecario S.A.',          'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Financiero'),
    upsert('BMA.BA',  'Banco Macro S.A.',                'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Financiero'),
    upsert('CEPU.BA', 'Central Puerto S.A.',             'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Energía'),
    upsert('COME.BA', 'Soc. Comercial del Plata',        'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Diversificado'),
    upsert('CRES.BA', 'Cresud S.A.C.I.F. y A.',          'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Agropecuario'),
    upsert('EDN.BA',  'Edenor S.A.',                     'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Servicios Públicos'),
    upsert('GGAL.BA', 'Grupo Financiero Galicia',        'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Financiero'),
    upsert('HARG.BA', 'Holcim (Argentina) S.A.',         'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Materiales'),
    upsert('IRSA.BA', 'IRSA Propiedades Comerciales',    'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Inmobiliario'),
    upsert('LOMA.BA', 'Loma Negra C.I.A.S.A.',           'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Industriales'),
    upsert('MIRG.BA', 'Mirgor S.A.I.C.I.F.',             'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Tecnología'),
    upsert('MOLI.BA', 'Molinos Río de la Plata',         'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Consumo'),
    upsert('PAMP.BA', 'Pampa Energía S.A.',              'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Energía'),
    upsert('TGN.BA',  'Transportadora de Gas del Norte', 'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Energía'),
    upsert('TGS.BA',  'Transportadora de Gas del Sur',   'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Energía'),
    upsert('TRAN.BA', 'Transener S.A.',                  'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Energía'),
    upsert('TXAR.BA', 'Ternium Argentina S.A.',          'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Industriales'),
    upsert('VALO.BA', 'Grupo Supervielle S.A.',          'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Financiero'),
    upsert('VIST.BA', 'Vista Energy Argentina S.A.',     'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Energía'),
    upsert('YPF.BA',  'YPF S.A.',                        'BYMA', SymbolType.stock, Currency.ARS, Market.BYMA, DataSource.yahoo, 'Energía'),
  ]);
  console.log(`✅ ${arStocks.length} Argentine stock symbols (ARS)`);

  // ─── Demo user & portfolio ───────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {
      password: '$2a$10$yYhb0Y/xqMN1s7OpYfun9.7pKOzSlHmwIPE.2f2tA0dlg2dHFd49m', // demo123
      username: 'demo',
      firstName: 'Demo',
      lastName: 'User',
      isActive: true,
    },
    create: {
      email: 'demo@example.com',
      username: 'demo',
      password: '$2a$10$yYhb0Y/xqMN1s7OpYfun9.7pKOzSlHmwIPE.2f2tA0dlg2dHFd49m', // demo123
      firstName: 'Demo',
      lastName: 'User',
      isActive: true,
    },
  });

  const watchlist = await prisma.watchlist.upsert({
    where: { id: 'watchlist-default' },
    update: {},
    create: {
      id: 'watchlist-default',
      userId: user.id,
      name: 'My Favorites',
      description: 'Mis activos favoritos',
      isDefault: true,
      items: {
        create: [
          { symbolId: cryptos[0].id, position: 0 }, // BTC
          { symbolId: cryptos[1].id, position: 1 }, // ETH
          { symbolId: underlyings[0].id, position: 2 }, // AAPL (USD)
          { symbolId: cedears[0].id, position: 3 },  // AAPL (ARS CEDEAR)
          { symbolId: arStocks[0].id, position: 4 }, // GGAL
        ],
      },
    },
  });
  console.log(`✅ Watchlist: ${watchlist.name}`);

  const portfolio = await prisma.portfolio.upsert({
    where: { id: 'portfolio-default' },
    update: {},
    create: {
      id: 'portfolio-default',
      userId: user.id,
      name: 'Main Portfolio',
      description: 'Portfolio principal',
      currency: Currency.USD,
      isDefault: true,
    },
  });
  console.log(`✅ Portfolio: ${portfolio.name}`);

  console.log('🎉 Seeding completed!');
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function upsert(
  symbol: string,
  name: string,
  exchange: string,
  type: SymbolType,
  currency: Currency,
  market: Market,
  dataSource: DataSource,
  sector?: string,
) {
  return prisma.symbol.upsert({
    where: { symbol },
    update: { name, exchange, type, currency, market, dataSource, ...(sector && { sector }) },
    create: { symbol, name, exchange, type, currency, market, dataSource, sector, isActive: true },
  });
}

function upsertCedear(
  baseSymbol: string,
  name: string,
  exchange: string,
  currency: Currency,
  underlyingSymbol: string,
  cedearRatio: number,
  sector?: string,
) {
  // Use BYMA convention: append 'D' to distinguish CEDEAR from underlying
  const symbol = `${baseSymbol}D`;
  return prisma.symbol.upsert({
    where: { symbol },
    update: { underlyingSymbol, cedearRatio },
    create: {
      symbol,
      name,
      exchange,
      type: SymbolType.cedear,
      currency,
      market: Market.BYMA,
      dataSource: DataSource.iol,
      underlyingSymbol,
      cedearRatio,
      sector,
      isActive: true,
    },
  });
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
