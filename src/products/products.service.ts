import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

export type StorefrontProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  brand: string | null;
  isDemo: boolean;
  priceBdt: number | null;
  stockQuantity: number | null;
};

@Injectable()
export class ProductsService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async listProducts(): Promise<StorefrontProduct[]> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      description: string;
      category: string;
      brand: string | null;
      is_demo: boolean;
      price_bdt: number | null;
      stock_quantity: number;
    }>(
      `SELECT id, title, description, category, brand, is_demo, price_bdt, stock_quantity
       FROM products
       WHERE is_demo = false AND is_public_approved = true
         AND status = 'active' AND stock_quantity > 0
         AND EXISTS (
           SELECT 1 FROM seller_applications sa
           WHERE sa.applicant_sub = products.seller_id AND sa.status = 'approved'
         )
       ORDER BY id`,
    );

    return result.rows.map((product) => ({
      id: product.id,
      title: product.title,
      description: product.description,
      category: product.category,
      brand: product.brand,
      isDemo: product.is_demo,
      priceBdt: product.price_bdt,
      stockQuantity: product.is_demo ? null : product.stock_quantity,
    }));
  }

  async listSellerProducts(sellerId: string) {
    const result = await this.pool.query<{
      id: string;
      title: string;
      description: string;
      category: string;
      brand: string | null;
      sku: string | null;
      price_bdt: number;
      stock_quantity: number;
      status: 'draft' | 'active' | 'inactive';
      created_at: Date;
    }>(
      `SELECT id, title, description, category, brand, sku, price_bdt,
              stock_quantity, status, created_at
       FROM products
       WHERE seller_id = $1 AND is_demo = false
       ORDER BY created_at DESC`,
      [sellerId],
    );
    return { products: result.rows.map((product) => this.mapSellerProduct(product)) };
  }

  async getSellerProduct(sellerId: string, productId: string) {
    const result = await this.pool.query<{
      id: string;
      title: string;
      description: string;
      category: string;
      brand: string | null;
      sku: string | null;
      price_bdt: number;
      stock_quantity: number;
      status: 'draft' | 'active' | 'inactive';
      created_at: Date;
    }>(
      `SELECT id, title, description, category, brand, sku, price_bdt,
              stock_quantity, status, created_at
       FROM products
       WHERE seller_id = $1 AND id = $2 AND is_demo = false`,
      [sellerId, productId],
    );
    const product = result.rows[0];
    if (!product) throw new NotFoundException('Seller product was not found.');
    return { product: this.mapSellerProduct(product) };
  }

  async createSellerProduct(
    sellerId: string,
    input: {
      title: string;
      description: string;
      category: string;
      brand?: string;
      sku?: string;
      priceBdt: number;
      stockQuantity: number;
    },
  ) {
    const result = await this.pool.query<{
      id: string;
      title: string;
      description: string;
      category: string;
      brand: string | null;
      sku: string | null;
      price_bdt: number;
      stock_quantity: number;
      status: 'draft' | 'active' | 'inactive';
      created_at: Date;
    }>(
      `INSERT INTO products
         (id, title, description, category, brand, is_demo, seller_id, sku,
          price_bdt, stock_quantity, status)
       VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, 'draft')
       RETURNING id, title, description, category, brand, sku, price_bdt,
                 stock_quantity, status, created_at`,
      [
        `local-${randomUUID()}`,
        input.title.trim(),
        input.description.trim(),
        input.category.trim(),
        input.brand?.trim() || null,
        sellerId,
        input.sku?.trim() || null,
        input.priceBdt,
        input.stockQuantity,
      ],
    );
    return { product: this.mapSellerProduct(result.rows[0]) };
  }

  async updateSellerProduct(
    sellerId: string,
    productId: string,
    input: {
      title?: string;
      description?: string;
      category?: string;
      brand?: string | null;
      sku?: string | null;
      priceBdt?: number;
      stockQuantity?: number;
      status?: 'inactive';
    },
  ) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException('Provide at least one product field to update.');
    }
    if (
      (input.title !== undefined && input.title.trim().length < 2) ||
      (input.description !== undefined && input.description.trim().length < 10) ||
      (input.category !== undefined && input.category.trim().length < 2)
    ) {
      throw new BadRequestException('Product text fields cannot be blank.');
    }
    const result = await this.pool.query<{
      id: string;
      title: string;
      description: string;
      category: string;
      brand: string | null;
      sku: string | null;
      price_bdt: number;
      stock_quantity: number;
      status: 'draft' | 'active' | 'inactive';
      created_at: Date;
    }>(
      `WITH material AS (
         SELECT id, is_public_approved AS was_approved,
                (
                  ($3::text IS NOT NULL AND regexp_replace(btrim(title), '\\s+', ' ', 'g') IS DISTINCT FROM regexp_replace(btrim($3), '\\s+', ' ', 'g'))
                  OR ($4::text IS NOT NULL AND regexp_replace(btrim(description), '\\s+', ' ', 'g') IS DISTINCT FROM regexp_replace(btrim($4), '\\s+', ' ', 'g'))
                  OR ($5::text IS NOT NULL AND regexp_replace(btrim(category), '\\s+', ' ', 'g') IS DISTINCT FROM regexp_replace(btrim($5), '\\s+', ' ', 'g'))
                  OR (
                    $6::boolean AND (
                      (brand IS NULL) IS DISTINCT FROM ($7::text IS NULL)
                      OR (
                        brand IS NOT NULL AND $7::text IS NOT NULL
                        AND regexp_replace(btrim(brand), '\\s+', ' ', 'g') IS DISTINCT FROM regexp_replace(btrim($7), '\\s+', ' ', 'g')
                      )
                    )
                  )
                ) AS material_change
         FROM products
         WHERE seller_id = $1 AND id = $2 AND is_demo = false
         FOR UPDATE
       ),
       updated AS (
       UPDATE products
       SET title = COALESCE($3, title),
           description = COALESCE($4, description),
           category = COALESCE($5, category),
           brand = CASE WHEN $6 THEN $7 ELSE brand END,
           sku = CASE WHEN $8 THEN $9 ELSE sku END,
           price_bdt = COALESCE($10, price_bdt),
           stock_quantity = COALESCE($11, stock_quantity),
           status = COALESCE($12, status),
           is_public_approved = CASE WHEN material.material_change THEN false ELSE products.is_public_approved END,
           public_approval_updated_at = CASE WHEN material.material_change AND products.is_public_approved THEN now() ELSE products.public_approval_updated_at END,
           public_approval_updated_by = CASE WHEN material.material_change AND products.is_public_approved THEN $1 ELSE products.public_approval_updated_by END
       FROM material
       WHERE products.seller_id = $1 AND products.id = $2 AND products.is_demo = false
         AND material.id = products.id
         AND (COALESCE($12, status) <> 'active' OR COALESCE($11, stock_quantity) > 0)
       RETURNING products.id, products.title, products.description, products.category,
                 products.brand, products.sku, products.price_bdt,
                 products.stock_quantity, products.status, products.created_at,
                 material.was_approved, material.material_change
       ),
       audited AS (
         INSERT INTO product_publication_audit
           (product_id, actor_sub, action, reason, previous_state, resulting_state)
         SELECT id, $1, 'content_change_suspension',
                'Publication approval suspended because substantive listing details changed.',
                true, false
         FROM updated
         WHERE was_approved AND material_change
         RETURNING id
       )
       SELECT id, title, description, category, brand, sku, price_bdt,
              stock_quantity, status, created_at
       FROM updated`,
      [
        sellerId,
        productId,
        input.title?.trim() || null,
        input.description?.trim() || null,
        input.category?.trim() || null,
        input.brand !== undefined,
        input.brand?.trim() || null,
        input.sku !== undefined,
        input.sku?.trim() || null,
        input.priceBdt ?? null,
        input.stockQuantity ?? null,
        input.status ?? null,
      ],
    );
    const product = result.rows[0];
    if (!product) {
      const existing = await this.pool.query<{
        status: 'draft' | 'active' | 'inactive';
        stock_quantity: number;
      }>(
        `SELECT status, stock_quantity
         FROM products
         WHERE seller_id = $1 AND id = $2 AND is_demo = false`,
        [sellerId, productId],
      );
      if (
        existing.rows[0] &&
        (input.status ?? existing.rows[0].status) === 'active' &&
        (input.stockQuantity ?? existing.rows[0].stock_quantity) < 1
      ) {
        throw new ConflictException('A product must have stock before it can be activated.');
      }
      throw new NotFoundException('Seller product was not found.');
    }
    return { product: this.mapSellerProduct(product) };
  }

  private mapSellerProduct(product: {
    id: string;
    title: string;
    description: string;
    category: string;
    brand: string | null;
    sku: string | null;
    price_bdt: number;
    stock_quantity: number;
    status: 'draft' | 'active' | 'inactive';
    created_at: Date;
  }) {
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      category: product.category,
      brand: product.brand,
      sku: product.sku,
      priceBdt: product.price_bdt,
      stockQuantity: product.stock_quantity,
      status: product.status,
      createdAt: product.created_at.toISOString(),
    };
  }
}
