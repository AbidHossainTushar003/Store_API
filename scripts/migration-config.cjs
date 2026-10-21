class MigrationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationConfigurationError';
  }
}

function resolveMigrationDatabaseUrl(env) {
  const connectionString = env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new MigrationConfigurationError(
      'MIGRATION_DATABASE_URL is required to run database migrations.',
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new MigrationConfigurationError(
      'MIGRATION_DATABASE_URL must be a valid PostgreSQL connection URL.',
    );
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new MigrationConfigurationError(
      'MIGRATION_DATABASE_URL must use the PostgreSQL protocol.',
    );
  }

  return connectionString;
}

module.exports = {
  MigrationConfigurationError,
  resolveMigrationDatabaseUrl,
};
