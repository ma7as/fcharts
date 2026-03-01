# Guía Educativa: Stack Tecnológico de Financial Charts

> **Audiencia**: Estudiantes que dominan algoritmos y estructuras de datos, y quieren aprender las tecnologías que componen una aplicación web full-stack de producción.
>
> **Enfoque**: Cada tecnología se explica conectándola con conceptos que ya conocés (complejidad, grafos, árboles, abstracción) y mostrando código real del proyecto.

---

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [TypeScript — Tipos como Pruebas Estáticas](#2-typescript)
3. [NestJS — Inyección de Dependencias y Decoradores](#3-nestjs)
4. [Prisma ORM — El Schema como Fuente de Verdad](#4-prisma-orm)
5. [PostgreSQL — Más Allá del SELECT](#5-postgresql)
6. [REST API — Contratos HTTP y DTOs](#6-rest-api)
7. [WebSockets con Socket.IO — Estado en Tiempo Real](#7-websockets)
8. [Autenticación JWT + Passport](#8-autenticacion-jwt)
9. [Next.js — React con Server-Side Rendering](#9-nextjs)
10. [TanStack Query — Estado del Servidor](#10-tanstack-query)
11. [ECharts — Visualización de Datos](#11-echarts)
12. [Docker y Compose — Entornos Reproducibles](#12-docker)
13. [pnpm Workspaces — Monorepo](#13-monorepo)
14. [Patrón Strategy — Proveedores de Datos de Mercado](#14-patron-strategy)
15. [Ejercicios Propuestos](#15-ejercicios)

---

## 1. Arquitectura General

### El Problema que Resuelve

Una aplicación financiera necesita:
- Datos históricos (OHLCV: open, high, low, close, volume)
- Datos en tiempo real (streaming de precios)
- Múltiples fuentes (Binance, Yahoo Finance, IOL)
- Múltiples usuarios con autenticación
- Interfaz interactiva con gráficos

### Vista de Pájaro

```
┌─────────────────────────────────────────────────────────────────┐
│                         MONOREPO (pnpm)                          │
│                                                                   │
│  apps/frontend (Next.js :8100)  apps/backend (NestJS :8101)     │
│         │                               │                        │
│         │  HTTP REST / WebSocket        │                        │
│         └───────────────────────────────┘                        │
│                                         │                        │
│  packages/database (Prisma schema)      │                        │
│         └───────────────────────────────┘                        │
│                                         │                        │
│  PostgreSQL :8102    Redis :8103         │                        │
│         └─────────────────────────────── ┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de un Request Típico

```
Usuario hace click en "BTCUSDT"
   │
   ▼
React Query detecta que el queryKey ['ohlc', 'BTCUSDT', '1h'] no está cacheado
   │
   ▼
marketApi.getOhlc() → GET /api/v1/market/ohlc?symbol=BTCUSDT&interval=1h
   │
   ▼
NestJS MarketController.getOhlc() → valida DTO
   │
   ▼
MarketService.getOhlcData() → busca Symbol en DB (Prisma)
   │
   ▼
¿Hay candles en cache? (≥90% del limit pedido)
 ├─ SÍ → retorna desde PostgreSQL
 └─ NO → MarketDataRegistry.getProvider('binance').getHistoricalOhlc()
              │
              ▼
           BinanceProvider → GET api.binance.com/api/v3/klines
              │
              ▼
           Persiste en DB → retorna al cliente
```

---

## 2. TypeScript

### Por Qué Importa (Para Alguien que Conoce Algoritmos)

En algoritmos, cuando declarás una función de ordenamiento, sabés exactamente qué tipo recibe y qué retorna. TypeScript traslada esa precisión al desarrollo de software a escala.

```typescript
// Sin TypeScript — cualquier cosa puede pasar
function getOhlc(params) {
  return fetch('/market/ohlc', { params });
}

// Con TypeScript — el compilador te protege
interface OhlcParams {
  symbol: string;
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  limit?: number;  // ? = opcional
}

interface CandleData {
  timestamp: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed?: boolean;
}

function getOhlc(params: OhlcParams): Promise<CandleData[]> {
  return fetch('/market/ohlc', { params });
}
```

### Tipos Avanzados Usados en Este Proyecto

**Union types** (como un enum pero más flexible):
```typescript
// apps/backend/src/market/providers/market-data-registry.service.ts
type DataSourceKey = 'binance' | 'yahoo' | 'alphavantage' | 'finnhub' | 'iol';
```

**Interfaces vs Types**:
```typescript
// Interface: para objetos y clases (extensible)
interface IMarketDataProvider {
  getHistoricalOhlc(symbol: string, interval: string, limit: number): Promise<CandleData[]>;
  getLatestPrice(symbol: string): Promise<number>;
  streamCandles(symbol: string, interval: string, onCandle: (c: CandleData) => void): () => void;
}

// Type: para unions, intersecciones, tuplas
type UnsubscribeFn = () => void;
type PriceWithDate = [date: string, price: number];
```

**Genéricos** (análogo a templates en C++):
```typescript
// React Query usa genéricos para tipar el resultado
const { data } = useQuery<CandleData[]>({
  queryKey: ['ohlc', symbol],
  queryFn: () => marketApi.getOhlc({ symbol, interval }),
});
// 'data' es CandleData[] | undefined, TypeScript lo sabe
```

**Inferencia de tipos con Prisma**:
```typescript
// Prisma genera tipos automáticamente del schema
import { Symbol, Candle } from '@prisma/client';
// Symbol y Candle son tipos exactos de las tablas de PostgreSQL
```

### Conceptos Clave

| Concepto | Analogía Algorítmica | Uso en el Proyecto |
|---|---|---|
| `interface` | Contrato de un TAD | `IMarketDataProvider` |
| `type` | Alias de tipo | `DataSourceKey` |
| `generic <T>` | Función paramétrica | `Promise<T>`, `useQuery<T>` |
| `readonly` | Constante | Props de React |
| `?` optional | Parámetro con default | `limit?: number` |
| `!` non-null assertion | Precondición | `cedear.ratio!` |

---

## 3. NestJS

### Framework de Backend para Node.js

NestJS resuelve el mismo problema que Spring (Java) o ASP.NET (C#): organizar una aplicación de servidor grande de forma mantenible.

### Módulos: División del Grafo de Dependencias

Cada módulo es un **nodo en el grafo de dependencias** de la aplicación. NestJS construye ese grafo al arrancar y resuelve el orden de inicialización (análogo a un topological sort).

```
AppModule
├── AuthModule        (depende de UsersModule, JwtModule)
├── MarketModule      (depende de HttpModule, PrismaModule)
│   ├── MarketController
│   ├── MarketService
│   ├── MarketGateway (WebSocket)
│   └── Providers
│       ├── BinanceProvider
│       ├── YahooFinanceProvider
│       ├── FinnhubProvider
│       ├── IolProvider
│       └── MarketDataRegistry
├── SymbolsModule
├── PortfoliosModule
├── UsersModule
└── PrismaModule (@Global)
```

```typescript
// apps/backend/src/market/market.module.ts
@Module({
  imports: [HttpModule],   // dependencias externas
  controllers: [MarketController],
  providers: [
    MarketService,
    MarketGateway,
    BinanceProvider,
    YahooFinanceProvider,
    FinnhubProvider,
    IolProvider,
    MarketDataRegistry,
  ],
  exports: [MarketService, MarketDataRegistry],  // qué pueden usar otros módulos
})
export class MarketModule {}
```

### Inyección de Dependencias (DI)

**El concepto**: En lugar de que una clase construya sus dependencias (`new BinanceProvider()`), el framework las **inyecta** desde afuera. Esto es el principio de inversión de dependencias (D de SOLID).

```typescript
// ❌ Sin DI — acoplamiento fuerte
class MarketService {
  private provider = new BinanceProvider(); // hardcoded
}

// ✅ Con DI — desacoplado
@Injectable()
class MarketService {
  constructor(
    private readonly registry: MarketDataRegistry,  // NestJS inyecta esto
    private readonly prisma: PrismaService,          // y esto
    private readonly config: ConfigService,          // y esto
  ) {}
}
```

**Por qué importa algorítmicamente**: DI transforma el grafo de dependencias de **implícito** (hardcoded) a **explícito** (declarado). Esto permite sustituir implementaciones (ideal para testing: inyectás un mock en lugar del servicio real).

### Decoradores: Metadatos en Tiempo de Compilación

Los decoradores son funciones que ejecutan código extra alrededor de una clase o método.

```typescript
@Controller('/api/v1/market')    // prefijo de ruta
export class MarketController {

  constructor(private readonly marketService: MarketService) {}

  @Get('/ohlc')                  // mapea GET /api/v1/market/ohlc
  @UseGuards(JwtAuthGuard)       // middleware: verifica JWT antes de ejecutar
  async getOhlc(
    @Query() query: OhlcQueryDto // extrae y valida query params automáticamente
  ) {
    return this.marketService.getOhlcData(query);
  }

  @Get('/ccl/:cedear')           // :cedear es un param dinámico
  async getCcl(
    @Param('cedear') cedear: string
  ) {
    return this.marketService.getImpliedCcl(cedear);
  }
}
```

### Ciclo de Vida de un Request en NestJS

```
Request HTTP
     │
     ▼
Middleware (logging, CORS)
     │
     ▼
Guards (@UseGuards → verifica JWT)
     │
     ▼
Interceptors (transformación de respuesta, caché)
     │
     ▼
Pipes (@Query() → valida y transforma DTOs)
     │
     ▼
Handler del Controller
     │
     ▼
Service (lógica de negocio)
     │
     ▼
Exception Filters (maneja errores, formatea respuesta)
     │
     ▼
Response HTTP
```

---

## 4. Prisma ORM

### Schema como Álgebra Relacional

Prisma usa un archivo `schema.prisma` que es la **fuente de verdad** del modelo de datos. De él se generan:
1. El cliente TypeScript (queries type-safe)
2. Las migraciones SQL
3. Los tipos del dominio

```prisma
// packages/database/prisma/schema.prisma

model Symbol {
  id              String    @id @default(cuid())
  symbol          String    @unique           // PK lógica
  name            String
  type            String                      // "crypto" | "cedear" | "stock" | ...
  currency        String    @default("USD")
  market          String    @default("GLOBAL")
  dataSource      String    @default("binance")
  underlyingSymbol String?                    // nullable: solo CEDEARs
  cedearRatio     Float?                      // nullable: solo CEDEARs

  candles   Candle[]      // relación 1:N
  createdAt DateTime @default(now())

  @@index([market, type])  // índice compuesto para queries frecuentes
}

model Candle {
  id        String   @id @default(cuid())
  symbolId  String
  symbol    Symbol   @relation(fields: [symbolId], references: [id])
  interval  String
  timestamp DateTime
  open      Float
  high      Float
  low       Float
  close     Float
  volume    Float

  @@unique([symbolId, interval, timestamp])  // evita duplicados
  @@index([symbolId, interval, timestamp])   // búsqueda rápida por rango
}
```

### Queries en Prisma vs SQL

```typescript
// Prisma — type-safe, autocompletado en el IDE
const symbol = await prisma.symbol.findFirst({
  where: { symbol: 'BTCUSDT', type: 'crypto' },
  include: { candles: { orderBy: { timestamp: 'desc' }, take: 100 } },
});

// SQL equivalente
// SELECT s.*, c.* FROM symbols s
// JOIN candles c ON c.symbolId = s.id
// WHERE s.symbol = 'BTCUSDT' AND s.type = 'crypto'
// ORDER BY c.timestamp DESC LIMIT 100;

// Upsert — INSERT or UPDATE si ya existe
await prisma.symbol.upsert({
  where: { symbol: 'AAPLD' },         // condición de unicidad
  update: { cedearRatio: 10 },         // si existe: actualizar
  create: { symbol: 'AAPLD', ... },   // si no existe: crear
});

// createMany con skipDuplicates (bulk insert eficiente)
await prisma.candle.createMany({
  data: candles.map(c => ({ symbolId, interval, ...c })),
  skipDuplicates: true,  // ignora si @@unique viola restricción
});
```

### Migraciones: Control de Versiones del Schema

Cada cambio al schema genera un archivo SQL versionado:

```
packages/database/prisma/migrations/
├── 20260131232912_add_portfolio_system/
│   └── migration.sql   ← agrega tablas de portafolio
└── 20260228000000_add_market_data_sources/
    └── migration.sql   ← agrega market, dataSource, underlyingSymbol, cedearRatio
```

```sql
-- migration.sql: lo que Prisma ejecuta en producción
ALTER TABLE "symbols" ADD COLUMN "market" TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "symbols" ADD COLUMN "dataSource" TEXT NOT NULL DEFAULT 'binance';
ALTER TABLE "symbols" ADD COLUMN "underlyingSymbol" TEXT;
ALTER TABLE "symbols" ADD COLUMN "cedearRatio" DOUBLE PRECISION;

-- Backfill: actualiza registros existentes
UPDATE "symbols" SET "market" = 'Binance', "dataSource" = 'binance'
WHERE "type" = 'crypto';
```

**Flujo de trabajo**:
```bash
# 1. Modificás schema.prisma
# 2. Generás la migración (dev)
pnpm --filter @financial-charts/database db:migrate

# 3. En producción, aplicás migraciones pendientes
prisma migrate deploy
```

---

## 5. PostgreSQL

### Índices: La Misma Idea que en Estructuras de Datos

Un índice en PostgreSQL es una estructura auxiliar (B-tree por defecto) que acelera búsquedas a costa de espacio y tiempo de escritura.

```sql
-- Sin índice: O(n) scan de toda la tabla
SELECT * FROM candles WHERE symbolId = 'xxx' AND interval = '1h';

-- Con índice @@index([symbolId, interval, timestamp]):
-- O(log n) B-tree lookup + range scan → órdenes de magnitud más rápido
```

```prisma
model Candle {
  @@unique([symbolId, interval, timestamp])  // B-tree único (también evita duplicados)
  @@index([symbolId, interval, timestamp])   // B-tree de búsqueda
}
```

**Regla práctica**: Indexá por las columnas que aparecen en `WHERE`, `ORDER BY` o `JOIN ON`.

### JSONB y Arrays

PostgreSQL soporta JSON nativo para datos semi-estructurados:
```sql
-- Podés guardar metadata sin definir columnas de antemano
ALTER TABLE symbols ADD COLUMN metadata JSONB;
INSERT INTO symbols (metadata) VALUES ('{"exchange_fee": 0.001, "lot_size": 100}');
SELECT metadata->>'exchange_fee' FROM symbols;
```

### Transacciones en Prisma

Cuando necesitás que múltiples operaciones sean atómicas (o todas o ninguna):

```typescript
// Ejemplo: crear portfolio + posición inicial en una transacción
await prisma.$transaction(async (tx) => {
  const portfolio = await tx.portfolio.create({ data: { userId, name } });
  const position = await tx.position.create({
    data: { portfolioId: portfolio.id, symbolId, quantity: 0 }
  });
  return { portfolio, position };
  // Si cualquier línea falla, TODO se revierte (rollback)
});
```

---

## 6. REST API

### HTTP como Protocolo de Operaciones CRUD

```
Método    Semántica        Idempotente   Ejemplo
GET       Leer             SÍ            GET /api/v1/symbols
POST      Crear            NO            POST /api/v1/portfolios
PATCH     Actualizar parcial SÍ          PATCH /api/v1/portfolios/:id
PUT       Reemplazar total  SÍ           PUT /api/v1/portfolios/:id
DELETE    Eliminar         SÍ            DELETE /api/v1/portfolios/:id
```

### DTOs: Validación en la Frontera del Sistema

DTO (Data Transfer Object) es el objeto que viaja por la red. Validarlo en el borde del sistema previene que datos inválidos lleguen a la lógica de negocio.

```typescript
// apps/backend/src/market/dto/ohlc-query.dto.ts
import { IsString, IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';

export class OhlcQueryDto {
  @IsString()
  symbol: string;   // requerido

  @IsIn(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w'])
  interval: string;

  @IsOptional()     // opcional
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 200;  // default

  @IsOptional()
  @IsString()
  source?: string;  // override del dataSource del símbolo
}
```

NestJS usa `class-validator` para ejecutar estas validaciones automáticamente antes de llamar al handler. Si fallan, retorna `400 Bad Request` con detalle del error.

### Códigos de Estado HTTP

```typescript
// NestJS lanza excepciones que se mapean a códigos HTTP
throw new HttpException('Symbol not found', HttpStatus.NOT_FOUND);        // 404
throw new HttpException('Not a CEDEAR', HttpStatus.BAD_REQUEST);          // 400
throw new UnauthorizedException('Invalid token');                          // 401
throw new ForbiddenException('Cannot access this portfolio');              // 403
// Si no se lanza nada: 200 OK (GET) o 201 Created (POST)
```

---

## 7. WebSockets

### Por Qué HTTP No Alcanza para Tiempo Real

HTTP es **request-response**: el cliente siempre inicia. Para streaming de precios necesitás que el **servidor pueda enviar datos cuando quiera** → WebSocket.

```
HTTP:
Cliente → [Request]  → Servidor
Client  ← [Response] ← Servidor
(conexión cerrada)

WebSocket:
Cliente ⟺ [Bidireccional permanente] ⟺ Servidor
         precio: 95431.20
         precio: 95431.85
         precio: 95430.10
         ...
```

### Implementación en NestJS con Socket.IO

```typescript
// apps/backend/src/market/market.gateway.ts
@WebSocketGateway({ cors: true, namespace: '/' })
export class MarketGateway {

  @WebSocketServer()
  server: Server;  // instancia de Socket.IO server

  @SubscribeMessage('subscribe')
  async handleSubscribe(client: Socket, payload: { symbol: string; interval: string }) {
    // 1. Resolver el proveedor según el dataSource del símbolo en DB
    const dbSymbol = await this.prisma.symbol.findFirst({
      where: { symbol: payload.symbol }
    });
    const provider = this.registry.getProvider(dbSymbol?.dataSource ?? 'binance');

    // 2. Suscribirse al stream del proveedor
    const unsubscribe = provider.streamCandles(
      payload.symbol,
      payload.interval,
      (candle) => {
        client.emit('candle', candle);  // enviar al cliente específico
      }
    );

    // 3. Cuando el cliente se desconecte, cancelar la suscripción
    client.on('disconnect', unsubscribe);
  }
}
```

### Cliente en React

```typescript
// apps/frontend/src/lib/websocket.ts
export class MarketWebSocket {
  private socket: Socket | null = null;

  connect() {
    this.socket = io(WS_URL);
  }

  subscribe(symbol: string, interval: string, onCandle: (c: any) => void) {
    this.socket?.emit('subscribe', { symbol, interval });
    this.socket?.on('candle', onCandle);
  }

  unsubscribe() {
    this.socket?.emit('unsubscribe');
    this.socket?.off('candle');
  }
}
```

### Complejidad de la Gestión de Estado en Tiempo Real

Cada cliente suscrito consume:
- 1 conexión TCP persistente
- Memoria en el servidor para el estado de la suscripción
- CPU por cada candle procesado/emitido

Para escalar a N clientes suscriptos al mismo símbolo, la optimización es **pub/sub con Redis**: un solo proceso se suscribe a Binance, y publica a una cola en Redis; múltiples workers consumen de esa cola y emiten a sus clientes. Esto es exactamente para qué está Redis en el `docker-compose.yml`.

---

## 8. Autenticación JWT

### El Problema: HTTP es Stateless

HTTP no tiene memoria de sesión. Cada request es independiente. Necesitamos una forma de que el cliente pruebe "soy el usuario X" en cada request sin enviar usuario/contraseña cada vez.

**Solución**: Token firmado criptográficamente (JWT).

### Anatomía de un JWT

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWlkLTEyMyIsImVtYWlsIjoiZGVtb0BleGFtcGxlLmNvbSIsImlhdCI6MTcwOTEzMjAwMCwiZXhwIjoxNzA5MjE4NDAwfQ.HMAC_SIGNATURE
│                   │ │                                                          │ │               │
└── Header (alg)────┘ └── Payload (claims)────────────────────────────────────┘ └── Signature  ─┘
```

- **Header**: algoritmo de firma (HS256 = HMAC-SHA256)
- **Payload**: datos del usuario (userId, email, expiración)
- **Signature**: `HMAC(base64(header) + "." + base64(payload), SECRET_KEY)`

Cualquiera puede **leer** el payload (está en base64), pero no puede **modificarlo** sin invalidar la firma. El servidor verifica la firma con su `JWT_SECRET`.

### Flujo Completo

```
1. LOGIN
   Cliente → POST /api/v1/auth/login { email, password }
   Servidor → bcryptjs.compare(password, hash_en_db)
   Servidor → jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '24h' })
   Servidor → { access_token: "eyJ..." }

2. REQUESTS AUTENTICADOS
   Cliente → GET /api/v1/portfolios
             Authorization: Bearer eyJ...
   Servidor → JwtStrategy.validate() → verifica firma → extrae userId
   Servidor → retorna portafolios del userId

3. GUARD (middleware de autorización)
   @UseGuards(JwtAuthGuard)  →  ejecuta JwtStrategy antes del handler
```

```typescript
// apps/backend/src/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  validate(payload: { sub: string; email: string }) {
    // este objeto queda disponible en @Request() req.user
    return { userId: payload.sub, email: payload.email };
  }
}
```

### Por Qué bcryptjs y No MD5/SHA

MD5 y SHA son hash de propósito general: **rápidos** → malos para passwords. Un atacante puede calcular billones de intentos por segundo.

bcrypt incluye un **factor de costo** (work factor) que ajusta cuánto tarda el hash:
```typescript
await bcrypt.hash(password, 10);  // 10 = 2^10 = 1024 iteraciones
// ~100ms en hardware moderno → un ataque de diccionario es impráctico
```

---

## 9. Next.js

### React con Renderizado del Lado del Servidor

React puro renderiza en el **navegador**. Next.js agrega la capacidad de renderizar en el **servidor**.

```
React puro (CSR):
Navegador → HTML vacío → descarga JS → React ejecuta → ve contenido

Next.js con SSR:
Navegador → HTML completo (servidor ya ejecutó React) → ve contenido inmediatamente
                                                          → hidratación (JS toma el control)
```

**Ventajas para este proyecto**:
- SEO (los bots ven el contenido)
- Tiempo hasta primer render visible (FCP) menor
- `'use client'` marca explícitamente qué componentes necesitan el navegador

### App Router (Next.js 13+)

```
apps/frontend/src/app/
├── layout.tsx           ← layout raíz (nav, providers, dark mode)
├── page.tsx             ← ruta /
├── dashboard/
│   └── page.tsx         ← ruta /dashboard
├── charts/
│   └── page.tsx         ← ruta /charts
├── ccl/
│   └── page.tsx         ← ruta /ccl (nueva)
├── login/
│   └── page.tsx         ← ruta /login
└── register/
    └── page.tsx         ← ruta /register
```

Cada `page.tsx` es una ruta automáticamente. No hay configuración adicional de router.

### Server Components vs Client Components

```typescript
// Server Component (default): se ejecuta en el servidor, no tiene estado
// ✅ Puede hacer fetch directo a DB, acceder a env vars secretas
// ❌ No puede usar useState, useEffect, event handlers
export default async function SymbolsPage() {
  const symbols = await fetch('http://backend:8101/api/v1/symbols');
  return <ul>{symbols.map(s => <li>{s.name}</li>)}</ul>;
}

// Client Component ('use client'): se ejecuta en el navegador
// ✅ Puede usar hooks, event handlers, WebSocket
// ❌ No puede acceder a secrets del servidor
'use client';
export function CandlestickChart({ symbol }: { symbol: string }) {
  const [data, setData] = useState([]);
  // ...
}
```

### Tailwind CSS: Sistema de Diseño con Clases Utilitarias

En lugar de escribir CSS:
```css
.button-primary {
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
}
```

Usás clases predefinidas directamente en el HTML:
```tsx
<button className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors">
  Guardar
</button>
```

**Modo oscuro** (configurado en este proyecto):
```tsx
// tailwind.config.js: darkMode: 'class'
// layout.tsx: <html className="dark">

// Las clases dark: se aplican cuando el elemento padre tiene clase "dark"
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
```

---

## 10. TanStack Query

### El Problema del Estado del Servidor

En React, `useState` maneja **estado local** (UI). Pero los datos del servidor (precios, portafolios) tienen características distintas:
- Pueden cambiar en cualquier momento (otro usuario modifica)
- Necesitan caching para no re-fetchear en cada render
- Necesitan invalidación cuando los datos cambian
- Necesitan manejo de loading/error states

TanStack Query (antes React Query) resuelve exactamente esto.

### Caching como Estructura de Datos

Internamente, React Query mantiene un **diccionario** `queryKey → { data, status, updatedAt }`:

```typescript
// Este queryKey identifica unívocamente una query
const { data, isLoading, error } = useQuery({
  queryKey: ['ohlc', symbol, interval],  // clave = ['ohlc', 'BTCUSDT', '1h']
  queryFn: () => marketApi.getOhlc({ symbol, interval }),
  staleTime: 5 * 60 * 1000,   // los datos son "frescos" por 5 minutos
  gcTime: 30 * 60 * 1000,     // eliminar del cache si no se usa por 30 min
});
```

Cuando `symbol` cambia de `'BTCUSDT'` a `'ETHUSDT'`, React Query:
1. Busca `['ohlc', 'ETHUSDT', '1h']` en el cache
2. Si existe y no está stale: retorna inmediatamente (O(1))
3. Si no existe: ejecuta `queryFn` y cachea el resultado

### Mutaciones (Modificar Datos)

```typescript
// Para operaciones que cambian datos en el servidor
const mutation = useMutation({
  mutationFn: (portfolio) => portfoliosApi.create(portfolio),
  onSuccess: () => {
    // Invalida el cache de portafolios → fuerza re-fetch
    queryClient.invalidateQueries({ queryKey: ['portfolios'] });
  },
  onError: (error) => {
    // Manejo de error sin try/catch disperso
  },
});

// Usar la mutación
<button onClick={() => mutation.mutate({ name: 'Nuevo Portfolio' })}>
  {mutation.isPending ? 'Guardando...' : 'Guardar'}
</button>
```

---

## 11. ECharts

### Arquitectura Declarativa de Gráficos

ECharts funciona con un objeto de configuración que **describe** el gráfico (no lo dibuja paso a paso). Es similar a la diferencia entre un algoritmo imperativo y declarativo.

```typescript
// Gráfico de velas (candlestick)
const option = {
  // Definir las series de datos
  series: [
    {
      type: 'candlestick',
      data: ohlc,  // [[open, close, low, high], ...]
      itemStyle: {
        color: '#00da3c',    // vela alcista (cierre > apertura)
        color0: '#ec0000',   // vela bajista
        borderColor: '#008F28',
        borderColor0: '#8A0000',
      },
    },
    {
      type: 'bar',
      xAxisIndex: 1,  // segunda grilla (volumen)
      yAxisIndex: 1,
      data: volumes,
    },
  ],

  // Zoom interactivo (dataZoom)
  dataZoom: [
    { type: 'inside', xAxisIndex: [0, 1] },  // zoom con scroll/pinch
    { type: 'slider', xAxisIndex: [0, 1] },  // barra deslizante
  ],

  // Eje X compartido entre precio y volumen
  grid: [
    { height: '50%' },      // grilla principal (precio)
    { top: '70%', height: '15%' },  // grilla secundaria (volumen)
  ],
};
```

### Algoritmos Relevantes en Visualización Financiera

**Media Móvil Simple (SMA)**:
```typescript
// apps/backend/src/market/market.service.ts
calculateMA(data: CandleData[], period: number): (number | null)[] {
  const closes = data.map(d => d.close);
  const ma: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      ma.push(null);  // no hay suficientes datos aún
    } else {
      // Ventana deslizante: O(n) total en lugar de O(n·p)
      const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      ma.push(+(sum / period).toFixed(4));
    }
  }
  return ma;
}
// Complejidad: O(n·p) naive, O(n) con suma acumulada
```

**CCL Implícito** (alineación por fecha):
```typescript
// Alineación de dos series temporales por fecha → HashMap de lookup
const usdMap = new Map<string, number>(
  usdCandles.data.map(c => [c.date.split('T')[0], c.close])
  // O(n) para construir el mapa
);

const cclSeries = arsCandles.data.map(c => {
  const usdClose = usdMap.get(c.date.split('T')[0]);  // O(1) lookup
  if (!usdClose) return null;
  return { date: c.date, ccl: c.close / (usdClose * ratio) };
}).filter(Boolean);
// Total: O(n) en lugar de O(n²) búsqueda naive
```

---

## 12. Docker

### Contenedores: Máquinas Virtuales Livianas

Un contenedor empaqueta la aplicación **con todas sus dependencias del sistema operativo**. Garantiza que lo que corre en tu laptop corre igual en producción.

```
Máquina Virtual:        Contenedor:
┌──────────────┐        ┌──────────────┐
│ App           │        │ App           │
│ Librerías    │        │ Librerías    │
│ OS completo  │        │ Solo lo que  │
│ (GBs)        │        │ necesita     │
│              │        │ (MBs)        │
└──────────────┘        └──────────────┘
│ Hypervisor   │        │ Docker Engine │
│ Host OS      │        │ Host OS      │
```

### Dockerfile Línea por Línea

```dockerfile
# apps/backend/Dockerfile
FROM node:20-bookworm-slim  # imagen base: Node.js 20 sobre Debian

RUN apt-get update -y && apt-get install -y openssl  # Prisma necesita OpenSSL

RUN corepack enable && corepack prepare pnpm@latest --activate  # activar pnpm

WORKDIR /app  # directorio de trabajo dentro del contenedor

# Copiar solo package.json primero → Docker cachea esta capa
# Si el código cambia pero las deps no, no reinstala todo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile  # instalar dependencias (cacheado)

COPY apps/backend ./apps/backend  # copiar código fuente
COPY packages/database ./packages/database

EXPOSE 8101  # documentar el puerto (no lo abre, solo documenta)

CMD ["sh", "-c", "
  prisma generate &&      # generar cliente TypeScript de Prisma
  prisma migrate deploy && # aplicar migraciones pendientes
  nest start --watch       # iniciar servidor en modo watch
"]
```

### Docker Compose: Orquestación Local

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    healthcheck:                   # liveness probe
      test: ['CMD-SHELL', 'pg_isready -U postgres']

  backend:
    depends_on:
      postgres:
        condition: service_healthy  # espera que Postgres esté listo
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/financial_charts
      # "postgres" aquí es el nombre del servicio = hostname en la red interna
    volumes:
      - ./apps/backend/src:/app/apps/backend/src  # hot reload del código fuente
```

**Red interna de Docker Compose**: los servicios se comunican por nombre (`postgres`, `redis`, `backend`). Desde fuera del compose, exponés puertos (`8101:8101`).

---

## 13. Monorepo

### pnpm Workspaces

Un monorepo agrupa múltiples paquetes relacionados en un solo repositorio. La alternativa (un repo por paquete) genera problemas de versionado y sincronización.

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'         # apps/frontend, apps/backend
  - 'packages/*'     # packages/database
```

```json
// packages/database/package.json
{
  "name": "@financial-charts/database",
  "version": "1.0.0",
  "scripts": {
    "db:seed": "tsx prisma/seed.ts"
  }
}

// apps/backend/package.json — referencia al paquete del monorepo
{
  "dependencies": {
    "@financial-charts/database": "workspace:*"  // workspace:* = versión local
  }
}
```

**Beneficio clave**: cuando el schema de Prisma cambia, tanto el backend como cualquier otro consumer del tipo generado lo ven inmediatamente — sin publicar a npm.

### Scripts Centralizados

```json
// package.json (raíz)
{
  "scripts": {
    "dev": "docker compose up -d",
    "db:seed": "pnpm --filter @financial-charts/database db:seed"
    //                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                 ejecuta el script en ese workspace específico
  }
}
```

---

## 14. Patrón Strategy

### Problema: Múltiples Proveedores de Datos

El mercado financiero argentino requiere datos de varias fuentes:
- **Binance**: criptos via WebSocket
- **Yahoo Finance**: acciones .BA y subyacentes
- **Finnhub**: subyacentes USD en tiempo real
- **IOL**: CEDEARs en ARS via BYMA

Sin patrón estrategia, el código quedaría así:
```typescript
// ❌ Violación de Open/Closed Principle
getOhlc(symbol: string, dataSource: string) {
  if (dataSource === 'binance') {
    return fetch('https://api.binance.com/...');
  } else if (dataSource === 'yahoo') {
    return fetch('https://query1.finance.yahoo.com/...');
  } else if (dataSource === 'finnhub') {
    return fetch('https://finnhub.io/...');
  }
  // Agregar IOL requiere modificar esta función → riesgo de romper otros proveedores
}
```

### Solución: Interface + Registry

```typescript
// apps/backend/src/market/providers/market-data-provider.interface.ts
// Define el CONTRATO (interfaz común)
export interface IMarketDataProvider {
  getHistoricalOhlc(symbol: string, interval: string, limit: number): Promise<CandleData[]>;
  getLatestPrice(symbol: string): Promise<number>;
  streamCandles(symbol: string, interval: string, onCandle: (c: CandleData) => void): () => void;
}

// Cada proveedor implementa la misma interfaz
@Injectable()
export class BinanceProvider implements IMarketDataProvider { ... }

@Injectable()
export class YahooFinanceProvider implements IMarketDataProvider { ... }

@Injectable()
export class IolProvider implements IMarketDataProvider { ... }

// El registry es un diccionario de estrategias
@Injectable()
export class MarketDataRegistry {
  private readonly providers: Record<string, IMarketDataProvider>;

  constructor(
    binance: BinanceProvider,
    yahoo: YahooFinanceProvider,
    finnhub: FinnhubProvider,
    iol: IolProvider,
  ) {
    this.providers = { binance, yahoo, finnhub, iol };
  }

  getProvider(key: string): IMarketDataProvider {
    return this.providers[key] ?? this.providers['binance'];
  }
}

// El servicio no sabe qué proveedor usa: solo llama a la interfaz
@Injectable()
export class MarketService {
  async getOhlcData(query: OhlcQueryDto) {
    const symbol = await this.prisma.symbol.findUnique({ where: { symbol: query.symbol } });
    const provider = this.registry.getProvider(symbol.dataSource);
    return provider.getHistoricalOhlc(query.symbol, query.interval, query.limit);
    // Agregar un nuevo proveedor: solo crear la clase + registrarla
    // Cero cambios en MarketService
  }
}
```

### Diagrama UML Simplificado

```
«interface»
IMarketDataProvider
────────────────────
+ getHistoricalOhlc()
+ getLatestPrice()
+ streamCandles()
       △
       │ implements
  ┌────┴──────────────────────────────┐
  │           │          │            │
BinanceProvider  YahooProvider  FinnhubProvider  IolProvider

MarketDataRegistry
────────────────────
- providers: Map<string, IMarketDataProvider>
+ getProvider(key): IMarketDataProvider
```

### Por Qué Esto Importa

| Sin Strategy | Con Strategy |
|---|---|
| Agregar proveedor = modificar `getOhlc` | Agregar proveedor = nueva clase |
| Testing: mock difícil | Testing: inyectar mock que implementa la misma interface |
| Crecimiento: función monolítica | Crecimiento: N clases independientes |
| Open/Closed: violado | Open/Closed: cumplido |

---

## 15. Ejercicios Propuestos

Los ejercicios están ordenados de menor a mayor dificultad. Cada uno tiene un hint algorítmico.

### Nivel 1 — Exploración

**E1.** Agregá un campo `description` al modelo `Symbol` en Prisma, generá la migración y actualizá el seed.
> Hint: `prisma migrate dev --name add_symbol_description`

**E2.** Creá un endpoint `GET /api/v1/market/symbols/by-market/:market` que retorne todos los símbolos de un mercado dado (e.g., `BYMA`).
> Hint: `prisma.symbol.findMany({ where: { market } })`

**E3.** En el frontend, mostrá solo los símbolos del mercado activo en el `SymbolSelector` (agregar un filtro por mercado).

### Nivel 2 — Algoritmos Aplicados

**E4.** Implementá Bollinger Bands en `MarketService`:
- SMA(n) ± k × σ(n)
- σ = desviación estándar de los cierres en la ventana
- Retornar tres series: `upper`, `middle`, `lower`
> Hint: Complejidad O(n) con suma y suma de cuadrados acumulada (Welford's algorithm).

**E5.** Implementá RSI (Relative Strength Index) de 14 períodos:
- `RS = promedio_ganancias / promedio_pérdidas`
- `RSI = 100 - 100/(1+RS)`
> Hint: Ventana deslizante, O(n).

**E6.** En la página CCL, calculá y mostrá la **volatilidad histórica** del tipo de cambio implícito:
- σ anualizada = σ diaria × √252
> Hint: Varianza de los log-retornos diarios.

### Nivel 3 — Arquitectura

**E7.** Implementá rate limiting para el endpoint de OHLC:
- Máximo 60 requests por minuto por usuario
- Usar Redis como backend del contador
- Retornar 429 Too Many Requests si se excede
> Hint: Sliding window counter en Redis con `INCR` + `EXPIRE`. O(1) por request.

**E8.** Agregá un proveedor `AlphaVantageProvider` (ya existe el skeleton) para obtener datos históricos de años anteriores de acciones y completar los blancos del `YahooFinanceProvider`.
> Hint: Mapeá los intervalos de Financi Charts (`1d`, `1h`) a los parámetros de Alpha Vantage (`TIME_SERIES_DAILY`, `TIME_SERIES_INTRADAY`).

**E9.** Implementá WebSocket en el frontend para el gráfico CCL: actualizá el CCL en tiempo real cuando lleguen nuevas velas del CEDEAR o del subyacente.
> Hint: Suscribite a dos streams simultáneos y re-calculá el CCL al recibir cualquier candle nuevo.

**E10.** Optimizá el cache de candles en `MarketService`:
- En lugar de "re-fetch si hay menos del 90%", implementá un cache que llene solo los **gaps** (candles faltantes en el rango pedido).
> Hint: Dado el rango `[t_start, t_end]` y la lista de timestamps existentes en DB, encontrar los intervalos faltantes es equivalent a encontrar los gaps en un arreglo de intervalos (merge intervals algorithm). Complejidad O(n log n) con sort o O(n) si ya está ordenado.

---

## Lecturas Recomendadas

### Para Profundizar en TypeScript
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/) — cubre genéricos, decoradores, módulos avanzados
- Documentación oficial: [`typescriptlang.org/docs`](https://www.typescriptlang.org/docs/)

### Para NestJS
- [Documentación oficial de NestJS](https://docs.nestjs.com) — excelente, con ejemplos para cada concepto
- [NestJS Fundamentals](https://courses.nestjs.com) — curso oficial

### Para Bases de Datos
- [Prisma Data Guide](https://www.prisma.io/dataguide) — fundamentos de PostgreSQL explicados bien
- *Designing Data-Intensive Applications* (Kleppmann) — el libro definitivo para entender sistemas de datos a escala

### Para Frontend / React
- [react.dev](https://react.dev) — documentación oficial con hooks, Suspense, Server Components
- [TanStack Query docs](https://tanstack.com/query/latest) — guía completa de caching y estado del servidor

### Para Sistemas Distribuidos
- *Patterns of Enterprise Application Architecture* (Fowler) — DI, Repository, Strategy y otros patrones
- [Refactoring Guru](https://refactoring.guru/design-patterns) — todos los patrones GoF con ejemplos en TypeScript
