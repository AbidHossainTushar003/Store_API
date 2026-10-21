import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';

export type StorefrontProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  brand: string | null;
  isDemo: true;
};

@Injectable()
export class ProductsService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async listDemoProducts(): Promise<StorefrontProduct[]> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      description: string;
      category: string;
      brand: string | null;
    }>(
      `SELECT id, title, description, category, brand
       FROM products
       WHERE is_demo = true
       ORDER BY id`,
    );

    return result.rows.map((product) => ({ ...product, isDemo: true }));
  }
}
