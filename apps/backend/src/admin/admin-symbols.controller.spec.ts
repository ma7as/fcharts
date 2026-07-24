import { AdminSymbolsController } from './admin-symbols.controller';
import { CacheService } from '../common/cache/cache.service';

describe('AdminSymbolsController', () => {
  it('refreshSymbols returns the count of invalidated entries', async () => {
    const cache = {
      invalidateAllSymbols: jest.fn().mockResolvedValue(7),
    } as unknown as CacheService;
    const controller = new AdminSymbolsController(cache);
    const result = await controller.refreshSymbols();
    expect(result).toEqual({ invalidated: 7 });
    expect(cache.invalidateAllSymbols).toHaveBeenCalledTimes(1);
  });

  it('refreshSymbols returns 0 when the cache layer is empty', async () => {
    const cache = {
      invalidateAllSymbols: jest.fn().mockResolvedValue(0),
    } as unknown as CacheService;
    const controller = new AdminSymbolsController(cache);
    const result = await controller.refreshSymbols();
    expect(result).toEqual({ invalidated: 0 });
  });
});