export type NodeEnv = 'development' | 'production' | 'test';

export interface AppEnvironment {
  PORT: number;
  NODE_ENV: NodeEnv;
  DATABASE_URL: string;
  STOREFRONT_ORIGIN: string;
}

export function validateEnvironment(env: Record<string, string | undefined>): AppEnvironment {
  const rawPort = env.PORT ?? '3001';
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid integer between 1 and 65535.');
  }

  const nodeEnv = (env.NODE_ENV ?? 'development') as NodeEnv;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be one of: development, production, test.');
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  const storefrontOrigin = env.STOREFRONT_ORIGIN ?? 'http://localhost:3000';
  let parsedStorefrontOrigin: URL;
  try {
    parsedStorefrontOrigin = new URL(storefrontOrigin);
  } catch {
    throw new Error('STOREFRONT_ORIGIN must be a valid HTTP or HTTPS origin.');
  }
  if (
    !['http:', 'https:'].includes(parsedStorefrontOrigin.protocol) ||
    parsedStorefrontOrigin.origin !== storefrontOrigin
  ) {
    throw new Error('STOREFRONT_ORIGIN must be an HTTP or HTTPS origin without a path or trailing slash.');
  }

  return {
    PORT: port,
    NODE_ENV: nodeEnv,
    DATABASE_URL: databaseUrl,
    STOREFRONT_ORIGIN: storefrontOrigin,
  };
}
