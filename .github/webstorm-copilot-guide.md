# Configuración de GitHub Copilot para WebStorm

## Financial Charts Project

Este archivo contiene directrices de codificación para GitHub Copilot en WebStorm.

## Configuración de WebStorm

### 1. Instalación de GitHub Copilot

1. Abrir WebStorm → **Settings** (Ctrl+Alt+S)
2. Navegar a **Plugins**
3. Buscar "GitHub Copilot" e instalar
4. Reiniciar WebStorm
5. **Tools** → **GitHub Copilot** → **Login to GitHub**

### 2. Configuración de Node.js y pnpm

1. **Settings** → **Languages & Frameworks** → **Node.js**
2. Configurar Node.js interpreter (v20.20.0 o superior)
3. Configurar Package manager: **pnpm**

### 3. Configuración de TypeScript

1. **Settings** → **Languages & Frameworks** → **TypeScript**
2. TypeScript version: Usar del proyecto (node_modules/typescript)
3. Habilitar **TypeScript Language Service**
4. Habilitar **Recompile on changes**

### 4. Configuración de Prisma

1. **Settings** → **Languages & Frameworks** → **SQL Dialects**
2. Seleccionar **PostgreSQL** como dialecto por defecto
3. **Database** → **Data Sources** → Agregar PostgreSQL
   - Host: localhost
   - Port: 8102
   - Database: financial_charts
   - User: postgres
   - Password: postgres

### 5. Configuración de ESLint y Prettier

1. **Settings** → **Languages & Frameworks** → **JavaScript** → **Code Quality Tools** → **ESLint**
2. Habilitar: **Automatic ESLint configuration**
3. Habilitar: **Run eslint --fix on save**

## Stack Tecnológico

### Frontend
- **Next.js 15.3.2** (App Router)
- **React 19** + TypeScript
- **TailwindCSS 4.0** + shadcn/ui
- **Apache ECharts** para gráficos
- **i18next** para internacionalización

### Backend
- **NestJS 11** con TypeScript
- **PostgreSQL 16** + **Prisma 5.22.0**
- **Redis 7** para caché
- **Socket.io** para WebSockets
- **JWT** para autenticación

### Base de Datos
- **ORM**: Prisma 5.22.0 (IMPORTANTE: NO Prisma 7)
- **Schema**: `packages/database/prisma/schema.prisma`
- **Migraciones**: `packages/database/prisma/migrations/`

## Directrices de Código para Copilot

### TypeScript
```typescript
// Usa tipos explícitos, evita 'any'
function getSymbol(id: string): Promise<Symbol> {
  return prisma.symbol.findUnique({ where: { id } });
}

// Usa interfaces para estructuras de datos
interface OhlcData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}
```

### Next.js - Server Components
```typescript
// Por defecto, usa Server Components
// app/symbols/page.tsx
export default async function SymbolsPage() {
  const symbols = await fetchSymbols(); // Server-side
  return <SymbolsList symbols={symbols} />;
}
```

### Next.js - Client Components
```typescript
// Solo cuando necesites interactividad
'use client'

import { useState } from 'react';

export function CandlestickChart({ data }: Props) {
  const [interval, setInterval] = useState('1d');
  // ... lógica interactiva
}
```

### NestJS - Controllers
```typescript
@Controller('symbols')
@UseGuards(JwtAuthGuard)
export class SymbolsController {
  constructor(private readonly symbolsService: SymbolsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all symbols' })
  async findAll(@Query() query: OhlcQueryDto) {
    return this.symbolsService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a symbol' })
  async create(@Body() createDto: CreateSymbolDto) {
    return this.symbolsService.create(createDto);
  }
}
```

### NestJS - Services
```typescript
@Injectable()
export class SymbolsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: OhlcQueryDto): Promise<Symbol[]> {
    return this.prisma.symbol.findMany({
      where: {
        type: query.type,
        isActive: true,
      },
      orderBy: { symbol: 'asc' },
    });
  }
}
```

### Prisma - Modelos
```prisma
model Symbol {
  id        String   @id @default(cuid())
  symbol    String   @unique
  name      String
  type      String   // 'crypto' | 'stock' | 'cedear'
  currency  String   @default("USD")
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  candles Candle[]

  @@index([symbol, type])
  @@map("symbols")
}
```

### Prisma - Queries
```typescript
// CORRECTO: Prisma 5 - Sin configuraciones especiales
const prisma = new PrismaClient();

// Query básico
const symbols = await prisma.symbol.findMany({
  where: { isActive: true },
  include: { candles: true },
  orderBy: { symbol: 'asc' },
});

// Query con paginación
const symbols = await prisma.symbol.findMany({
  skip: (page - 1) * limit,
  take: limit,
  where: { type: 'crypto' },
});

// Transaction
await prisma.$transaction([
  prisma.user.create({ data: userData }),
  prisma.portfolio.create({ data: portfolioData }),
]);
```

### Apache ECharts
```typescript
const chartOption: EChartsOption = {
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross' },
  },
  xAxis: {
    type: 'category',
    data: timestamps,
  },
  yAxis: {
    type: 'value',
  },
  series: [{
    name: 'Candlestick',
    type: 'candlestick',
    data: ohlcData, // [[open, close, low, high], ...]
    itemStyle: {
      color: '#26a69a', // verde alcista
      color0: '#ef5350', // rojo bajista
      borderColor: '#26a69a',
      borderColor0: '#ef5350',
    },
  }],
};
```

