# Financial Charts

## 🎉 Proyecto Completamente Generado!

### ✅ Estructura del Proyecto

```
fcharts/
├── apps/
│   ├── backend/              ✅ NestJS Backend
│   └── frontend/             ✅ Next.js Frontend
├── packages/
│   └── database/             ✅ Prisma + PostgreSQL
├── docker-compose.yml        ✅ Docker orchestration
└── pnpm-workspace.yaml       ✅ Monorepo config
```

### 📦 Tecnologías Incluidas

**Frontend:**
- ✅ Next.js 15 con App Router
- ✅ React 18
- ✅ ECharts para gráficos financieros
- ✅ TanStack Query (React Query v5)
- ✅ Socket.IO client para WebSockets
- ✅ Tailwind CSS
- ✅ TypeScript

**Backend:**
- ✅ NestJS 10
- ✅ Prisma ORM
- ✅ PostgreSQL 16
- ✅ Redis 7 (cache)
- ✅ Socket.IO para WebSockets
- ✅ Swagger/OpenAPI docs
- ✅ TypeScript

### 🚀 Cómo Iniciar el Proyecto

#### 1. Navegar al proyecto
```powershell
cd b:\github\fcharts
```

#### 2. Instalar pnpm (si no lo tienes)
```powershell
npm install -g pnpm
```

#### 3. Instalar dependencias
```powershell
pnpm install
```

#### 4. Copiar archivo de entorno
```powershell
Copy-Item .env.example .env
```

#### 5. Elegir modo de desarrollo

Tienes **dos opciones** para ejecutar la aplicación:

##### 🔹 Opción A: Desarrollo Local (Recomendado para iteración rápida)

Ejecuta solo bases de datos en Docker, aplicaciones corren directamente con Node.js:

```powershell
# 1. Iniciar PostgreSQL y Redis en Docker
docker-compose up -d

# 2. Esperar ~10 segundos a que los servicios estén listos

# 3. Generar cliente de Prisma
pnpm db:generate

# 4. Crear tablas en la base de datos
pnpm db:push

# 5. Insertar datos de prueba
pnpm db:seed

# 6. Iniciar aplicaciones
pnpm dev              # Inicia frontend y backend
# O iniciar por separado:
pnpm dev:frontend     # Terminal 1 - http://localhost:8100
pnpm dev:backend      # Terminal 2 - http://localhost:8101
```

**Ventajas:** Hot-reload rápido, debugging fácil, acceso directo a node_modules  
**Desventajas:** Requiere Node.js 20+ instalado localmente

##### 🔹 Opción B: Docker Completo

Ejecuta todo en contenedores Docker (bases de datos + aplicaciones):

```powershell
# 1. Generar cliente de Prisma localmente primero
pnpm db:generate

# 2. Iniciar todos los servicios con Docker Compose
docker-compose -f docker-compose.all.yml up -d --build

# 3. Insertar datos de prueba (opcional)
docker exec fc-backend sh -c "cd /app/packages/database && node -r esbuild-register prisma/seed.ts"
```

**Ventajas:** Entorno consistente, no requiere Node.js local, más cercano a producción  
**Desventajas:** Hot-reload más lento, consume más recursos

> **ℹ️ Configuración de Base de Datos**: Este proyecto usa Prisma 5.22.0 para la gestión de base de datos. La variable `DATABASE_URL` se carga automáticamente desde el archivo `.env`.

### 🌐 URLs Disponibles

Una vez iniciado todo (ambas opciones usan los mismos puertos):

- **Frontend**: http://localhost:8100
- **Backend API**: http://localhost:8101
- **API Docs (Swagger)**: http://localhost:8101/api/docs
- **PostgreSQL**: localhost:8102 (postgres/postgres)
- **Redis**: localhost:8103
- **Prisma Studio**: Ejecuta `pnpm db:studio`

### 🎯 Características Implementadas

