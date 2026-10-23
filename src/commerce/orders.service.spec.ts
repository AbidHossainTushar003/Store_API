import { BadRequestException, ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  function createService(product: Record<string, unknown>) {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT p.id')) return { rows: [{ ...product }] };
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    return { service: new OrdersService(pool), client };
  }

  const product = {
    id: 'product-1',
    title: 'Product',
    quantity: 1,
    is_demo: false,
    price_bdt: 250,
    stock_quantity: 3,
    status: 'active',
    is_public_approved: true,
    seller_id: 'seller-1',
    seller_eligible: true,
  };

  const buyer = {
    name: 'Buyer Name',
    email: 'buyer@example.test',
    phone: '0123456789',
    address: 'Delivery address for this test.',
  };

  it('rejects an unapproved non-demo product before creating an order', async () => {
    const { service, client } = createService({ ...product, is_public_approved: false });

    await expect(service.placeOrder('session', buyer)).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO orders'))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects a product whose seller is no longer eligible', async () => {
    const { service, client } = createService({ ...product, seller_eligible: false });

    await expect(service.placeOrder('session', buyer)).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('continues to reject fictional demo products as non-purchasable', async () => {
    const { service, client } = createService({ ...product, is_demo: true });

    await expect(service.placeOrder('session', buyer)).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