### WebSockets (Socket.io)
```typescript
// Backend - Gateway
@WebSocketGateway({
  namespace: 'market',
  cors: { origin: '*' },
})
export class MarketGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() symbol: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`symbol:${symbol}`);
    return { event: 'subscribed', data: { symbol } };
  }

  emitPriceUpdate(symbol: string, price: number) {
    this.server.to(`symbol:${symbol}`).emit('price-update', { symbol, price });
  }
}

// Frontend - Client
const socket = io('http://localhost:8101/market');

socket.on('connect', () => {
  console.log('Connected to market');
  socket.emit('subscribe', 'BTCUSDT');
});

socket.on('price-update', (data) => {
  updatePrice(data.symbol, data.price);
});
```

## Patrones Recomendados

### Repository Pattern
```typescript
// prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### DTO Validation
```typescript
export class CreateSymbolDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  name: string;

  @IsEnum(['crypto', 'stock', 'cedear', 'cedear_underlying'])
  type: string;

  @IsOptional()
  @IsString()
  sector?: string;
}
```

### Error Handling
```typescript
// Backend
try {
  const result = await this.symbolsService.create(dto);
  return result;
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictException('Symbol already exists');
    }
  }
  throw new InternalServerErrorException('Failed to create symbol');
}

// Frontend
try {
  const data = await fetch('/api/symbols');
  return data.json();
} catch (error) {
  console.error('Failed to fetch symbols:', error);
  throw error;
}
```

## Comandos Útiles en WebStorm

### Terminal Integrado

```bash
# Base de datos
pnpm db:generate    # Generar cliente Prisma
pnpm db:push        # Sincronizar schema con DB
pnpm db:seed        # Insertar datos de prueba
pnpm db:studio      # Abrir Prisma Studio

# Desarrollo
pnpm dev            # Iniciar todo
pnpm dev:frontend   # Solo frontend (localhost:3000)
pnpm dev:backend    # Solo backend (localhost:8101)

# Docker
docker-compose up -d         # Iniciar contenedores
docker-compose down          # Detener contenedores
docker-compose logs -f       # Ver logs

# Testing
pnpm test           # Tests de todos los proyectos
pnpm test:watch     # Tests en modo watch
```

### Atajos de Teclado Útiles

- **Ctrl+Space**: Autocompletado
- **Ctrl+Shift+Space**: Autocompletado inteligente
- **Alt+Enter**: Quick fixes
- **Ctrl+Alt+L**: Formatear código
- **Ctrl+Alt+O**: Optimizar imports
- **Shift+Shift**: Buscar en todo
- **Ctrl+Shift+F**: Find in files
- **Ctrl+B**: Go to definition
- **Ctrl+Shift+B**: Go to type definition

## Estructura del Proyecto

```
fcharts/
├── apps/
│   ├── frontend/           # Next.js app
│   │   ├── src/
│   │   │   ├── app/       # App Router
│   │   │   ├── components/
│   │   │   ├── contexts/
│   │   │   └── lib/
│   │   └── package.json
│   └── backend/            # NestJS app
│       ├── src/
│       │   ├── auth/
│       │   ├── market/
│       │   ├── symbols/
│       │   ├── portfolios/
│       │   └── prisma/
│       └── package.json
├── packages/
│   └── database/           # Prisma schema
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── seed.ts
│       │   └── migrations/
│       └── package.json
├── docs/                   # Documentación
├── docker-compose.yml
├── .env                    # Variables de entorno
└── package.json
```

## Variables de Entorno

Crear archivo `.env` en la raíz:

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:8102/financial_charts"

# Redis
REDIS_URL="redis://localhost:8103"

# Backend
PORT=8101
JWT_SECRET="your-super-secret-jwt-key"
CORS_ORIGIN="http://localhost:3000"

# Frontend
NEXT_PUBLIC_API_URL="http://localhost:8101"
NEXT_PUBLIC_WS_URL="ws://localhost:8101"

# External APIs (opcional)
BINANCE_API_KEY=""
ALPHA_VANTAGE_API_KEY=""
FINNHUB_API_KEY=""
```

## Debugging en WebStorm

### Backend (NestJS)

1. **Run** → **Edit Configurations**
2. **+** → **Node.js**
3. Configurar:
   - **JavaScript file**: `apps/backend/dist/main.js`
   - **Application parameters**: (vacío)
   - **Working directory**: `$PROJECT_DIR$/apps/backend`
   - **Environment variables**: `NODE_ENV=development`

### Frontend (Next.js)

1. **Run** → **Edit Configurations**
2. **+** → **npm**
3. Configurar:
   - **Command**: `run`
   - **Scripts**: `dev:frontend`
   - **Package.json**: Seleccionar el de la raíz

## Convenciones de Código

- **Archivos**: kebab-case (`user-service.ts`)
- **Componentes**: PascalCase (`CandlestickChart.tsx`)
- **Funciones**: camelCase (`getUserData()`)
- **Constantes**: SCREAMING_SNAKE_CASE (`API_BASE_URL`)
- **Interfaces**: PascalCase (`Symbol`, `OhlcData`)
- **Modelos Prisma**: PascalCase singular (`User`, `Symbol`)
- **Tablas DB**: snake_case plural (`users`, `symbols`)

## Recursos

- [Documentación del Proyecto](../README.md)
- [Guía de Prisma](../docs/PRISMA_CONFIG.md)
- [Workflow de Prisma](../docs/PRISMA_WORKFLOW.md)
- [NestJS Docs](https://docs.nestjs.com)
- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
