const {
  MigrationConfigurationError,
  resolveMigrationDatabaseUrl,
} = require('../scripts/migration-config.cjs') as {
  MigrationConfigurationError: new (message: string) => Error;
  resolveMigrationDatabaseUrl: (env: NodeJS.ProcessEnv) => string;
};

describe('migration database configuration', () => {
  it('uses the dedicated migration URL', () => {
    const migrationUrl = 'postgresql://owner:fixture@localhost:55432/shopademia_d6_disposable';

    expect(resolveMigrationDatabaseUrl({
      DATABASE_URL: 'postgresql://runtime:fixture@localhost:55432/shopademia_d6_disposable',
      MIGRATION_DATABASE_URL: migrationUrl,
    })).toBe(migrationUrl);
  });

  it('fails closed when migration configuration is missing even if runtime URL exists', () => {
    expect(() => resolveMigrationDatabaseUrl({
      DATABASE_URL: 'postgresql://runtime:fixture@localhost:55432/shopademia_d6_disposable',
    })).toThrow('MIGRATION_DATABASE_URL is required to run database migrations.');
  });

  it('rejects malformed migration URLs without exposing their contents', () => {
    const sentinel = 'do-not-disclose-this-secret';
    let thrown: Error | undefined;

    try {
      resolveMigrationDatabaseUrl({
        MIGRATION_DATABASE_URL: `not-a-url-${sentinel}`,
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeInstanceOf(MigrationConfigurationError);
    expect(thrown?.message).toBe(
      'MIGRATION_DATABASE_URL must be a valid PostgreSQL connection URL.',
    );
    expect(thrown?.message).not.toContain(sentinel);
  });

  it('rejects non-PostgreSQL URLs without exposing credentials', () => {
    const sentinel = 'do-not-disclose-this-secret';
    let thrown: Error | undefined;

    try {
      resolveMigrationDatabaseUrl({
        MIGRATION_DATABASE_URL: `mysql://user:${sentinel}@localhost/shopademia`,
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeInstanceOf(MigrationConfigurationError);
    expect(thrown?.message).toBe(
      'MIGRATION_DATABASE_URL must use the PostgreSQL protocol.',
    );
    expect(thrown?.message).not.toContain(sentinel);
  });
});
