import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

type CartProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  brand: string | null;
  quantity: number;
};

type WishlistProduct = Omit<CartProduct, 'quantity'>;

@Injectable()
export class CommerceService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async getCart(sessionId: string): Promise<{ items: CartProduct[]; totalQuantity: number }> {
    const result = await this.pool.query<CartProduct>(
      `SELECT p.id, p.title, p.description, p.category, p.brand, ci.quantity
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.guest_session_id = $1 AND p.is_demo = true
       ORDER BY ci.created_at`,
      [sessionId],
    );

    return {
      items: result.rows,
      totalQuantity: result.rows.reduce((total, item) => total + item.quantity, 0),
    };
  }

  async addCartItem(sessionId: string, productId: string, quantity: number) {
    const result = await this.pool.query<{ product_id: string; quantity: number }>(
      `INSERT INTO cart_items (guest_session_id, product_id, quantity)
       SELECT $1, p.id, $3
       FROM products p
       WHERE p.id = $2 AND p.is_demo = true
       ON CONFLICT (guest_session_id, product_id)
       DO UPDATE SET
         quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 99),
         updated_at = now()
       RETURNING product_id, quantity`,
      [sessionId, productId, quantity],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Demo product not found.');
    }
    return result.rows[0];
  }

  async removeCartItem(sessionId: string, productId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM cart_items WHERE guest_session_id = $1 AND product_id = $2',
      [sessionId, productId],
    );
  }

  async getWishlist(sessionId: string): Promise<{ items: WishlistProduct[] }> {
    const result = await this.pool.query<WishlistProduct>(
      `SELECT p.id, p.title, p.description, p.category, p.brand
       FROM wishlist_items wi
       JOIN products p ON p.id = wi.product_id
       WHERE wi.guest_session_id = $1 AND p.is_demo = true
       ORDER BY wi.created_at`,
      [sessionId],
    );
    return { items: result.rows };
  }

  async addWishlistItem(sessionId: string, productId: string) {
    const result = await this.pool.query<{ product_id: string }>(
      `INSERT INTO wishlist_items (guest_session_id, product_id)
       SELECT $1, p.id
       FROM products p
       WHERE p.id = $2 AND p.is_demo = true
       ON CONFLICT (guest_session_id, product_id) DO NOTHING
       RETURNING product_id`,
      [sessionId, productId],
    );

    if (!result.rows[0]) {
      const exists = await this.pool.query(
        'SELECT 1 FROM products WHERE id = $1 AND is_demo = true',
        [productId],
      );
      if (!exists.rowCount) {
        throw new NotFoundException('Demo product not found.');
      }
    }
    return { productId };
  }

  async removeWishlistItem(sessionId: string, productId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM wishlist_items WHERE guest_session_id = $1 AND product_id = $2',
      [sessionId, productId],
    );
  }
}
