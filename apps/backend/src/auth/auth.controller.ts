import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequestWithUser } from './types/request-with-user';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Tight limit on credential endpoints to make brute-force / enumeration
  // impractical: 5 attempts per minute, 20 per hour.
  @Post('login')
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Login user' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @Throttle({ short: { limit: 3, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Register new user' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req: RequestWithUser) {
    return this.authService.getProfile(req.user.userId);
  }
}
