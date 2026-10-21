import { Pool } from 'pg';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  it('returns only the demo catalogue with explicit demo status', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'sample-notebook',
          title: 'Everyday notebook',
          description: 'An example.',
          category: 'Books & stationery',
          brand: null,
        }],
      }),
    } as unknown as Pool;
    const service = new ProductsService(pool);

    await expect(service.listDemoProducts()).resolves.toEqual([{
      id: 'sample-notebook',
      title: 'Everyday notebook',
      description: 'An example.',
      category: 'Books & stationery',
      brand: null,
      isDemo: true,
    }]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE is_demo = true'));
  });
});
