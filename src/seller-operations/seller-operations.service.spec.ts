import { Pool } from 'pg';
import { SellerOperationsService } from './seller-operations.service';

describe('SellerOperationsService', () => {
  it('returns local seller counts scoped to the authenticated seller id', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          listing_count: '2',
          active_count: '1',
          low_stock_count: '1',
          order_count: '3',
          pending_seller_count: '2',
        }],
      }),
    } as unknown as Pool;
    const service = new SellerOperationsService(pool);

    await expect(service.getSummary('seller-demo')).resolves.toEqual({
      listings: 2,
      activeListings: 1,
      lowStockListings: 1,
      orders: 3,
      awaitingSellerConfirmation: 2,
    });
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['seller-demo']);
  });

  it('returns only actionable low-stock and seller-confirmation notices', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'local-product',
          type: 'low_stock',
          message: 'A listing is low.',
          created_at: new Date('2026-10-22T10:00:00Z'),
        }],
      }),
    } as unknown as Pool;
    const service = new SellerOperationsService(pool);

    await expect(service.getNotifications('seller-demo')).resolves.toEqual({
      notifications: [{
        id: 'local-product',
        type: 'low_stock',
        message: 'A listing is low.',
        createdAt: '2026-10-22T10:00:00.000Z',
      }],
    });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('pending_seller_confirmation'), ['seller-demo']);
  });
});
