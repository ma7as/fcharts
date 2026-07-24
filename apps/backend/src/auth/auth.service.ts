import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  generateRefreshToken,
  hashRefreshToken,
} from './auth-cookie.util';
import { MetricsService } from '../common/metrics/metrics.service';
import * as bcrypt from 'bcryptjs';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);

    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _pw, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * Sign a new access JWT. TTL is taken from JWT_EXPIRES_IN env
   * (defaults to 15m in the module registration).
   */
  private signAccessToken(user: {
    id: string;
    username: string;
    email: string;
  }): string {
    return this.jwtService.sign({
      sub: user.id,
      username: user.username,
      email: user.email,
    });
  }

  /**
   * Mint a fresh access + refresh pair tied to a family. Persists only
   * the refresh token's SHA-256 hash; the raw token is returned to the
   * caller and only lives in the cookie.
   *
   * If `oldRefreshToken` is provided, the matching row is marked as used
   * (rotation). If the old token was already used → entire family revoked
   * (replay detection).
   */
  async issueTokenPair(
    userId: string,
    options: { oldRefreshToken?: string } = {},
  ): Promise<AuthTokens> {
    const user = await this.usersService.findOne(userId);
    const accessToken = this.signAccessToken(user);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    if (options.oldRefreshToken) {
      const oldHash = hashRefreshToken(options.oldRefreshToken);
      const oldRow = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: oldHash },
      });

      if (!oldRow) {
        // Token presented but no matching row → tampered / unknown.
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (oldRow.usedAt || oldRow.revokedAt) {
        // Replay detected. Revoke the entire family and force re-login.
        this.logger.warn(
          `Refresh token reuse detected for family ${oldRow.family} \u2014 revoking`,
        );
        this.metrics.authEvent('refresh_revoke');
        await this.prisma.refreshToken.updateMany({
          where: { family: oldRow.family, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedException('Refresh token revoked');
      }

      if (oldRow.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // Rotate: mark old as used, issue new in the same family.
      await this.prisma.refreshToken.update({
        where: { id: oldRow.id },
        data: { usedAt: new Date() },
      });

      await this.prisma.refreshToken.create({
        data: {
          userId,
          tokenHash,
          family: oldRow.family,
          expiresAt,
        },
      });
      this.metrics.authEvent('refresh_rotate');
    } else {
      // Initial login: start a new family.
      const family = generateRefreshToken();
      await this.prisma.refreshToken.create({
        data: {
          userId,
          tokenHash,
          family,
          expiresAt,
        },
      });
    }

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto): Promise<AuthTokens> {
    const user = await this.usersService.findByUsername(loginDto.username);

    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      // Generic message — no user enumeration via timing or wording.
      this.metrics.authEvent('login_fail');
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is disabled');
    }

    this.metrics.authEvent('login_success');
    return this.issueTokenPair(user.id);
  }

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);
    this.metrics.authEvent('register_success');
    const tokens = await this.issueTokenPair(user.id);
    return { ...tokens, user };
  }

  async refresh(oldRefreshToken: string): Promise<AuthTokens> {
    const oldHash = hashRefreshToken(oldRefreshToken);
    const oldRow = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: oldHash },
    });

    if (!oldRow) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokenPair(oldRow.userId, { oldRefreshToken });
  }

  /**
   * Revoke a refresh token (logout). If the cookie is missing, we still
   * succeed — idempotent logout.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const hash = hashRefreshToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string) {
    return this.usersService.findOne(userId);
  }
}