import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

interface CartOrderRow {
  id: string;
  title: string;
  quantity: number;
  is_demo: boolean;
  price_bdt: number | null;
  stock_quantity: number;
  status: string;
  is_public_approved: boolean;
  seller_id: string | null;
  seller_eligible: boolean;
}

export interface OrderSummary {
  id: string;
  reference: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  deliveryAddress: string;
  totalBdt: number;
  status: 'pending_seller_confirmation' | 'pending_admin_confirmation' | 'confirmed';
  createdAt: string;
  items: Array<{
    productId: string;
    title: string;
    unitPriceBdt: number;
    quantity: number;
    lineTotalBdt: number;
  }>;
}

@Injectable()
export class OrdersService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async placeOrder(
    guestSessionId: string,
    buyer: { name: string; email: string; phone: string; address: string },
  ): Promise<{ order: OrderSummary }> {
    const client = await this.pool.connect();
    let transactionActive = false;
    try {
      await client.query('BEGIN');
      transactionActive = true;
      const cart = await client.query<CartOrderRow>(
        `SELECT p.id, p.title, ci.quantity, p.is_demo, p.price_bdt,
                p.stock_quantity, p.status, p.is_public_approved, p.seller_id,
                EXISTS (
                  SELECT 1 FROM seller_applications sa
                  WHERE sa.applicant_sub = p.seller_id AND sa.status = 'approved'
                ) AS seller_eligible
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.guest_session_id = $1
         ORDER BY p.id
         FOR UPDATE OF ci, p`,
        [guestSessionId],
      );
      if (cart.rows.length === 0) {
        throw new BadRequestException('Add a seller-listed product to your cart before ordering.');
      }
      if (cart.rows.some((item) => item.is_demo)) {
        throw new BadRequestException('Remove fictional demo products before placing a COD order.');
      }
      if (cart.rows.some((item) =>
        item.status !== 'active' ||
        !item.is_public_approved ||
        !item.seller_eligible ||
        !item.seller_id ||
        item.price_bdt === null
      )) {
        throw new ConflictException('A product in your cart is no longer available.');
      }
      const sellerIds = new Set(cart.rows.map((item) => item.seller_id));
      if (sellerIds.size !== 1) {
        throw new BadRequestException('Place separate orders for products from different shops.');
      }
      if (cart.rows.some((item) => item.quantity > item.stock_quantity)) {
        throw new ConflictException('A product in your cart no longer has enough stock.');
      }

      const totalBdt = cart.rows.reduce(
        (total, item) => total + item.price_bdt! * item.quantity,
        0,
      );
      if (!Number.isSafeInteger(totalBdt) || totalBdt <= 0) {
        throw new ConflictException('The order total is outside the supported range.');
      }

      const reference = `SH-${randomBytes(6).toString('hex').toUpperCase()}`;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO orders
           (reference, guest_session_id, seller_id, buyer_name, buyer_email,
            buyer_phone, delivery_address, total_bdt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          reference,
          guestSessionId,
          cart.rows[0].seller_id,
          buyer.name.trim(),
          buyer.email.trim().toLowerCase(),
          buyer.phone.trim(),
          buyer.address.trim(),
          totalBdt,
        ],
      );
      const orderId = inserted.rows[0].id;

      for (const item of cart.rows) {
        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, product_title, unit_price_bdt, quantity, line_total_bdt)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.id, item.title, item.price_bdt, item.quantity, item.price_bdt! * item.quantity],
        );
        const stock = await client.query(
          `UPDATE products
           SET stock_quantity = stock_quantity - $2
           WHERE id = $1 AND stock_quantity >= $2`,
          [item.id, item.quantity],
        );
        if (stock.rowCount !== 1) {
          throw new ConflictException('A product in your cart no longer has enough stock.');
        }
      }
      await client.query('DELETE FROM cart_items WHERE guest_session_id = $1', [guestSessionId]);
      await client.query('COMMIT');
      transactionActive = false;
      const result = await this.getCustomerOrder(orderId, guestSessionId);
      if (!result) {
        throw new Error('Created order could not be read back.');
      }
      return { order: result };
    } catch (error) {
      if (transactionActive) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listCustomerOrders(guestSessionId: string): Promise<{ orders: OrderSummary[] }> {
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM orders WHERE guest_session_id = $1 ORDER BY created_at DESC',
      [guestSessionId],
    );
    return {
      orders: (await Promise.all(
        result.rows.map((order) => this.getCustomerOrder(order.id, guestSessionId)),
      )).filter((order): order is OrderSummary => order !== null),
    };
  }

  async listSellerOrders(sellerId: string): Promise<{ orders: OrderSummary[] }> {
    return this.listOrders('seller_id', sellerId);
  }

  async listAdminOrders(): Promise<{ orders: OrderSummary[] }> {
    return this.listOrders();
  }

  async confirmBySeller(orderId: string, sellerId: string): Promise<{ order: OrderSummary }> {
    const result = await this.pool.query<{ id: string }>(
      `UPDATE orders
       SET status = 'pending_admin_confirmation', seller_confirmed_at = now()
       WHERE id = $1 AND seller_id = $2 AND status = 'pending_seller_confirmation'
       RETURNING id`,
      [orderId, sellerId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Pending order for this seller was not found.');
    }
    const order = await this.getOrder(result.rows[0].id);
    return { order: order! };
  }

  async confirmByAdmin(orderId: string): Promise<{ order: OrderSummary }> {
    const result = await this.pool.query<{ id: string }>(
      `UPDATE orders
       SET status = 'confirmed', admin_confirmed_at = now()
       WHERE id = $1 AND status = 'pending_admin_confirmation'
       RETURNING id`,
      [orderId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Order awaiting admin confirmation was not found.');
    }
    const order = await this.getOrder(result.rows[0].id);
    return { order: order! };
  }

  private async listOrders(
    ownerColumn?: 'seller_id',
    ownerId?: string,
  ): Promise<{ orders: OrderSummary[] }> {
    const result = ownerColumn
      ? await this.pool.query<{ id: string }>(
        `SELECT id FROM orders WHERE ${ownerColumn} = $1 ORDER BY created_at DESC`,
        [ownerId],
      )
      : await this.pool.query<{ id: string }>('SELECT id FROM orders ORDER BY created_at DESC');
    return {
      orders: (await Promise.all(result.rows.map((order) => this.getOrder(order.id))))
        .filter((order): order is OrderSummary => order !== null),
    };
  }

  private async getCustomerOrder(
    orderId: string,
    guestSessionId: string,
  ): Promise<OrderSummary | null> {
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM orders WHERE id = $1 AND guest_session_id = $2',
      [orderId, guestSessionId],
    );
    return result.rows[0] ? this.getOrder(orderId) : null;
  }

  private async getOrder(orderId: string): Promise<OrderSummary | null> {
    const result = await this.pool.query<{
      id: string;
      reference: string;
      buyer_name: string;
      buyer_email: string;
      buyer_phone: string;
      delivery_address: string;
      total_bdt: number;
      status: OrderSummary['status'];
      created_at: Date;
      product_id: string | null;
      product_title: string | null;
      unit_price_bdt: number | null;
      quantity: number | null;
      line_total_bdt: number | null;
    }>(
      `SELECT o.id, o.reference, o.buyer_name, o.buyer_email, o.buyer_phone,
              o.delivery_address, o.total_bdt, o.status, o.created_at,
              oi.product_id, oi.product_title, oi.unit_price_bdt, oi.quantity, oi.line_total_bdt
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       ORDER BY oi.id`,
      [orderId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      reference: row.reference,
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      buyerPhone: row.buyer_phone,
      deliveryAddress: row.delivery_address,
      totalBdt: row.total_bdt,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      items: result.rows.flatMap((item) => item.product_id && item.product_title
        && item.unit_price_bdt !== null && item.quantity !== null && item.line_total_bdt !== null
        ? [{
          productId: item.product_id,
          title: item.product_title,
          unitPriceBdt: item.unit_price_bdt,
          quantity: item.quantity,
          lineTotalBdt: item.line_total_bdt,
        }]
        : []),
    };
  }
}
