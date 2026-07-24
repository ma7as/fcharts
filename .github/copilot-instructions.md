# GitHub Copilot Instructions - Financial Charts

## Stack Tecnológico

Este proyecto es una aplicación full-stack de gráficos financieros con el siguiente stack:

### Frontend
- **Framework**: Next.js 16.1.6 (App Router)
- **UI**: React 19, TailwindCSS 4.0, shadcn/ui
- **Gráficos**: Apache ECharts
- **Estado**: React Context API
- **Internacionalización**: i18next
- **TypeScript**: Tipado estricto

### Backend
- **Framework**: NestJS 11
- **Base de Datos**: PostgreSQL 17 + Prisma ORM 5.22.0
- **Caché**: Redis 8
- **WebSockets**: Socket.io para datos en tiempo real
- **Autenticación**: JWT + bcrypt

> **ℹ️ Nota sobre Prisma**: Usamos Prisma 5.22.0 por estabilidad. NO usar sintaxis de Prisma 7.

### Arquitectura
- **Monorepo**: pnpm workspaces
- **Containerización**: Docker + Docker Compose
- **Estructura**:
  - `apps/frontend/` - Aplicación Next.js
  - `apps/backend/` - API NestJS
  - `packages/database/` - Prisma schema y migraciones

## Directrices de Código

### General
- Usa TypeScript estricto en todo el código
- Prefiere interfaces sobre types para objetos
- Usa `const` por defecto, `let` solo cuando sea necesario
- Implementa manejo de errores robusto con try-catch
- Agrega comentarios JSDoc para funciones públicas

### Frontend (Next.js)
- Usa Server Components por defecto, Client Components solo cuando sea necesario
- Marca Client Components con `'use client'` al inicio del archivo
- Usa el App Router (app/) en lugar del Pages Router
- Implementa loading.tsx y error.tsx para cada ruta
- Usa suspense boundaries para carga asíncrona
- Prefiere Server Actions sobre API routes cuando sea posible
- Usa `useTransition` para transiciones de estado
- Implementa validación de formularios con Zod

**Ejemplo de Server Component:**
```typescript
// app/dashboard/page.tsx
export default async function DashboardPage() {
  const data = await fetchData(); // Server-side
  return <Dashboard data={data} />;
}
```

**Ejemplo de Client Component:**
```typescript
'use client'

import { useState } from 'react';

export function InteractiveChart() {
  const [data, setData] = useState([]);
  // ... código interactivo
}
```

### Backend (NestJS)
- Usa decoradores de NestJS consistentemente
- Implementa DTOs con class-validator para validación
- Usa servicios inyectables con @Injectable()
- Implementa guards para autenticación y autorización
- Usa interceptores para transformación de respuestas
- Implementa pipes para validación y transformación
- Separa lógica de negocio en servicios

**Ejemplo de Controller:**
```typescript
@Controller('symbols')
@UseGuards(JwtAuthGuard)
export class SymbolsController {
  constructor(private readonly symbolsService: SymbolsService) {}

  @Get()
  async findAll(@Query() query: OhlcQueryDto) {
    return this.symbolsService.findAll(query);
  }
}
```

**Ejemplo de DTO:**
```typescript
export class CreateSymbolDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  name: string;

  @IsEnum(['crypto', 'stock', 'cedear'])
  type: string;
}
```

### Prisma (Base de Datos)

**Versión**: Prisma 5.22.0 (IMPORTANTE: NO usar sintaxis de Prisma 7)

**Por qué Prisma 5**: Optamos por Prisma 5.22.0 en lugar de Prisma 7 por:
- Estabilidad probada y madurez
- Menor complejidad en la configuración
- No requiere archivos adicionales ni adaptadores especiales
- Amplia documentación y soporte de la comunidad

- Usa PrismaClient sin configuraciones especiales
- Implementa el schema en `packages/database/prisma/schema.prisma`
- Usa relaciones explícitas con @relation
- Implementa índices con @@index para queries frecuentes
- Usa tipos Decimal para valores monetarios/financieros
- Implementa soft deletes con campos isActive o deletedAt

**Ejemplo de Modelo:**
```prisma
model Symbol {
  id        String   @id @default(cuid())
  symbol    String   @unique
  name      String
  type      String
  currency  String   @default("USD")
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  candles Candle[]

  @@index([symbol, type])
  @@map("symbols")
}
```

