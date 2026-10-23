import { Pool } from 'pg';
import { AdminOperationsService } from './admin-operations.service';

describe('AdminOperationsService', () => {
  it('converts PostgreSQL summary counts into numbers', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          order_count: '4',
          pending_seller_count: '1',
          pending_admin_count: '2',
          order_value_bdt: '940',
          product_count: '3',
          active_product_count: '2',
          seller_count: '1',
          customer_count: '4',
        }],
      }),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.getSummary()).resolves.toEqual({
      orders: 4,
      awaitingSeller: 1,
      awaitingAdmin: 2,
      localOrderValueBdt: 940,
      sellerListings: 3,
      activeListings: 2,
      localSellerIdentities: 1,
      guestCustomers: 4,
    });
  });

  it('does not activate listings without a seller, price, and stock', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.updateProductStatus('missing', 'active')).rejects.toThrow(
      'Eligible seller listing was not found.',
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("price_bdt IS NOT NULL AND stock_quantity > 0"),
      ['missing', 'active'],
    );
  });

  it('commits publication approval and its audit record in one transaction', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-1', is_demo: false }] })
        .mockResolvedValueOnce({ rows: [{ status: 'approved' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'product-1',
            is_demo: false,
            is_public_approved: false,
            status: 'active',
            stock_quantity: 5,
            seller_id: 'seller-1',
            price_bdt: 250,
          }],
        })
        .mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.updateProductPublication(
      'product-1',
      true,
      'Reviewed listing details.',
      'auth0|admin',
    )).resolves.toEqual({
      product: { id: 'product-1', isPublicApproved: true },
      changed: true,
    });
    expect(client.query.mock.calls[0][0]).toBe('BEGIN');
    expect(client.query.mock.calls[4][0]).toContain('UPDATE products');
    expect(client.query.mock.calls[5][0]).toContain('INSERT INTO product_publication_audit');
    expect(client.query.mock.calls[6][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back publication approval if its audit write fails', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-1', is_demo: false }] })
        .mockResolvedValueOnce({ rows: [{ status: 'approved' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'product-1',
            is_demo: false,
            is_public_approved: false,
            status: 'active',
            stock_quantity: 5,
            seller_id: 'seller-1',
            price_bdt: 250,
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('audit insert failed'))
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.updateProductPublication(
      'product-1',
      true,
      'Reviewed listing details.',
      'auth0|admin',
    )).rejects.toThrow('audit insert failed');
    expect(client.query.mock.calls[6][0]).toBe('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back publication revocation if its audit write fails', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-1', is_demo: false }] })
        .mockResolvedValueOnce({ rows: [{ status: 'approved' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'product-1',
            is_demo: false,
            is_public_approved: true,
            status: 'active',
            stock_quantity: 5,
            seller_id: 'seller-1',
            price_bdt: 250,
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('audit insert failed'))
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.updateProductPublication(
      'product-1',
      false,
      'Publication eligibility changed.',
      'auth0|admin',
    )).rejects.toThrow('audit insert failed');
    expect(client.query.mock.calls[6][0]).toBe('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('refuses to approve a product that is not owned by an approved seller', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seller_id: 'seller-1', is_demo: false }] })
        .mockResolvedValueOnce({ rows: [{ status: 'rejected' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'product-1',
            is_demo: false,
            is_public_approved: false,
            status: 'active',
            stock_quantity: 5,
            seller_id: 'seller-1',
            price_bdt: 250,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.updateProductPublication(
      'product-1',
      true,
      'Reviewed listing details.',
      'auth0|admin',
    )).rejects.toThrow('approved seller');
    expect(client.query.mock.calls[4][0]).toBe('ROLLBACK');
  });

  it('suspends seller eligibility and revokes product approvals with durable audit records', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'application-1',
            applicant_sub: 'auth0|seller-1',
            status: 'approved',
          }],
        })
        .mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.reviewApplication(
      'application-1',
      'suspended',
      'Seller eligibility requires review.',
      'auth0|admin',
    )).resolves.toEqual({
      application: { id: 'application-1', status: 'suspended' },
    });

    expect(client.query.mock.calls[2][0]).toContain('UPDATE seller_applications');
    expect(client.query.mock.calls[3][0]).toContain('INSERT INTO seller_application_audit');
    expect(client.query.mock.calls[4][0]).toContain('seller_eligibility_suspension');
    expect(client.query.mock.calls[5][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back a seller suspension when publication audit persistence fails', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'application-1',
            applicant_sub: 'auth0|seller-1',
            status: 'approved',
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('publication audit insert failed'))
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.reviewApplication(
      'application-1',
      'suspended',
      'Seller eligibility requires review.',
      'auth0|admin',
    )).rejects.toThrow('publication audit insert failed');
    expect(client.query.mock.calls[5][0]).toBe('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back a seller decision when its application audit cannot be persisted', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'application-1',
            applicant_sub: 'auth0|seller-1',
            status: 'pending',
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('seller application audit insert failed'))
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.reviewApplication(
      'application-1',
      'approved',
      'Application review completed.',
      'auth0|admin',
    )).rejects.toThrow('seller application audit insert failed');
    expect(client.query.mock.calls[4][0]).toBe('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE products')))
      .toBe(false);
  });

  it('does not republish products when restoring a suspended seller', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'application-1',
            applicant_sub: 'auth0|seller-1',
            status: 'suspended',
          }],
        })
        .mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new AdminOperationsService(pool);

    await expect(service.reviewApplication(
      'application-1',
      'approved',
      'Seller eligibility checks are complete.',
      'auth0|admin',
    )).resolves.toEqual({
      application: { id: 'application-1', status: 'approved' },
    });
    expect(client.query.mock.calls[3][0]).toContain('INSERT INTO seller_application_audit');
    expect(client.query.mock.calls[4][0]).toBe('COMMIT');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('seller_eligibility_suspension')))
      .toBe(false);
  });
});
