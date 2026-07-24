# Financial Charts - Portfolio Management System

Full-stack financial application with real-time market data, portfolio tracking, and investment management.

## 🚀 Features

### 📊 Market Data & Charts
- Real-time candlestick charts powered by ECharts
- Multiple timeframes (1m, 5m, 15m, 1h, 4h, 1d, 1w, 1M)
- Support for crypto, stocks, bonds, forex, ETFs, and commodities
- Technical indicators and advanced charting

### 💼 Portfolio Management
- Track multiple investment portfolios
- Real-time position monitoring with P&L calculations
- Transaction history (BUY/SELL/DIVIDEND/SPLIT/TRANSFER)
- Performance snapshots and analytics
- Multi-currency support

### 🔐 Authentication & Security
- JWT-based authentication
- Secure password hashing with bcrypt
- User registration and login
- Protected API endpoints

### 📱 Modern UI
- Responsive dashboard with portfolio overview
- Real-time updates via WebSockets
- Clean, intuitive interface with Tailwind CSS
- Interactive charts and data visualizations

## 🚀 Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **ECharts** - Advanced charting library
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Utility-first CSS
- **Socket.IO** - Real-time WebSocket communication

### Backend
- **NestJS** - Progressive Node.js framework
- **Prisma 5** - Type-safe ORM
- **PostgreSQL 16** - Relational database
- **Redis 7** - Caching layer
- **Passport & JWT** - Authentication
- **Socket.IO** - WebSocket server

## 📋 Prerequisites

- Node.js 20+
- pnpm 10+
- Docker & Docker Compose

## 🛠️ Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd fcharts

# Install pnpm globally if you haven't
npm install -g pnpm

# Install dependencies
pnpm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings (optional, defaults work for local dev)
```

### 3. Choose Your Development Mode

You have **two options** for running the application:

#### 🔹 Option A: Local Development (Recommended for fast iteration)

Run only databases in Docker, applications run directly with Node.js for hot-reload:

```bash
# 1. Start PostgreSQL and Redis in Docker
docker-compose up -d

# 2. Wait for services to be healthy (~10 seconds)

# 3. Generate Prisma client
pnpm db:generate

# 4. Push schema to database
pnpm db:push

# 5. Seed initial data
pnpm db:seed

# 6. Start applications
pnpm dev              # Starts both frontend and backend
# Or start individually:
pnpm dev:frontend     # http://localhost:8100
pnpm dev:backend      # http://localhost:8101
```

**Pros:** Faster hot-reload, easier debugging, direct access to node_modules  
**Cons:** Requires Node.js 20+ installed locally

#### 🔹 Option B: Full Docker Development

Run everything in Docker containers (databases + applications):

```bash
# 1. Generate Prisma client locally first
pnpm db:generate

# 2. Start all services with Docker Compose
docker-compose -f docker-compose.all.yml up -d --build

# 3. Seed database (optional)
docker exec fc-backend sh -c "cd /app/packages/database && node -r esbuild-register prisma/seed.ts"
```

**Pros:** Consistent environment, no local Node.js setup needed, closer to production  
**Cons:** Slower hot-reload, more resource-intensive

> **ℹ️ Database Configuration**: This project uses Prisma 5.22.0 for database management. The `DATABASE_URL` is loaded automatically from the `.env` file.

## 🧪 Demo User Credentials

The seed script creates a demo user for testing:

- **Email**: demo@example.com
- **Username**: demo
- **Password**: demo123

The demo user has a portfolio with 3 positions (BTC, AAPL, MSFT) and sample transaction history.

## 📚 Available Scripts

```bash
# Development
pnpm dev              # Start all services (requires manual DB setup)
pnpm dev:frontend     # Start Next.js frontend only
pnpm dev:backend      # Start NestJS backend only

# Docker - Only Databases
docker-compose up -d           # Start PostgreSQL + Redis
docker-compose down            # Stop databases
docker-compose logs -f         # View logs

# Docker - Full Stack
docker-compose -f docker-compose.all.yml up -d --build  # Start everything
docker-compose -f docker-compose.all.yml down           # Stop all containers
docker-compose -f docker-compose.all.yml logs -f backend   # View backend logs
docker-compose -f docker-compose.all.yml logs -f frontend  # View frontend logs

# Database Management
pnpm db:generate    # Generate Prisma Client
pnpm db:push        # Push schema to database
pnpm db:seed        # Seed initial data
pnpm db:studio      # Open Prisma Studio UI