**Uso en Código:**
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Queries
const symbols = await prisma.symbol.findMany({
  where: { isActive: true },
  include: { candles: true }
});
```

### Apache ECharts
- Usa ECharts para gráficos de velas (candlestick), líneas y volumen
- Implementa temas personalizados con colores consistentes
- Usa responsive: true para gráficos adaptables
- Implementa tooltips informativos
- Usa lazy loading para gráficos complejos

**Ejemplo de Configuración:**
```typescript
const option: EChartsOption = {
  xAxis: { type: 'category', data: timestamps },
  yAxis: { type: 'value' },
  series: [{
    type: 'candlestick',
    data: ohlcData,
    itemStyle: {
      color: '#26a69a', // verde
      color0: '#ef5350', // rojo
    }
  }]
};
```

### TailwindCSS
- Usa clases utilitarias, evita CSS custom
- Usa dark: para modo oscuro
- Implementa responsive design con sm:, md:, lg:
- Usa variables CSS para colores del tema
- Prefiere componentes de shadcn/ui sobre componentes custom

### WebSockets (Socket.io)
- Usa namespaces para organizar eventos (/market, /portfolio)
- Implementa rooms para datos específicos por símbolo
- Usa eventos tipados con TypeScript
- Implementa reconexión automática en el cliente
- Maneja errores de conexión gracefully

**Ejemplo Backend:**
```typescript
@WebSocketGateway({ namespace: 'market' })
export class MarketGateway {
  @SubscribeMessage('subscribe')
  handleSubscribe(@MessageBody() symbol: string) {
    // Emitir datos en tiempo real
  }
}
```

**Ejemplo Frontend:**
```typescript
const socket = io('http://localhost:8101/market');
socket.emit('subscribe', 'BTCUSDT');
socket.on('price-update', (data) => {
  updatePrice(data);
});
```

## Patrones de Diseño

### Repository Pattern
- Usa PrismaService como repository base
- Implementa métodos específicos en servicios

### DTO Pattern
- Separa DTOs de entrada y salida
- Usa class-transformer para transformaciones
- Valida con class-validator

### Dependency Injection
- Usa constructor injection en NestJS
- Usa React Context para estado compartido en frontend

## Testing

### Backend
```typescript
describe('SymbolsService', () => {
  let service: SymbolsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SymbolsService, PrismaService],
    }).compile();

    service = module.get(SymbolsService);
  });

  it('should find all symbols', async () => {
    const result = await service.findAll();
    expect(result).toBeDefined();
  });
});
```

### Frontend
- Usa React Testing Library
- Prefiere queries por role y text sobre testId
- Mockea APIs con MSW

## Variables de Entorno

Usa archivos `.env` en la raíz del proyecto:

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:8102/financial_charts"

# Redis
REDIS_URL="redis://localhost:8103"

# Backend
PORT=8101
JWT_SECRET="your-secret-key"

# Frontend
NEXT_PUBLIC_API_URL="http://localhost:8101"
NEXT_PUBLIC_WS_URL="ws://localhost:8101"
```

## Comandos Importantes

```bash
# Instalación
pnpm install

# Base de datos
pnpm db:generate  # Generar cliente Prisma
pnpm db:push      # Sincronizar schema
pnpm db:seed      # Datos de prueba

# Desarrollo
pnpm dev          # Todo
pnpm dev:frontend # Solo frontend
pnpm dev:backend  # Solo backend

# Docker
docker-compose up -d
```

## Convenciones de Nombres

- **Archivos**: kebab-case (user-service.ts)
- **Componentes React**: PascalCase (CandlestickChart.tsx)
- **Funciones/Variables**: camelCase (getUserData)
- **Constantes**: SCREAMING_SNAKE_CASE (API_BASE_URL)
- **Interfaces**: PascalCase con prefijo I opcional (User o IUser)
- **Types**: PascalCase (UserType)
- **Prisma Models**: PascalCase singular (User, Symbol)
- **Database Tables**: snake_case plural (users, symbols)

## Seguridad

- Nunca expongas JWT_SECRET o claves API en el código
- Valida y sanitiza todas las entradas
- Usa bcrypt para hashear passwords (salt rounds: 10)
- Implementa rate limiting en endpoints públicos
- Usa CORS configurado correctamente
- Implementa CSRF protection para formularios

## Performance

- Usa índices en Prisma para queries frecuentes
- Implementa paginación para listas grandes
- Usa Redis para caché de datos frecuentes
- Implementa lazy loading para componentes pesados
- Optimiza imágenes con next/image
- Usa suspense boundaries para mejor UX

## Recursos Financieros

El proyecto trabaja con:
- **Criptomonedas**: BTCUSDT, ETHUSDT (Binance)
- **Acciones US**: AAPL, MSFT, GOOGL (NYSE/NASDAQ)
- **CEDEARs**: Versiones ARS de acciones US en BYMA
- **Acciones AR**: GGAL, YPF, PAMP (Merval)

Intervalos soportados: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M

## Skills de Proyecto

Skills locales en `.github/skills/` que extienden el comportamiento por defecto de Copilot para este repo. Cargarlas cuando el trigger aplique.

| Skill | Trigger | Propósito |
|---|---|---|
| `powershell-windows` | `run_in_terminal` en Windows, `.ps1`, PowerShell 5.1/7 | Comandos y scripts PowerShell correctos, sin bashisms, con UTF-8 BOM en scripts. **REGLA CRÍTICA: `.ps1` se guarda UTF-8 CON BOM; el resto del repo va UTF-8 sin BOM.** |
