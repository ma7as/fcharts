/**
 * Centralised cookie configuration for the httpOnly token strategy.
 *
 * Why two cookies:
 * - ACCESS_TOKEN: short-lived JWT (15 min). Sent on every request. XSS-readable,
 *   but the lifetime is short enough that theft damage is bounded.
 * - REFRESH_TOKEN: opaque random token (7 days). Used only on /refresh to mint
 *   a new pair. Persisted as SHA-256 hash in DB; rotation invalidates the family.
 *
 * Both cookies are httpOnly + SameSite=Lax. The Secure flag is only set when
 * the server is behind HTTPS (NODE_ENV=production) — local dev runs over HTTP.
 */
import { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'fc_access_token';
export const REFRESH_TOKEN_COOKIE = 'fc_refresh_token';

const isProd = process.env.NODE_ENV === 'production';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd, // Secure only over HTTPS in prod
  sameSite: 'lax',
  path: '/',
};

export const accessCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  // Access token is short-lived — set Max-Age in ms.
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export const refreshCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  sameSite: 'strict', // Tighter on refresh — only sent to /api/v1/auth/refresh
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const clearedCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: 0,
};