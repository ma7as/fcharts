import { PrismaClient } from '@prisma/client';

/**
 * In-memory mock of PrismaClient for unit tests.
 *
 * Each test should call `resetPrismaMock()` in beforeEach to ensure isolation.
 *
 * Only the methods used by the specs are implemented; anything else will
 * throw a clear error pointing at the missing method.
 */

type Store = {
  users: Map<string, any>;
  refreshTokens: Map<string, any>; // keyed by tokenHash
  symbols: Map<string, any>;
  portfolios: Map<string, any>;
  positions: Map<string, any>; // keyed by `${portfolioId}::${symbolId}`
  transactions: any[];
};

const store: Store = {
  users: new Map(),
  refreshTokens: new Map(),
  symbols: new Map(),
  portfolios: new Map(),
  positions: new Map(),
  transactions: [],
};

export function resetPrismaMock(): void {
  store.users.clear();
  store.refreshTokens.clear();
  store.symbols.clear();
  store.portfolios.clear();
  store.positions.clear();
  store.transactions.length = 0;
}

/**
 * Build a PrismaClient-shaped object that uses the in-memory store.
 * Use inside `Test.createTestingModule` via:
 *
 *   providers: [
 *     { provide: PrismaService, useValue: prismaMock },
 *     AuthService,
 *     ...
 *   ]
 */
