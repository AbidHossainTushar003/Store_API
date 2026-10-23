import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

const ACTIVE_SESSION_PREFIX = 'shopademia:auth0:active:';
type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class Auth0SessionRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(Auth0SessionRegistry.name);
  private client?: RedisClient;
  private connecting?: Promise<RedisClient>;

  constructor(private readonly configService: ConfigService) {}

  async getSubject(sessionId: string): Promise<string | null> {
    const client = await this.getClient();
    const value = await client.get(`${ACTIVE_SESSION_PREFIX}${sessionId}`);
    return value === null
      ? null
      : typeof value === 'string'
        ? value
        : value.toString('utf8');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private async getClient(): Promise<RedisClient> {
    if (this.client?.isReady) {
      return this.client;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new ServiceUnavailableException('Seller session storage is not configured.');
    }

    if (!this.connecting) {
      const client = createClient({ url: redisUrl });
      client.on('error', () => {
        this.logger.error('Seller session storage is unavailable.');
      });
      this.connecting = client.connect()
        .then(() => {
          this.client = client;
          return client;
        })
        .catch((error: unknown) => {
          this.connecting = undefined;
          throw error;
        });
    }

    return this.connecting;
  }
}