# Build
pnpm build            # Build all apps
pnpm build:frontend   # Build frontend only
pnpm build:backend    # Build backend only

# Quality
pnpm lint             # Lint all apps
pnpm test             # Test all apps
```

## 🌐 URLs

### Local Development (Option A)
- **Frontend**: http://localhost:8100
- **Backend API**: http://localhost:8101
- **API Docs (Swagger)**: http://localhost:8101/api/docs
- **PostgreSQL**: localhost:8102 (postgres/postgres)
- **Redis**: localhost:8103

### Full Docker (Option B)
- **Frontend**: http://localhost:8100
- **Backend API**: http://localhost:8101
- **API Docs (Swagger)**: http://localhost:8101/api/docs
- **PostgreSQL**: localhost:8102 (postgres/postgres)
- **Redis**: localhost:8103

## 📦 Project Structure

```
fcharts/
├── apps/
│   ├── frontend/          # Next.js application
│   │   ├── src/
│   │   │   ├── app/              # App Router pages
│   │   │   │   ├── login/        # Login page
│   │   │   │   ├── register/     # Registration page
│   │   │   │   ├── dashboard/    # Portfolio dashboard
│   │   │   │   └── charts/       # Market charts
│   │   │   ├── components/       # React components
│   │   │   ├── contexts/         # React contexts (Auth)
│   │   │   └── lib/              # Utilities (API client, WebSocket)
│   │   └── Dockerfile
│   │
│   └── backend/           # NestJS application
│       ├── src/
│       │   ├── auth/             # JWT authentication
│       │   ├── users/            # User management
│       │   ├── portfolios/       # Portfolio CRUD
│       │   ├── market/           # Market data & WebSockets
│       │   ├── symbols/          # Symbols management
│       │   └── prisma/           # Prisma service
│       └── Dockerfile
│
├── packages/
│   └── database/          # Shared Prisma schema
│       ├── prisma/
│       │   ├── schema.prisma    # Database models
│       │   └── seed.ts          # Seed data
│       └── init.sql
│
├── docker-compose.yml     # Docker orchestration
├── pnpm-workspace.yaml    # pnpm workspace config
└── README.md
│   │   ├── src/
│   │   │   ├── app/       # App router pages
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── Dockerfile
│   └── backend/           # NestJS application
│       ├── src/
│       │   ├── market/    # Market data module
│       │   ├── symbols/   # Symbols module
│       │   └── prisma/    # Prisma service
│       └── Dockerfile
├── packages/
│   └── database/          # Prisma schema & migrations
│       └── prisma/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

## Redis (PR1)

The NestJS backend wires a Redis 8 client via `RedisModule` for future
caching and Throttler storage (PR2). Connection is configured by
`REDIS_URL` (default `redis://localhost:8103`); set `REDIS_REQUIRED=true`
to fail-fast on startup when Redis is unreachable.

## Observability (PR3)

The backend exposes Prometheus metrics at `GET /internal/metrics` on the
main API port (8101). A Prometheus + Grafana stack is included in
`docker-compose.all.yml`:

- Prometheus scrapes the backend, `redis-exporter`, and itself every 15s
  (15d retention).
- Grafana auto-provisions the Prometheus datasource and three dashboards
  (`fcharts-overview`, `fcharts-cache`, `fcharts-auth`) from
  `ops/grafana/`.
- Alert rules live in `ops/prometheus/alerts.yml` and are mounted into
  Prometheus at `/etc/prometheus/alerts.yml`. The file is loaded by
  `prometheus.yml` via `rule_files:`; alerts surface in the Prometheus
  UI (`http://localhost:9090/alerts`) without alertmanager for now
  (PR-FU-006 scope; alertmanager is a follow-up).

The observability containers (`fc-prometheus`, `fc-grafana`,
`fc-redis-exporter`) publish their ports on **all interfaces** by
default — Prometheus on `9090`, Grafana on `8300`, redis-exporter on
`9110`. **Production lockdown is via reverse proxy / Docker socket
options, not via port binding.** See `docs/follow-ups/prs.md` PR-FU-003
for the context behind this decision.

Then open:

- Grafana: http://localhost:8300 (admin / `${GRAFANA_ADMIN_PASSWORD}`)
- Prometheus: http://localhost:9090

Dashboard sources live under `ops/grafana/dashboards/`. Editing JSON and
committing will reflect in Grafana within 30s — no container restart.

