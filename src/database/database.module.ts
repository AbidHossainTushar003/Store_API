import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const POSTGRES_POOL = 'POSTGRES_POOL';

class DatabaseShutdown implements OnModuleDestroy {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => new Pool({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        max: 10,
      }),
    },
    DatabaseShutdown,
  ],
  exports: [POSTGRES_POOL],
})
export class DatabaseModule {}
