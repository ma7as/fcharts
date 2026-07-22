import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  prismaMock,
  resetPrismaMock,
  seedUser,
  seedRefreshToken,
} from '../test/prisma.mock';
import { hashRefreshToken } from './auth-cookie.util';

/**
 * In-memory UsersService that delegates to the same Prisma mock
 * (so we exercise the real lookup logic without needing a DB).
 */
class FakeUsersService {
  async findByUsername(username: string) {
    return prismaMock.user.findUnique({ where: { username } } as any);
  }
  async findByEmail(email: string) {
    return prismaMock.user.findUnique({ where: { email } } as any);
  }
  async findOne(id: string) {
    return prismaMock.user.findUnique({ where: { id } } as any);
  }
  async create(dto: any) {
    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await prismaMock.user.create({
      data: { ...dto, password: hashed },
    } as any);
    const { password: _, ...safe } = user as any;
    return safe;
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    resetPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UsersService, useClass: FakeUsersService },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn((payload: any) => `jwt.${payload.sub}.${payload.username}`),
            verifyAsync: jest.fn(async (token: string) => {
              // Reverse the sign format for tests
              const [, sub, username] = token.split('.');
              return {
                sub,
                username,
                email: 'test@example.com',
              };
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('login', () => {
    it('rejects invalid credentials with generic message (no user enumeration)', async () => {
      await expect(
        service.login({ username: 'nobody', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects disabled users', async () => {
      const hashed = await bcrypt.hash('demo123', 10);
      seedUser({
        id: 'u1',
        email: 'a@b.c',
        username: 'demo',
        password: hashed,
        isActive: false,
      });
      await expect(
        service.login({ username: 'demo', password: 'demo123' }),
      ).rejects.toThrow(/disabled/);
    });

    it('returns access + refresh tokens on valid credentials', async () => {
      const hashed = await bcrypt.hash('demo123', 10);
      seedUser({
        id: 'u1',
        email: 'a@b.c',
        username: 'demo',
        password: hashed,
      });

      const tokens = await service.login({ username: 'demo', password: 'demo123' });
      expect(tokens.accessToken).toMatch(/^jwt\./);
      expect(tokens.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('register', () => {
    it('creates a user and returns tokens', async () => {
      const result = await service.register({
        email: 'new@user.com',
        username: 'newuser',
        password: 'Secure#2026',
      });
      expect(result.user).toMatchObject({
        email: 'new@user.com',
        username: 'newuser',
      });
      // Password is hashed, not stored in plaintext (no `password` field in DTO)
      expect((result.user as any).password).toBeUndefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('refresh token rotation', () => {
    it('rotates: marks old as used, issues new in same family', async () => {
      seedUser({ id: 'u1', email: 'a@b.c', username: 'demo', password: 'x' });
      const tokens = await service.login({ username: 'demo', password: 'x' });

      // Advance: try to refresh with the same token
      const newTokens = await service.refresh(tokens.refreshToken);

      // The OLD token must now be marked usedAt
      const oldRow = await (prismaMock.refreshToken.findUnique as any)({
        where: { tokenHash: hashRefreshToken(tokens.refreshToken) },
      });
      expect(oldRow.usedAt).toBeTruthy();

      // The NEW token must exist and belong to the same family
      const newRow = await (prismaMock.refreshToken.findUnique as any)({
        where: { tokenHash: hashRefreshToken(newTokens.refreshToken) },
      });
      expect(newRow.family).toBe(oldRow.family);
      expect(newRow.usedAt).toBeNull();
    });

    it('detects replay: reusing a used token revokes the entire family', async () => {
      seedUser({ id: 'u1', email: 'a@b.c', username: 'demo', password: 'x' });
      const tokens = await service.login({ username: 'demo', password: 'x' });

      // Rotate once -> old is used, new is fresh
      const rotated = await service.refresh(tokens.refreshToken);

      // Replay the old (used) token
      await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(
        /revoked/,
      );

      // The rotated (new) token must also be dead now (family revoked)
      await expect(service.refresh(rotated.refreshToken)).rejects.toThrow();
    });

    it('rejects unknown tokens (tampered/unknown)', async () => {
      await expect(
        service.refresh('a'.repeat(64)),
      ).rejects.toThrow(/Invalid/);
    });

    it('rejects expired tokens', async () => {
      seedUser({ id: 'u1', email: 'a@b.c', username: 'demo', password: 'x' });
      const tokens = await service.login({ username: 'demo', password: 'x' });
      const hash = hashRefreshToken(tokens.refreshToken);
      seedRefreshToken({
        // overwrite the just-created row with an expired one
        id: 'manual',
        userId: 'u1',
        tokenHash: hash,
        family: 'FAM_X',
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(
        /expired/,
      );
    });
  });

  describe('logout', () => {
    it('revokes the specific refresh token and is idempotent without one', async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();

      seedUser({ id: 'u1', email: 'a@b.c', username: 'demo', password: 'x' });
      const tokens = await service.login({ username: 'demo', password: 'x' });
      await service.logout(tokens.refreshToken);

      const row = await (prismaMock.refreshToken.findUnique as any)({
        where: { tokenHash: hashRefreshToken(tokens.refreshToken) },
      });
      expect(row.revokedAt).toBeTruthy();
    });
  });
});