## 🔌 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Create new user account
- `POST /api/v1/auth/login` - Authenticate user (returns JWT)
- `GET /api/v1/auth/profile` - Get current user profile (requires JWT)

### Users
- `GET /api/v1/users` - List all users (protected)
- `GET /api/v1/users/:id` - Get user by ID (protected)
- `PATCH /api/v1/users/:id` - Update user (protected)
- `DELETE /api/v1/users/:id` - Delete user (protected)

### Portfolios
- `GET /api/v1/portfolios` - Get user's portfolios (protected)
- `POST /api/v1/portfolios` - Create new portfolio (protected)
- `GET /api/v1/portfolios/:id` - Get portfolio details (protected)
- `PATCH /api/v1/portfolios/:id` - Update portfolio (protected)
- `DELETE /api/v1/portfolios/:id` - Delete portfolio (protected)
- `GET /api/v1/portfolios/:id/positions` - Get portfolio positions (protected)
- `GET /api/v1/portfolios/:id/transactions` - Get transaction history (protected)
- `POST /api/v1/portfolios/:id/transactions` - Add transaction (protected)
- `GET /api/v1/portfolios/:id/performance` - Get performance snapshots (protected)

### Market Data
- `GET /api/v1/market/ohlc?symbol=BTCUSDT&interval=1h&limit=100` - Get OHLC data
- `GET /api/v1/market/indicators?symbol=BTCUSDT&interval=1h&ma=20,50` - Get technical indicators

### Symbols
- `GET /api/v1/symbols` - Get all symbols
- `GET /api/v1/symbols/:symbol` - Get specific symbol details

### WebSocket
- `ws://localhost:8101/market` - Real-time candle updates

## 🎯 Features

### ✅ Implemented
- Real-time candlestick charts with ECharts
- Multiple timeframes (1m, 5m, 15m, 1h, 4h, 1d, 1w, 1M)
- Volume visualization
- Zoom and pan functionality
- WebSocket real-time updates
- Technical indicators (MA, more coming)
- User authentication (JWT + bcrypt)
- Portfolio management (CRUD)
- Position tracking with P&L calculations
- Transaction history
- Performance snapshots
- Multi-currency support
- Responsive design
- Type-safe API with TypeScript
- Docker containerization
- Swagger API documentation

### 🔜 Coming Soon
- Price alerts and notifications
- Watchlists
- Advanced technical indicators (RSI, MACD, Bollinger Bands)
- Chart pattern recognition
- Export reports (PDF/CSV)
- Mobile app

## 📊 Database Models

### Core Entities
- **Symbol**: Tradable assets (crypto, stocks, bonds, forex, ETFs, commodities)
- **Candle**: OHLCV data for technical analysis
- **User**: Registered users with authentication
- **Portfolio**: Investment portfolios belonging to users
- **Position**: Current holdings in a portfolio
- **Transaction**: Trade history (BUY/SELL/DIVIDEND/SPLIT/TRANSFER)
- **PerformanceSnapshot**: Historical portfolio performance metrics
- **Watchlist**: User's favorite symbols to track
- **PriceAlert**: Price alerts for symbols

See [PRISMA_WORKFLOW.md](PRISMA_WORKFLOW.md) for detailed database schema documentation.

## 🐛 Troubleshooting

### Database connection failed
```bash
# Check if containers are running
docker-compose ps

# View logs
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d
```

### Port already in use
The application uses custom ports to avoid conflicts:
- Frontend: 8100
- Backend: 8101
- PostgreSQL: 8102
- Redis: 8103

If these ports are in use, modify them in [docker-compose.yml](docker-compose.yml).

### WebSocket not connecting
- Check CORS settings in backend [main.ts](apps/backend/src/main.ts)
- Ensure backend is running on port 8101
- Check browser console for connection errors

### Prisma Client not found
```bash
# Regenerate Prisma Client
docker exec fc-backend sh -c "cd /app && pnpm db:generate"

# Restart backend
docker-compose restart backend
```

### Frontend not loading
```bash
# Check frontend logs
docker-compose logs -f frontend

# Rebuild frontend
docker-compose up -d --build frontend
```

## 📄 License

MIT - See [LICENSE](LICENSE) for details

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 🔗 Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [ECharts Documentation](https://echarts.apache.org/en/index.html)
- [Docker Documentation](https://docs.docker.com/)
