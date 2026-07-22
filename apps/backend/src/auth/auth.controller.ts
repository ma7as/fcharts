import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequestWithUser } from './types/request-with-user';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from './constants';
import { clearAuthCookies, setAuthCookies } from './auth-cookie.util';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { ThrottlerException } from '@nestjs/throttler';

@ApiTags('auth')
@ApiResponse({ status: 429, description: 'Rate limit exceeded' })
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  // Tight limit on credential endpoints to make brute-force / enumeration
  // impractical: 5 attempts per minute, 20 per hour.
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Login user (sets httpOnly cookies)',
    description:
      'Authenticates with username + password. On success sets two httpOnly ' +
      'cookies: `fc_access_token` (15 min) and `fc_refresh_token` (7 days). ' +
      'No tokens are returned in the body. The cookies must be sent on ' +
      'every subsequent request via `credentials: include` (axios) or ' +
      '`withCredentials: true` (fetch).',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login successful, cookies set' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials (generic message — no user enumeration)',
  })
  @ApiResponse({ status: 400, description: 'Validation failed (missing/invalid fields)' })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(loginDto);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { ok: true };
  }

  @Post('register')
  @Throttle({ short: { limit: 3, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Register new user (sets httpOnly cookies)',
    description:
      'Creates a new user account and immediately logs them in by setting ' +
      'the auth cookies. Returns the created user object (no token in body).',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User created and logged in' })
  @ApiResponse({ status: 409, description: 'Email or username already taken' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(registerDto);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  /**
   * Exchange a valid refresh cookie for a fresh access + refresh pair.
   * The old refresh token is rotated (marked used). Reuse of a used
   * token revokes the whole family — defence against theft.
   *
   * Rate limit: 60/min per IP. Higher than login because legitimate
   * clients may auto-refresh on tab focus, but still bounded.
   */
  @Post('refresh')
  @Throttle({ short: { limit: 10, ttl: 60_000 }, long: { limit: 60, ttl: 3_600_000 } })
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary: 'Rotate refresh token, issue new access token',
    description:
      'Reads the `fc_refresh_token` cookie, validates it against the DB, ' +
      'and issues a fresh access + refresh pair. The old refresh token is ' +
      'marked as used (rotation). If the old token was already used, the ' +
      'entire token family is revoked — defence against token theft.',
  })
  @ApiResponse({ status: 200, description: 'Tokens rotated, new cookies set' })
  @ApiResponse({ status: 401, description: 'Refresh token invalid, expired, or revoked' })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new Error('Missing refresh token cookie');
    }
    const tokens = await this.authService.refresh(refreshToken);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { ok: true };
  }

  @Post('logout')
  @Throttle({ short: { limit: 20, ttl: 60_000 }, long: { limit: 100, ttl: 3_600_000 } })
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary: 'Revoke refresh token and clear cookies',
    description:
      'Idempotent: succeeds even if no cookies are present. When a refresh ' +
      'cookie is sent, that specific token is revoked server-side and the ' +
      'cookies are cleared in the browser.',
  })
  @ApiResponse({ status: 200, description: 'Logged out (or already was)' })
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    await this.authService.logout(refreshToken);
    clearAuthCookies(res);
    return { ok: true };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth('bearerAuth') // also accepts Authorization header
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile returned' })
  @ApiResponse({ status: 401, description: 'Missing or invalid auth token' })
  async getProfile(@Request() req: RequestWithUser) {
    return this.authService.getProfile(req.user.userId);
  }
}

// Re-export so consumers (e.g. tests) can read the cookie names without
// importing from constants directly.
export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };