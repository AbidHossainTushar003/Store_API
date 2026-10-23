import {
  Controller,
  Get,
  Inject,
  Logger,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Pool } from 'pg';
import {
  getRequestId,
  getSafeErrorDiagnostics,
  markRequestDiagnosticLogged,
} from '../common/diagnostics/safe-error-diagnostics';
import { POSTGRES_POOL } from '../database/database.module';

class HealthResponseDto {
  status: string;
  service: string;
  timestamp: string;
  uptimeMs: number;
}

type SchemaCheck = {
  missingColumns: string[];
};

const REQUIRED_SCHEMA_COLUMNS = `
  ('products', 'id'),
  ('products', 'title'),
  ('products', 'description'),
  ('products', 'category'),
  ('products', 'brand'),
  ('products', 'is_demo'),
  ('products', 'created_at'),
  ('products', 'seller_id'),
  ('products', 'sku'),
  ('products', 'price_bdt'),
  ('products', 'stock_quantity'),
  ('products', 'status'),
  ('products', 'is_public_approved'),
  ('products', 'public_approval_updated_at'),
  ('products', 'public_approval_updated_by'),
  ('guest_sessions', 'id'),
  ('guest_sessions', 'token_hash'),
  ('guest_sessions', 'expires_at'),
  ('guest_sessions', 'created_at'),
  ('cart_items', 'guest_session_id'),
  ('cart_items', 'product_id'),
  ('cart_items', 'quantity'),
  ('cart_items', 'created_at'),
  ('cart_items', 'updated_at'),
  ('wishlist_items', 'guest_session_id'),
  ('wishlist_items', 'product_id'),
  ('wishlist_items', 'created_at'),
  ('orders', 'id'),
  ('orders', 'reference'),
  ('orders', 'guest_session_id'),
  ('orders', 'seller_id'),
  ('orders', 'buyer_name'),
  ('orders', 'buyer_email'),
  ('orders', 'buyer_phone'),
  ('orders', 'delivery_address'),
  ('orders', 'total_bdt'),
  ('orders', 'status'),
  ('orders', 'created_at'),
  ('orders', 'seller_confirmed_at'),
  ('orders', 'admin_confirmed_at'),
  ('order_items', 'id'),
  ('order_items', 'order_id'),
  ('order_items', 'product_id'),
  ('order_items', 'product_title'),
  ('order_items', 'unit_price_bdt'),
  ('order_items', 'quantity'),
  ('order_items', 'line_total_bdt'),
  ('seller_applications', 'id'),
  ('seller_applications', 'applicant_sub'),
  ('seller_applications', 'applicant_name'),
  ('seller_applications', 'applicant_email'),
  ('seller_applications', 'shop_name'),
  ('seller_applications', 'description'),
  ('seller_applications', 'status'),
  ('seller_applications', 'submitted_at'),
  ('super_admin_identities', 'auth0_sub'),
  ('super_admin_identities', 'created_at'),
  ('super_admin_identities', 'created_by'),
  ('super_admin_bootstrap_state', 'singleton'),
  ('super_admin_bootstrap_state', 'consumed_at'),
  ('super_admin_bootstrap_state', 'consumed_by'),
  ('super_admin_audit_log', 'id'),
  ('super_admin_audit_log', 'actor_sub'),
  ('super_admin_audit_log', 'action'),
  ('super_admin_audit_log', 'target_type'),
  ('super_admin_audit_log', 'target_id'),
  ('super_admin_audit_log', 'created_at'),
  ('super_admin_audit_log', 'details'),
  ('product_publication_audit', 'id'),
  ('product_publication_audit', 'product_id'),
  ('product_publication_audit', 'actor_sub'),
  ('product_publication_audit', 'action'),
  ('product_publication_audit', 'reason'),
  ('product_publication_audit', 'previous_state'),
  ('product_publication_audit', 'resulting_state'),
  ('product_publication_audit', 'created_at'),
  ('seller_application_audit', 'id'),
  ('seller_application_audit', 'application_id'),
  ('seller_application_audit', 'actor_sub'),
  ('seller_application_audit', 'action'),
  ('seller_application_audit', 'reason'),
  ('seller_application_audit', 'previous_state'),
  ('seller_application_audit', 'resulting_state'),
  ('seller_application_audit', 'created_at'),
  ('support_tickets', 'id'),
  ('support_tickets', 'reference'),
  ('support_tickets', 'name'),
  ('support_tickets', 'email'),
  ('support_tickets', 'category'),
  ('support_tickets', 'subject'),
  ('support_tickets', 'message'),
  ('support_tickets', 'notification_sent'),
  ('support_tickets', 'notification_attempted_at'),
  ('support_tickets', 'created_at'),
  ('support_tickets', 'expires_at')
`;

@ApiTags('Health')
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  @Get('health')
  @ApiOperation({ summary: 'Check the API status' })
  @ApiResponse({
    status: 200,
    description: 'API is running.',
    schema: {
      example: {
        status: 'ok',
        service: 'shopademia-api',
        timestamp: '2026-10-21T00:00:00.000Z',
        uptimeMs: 1234,
      },
    },
  })
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'shopademia-api',
      timestamp: new Date().toISOString(),
      uptimeMs: Math.round(process.uptime() * 1000),
    };
  }

  @Get('health/ready')
  @ApiOperation({
    summary: 'Check database connectivity and required application schema',
  })
  @ApiResponse({
    status: 200,
    description: 'The API database and required schema are ready.',
    schema: {
      example: {
        status: 'ok',
        service: 'shopademia-api',
        database: 'ready',
        timestamp: '2026-10-21T00:00:00.000Z',
        uptimeMs: 1234,
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'The database or required schema is not ready.',
  })
  async getReadiness(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponseDto & { database: string }> {
    let missingColumns: string[];
    try {
      const result = await this.pool.query<SchemaCheck>(
        `SELECT COALESCE(
           array_agg(required.table_name || '.' || required.column_name
                     ORDER BY required.table_name, required.column_name)
             FILTER (WHERE actual.column_name IS NULL),
           ARRAY[]::text[]
         ) AS "missingColumns"
         FROM (VALUES ${REQUIRED_SCHEMA_COLUMNS}) AS required(table_name, column_name)
         LEFT JOIN information_schema.columns AS actual
           ON actual.table_schema = 'public'
          AND actual.table_name = required.table_name
          AND actual.column_name = required.column_name`,
      );
      const schemaCheck = result.rows[0];
      if (!schemaCheck) {
        throw new Error('The database returned no schema readiness result.');
      }
      missingColumns = schemaCheck.missingColumns;
    } catch (error: unknown) {
      const diagnostics = getSafeErrorDiagnostics(error, getRequestId(request));
      markRequestDiagnosticLogged(request);
      response.setHeader('X-Request-ID', diagnostics.requestId);
      this.logger.error([
        'Database readiness check could not query the required schema.',
        `requestId=${diagnostics.requestId}`,
        `errorClass=${diagnostics.errorClass}`,
        ...(diagnostics.sqlState ? [`sqlState=${diagnostics.sqlState}`] : []),
      ].join(' '));
      throw new ServiceUnavailableException('API dependencies are not ready.');
    }

    if (missingColumns.length > 0) {
      this.logger.warn(
        `Database readiness check found ${missingColumns.length} required schema columns missing.`,
      );
      throw new ServiceUnavailableException('API dependencies are not ready.');
    }

    return {
      status: 'ok',
      service: 'shopademia-api',
      database: 'ready',
      timestamp: new Date().toISOString(),
      uptimeMs: Math.round(process.uptime() * 1000),
    };
  }
}
