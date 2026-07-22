import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto, TransactionType } from './create-transaction.dto';

describe('CreateTransactionDto', () => {
  async function validateDto(input: Record<string, any>) {
    const dto = plainToInstance(CreateTransactionDto, input);
    const errs = await validate(dto);
    return errs;
  }

  it('accepts a valid BUY transaction', async () => {
    const errs = await validateDto({
      symbolId: 'sym-AAPL',
      type: TransactionType.BUY,
      quantity: 1.5,
      price: 100,
    });
    expect(errs).toHaveLength(0);
  });

  it('accepts a SELL transaction with fees', async () => {
    const errs = await validateDto({
      symbolId: 'sym-AAPL',
      type: TransactionType.SELL,
      quantity: 1,
      price: 100,
      fees: 5,
    });
    expect(errs).toHaveLength(0);
  });

  describe('quantity validation (must be > 0)', () => {
    it('rejects quantity = 0', async () => {
      const errs = await validateDto({
        symbolId: 'sym-AAPL',
        type: TransactionType.BUY,
        quantity: 0,
        price: 100,
      });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('rejects negative quantity', async () => {
      const errs = await validateDto({
        symbolId: 'sym-AAPL',
        type: TransactionType.BUY,
        quantity: -1,
        price: 100,
      });
      expect(errs.length).toBeGreaterThan(0);
    });
  });

  describe('price validation (must be > 0)', () => {
    it('rejects price = 0', async () => {
      const errs = await validateDto({
        symbolId: 'sym-AAPL',
        type: TransactionType.BUY,
        quantity: 1,
        price: 0,
      });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('rejects negative price', async () => {
      const errs = await validateDto({
        symbolId: 'sym-AAPL',
        type: TransactionType.BUY,
        quantity: 1,
        price: -50,
      });
      expect(errs.length).toBeGreaterThan(0);
    });
  });

  describe('fees (must be >= 0)', () => {
    it('rejects negative fees', async () => {
      const errs = await validateDto({
        symbolId: 'sym-AAPL',
        type: TransactionType.BUY,
        quantity: 1,
        price: 100,
        fees: -1,
      });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('accepts fees = 0', async () => {
      const errs = await validateDto({
        symbolId: 'sym-AAPL',
        type: TransactionType.BUY,
        quantity: 1,
        price: 100,
        fees: 0,
      });
      expect(errs).toHaveLength(0);
    });
  });

  describe('type validation (must be valid enum)', () => {
    it('rejects unknown type', async () => {
      const errs = await validateDto({
        symbolId: 'sym-AAPL',
        type: 'NOT_A_TYPE',
        quantity: 1,
        price: 100,
      });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('rejects lowercase type', async () => {
      const errs = await validateDto({
        symbolId: 'sym-AAPL',
        type: 'buy',
        quantity: 1,
        price: 100,
      });
      expect(errs.length).toBeGreaterThan(0);
    });
  });
});
