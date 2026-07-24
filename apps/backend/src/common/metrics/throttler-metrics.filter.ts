import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { MetricsServiceStub } from './metrics.stub';

/**
 * Global filter: on a ThrottlerException (429), increment
 * `throttler_blocked_total{name, route}` before delegating to the
 * NextExceptionFilter for the 429 response.
 */
@Catch(ThrottlerException)
export class ThrottlerMetricsFilter implements ExceptionFilter {
  constructor(private readonly metrics: MetricsServiceStub) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { route?: { path?: string } }>();
    // The route is the template path (`/api/v1/symbols`), not the full URL.
    const route = (req.route?.path as string | undefined) ?? req.path ?? 'unknown';
    this.metrics.throttlerBlocked('long', route);
    // Re-throw to let the default exception filter emit the 429 response.
    throw exception;
  }
}
