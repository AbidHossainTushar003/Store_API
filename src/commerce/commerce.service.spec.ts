import { NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { CommerceService } from './commerce.service';

describe('CommerceService', () => {
  let query: jest.Mock;
  let service: CommerceService;

  beforeEach(() => {
    query = jest.fn();
    service = new CommerceService({ query } as unknown as Pool);
  });

  it('returns cart contents and total quantity', async () => {
    query.mockResolvedValue({
      rows: [
        { id: 'a', title: 'A', description: '', category: '', brand: null, quantity: 2 },
        { id: 'b', title: 'B', description: '', category: '', brand: null, quantity: 1 },
      ],
    });

    await expect(service.getCart('session')).resolves.toEqual({
      items: expect.any(Array),
      totalQuantity: 3,
    });
  });

  it('increments cart quantities up to the database-enforced limit', async () => {
    query.mockResolvedValue({ rows: [{ product_id: 'a', quantity: 2 }] });

    await expect(service.addCartItem('session', 'a', 1)).resolves.toEqual({
      product_id: 'a',
      quantity: 2,
    });
    expect(query.mock.calls[0][0]).toContain('LEAST(cart_items.quantity + EXCLUDED.quantity, 99)');
    expect(query.mock.calls[0][0]).toContain('p.is_public_approved = true');
    expect(query.mock.calls[0][0]).toContain("sa.status = 'approved'");
  });

  it('passes an intentional quantity increase to the cart query', async () => {
    query.mockResolvedValue({ rows: [{ product_id: 'a', quantity: 5 }] });

    await expect(service.addCartItem('session', 'a', 3)).resolves.toEqual({
      product_id: 'a',
      quantity: 5,
    });
    expect(query.mock.calls[0][1]).toEqual(['session', 'a', 3]);
  });

  it('treats repeated cart requests as separate increments rather than deduplicating them', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 'a', quantity: 2 }] })
      .mockResolvedValueOnce({ rows: [{ product_id: 'a', quantity: 3 }] });

    await service.addCartItem('session', 'a', 1);
    await service.addCartItem('session', 'a', 1);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => sql.includes('cart_items.quantity + EXCLUDED.quantity'))).toBe(true);
  });

  it('removes only the requested product from the guest cart', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(service.removeCartItem('session', 'a')).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM cart_items WHERE guest_session_id = $1 AND product_id = $2',
      ['session', 'a'],
    );
  });

  it('rejects products outside the demo catalogue', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(service.addCartItem('session', 'missing', 1))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps wishlist additions idempotent for an existing demo product', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

    await expect(service.addWishlistItem('session', 'a')).resolves.toEqual({ productId: 'a' });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('requires public approval and an eligible seller for non-demo wishlist products', async () => {
    query.mockResolvedValue({ rows: [{ product_id: 'a' }] });

    await service.addWishlistItem('session', 'a');

    expect(query.mock.calls[0][0]).toContain('p.is_public_approved = true');
    expect(query.mock.calls[0][0]).toContain("sa.status = 'approved'");
  });

  it('rejects unknown wishlist products', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(service.addWishlistItem('session', 'missing'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes only the requested product from the guest wishlist', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(service.removeWishlistItem('session', 'a')).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM wishlist_items WHERE guest_session_id = $1 AND product_id = $2',
      ['session', 'a'],
    );
  });
});
