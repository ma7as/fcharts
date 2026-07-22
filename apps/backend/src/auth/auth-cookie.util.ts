import { Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearedCookieOptions,
} from './constants';

/**
 * Hash a refresh token before storing it in the DB. We never persist
 * the raw token — even a DB leak cannot be used to forge sessions.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generate a cryptographically random refresh token (32 bytes = 64 hex chars). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessCookieOptions);
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshCookieOptions);
}

export function clearAuthCookies(res: Response): void {
  res.cookie(ACCESS_TOKEN_COOKIE, '', clearedCookieOptions);
  res.cookie(REFRESH_TOKEN_COOKIE, '', clearedCookieOptions);
}