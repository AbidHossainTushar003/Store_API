import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

@Injectable()
export class AdminOperationsService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async getSummary() {
    const result = await this.pool.query<{
      order_count: string;
      pending_seller_count: string;
      pending_admin_count: string;
      order_value_bdt: string;
      product_count: string;
      active_product_count: string;
      seller_count: string;
      customer_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM orders) AS order_count,
         (SELECT count(*) FROM orders WHERE status = 'pending_seller_confirmation') AS pending_seller_count,
         (SELECT count(*) FROM orders WHERE status = 'pending_admin_confirmation') AS pending_admin_count,
         (SELECT COALESCE(sum(total_bdt), 0) FROM orders) AS order_value_bdt,
         (SELECT count(*) FROM products WHERE is_demo = false) AS product_count,
         (SELECT count(*) FROM products WHERE is_demo = false AND status = 'active' AND stock_quantity > 0) AS active_product_count,
         (SELECT count(DISTINCT seller_id) FROM products WHERE seller_id IS NOT NULL) AS seller_count,
         (SELECT count(DISTINCT buyer_email) FROM orders) AS customer_count`,
    );
    const row = result.rows[0];
    return {
      orders: Number(row.order_count),
      awaitingSeller: Number(row.pending_seller_count),
      awaitingAdmin: Number(row.pending_admin_count),
      localOrderValueBdt: Number(row.order_value_bdt),
      sellerListings: Number(row.product_count),
      activeListings: Number(row.active_product_count),
      localSellerIdentities: Number(row.seller_count),
      guestCustomers: Number(row.customer_count),
    };
  }

  async getProducts() {
    const result = await this.pool.query<{
      id: string;
      title: string;
      category: string;
      seller_id: string | null;
      price_bdt: number | null;
      stock_quantity: number;
      status: string;
      is_public_approved: boolean;
      seller_eligible: boolean;
      created_at: Date;
    }>(
      `SELECT id, title, category, seller_id, price_bdt, stock_quantity, status,
              is_public_approved,
              EXISTS (
                SELECT 1 FROM seller_applications sa
                WHERE sa.applicant_sub = products.seller_id AND sa.status = 'approved'
              ) AS seller_eligible,
              created_at
       FROM products
       WHERE is_demo = false
       ORDER BY created_at DESC`,
    );
    return {
      products: result.rows.map((product) => ({
        id: product.id,
        title: product.title,
        category: product.category,
        sellerId: product.seller_id,
        priceBdt: product.price_bdt,
        stockQuantity: product.stock_quantity,
        status: product.status,
        isPublicApproved: product.is_public_approved,
        sellerEligible: product.seller_eligible,
        createdAt: product.created_at.toISOString(),
      })),
    };
  }

  async updateProductPublication(
    productId: string,
    approved: boolean,
    reason: string,
    actorSub: string,
  ) {
    if (reason.trim().length < 3 || reason.trim().length > 1000) {
      throw new BadRequestException('A publication decision reason between 3 and 1000 characters is required.');
    }
    const client = await this.pool.connect();
    let transactionActive = false;
    try {
      await client.query('BEGIN');
      transactionActive = true;
      const owner = await client.query<{
        seller_id: string | null;
        is_demo: boolean;
      }>(
        `SELECT seller_id, is_demo
         FROM products
         WHERE id = $1`,
        [productId],
      );
      if (!owner.rows[0] || owner.rows[0].is_demo) {
        throw new NotFoundException('A non-demo product was not found.');
      }
      const seller = owner.rows[0].seller_id
        ? await client.query<{ status: string }>(
          `SELECT status
           FROM seller_applications
           WHERE applicant_sub = $1
           FOR UPDATE`,
          [owner.rows[0].seller_id],
        )
        : { rows: [] as { status: string }[] };

      const found = await client.query<{
        id: string;
        is_demo: boolean;
        is_public_approved: boolean;
        status: string;
        stock_quantity: number;
        seller_id: string | null;
        price_bdt: number | null;
      }>(
        `SELECT p.id, p.is_demo, p.is_public_approved, p.status, p.stock_quantity,
                p.seller_id, p.price_bdt
         FROM products p
         WHERE p.id = $1
         FOR UPDATE OF p`,
        [productId],
      );
      const product = found.rows[0];
      if (!product || product.is_demo || product.seller_id !== owner.rows[0].seller_id) {
        throw new NotFoundException('A non-demo product was not found.');
      }
      const sellerEligible = seller.rows[0]?.status === 'approved';
      if (approved && (
        product.status !== 'active' ||
        product.stock_quantity < 1 ||
        !product.seller_id ||
        product.price_bdt === null ||
        !sellerEligible
      )) {
        throw new ConflictException('The listing must be active, in stock, priced, and owned by an approved seller before publication.');
      }

      if (product.is_public_approved === approved) {
        await client.query('COMMIT');
        transactionActive = false;
        return { product: { id: product.id, isPublicApproved: approved }, changed: false };
      }

      await client.query(
        `UPDATE products
         SET is_public_approved = $2,
             public_approval_updated_at = now(),
             public_approval_updated_by = $3
         WHERE id = $1`,
        [productId, approved, actorSub],
      );
      await client.query(
        `INSERT INTO product_publication_audit
           (product_id, actor_sub, action, reason, previous_state, resulting_state)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          productId,
          actorSub,
          approved ? 'approved' : 'revoked',
          reason.trim(),
          product.is_public_approved,
          approved,
        ],
      );
      await client.query('COMMIT');
      transactionActive = false;
      return { product: { id: product.id, isPublicApproved: approved }, changed: true };
    } catch (error) {
      if (transactionActive) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateProductStatus(productId: string, status: 'active' | 'inactive') {
    const result = await this.pool.query<{ id: string; status: string }>(
      `UPDATE products
       SET status = $2
       WHERE id = $1 AND is_demo = false
         AND ($2 = 'inactive' OR (seller_id IS NOT NULL AND price_bdt IS NOT NULL AND stock_quantity > 0))
       RETURNING id, status`,
      [productId, status],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Eligible seller listing was not found.');
    }
    return { product: { id: result.rows[0].id, status: result.rows[0].status } };
  }

  async getCategories() {
    const result = await this.pool.query<{
      category: string;
      product_count: string;
      active_count: string;
    }>(
      `SELECT category, count(*) AS product_count,
              count(*) FILTER (WHERE status = 'active' AND stock_quantity > 0) AS active_count
       FROM products
       WHERE is_demo = false
       GROUP BY category
       ORDER BY category`,
    );
    return {
      categories: result.rows.map((row) => ({
        name: row.category,
        productCount: Number(row.product_count),
        activeListings: Number(row.active_count),
      })),
    };
  }

  async getSellers() {
    const result = await this.pool.query<{
      seller_id: string;
      product_count: string;
      active_product_count: string;
      order_count: string;
    }>(
      `SELECT p.seller_id, count(DISTINCT p.id) AS product_count,
              count(DISTINCT p.id) FILTER (WHERE p.status = 'active' AND p.stock_quantity > 0) AS active_product_count,
              count(DISTINCT o.id) AS order_count
       FROM products p
       LEFT JOIN orders o ON o.seller_id = p.seller_id
       WHERE p.is_demo = false AND p.seller_id IS NOT NULL
       GROUP BY p.seller_id
       ORDER BY p.seller_id`,
    );
    return {
      sellers: result.rows.map((row) => ({
        id: row.seller_id,
        displayName: row.seller_id === 'seller-demo' ? 'Local Demo Seller' : row.seller_id,
        productCount: Number(row.product_count),
        activeListings: Number(row.active_product_count),
        orderCount: Number(row.order_count),
      })),
    };
  }

  async getCustomers() {
    const result = await this.pool.query<{
      buyer_name: string;
      buyer_email: string;
      buyer_phone: string;
      order_count: string;
      order_value_bdt: string;
      last_order_at: Date;
    }>(
      `SELECT buyer_email, max(buyer_name) AS buyer_name, max(buyer_phone) AS buyer_phone,
              count(*) AS order_count, sum(total_bdt) AS order_value_bdt,
              max(created_at) AS last_order_at
       FROM orders
       GROUP BY buyer_email
       ORDER BY last_order_at DESC`,
    );
    return {
      customers: result.rows.map((row) => ({
        name: row.buyer_name,
        email: row.buyer_email,
        phone: row.buyer_phone,
        orderCount: Number(row.order_count),
        localOrderValueBdt: Number(row.order_value_bdt),
        lastOrderAt: row.last_order_at.toISOString(),
      })),
    };
  }

  async getAnalytics() {
    const result = await this.pool.query<{
      day: Date;
      order_count: string;
      order_value_bdt: string;
      confirmed_count: string;
    }>(
      `SELECT date_trunc('day', created_at) AS day,
              count(*) AS order_count,
              sum(total_bdt) AS order_value_bdt,
              count(*) FILTER (WHERE status = 'confirmed') AS confirmed_count
       FROM orders
       WHERE created_at >= now() - interval '30 days'
       GROUP BY date_trunc('day', created_at)
       ORDER BY day`,
    );
    return {
      days: result.rows.map((row) => ({
        date: row.day.toISOString(),
        orders: Number(row.order_count),
        localOrderValueBdt: Number(row.order_value_bdt),
        confirmedOrders: Number(row.confirmed_count),
      })),
    };
  }

  async getActivity() {
    const result = await this.pool.query<{
      id: string;
      kind: 'listing' | 'order';
      label: string;
      occurred_at: Date;
    }>(
      `SELECT id, kind, label, occurred_at FROM (
         SELECT id::text AS id, 'listing'::text AS kind, title AS label, created_at AS occurred_at
         FROM products
         WHERE is_demo = false
         UNION ALL
         SELECT id::text AS id, 'order'::text AS kind, reference AS label, created_at AS occurred_at
         FROM orders
       ) activity
       ORDER BY occurred_at DESC
       LIMIT 100`,
    );
    return {
      activity: result.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        label: row.label,
        occurredAt: row.occurred_at.toISOString(),
      })),
    };
  }

  async getApplications() {
    const result = await this.pool.query<{
      id: string;
      applicant_name: string;
      applicant_email: string;
      shop_name: string;
      description: string;
      status: 'pending' | 'approved' | 'rejected' | 'suspended';
      submitted_at: Date;
    }>(
      `SELECT id, applicant_name, applicant_email, shop_name, description, status, submitted_at
       FROM seller_applications
       ORDER BY submitted_at DESC`,
    );
    return {
      applications: result.rows.map((row) => ({
        id: row.id,
        applicantName: row.applicant_name,
        applicantEmail: row.applicant_email,
        shopName: row.shop_name,
        description: row.description,
        status: row.status,
        submittedAt: row.submitted_at.toISOString(),
      })),
    };
  }

  async reviewApplication(
    applicationId: string,
    status: 'approved' | 'rejected' | 'suspended',
    reason: string,
    actorSub: string,
  ) {
    if (reason.trim().length < 3 || reason.trim().length > 1000) {
      throw new BadRequestException('A seller application decision reason between 3 and 1000 characters is required.');
    }
    if (!actorSub.trim()) {
      throw new BadRequestException('A verified admin identity is required.');
    }

    const client = await this.pool.connect();
    let transactionActive = false;
    try {
      await client.query('BEGIN');
      transactionActive = true;
      const found = await client.query<{
        id: string;
        applicant_sub: string;
        status: 'pending' | 'approved' | 'rejected' | 'suspended';
      }>(
        `SELECT id, applicant_sub, status
         FROM seller_applications
         WHERE id = $1
         FOR UPDATE`,
        [applicationId],
      );
      const application = found.rows[0];
      if (!application) {
        throw new NotFoundException('Seller application was not found.');
      }

      const allowedTransition =
        (application.status === 'pending' && (status === 'approved' || status === 'rejected')) ||
        (application.status === 'approved' && status === 'suspended') ||
        (application.status === 'suspended' && status === 'approved');
      if (!allowedTransition) {
        throw new ConflictException('The seller application cannot transition from its current status.');
      }

      await client.query(
        `UPDATE seller_applications
         SET status = $2
         WHERE id = $1`,
        [applicationId, status],
      );
      const action = application.status === 'suspended' && status === 'approved'
        ? 'reactivated'
        : status;
      await client.query(
        `INSERT INTO seller_application_audit
           (application_id, actor_sub, action, reason, previous_state, resulting_state)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [applicationId, actorSub, action, reason.trim(), application.status, status],
      );

      if (application.status === 'approved' && status === 'suspended') {
        await client.query(
          `WITH suspended AS (
             UPDATE products
             SET is_public_approved = false,
                 public_approval_updated_at = now(),
                 public_approval_updated_by = $2
             WHERE seller_id = $1 AND is_demo = false AND is_public_approved = true
             RETURNING id
           )
           INSERT INTO product_publication_audit
             (product_id, actor_sub, action, reason, previous_state, resulting_state)
           SELECT id, $2, 'seller_eligibility_suspension', $3, true, false
           FROM suspended`,
          [
            application.applicant_sub,
            actorSub,
            reason.trim(),
          ],
        );
      }

      await client.query('COMMIT');
      transactionActive = false;
      return { application: { id: application.id, status } };
    } catch (error) {
      if (transactionActive) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
