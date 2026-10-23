import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../database/database.module';
import type { AppEnvironment } from '../config/env.validation';
import type { SubmitContactRequestDto } from './dto/submit-contact-request.dto';

const CONTACT_RATE_LIMIT = 5;
const CONTACT_RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_RATE_LIMIT_KEYS = 10_000;

@Injectable()
export class ContactService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactService.name);
  private readonly supportConfig: AppEnvironment['SUPPORT_CONTACT'];
  private readonly transporter?: Transporter;
  private readonly rateLimits = new Map<string, { count: number; windowStartedAt: number }>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    configService: ConfigService,
  ) {
    this.supportConfig = configService.get<AppEnvironment['SUPPORT_CONTACT']>('SUPPORT_CONTACT');
    if (this.supportConfig) {
      this.transporter = createTransport({
        host: this.supportConfig.host,
        port: this.supportConfig.port,
        secure: this.supportConfig.secure,
        requireTLS: !this.supportConfig.secure,
        auth: {
          user: this.supportConfig.user,
          pass: this.supportConfig.password,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        tls: { minVersion: 'TLSv1.2' },
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    }
  }

  onModuleInit(): void {
    if (!this.supportConfig) {
      return;
    }
    void this.removeExpiredTickets();
    this.cleanupInterval = setInterval(() => void this.removeExpiredTickets(), 60 * 60 * 1000);
    this.cleanupInterval.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.transporter?.close();
  }

  async submit(
    input: SubmitContactRequestDto,
    clientAddress: string,
  ): Promise<{ ticketReference: string; notificationSent: boolean }> {
    if (!this.supportConfig || !this.transporter) {
      throw new ServiceUnavailableException(
        'The support contact service is not configured. Your request was not saved or emailed.',
      );
    }

    this.assertRateLimit(clientAddress);
    if (input.website?.trim()) {
      throw new BadRequestException('The support request could not be accepted.');
    }

    const ticketReference = `SUP-${randomBytes(6).toString('hex').toUpperCase()}`;
    await this.pool.query(
      `INSERT INTO support_tickets
         (reference, name, email, category, subject, message, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7::integer * interval '1 day'))`,
      [
        ticketReference,
        input.name,
        input.email,
        input.category,
        input.subject,
        input.message,
        this.supportConfig.retentionDays,
      ],
    );

    let notificationSent = false;
    try {
      const sendResult = await this.transporter.sendMail({
        from: this.supportConfig.from,
        to: this.supportConfig.to,
        replyTo: input.email,
        subject: `[Shopademia support ${ticketReference}] ${input.subject}`,
        text: [
          `Reference: ${ticketReference}`,
          `Category: ${input.category}`,
          `Name: ${input.name}`,
          `Email: ${input.email}`,
          '',
          input.message,
        ].join('\n'),
      });
      notificationSent = sendResult.accepted.length > 0;
      if (!notificationSent) {
        this.logger.warn(
          `Support ticket ${ticketReference} was saved but the SMTP service accepted no recipients.`,
        );
      }
    } catch {
      this.logger.error(
        `Support ticket ${ticketReference} was saved but its SMTP notification failed.`,
      );
    }

    try {
      await this.pool.query(
        `UPDATE support_tickets
         SET notification_sent = $2, notification_attempted_at = now()
         WHERE reference = $1`,
        [ticketReference, notificationSent],
      );
    } catch {
      this.logger.error(
        `Could not update notification status for saved support ticket ${ticketReference}.`,
      );
    }

    return { ticketReference, notificationSent };
  }

  private assertRateLimit(clientAddress: string): void {
    const now = Date.now();
    const key = clientAddress || 'unknown';
    const current = this.rateLimits.get(key);

    if (!current || now - current.windowStartedAt >= CONTACT_RATE_WINDOW_MS) {
      if (this.rateLimits.size >= MAX_RATE_LIMIT_KEYS) {
        for (const [address, limit] of this.rateLimits) {
          if (now - limit.windowStartedAt >= CONTACT_RATE_WINDOW_MS) {
            this.rateLimits.delete(address);
          }
        }
      }
      if (this.rateLimits.size >= MAX_RATE_LIMIT_KEYS) {
        throw new ServiceUnavailableException('The support service is temporarily busy.');
      }
      this.rateLimits.set(key, { count: 1, windowStartedAt: now });
      return;
    }

    if (current.count >= CONTACT_RATE_LIMIT) {
      throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
  }

  private async removeExpiredTickets(): Promise<void> {
    try {
      await this.pool.query('DELETE FROM support_tickets WHERE expires_at <= now()');
    } catch {
      this.logger.error(
        'Could not remove expired support tickets.',
      );
    }
  }
}
