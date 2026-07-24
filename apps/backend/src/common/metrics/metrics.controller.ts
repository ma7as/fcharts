import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { register as promRegister } from 'prom-client';
import type { Response } from 'express';

/**
 * Serves the Prometheus exposition at `/internal/metrics` on the main
 * Nest app (port 8101). Excluded from Swagger (Prometheus can't carry
 * a JWT, and the auth middleware isn't applied).
 *
 * Uses prom-client's default global registry, which is what
 * @willsoto/nestjs-prometheus's makeDefaultOptions() also uses when no
 * `registry` option is supplied. Both paths share the same underlying
 * Registry instance because prom-client maintains a singleton.
 *
 * NOTE: this controller MUST NOT extend PrometheusController — the
 * upstream class signature returns `Promise<string>` and uses
 * `@Res({ passthrough: true })`, which conflicts with custom paths
 * (the upstream registers at `@Controller()` with no prefix, which
 * lands at `/metrics` on the app root; we want `/internal/metrics`).
 */
@ApiExcludeController()
@Controller('internal/metrics')
export class MetricsController {
  @Get()
  async index(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Type', promRegister.contentType);
    return promRegister.metrics();
  }
}
