import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Cryptocurrencies (Binance) ──────────────────────────────────────────
  const cryptos = await Promise.all([
    upsert('BTCUSDT',  'Bitcoin',        'Binance', 'crypto',  'USD',   'Binance', 'binance'),
    upsert('ETHUSDT',  'Ethereum',       'Binance', 'crypto',  'USD',   'Binance', 'binance'),
    upsert('BNBUSDT',  'Binance Coin',   'Binance', 'crypto',  'USD',   'Binance', 'binance'),
    upsert('SOLUSDT',  'Solana',         'Binance', 'crypto',  'USD',   'Binance', 'binance'),
  ]);
  console.log(`✅ ${cryptos.length} crypto symbols`);

  // ─── CEDEAR Subyacentes — cotización en USD (NYSE / NASDAQ) ─────────────
  // type: "cedear_underlying" | dataSource: "finnhub"
  const underlyings = await Promise.all([
    upsert('AAPL',  'Apple Inc.',             'NASDAQ',   'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'Technology'),
    upsert('MSFT',  'Microsoft Corporation',  'NASDAQ',   'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'Technology'),
    upsert('AMZN',  'Amazon.com Inc.',        'NASDAQ',   'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'Consumer Technology'),
    upsert('GOOGL', 'Alphabet Inc.',          'NASDAQ',   'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'Technology'),
    upsert('TSLA',  'Tesla Inc.',             'NASDAQ',   'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'Automotive'),
    upsert('NVDA',  'NVIDIA Corporation',     'NASDAQ',   'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'Semiconductors'),
    upsert('META',  'Meta Platforms Inc.',    'NASDAQ',   'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'Technology'),
    upsert('MELI',  'MercadoLibre Inc.',      'NASDAQ',   'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'E-Commerce'),
    upsert('BABA',  'Alibaba Group',          'NYSE',     'cedear_underlying', 'USD', 'NYSE',     'finnhub', 'E-Commerce'),
    upsert('WMT',   'Walmart Inc.',           'NYSE',     'cedear_underlying', 'USD', 'NYSE',     'finnhub', 'Consumer Staples'),
    upsert('XOM',   'ExxonMobil Corp.',       'NYSE',     'cedear_underlying', 'USD', 'NYSE',     'finnhub', 'Energy'),
    upsert('KO',    'Coca-Cola Company',      'NYSE',     'cedear_underlying', 'USD', 'NYSE',     'finnhub', 'Consumer Staples'),
    upsert('SPY',   'SPDR S&P 500 ETF',       'NYSE Arca','cedear_underlying', 'USD', 'NYSE',     'finnhub', 'Index Fund'),
    upsert('QQQ',   'Invesco QQQ (Nasdaq 100)','NASDAQ',  'cedear_underlying', 'USD', 'NASDAQ',   'finnhub', 'Index Fund'),
    upsert('GLD',   'SPDR Gold Shares',       'NYSE Arca','cedear_underlying', 'USD', 'NYSE',     'finnhub', 'Commodities'),
  ]);
  console.log(`✅ ${underlyings.length} CEDEAR underlying symbols (USD)`);

  // ─── CEDEARs en BYMA — cotización en ARS ────────────────────────────────
  // type: "cedear" | dataSource: "iol" | currency: "ARS"
  // Ratio: cuántos CEDEARs equivalen a 1 acción del subyacente
  const cedears = await Promise.all([
    upsertCedear('AAPL',  'Apple Inc. (CEDEAR)',             'BYMA', 'ARS', 'AAPL',  10, 'Technology'),
    upsertCedear('MSFT',  'Microsoft Corp. (CEDEAR)',        'BYMA', 'ARS', 'MSFT',  10, 'Technology'),
    upsertCedear('AMZN',  'Amazon.com Inc. (CEDEAR)',        'BYMA', 'ARS', 'AMZN',   9, 'Consumer Technology'),
    upsertCedear('GOOGL', 'Alphabet Inc. (CEDEAR)',          'BYMA', 'ARS', 'GOOGL', 33, 'Technology'),
    upsertCedear('TSLA',  'Tesla Inc. (CEDEAR)',             'BYMA', 'ARS', 'TSLA',  10, 'Automotive'),
    upsertCedear('NVDA',  'NVIDIA Corp. (CEDEAR)',           'BYMA', 'ARS', 'NVDA',  10, 'Semiconductors'),
    upsertCedear('META',  'Meta Platforms (CEDEAR)',         'BYMA', 'ARS', 'META',  12, 'Technology'),
    upsertCedear('MELI',  'MercadoLibre (CEDEAR)',           'BYMA', 'ARS', 'MELI',   1, 'E-Commerce'),
    upsertCedear('BABA',  'Alibaba Group (CEDEAR)',          'BYMA', 'ARS', 'BABA',   4, 'E-Commerce'),
    upsertCedear('WMT',   'Walmart Inc. (CEDEAR)',           'BYMA', 'ARS', 'WMT',   10, 'Consumer Staples'),
    upsertCedear('XOM',   'ExxonMobil (CEDEAR)',             'BYMA', 'ARS', 'XOM',   10, 'Energy'),
    upsertCedear('KO',    'Coca-Cola (CEDEAR)',              'BYMA', 'ARS', 'KO',    10, 'Consumer Staples'),
    upsertCedear('SPY',   'SPDR S&P 500 ETF (CEDEAR)',       'BYMA', 'ARS', 'SPY',   10, 'Index Fund'),
    upsertCedear('QQQ',   'Invesco QQQ ETF (CEDEAR)',        'BYMA', 'ARS', 'QQQ',   10, 'Index Fund'),
    upsertCedear('GLD',   'SPDR Gold Shares (CEDEAR)',       'BYMA', 'ARS', 'GLD',   10, 'Commodities'),
  ]);
  // Note: CEDEARs must use a distinct symbol key from their USD underlying.
  // Convention used: append 'D' suffix (BYMA uses this for lote D, e.g. "AAPLD").
  // We store them with the .BA Yahoo suffix for identification.
  console.log(`✅ ${cedears.length} CEDEAR symbols (ARS)`);

  // ─── Acciones Argentinas (MERVAL / Panel Líder BYMA) ────────────────────
  // type: "stock" | dataSource: "yahoo" (sufijo .BA) | currency: "ARS"
  const arStocks = await Promise.all([
    upsert('GGAL.BA',  'Grupo Financiero Galicia',       'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Financiero'),
    upsert('YPF.BA',   'YPF S.A.',                       'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Energía'),
    upsert('PAMP.BA',  'Pampa Energía S.A.',             'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Energía'),
    upsert('TXAR.BA',  'Ternium Argentina S.A.',         'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Industriales'),
    upsert('ALUA.BA',  'Aluar Aluminio Argentino',       'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Materiales'),
    upsert('BBAR.BA',  'BBVA Argentina S.A.',            'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Financiero'),
    upsert('COME.BA',  'Soc. Comercial del Plata S.A.',  'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Diversificado'),
    upsert('CRES.BA',  'Cresud S.A.C.I.F. y A.',        'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Agropecuario'),
    upsert('VALO.BA',  'Grupo Supervielle S.A.',         'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Financiero'),
    upsert('MIRG.BA',  'Mirgor S.A.I.C.I.F.',           'BYMA', 'stock', 'ARS', 'BYMA', 'yahoo', 'Tecnología'),
  ]);
  console.log(`✅ ${arStocks.length} Argentine stock symbols (ARS)`);

  // ─── Demo user & portfolio ───────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      username: 'demo',
      password: '$2b$10$YourHashedPasswordHere',
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
      currency: 'USD',
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
  type: string,
  currency: string,
  market: string,
  dataSource: string,
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
  currency: string,
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
      type: 'cedear',
      currency,
      market: 'BYMA',
      dataSource: 'iol',
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
