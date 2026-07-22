import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ACCESS_TOKEN_COOKIE } from '../auth/constants';

@ApiTags('users')
@ApiBearerAuth('bearerAuth')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  // Registration goes through POST /api/v1/auth/register, NOT this endpoint.
  // Without this guard, any anonymous caller could bypass the registration
  // flow and create arbitrary accounts directly.
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create a new user (admin only)',
    description:
      'This endpoint exists for admin provisioning. End-user registration ' +
      'goes through POST /api/v1/auth/register.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 401, description: 'Missing or invalid auth token' })
  @ApiResponse({ status: 409, description: 'Email or username already exists' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get all users',
    description:
      'Returns all users (no pagination yet). For internal/admin use; ' +
      'note there is no role check — any authenticated user can list everyone.',
  })
  @ApiResponse({ status: 200, description: 'Array of users' })
  @ApiResponse({ status: 401, description: 'Missing or invalid auth token' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user (currently only `isActive`)', })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Delete user (cascades to portfolios, refresh tokens, etc.)',
  })
  @ApiParam({ name: 'id', example: 'clx123abc...' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
