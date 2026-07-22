import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ACCESS_TOKEN_COOKIE } from '../constants';

/**
 * Custom extractor: read the JWT from the httpOnly cookie first (the
 * canonical channel), then fall back to the Authorization header for
 * non-browser clients (curl, tests, future service-to-service).
 */
function extractJwtFromCookieOrHeader(req: Request): string | null {
  const fromCookie = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (fromCookie) return fromCookie;

  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT_SECRET is required and must be at least 32 characters long. ' +
          'Set it in your .env file (e.g. `openssl rand -hex 32`).',
      );
    }
    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: { sub: string; username: string; email: string }) {
    return {
      userId: payload.sub,
      username: payload.username,
      email: payload.email,
    };
  }
}