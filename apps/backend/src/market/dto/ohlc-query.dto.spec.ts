import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OhlcQueryDto } from './ohlc-query.dto';
import {
  ALLOWED_INTERVALS,
  ALLOWED_SOURCES,
} from './ohlc-query.dto';

describe('OhlcQueryDto', () => {
  async function validateDto(input: Record<string, any>) {
    const dto = plainToInstance(OhlcQueryDto, input);
    const errs = await validate(dto);
    return errs;
  }

  describe('interval allowlist', () => {
    for (const ok of ALLOWED_INTERVALS) {
      it(`accepts "${ok}"`, async () => {
        const errs = await validateDto({ symbol: 'BTCUSDT', interval: ok });
        expect(errs).toHaveLength(0);
      });
    }

    it('rejects unknown interval', async () => {
      const errs = await validateDto({
        symbol: 'BTCUSDT',
        interval: '../../../etc/passwd',
      });
      expect(errs.length).toBeGreaterThan(0);
      const intervalErr = errs.find((e) => e.property === 'interval');
      expect(intervalErr).toBeDefined();
    });

    it('rejects "2h" (not in allowlist)', async () => {
      const errs = await validateDto({ symbol: 'BTCUSDT', interval: '2h' });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('defaults to "1h" when missing', async () => {
      const errs = await validateDto({ symbol: 'BTCUSDT' });
      expect(errs).toHaveLength(0);
      const dto = plainToInstance(OhlcQueryDto, { symbol: 'BTCUSDT' });
      expect(dto.interval).toBe('1h');
    });
  });

  describe('limit cap (DoS prevention)', () => {
    it('accepts limit=1000 (boundary)', async () => {
      const errs = await validateDto({ symbol: 'BTCUSDT', limit: 1000 });
      expect(errs).toHaveLength(0);
    });

    it('rejects limit=1001', async () => {
      const errs = await validateDto({ symbol: 'BTCUSDT', limit: 1001 });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('rejects limit=99999999 (DoS vector)', async () => {
      const errs = await validateDto({ symbol: 'BTCUSDT', limit: 99999999 });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('rejects limit=0', async () => {
      const errs = await validateDto({ symbol: 'BTCUSDT', limit: 0 });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('defaults to limit=200', async () => {
      const dto = plainToInstance(OhlcQueryDto, { symbol: 'BTCUSDT' });
      expect(dto.limit).toBe(200);
    });
  });

  describe('source allowlist', () => {
    for (const ok of ALLOWED_SOURCES) {
      it(`accepts "${ok}"`, async () => {
        const errs = await validateDto({ symbol: 'BTCUSDT', source: ok });
        expect(errs).toHaveLength(0);
      });
    }

    it('rejects "evil-provider"', async () => {
      const errs = await validateDto({
        symbol: 'BTCUSDT',
        source: 'evil-provider',
      });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('rejects arbitrary path traversal in source', async () => {
      const errs = await validateDto({
        symbol: 'BTCUSDT',
        source: '../../etc',
      });
      expect(errs.length).toBeGreaterThan(0);
    });
  });

  describe('symbol is required', () => {
    it('rejects when missing', async () => {
      const errs = await validateDto({});
      expect(errs.length).toBeGreaterThan(0);
    });
  });
});
