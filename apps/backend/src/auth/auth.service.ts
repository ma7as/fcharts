import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.usersService.findByUsername(username);
    
    if (user && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByUsername(loginDto.username);
    
    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is disabled');
    }

    const payload = { 
      sub: user.id, 
      username: user.username,
      email: user.email,
    };

    const { password, ...userData } = user;

    return {
      access_token: this.jwtService.sign(payload),
      user: userData,
    };
  }

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);

    const payload = { 
      sub: user.id, 
      username: user.username,
      email: user.email,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async getProfile(userId: string) {
    return this.usersService.findOne(userId);
  }
}
