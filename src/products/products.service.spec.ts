import { Pool } from 'pg';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  it('lets the seller pause an owned listing without activating it', async () => {
    const row = {
      id: 'local-product',
      title: 'A listed product',
      description: 'A seller listing.',
      category: 'Books',
      brand: null,
      sku: null,
      price_bdt: 250,
      stock_quantity: 8,
      status: 'inactive' as const,
      created_at: new Date('2026-10-22T10:00:00Z'),
    };
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [row] }),
    } as unknown as Pool;
    const service = new ProductsService(pool);

    await expect(service.updateSellerProduct('seller-demo', 'local-product', {
      stockQuantity: 8,
      status: 'inactive',
    })).resolves.toEqual({
      product: {
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        brand: row.brand,
        sku: row.sku,
        priceBdt: 250,
        stockQuantity: 8,
        status: 'inactive',
        createdAt: '2026-10-22T10:00:00.000Z',
      },
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE seller_id = $1 AND id = $2 AND is_demo = false'),
      ['seller-demo', 'local-product', null, null, null, false, null, false, null, null, 8, 'inactive'],
    );
  });

  it('creates new seller products as drafts for Admin review', async () => {
    const draft = {
      id: 'local-product',
      title: 'A new listing',
      description: 'A new seller listing description.',
      category: 'Books',
      brand: null,
      sku: null,
      price_bdt: 250,
      stock_quantity: 8,
      status: 'draft' as const,
      created_at: new Date('2026-10-22T10:00:00Z'),
    };
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [draft] }),
    } as unknown as Pool;
    const service = new ProductsService(pool);

    await expect(service.createSellerProduct('auth0|seller-1', {
      title: draft.title,
      description: draft.description,
      category: draft.category,
      priceBdt: draft.price_bdt,
      stockQuantity: draft.stock_quantity,
    })).resolves.toMatchObject({
      product: { id: draft.id, status: 'draft' },
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, 'draft')"),
      expect.arrayContaining(['auth0|seller-1', 250, 8]),
    );
  });

  it('updates seller product details and supports clearing optional metadata', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{
        id: 'local-product',
        title: 'Updated listing',
        description: 'An updated seller listing.',
        category: 'Home & living',
        brand: null,
        sku: null,
        price_bdt: 375,
        stock_quantity: 3,
        status: 'active',
        created_at: new Date('2026-10-22T10:00:00Z'),
      }],
    });
    const pool = {
      query,
    } as unknown as Pool;
    const service = new ProductsService(pool);

    const result = await service.updateSellerProduct('seller-demo', 'local-product', {
      title: 'Updated listing',
      description: 'An updated seller listing.',
      category: 'Home & living',
      brand: null,
      sku: null,
      priceBdt: 375,
    });

    expect(result.product).toMatchObject({
      title: 'Updated listing',
      category: 'Home & living',
      brand: null,
      sku: null,
      priceBdt: 375,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('brand = CASE WHEN $6 THEN $7 ELSE brand END'),
      ['seller-demo', 'local-product', 'Updated listing', 'An updated seller listing.', 'Home & living', true, null, true, null, 375, null, null],
    );
    const updateSql = query.mock.calls[0][0] as string;
    expect(updateSql).toContain('WITH material AS');
    expect(updateSql).toContain('regexp_replace');
    expect(updateSql).toContain('INSERT INTO product_publication_audit');
    expect(updateSql).toContain('content_change_suspension');
  });

  it('rejects empty or whitespace-only updates without querying the database', async () => {
    const pool = { query: jest.fn() } as unknown as Pool;
    const service = new ProductsService(pool);

    await expect(service.updateSellerProduct('seller-demo', 'local-product', {}))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateSellerProduct('seller-demo', 'local-product', { title: '  ' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects zero stock when the resulting listing would remain active', async () => {
    const pool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ status: 'active', stock_quantity: 1 }] }),
    } as unknown as Pool;
    const service = new ProductsService(pool);

    await expect(service.updateSellerProduct('seller-demo', 'local-product', {
      stockQuantity: 0,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns active non-demo products with their prices and stock', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{
        id: 'local-product',
        title: 'A listed product',
        description: 'A seller listing.',
        category: 'Books',
        brand: 'Northstar',
        is_demo: false,
        price_bdt: 250,
        stock_quantity: 3,
      }],
    });
    const pool = {
      query,
    } as unknown as Pool;
    const service = new ProductsService(pool);

    await expect(service.listProducts()).resolves.toEqual([
      {
        id: 'local-product',
        title: 'A listed product',
        description: 'A seller listing.',
        category: 'Books',
        brand: 'Northstar',
        isDemo: false,
        priceBdt: 250,
        stockQuantity: 3,
      },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE is_demo = false AND is_public_approved = true"),
    );
    expect(query.mock.calls[0][0]).toContain("AND status = 'active' AND stock_quantity > 0");
    expect(query.mock.calls[0][0]).toContain("sa.status = 'approved'");
  });
});