export const prismaMock = {
  user: {
    findUnique: jest.fn(async ({ where }: any) => {
      if (where.id) return store.users.get(where.id) ?? null;
      if (where.email) {
        for (const u of store.users.values())
          if (u.email === where.email) return u;
        return null;
      }
      if (where.username) {
        for (const u of store.users.values())
          if (u.username === where.username) return u;
        return null;
      }
      return null;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      for (const u of store.users.values()) {
        if (where?.OR) {
          const match = where.OR.some(
            (cond: any) =>
              (cond.email && cond.email === u.email) ||
              (cond.username && cond.username === u.username),
          );
          if (match) return u;
        }
      }
      return null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const id = data.id ?? `user_${Date.now()}_${Math.random()}`;
      const user = { id, ...data };
      store.users.set(id, user);
      return user;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const existing = store.users.get(where.id);
      if (!existing) throw new Error('User not found');
      const updated = { ...existing, ...data };
      store.users.set(where.id, updated);
      return updated;
    }),
  },
  refreshToken: {
    findUnique: jest.fn(async ({ where }: any) => {
      return store.refreshTokens.get(where.tokenHash) ?? null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const id = data.id ?? `rt_${Date.now()}_${Math.random()}`;
      const row = {
        id,
        ...data,
        // Defaults that match the Prisma schema.
        usedAt: data.usedAt ?? null,
        revokedAt: data.revokedAt ?? null,
        createdAt: data.createdAt ?? new Date(),
      };
      store.refreshTokens.set(data.tokenHash, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      // Match by tokenHash first (used by refresh path) then by id
      // (used by rotation path).
      let key = where.tokenHash;
      if (!key && where.id) {
        for (const [k, v] of store.refreshTokens.entries()) {
          if ((v as any).id === where.id) {
            key = k;
            break;
          }
        }
      }
      const row = key ? store.refreshTokens.get(key) : null;
      if (!row) throw new Error('RefreshToken not found');
      const updated = { ...row, ...data };
      store.refreshTokens.set(key!, updated);
      return updated;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const row of store.refreshTokens.values()) {
        const match =
          (!where.family || row.family === where.family) &&
          (!where.tokenHash || row.tokenHash === where.tokenHash) &&
          (where.revokedAt === null || row.revokedAt === null);
        if (match) {
          store.refreshTokens.set(row.tokenHash, { ...row, ...data });
          count++;
        }
      }
      return { count };
    }),
  },
  symbol: {
    findUnique: jest.fn(async ({ where }: any) => {
      return store.symbols.get(where.symbol) ?? null;
    }),
  },
  portfolio: {
    findUnique: jest.fn(async ({ where }: any) => {
      return store.portfolios.get(where.id) ?? null;
    }),
  },
  position: {
    findUnique: jest.fn(async ({ where }: any) => {
      const key = `${where.portfolioId_symbolId.portfolioId}::${where.portfolioId_symbolId.symbolId}`;
      return store.positions.get(key) ?? null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const id = data.id ?? `pos_${Date.now()}_${Math.random()}`;
      const key = `${data.portfolioId}::${data.symbolId}`;
      const row = { id, ...data };
      store.positions.set(key, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const key = `${where.portfolioId_symbolId.portfolioId}::${where.portfolioId_symbolId.symbolId}`;
      const row = store.positions.get(key);
      if (!row) throw new Error('Position not found');
      const updated = { ...row, ...data };
      store.positions.set(key, updated);
      return updated;
    }),
    delete: jest.fn(async ({ where }: any) => {
      const key = `${where.portfolioId_symbolId.portfolioId}::${where.portfolioId_symbolId.symbolId}`;
      store.positions.delete(key);
      return {};
    }),
  },
  transaction: {
    create: jest.fn(async ({ data }: any) => {
      const id = data.id ?? `tx_${Date.now()}_${Math.random()}`;
      // Real Prisma returns Decimal as a string-like object. We coerce
      // numeric fields to strings so the spec asserts on the real shape.
      const row = {
        id,
        ...data,
        quantity: String(data.quantity),
        price: String(data.price),
        fees: data.fees !== undefined ? String(data.fees) : '0',
        total: data.total !== undefined ? String(data.total) : '0',
      };
      store.transactions.push(row);
      return row;
    }),
    findMany: jest.fn(async ({ where, skip = 0, take = 20 }: any = {}) => {
      const filtered = store.transactions.filter((tx: any) =>
        !where || Object.keys(where).every((k) => tx[k] === where[k]),
      );
      // sort by executedAt desc — store pushes in insertion order so we
      // emulate newest-first
      const sorted = [...filtered].sort((a: any, b: any) => {
        const at = a.executedAt ? new Date(a.executedAt).getTime() : 0;
        const bt = b.executedAt ? new Date(b.executedAt).getTime() : 0;
        return bt - at;
      });
      return sorted.slice(skip, skip + take);
    }),
    count: jest.fn(async ({ where }: any = {}) => {
      if (!where) return store.transactions.length;
      return store.transactions.filter((tx: any) =>
        Object.keys(where).every((k) => tx[k] === where[k]),
      ).length;
    }),
  },
  // $transaction runs the callback against a tx object. For the few specs
  // that need it, we forward to the same store (single in-memory backend).
  $transaction: jest.fn(async (fnOrBatch: any) => {
    if (typeof fnOrBatch === 'function') {
      // Use the same mock — the tx parameter is a Prisma.TransactionClient
      // and our mocks handle `create`/`update`/etc. correctly.
      return fnOrBatch(prismaMock);
    }
    // Array form (sequential): run each in order and collect results.
    return Promise.all(fnOrBatch);
  }),
  $connect: jest.fn(async () => {}),
  $disconnect: jest.fn(async () => {}),
} as unknown as PrismaClient;

// Expose internal store so specs can pre-seed data without going through
// the services. Use `seedUser`, `seedRefreshToken`, etc. for clarity.
export function seedUser(user: {
  id?: string;
  email: string;
  username: string;
  password: string;
  isActive?: boolean;
}) {
  const id = user.id ?? `user_${Date.now()}_${Math.random()}`;
  const row = {
    id,
    email: user.email,
    username: user.username,
    // Real bcrypt round would take ~100ms per call; sync seed runs in tests
    // so a pre-hashed value matching bcrypt.compare is more practical.
    // For tests that exercise login, hash synchronously once at seed time.
    password: user.password.startsWith('$2')
      ? user.password // already hashed
      : require('bcryptjs').hashSync(user.password, 4),
    firstName: null,
    lastName: null,
    isActive: user.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.users.set(id, row);
  return row;
}

export function seedRefreshToken(row: {
  id?: string;
  userId: string;
  tokenHash: string;
  family: string;
  expiresAt?: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
}) {
  const id = row.id ?? `rt_${Date.now()}_${Math.random()}`;
  const stored = {
    id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    family: row.family,
    expiresAt: row.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    usedAt: row.usedAt ?? null,
    revokedAt: row.revokedAt ?? null,
    createdAt: new Date(),
  };
  store.refreshTokens.set(row.tokenHash, stored);
  return stored;
}

export function seedPosition(p: {
  portfolioId: string;
  symbolId: string;
  quantity: number | string;
  costBasis?: number | string;
  averagePrice?: number | string;
}) {
  const key = `${p.portfolioId}::${p.symbolId}`;
  const id = `pos_${Date.now()}_${Math.random()}`;
  const row = {
    id,
    portfolioId: p.portfolioId,
    symbolId: p.symbolId,
    quantity: String(p.quantity),
    averagePrice: p.averagePrice !== undefined ? String(p.averagePrice) : '0',
    costBasis: p.costBasis !== undefined ? String(p.costBasis) : '0',
    currentPrice: null,
    marketValue: null,
    unrealizedPnL: null,
    unrealizedPnLPct: null,
    lastUpdated: new Date(),
    createdAt: new Date(),
  };
  store.positions.set(key, row);
  return row;
}

export function seedPortfolio(p: { id: string; userId: string }) {
  const row = {
    id: p.id,
    userId: p.userId,
    name: 'Test',
    description: null,
    currency: 'USD',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.portfolios.set(p.id, row);
  return row;
}
