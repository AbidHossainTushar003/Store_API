import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

@Injectable()
export class SellerOperationsService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async getSummary(sellerId: string) {
    const result = await this.pool.query<{
      listing_count: string;
      active_count: string;
      low_stock_count: string;
      order_count: string;
      pending_seller_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM products WHERE seller_id = $1 AND is_demo = false) AS listing_count,
         (SELECT count(*) FROM products WHERE seller_id = $1 AND is_demo = false AND status = 'active' AND stock_quantity > 0) AS active_count,
         (SELECT count(*) FROM products WHERE seller_id = $1 AND is_demo = false AND status = 'active' AND stock_quantity <= 5) AS low_stock_count,
         (SELECT count(*) FROM orders WHERE seller_id = $1) AS order_count,
         (SELECT count(*) FROM orders WHERE seller_id = $1 AND status = 'pending_seller_confirmation') AS pending_seller_count`,
      [sellerId],
    );
    const row = result.rows[0];
    return {
      listings: Number(row.listing_count),
      activeListings: Number(row.active_count),
      lowStockListings: Number(row.low_stock_count),
      orders: Number(row.order_count),
      awaitingSellerConfirmation: Number(row.pending_seller_count),
    };
  }

  async getNotifications(sellerId: string) {
    const result = await this.pool.query<{
      id: string;
      type: 'order' | 'low_stock';
      message: string;
      created_at: Date;
    }>(
      `SELECT id, type, message, created_at FROM (
         SELECT o.id::text AS id, 'order'::text AS type,
                'Order ' || o.reference || ' is awaiting seller confirmation.' AS message,
                o.created_at
         FROM orders o
         WHERE o.seller_id = $1 AND o.status = 'pending_seller_confirmation'
         UNION ALL
         SELECT p.id, 'low_stock'::text AS type,
                p.title || ' has only ' || p.stock_quantity::text || ' in stock.' AS message,
                now() AS created_at
         FROM products p
         WHERE p.seller_id = $1 AND p.is_demo = false
           AND p.status = 'active' AND p.stock_quantity <= 5
       ) notifications
       ORDER BY created_at DESC`,
      [sellerId],
    );
    return {
      notifications: result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        message: row.message,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }
}
