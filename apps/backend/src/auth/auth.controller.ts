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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  // Tight limit on credential endpoints to make brute-force / enumeration
  // impractical: 5 attempts per minute, 20 per hour.
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Login user (sets httpOnly cookies)' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(loginDto);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    // No token in the body — they're in the cookies.
    return { ok: true };
  }

  @Post('register')
  @Throttle({ short: { limit: 3, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Register new user (sets httpOnly cookies)' })
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
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token, issue new access token' })
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke refresh token and clear cookies' })
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req: RequestWithUser) {
    return this.authService.getProfile(req.user.userId);
  }
}

// Re-export so consumers (e.g. tests) can read the cookie names without
// importing from constants directly.
export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };