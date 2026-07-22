import { Request } from 'express';

/**
 * Authenticated user payload attached by JwtStrategy.validate().
 * Defined once so controllers can type `@Request() req: RequestWithUser`
 * instead of relying on implicit `any`.
 */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  email: string;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}