1. ✅ **Gráficos Candlestick en tiempo real** con ECharts
2. ✅ **WebSocket** para actualizaciones live desde Binance
3. ✅ **Múltiples intervalos** (1m, 5m, 15m, 1h, 4h, 1d, etc.)
4. ✅ **Gráfico de volumen** integrado
5. ✅ **Zoom y pan** interactivo
6. ✅ **Selección de símbolos** (BTC, ETH, BNB, SOL)
7. ✅ **API RESTful** con validación
8. ✅ **Base de datos** con Prisma
9. ✅ **Cache con Redis**
10. ✅ **Docker Compose** para desarrollo

### 📊 Endpoints API

**Market Data:**
```
GET /api/v1/market/ohlc?symbol=BTCUSDT&interval=1h&limit=100
GET /api/v1/market/indicators?symbol=BTCUSDT&interval=1h&ma=20,50
```

**Symbols:**
```
GET /api/v1/symbols
GET /api/v1/symbols/BTCUSDT
```

**WebSocket:**
```
ws://localhost:3001/market
Events: subscribe, unsubscribe
Receives: candle (real-time updates)
```

### 🛠️ Comandos Útiles

```powershell
# Docker - Solo Bases de Datos (Opción A)
docker-compose up -d          # Iniciar PostgreSQL + Redis
docker-compose down           # Detener bases de datos
docker-compose logs -f        # Ver logs

# Docker - Stack Completo (Opción B)
docker-compose -f docker-compose.all.yml up -d --build     # Iniciar todo
docker-compose -f docker-compose.all.yml down              # Detener todo
docker-compose -f docker-compose.all.yml logs -f backend   # Ver logs backend
docker-compose -f docker-compose.all.yml logs -f frontend  # Ver logs frontend
docker-compose -f docker-compose.all.yml restart backend   # Reiniciar backend

# Desarrollo Local
pnpm dev              # Iniciar frontend + backend
pnpm dev:frontend     # Solo frontend
pnpm dev:backend      # Solo backend

# Base de Datos
pnpm db:generate      # Generar cliente Prisma
pnpm db:push          # Sincronizar schema
pnpm db:seed          # Insertar datos de prueba
pnpm db:studio        # Abrir Prisma Studio (UI)

# Build y Testing
pnpm build            # Build para producción
pnpm lint             # Lint código
pnpm test             # Tests
```

### 🐛 Solución de Problemas

#### Puerto ocupado:
```powershell
# Cambiar puertos en .env o docker-compose.yml
```

#### Base de datos no conecta:
```powershell
pnpm docker:down
pnpm docker:up
pnpm db:push
```

#### Dependencias desactualizadas:
```powershell
pnpm install --force
```

### 📈 Próximos Pasos (Opcional)

1. **Indicadores técnicos**: RSI, MACD, Bollinger Bands
2. **Autenticación**: JWT + Guards en NestJS
3. **Watchlists personalizadas**: Guardar favoritos
4. **Alertas de precio**: Notificaciones push
5. **Backtesting**: Simulación de estrategias
6. **Más exchanges**: Coinbase, Kraken, etc.

### 📚 Documentación de Referencia

- [Next.js Docs](https://nextjs.org/docs)
- [NestJS Docs](https://docs.nestjs.com)
- [ECharts Docs](https://echarts.apache.org/en/index.html)
- [Prisma Docs](https://www.prisma.io/docs)
- [Docker Compose Docs](https://docs.docker.com/compose/)

---

**¡El proyecto está listo para usar! 🎉**

**Opción A (Local):** Ejecuta `docker-compose up -d && pnpm dev` y abre http://localhost:8100  
**Opción B (Docker):** Ejecuta `docker-compose -f docker-compose.all.yml up -d --build` y abre http://localhost:8100

### 👤 Usuario Demo

El script de seed crea un usuario de prueba:
- **Email**: demo@example.com
- **Usuario**: demo  
- **Contraseña**: demo123

El usuario demo tiene un portfolio con 3 posiciones (BTC, AAPL, MSFT) e historial de transacciones.
