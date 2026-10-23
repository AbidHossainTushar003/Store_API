export type NodeEnv = 'development' | 'production' | 'test';

export interface AppEnvironment {
  PORT: number;
  HOST: string;
  NODE_ENV: NodeEnv;
  LOCAL_DEMO_MODE: boolean;
  DATABASE_URL: string;
  STOREFRONT_ORIGIN: string;
  AUTH0_ISSUER_URL?: string;
  AUTH0_AUDIENCE?: string;
  REDIS_URL?: string;
  SUPER_ADMIN_MFA_CLAIM?: string;
  SUPPORT_CONTACT?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    to: string;
    retentionDays: number;
  };
}

export function validateEnvironment(env: Record<string, string | undefined>): AppEnvironment {
  const rawPort = env.PORT ?? '3001';
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid integer between 1 and 65535.');
  }

  const host = env.HOST ?? '0.0.0.0';
  if (!host.trim()) {
    throw new Error('HOST must not be empty.');
  }

  const nodeEnv = (env.NODE_ENV ?? 'development') as NodeEnv;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be one of: development, production, test.');
  }

  const localDemoMode = env.LOCAL_DEMO_MODE === 'true';
  if (env.LOCAL_DEMO_MODE !== undefined && !['true', 'false'].includes(env.LOCAL_DEMO_MODE)) {
    throw new Error('LOCAL_DEMO_MODE must be true or false.');
  }
  if (
    localDemoMode &&
    (nodeEnv !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(host))
  ) {
    throw new Error('LOCAL_DEMO_MODE requires development mode and a loopback HOST.');
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

  const storefrontOriginValue = env.STOREFRONT_ORIGIN;
  if (nodeEnv === 'production' && !storefrontOriginValue) {
    throw new Error('STOREFRONT_ORIGIN is required in production.');
  }

  const storefrontOrigin = storefrontOriginValue ?? 'http://localhost:3000';
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
  if (nodeEnv === 'production' && parsedStorefrontOrigin.protocol !== 'https:') {
    throw new Error('STOREFRONT_ORIGIN must use HTTPS in production.');
  }

  const auth0Issuer = env.AUTH0_ISSUER_URL?.trim();
  const auth0Audience = env.AUTH0_AUDIENCE?.trim();
  const redisUrl = env.REDIS_URL?.trim();
  const superAdminMfaClaim = env.SUPER_ADMIN_MFA_CLAIM?.trim();

  if (nodeEnv === 'production') {
    if (!auth0Issuer) {
      throw new Error('AUTH0_ISSUER_URL is required in production.');
    }
    let parsedAuth0Issuer: URL;
    try {
      parsedAuth0Issuer = new URL(auth0Issuer);
    } catch {
      throw new Error('AUTH0_ISSUER_URL must be a valid HTTPS URL.');
    }
    if (
      parsedAuth0Issuer.protocol !== 'https:' ||
      parsedAuth0Issuer.username ||
      parsedAuth0Issuer.password ||
      parsedAuth0Issuer.search ||
      parsedAuth0Issuer.hash
    ) {
      throw new Error('AUTH0_ISSUER_URL must use HTTPS without credentials, query, or fragment.');
    }
    if (!auth0Audience) {
      throw new Error('AUTH0_AUDIENCE is required in production.');
    }
    if (!redisUrl) {
      throw new Error('REDIS_URL is required in production.');
    }
    let parsedRedisUrl: URL;
    try {
      parsedRedisUrl = new URL(redisUrl);
    } catch {
      throw new Error('REDIS_URL must be a valid Redis URL.');
    }
    if (parsedRedisUrl.protocol !== 'rediss:') {
      throw new Error('REDIS_URL must use TLS (rediss) in production.');
    }
    if (!superAdminMfaClaim) {
      throw new Error('SUPER_ADMIN_MFA_CLAIM is required in production.');
    }
    let parsedMfaClaim: URL;
    try {
      parsedMfaClaim = new URL(superAdminMfaClaim);
    } catch {
      throw new Error('SUPER_ADMIN_MFA_CLAIM must be a valid HTTPS URL.');
    }
    if (
      parsedMfaClaim.protocol !== 'https:' ||
      parsedMfaClaim.username ||
      parsedMfaClaim.password ||
      parsedMfaClaim.search ||
      parsedMfaClaim.hash
    ) {
      throw new Error('SUPER_ADMIN_MFA_CLAIM must use HTTPS without credentials, query, or fragment.');
    }
  }

  const supportContactEnabled = env.SUPPORT_CONTACT_ENABLED ?? 'false';
  if (!['true', 'false'].includes(supportContactEnabled)) {
    throw new Error('SUPPORT_CONTACT_ENABLED must be true or false.');
  }
  const retentionPolicyApproved = env.SUPPORT_RETENTION_POLICY_APPROVED ?? 'false';
  if (!['true', 'false'].includes(retentionPolicyApproved)) {
    throw new Error('SUPPORT_RETENTION_POLICY_APPROVED must be true or false.');
  }
  if (supportContactEnabled === 'true' && retentionPolicyApproved !== 'true') {
    throw new Error(
      'SUPPORT_RETENTION_POLICY_APPROVED must be true before support contact can be enabled.',
    );
  }

  const supportSettingNames = [
    'SUPPORT_SMTP_HOST',
    'SUPPORT_SMTP_PORT',
    'SUPPORT_SMTP_SECURE',
    'SUPPORT_SMTP_USER',
    'SUPPORT_SMTP_PASSWORD',
    'SUPPORT_EMAIL_FROM',
    'SUPPORT_EMAIL_TO',
    'SUPPORT_TICKET_RETENTION_DAYS',
  ] as const;
  let supportContact: AppEnvironment['SUPPORT_CONTACT'];

  if (supportContactEnabled === 'true') {
    for (const name of supportSettingNames) {
      if (!env[name]?.trim()) {
        throw new Error(`${name} is required when support contact is enabled.`);
      }
    }

    const smtpPort = Number(env.SUPPORT_SMTP_PORT);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new Error('SUPPORT_SMTP_PORT must be a valid integer between 1 and 65535.');
    }
    if (!['true', 'false'].includes(env.SUPPORT_SMTP_SECURE!)) {
      throw new Error('SUPPORT_SMTP_SECURE must be true or false.');
    }

    const retentionDays = Number(env.SUPPORT_TICKET_RETENTION_DAYS);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      throw new Error('SUPPORT_TICKET_RETENTION_DAYS must be an integer between 1 and 3650.');
    }
    for (const name of ['SUPPORT_EMAIL_FROM', 'SUPPORT_EMAIL_TO'] as const) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env[name]!)) {
        throw new Error(`${name} must be a valid email address.`);
      }
    }
    if (!env.SUPPORT_SMTP_HOST!.trim() || /[\r\n]/.test(env.SUPPORT_SMTP_HOST!)) {
      throw new Error('SUPPORT_SMTP_HOST must be a valid host name.');
    }

    supportContact = {
      host: env.SUPPORT_SMTP_HOST!,
      port: smtpPort,
      secure: env.SUPPORT_SMTP_SECURE === 'true',
      user: env.SUPPORT_SMTP_USER!,
      password: env.SUPPORT_SMTP_PASSWORD!,
      from: env.SUPPORT_EMAIL_FROM!,
      to: env.SUPPORT_EMAIL_TO!,
      retentionDays,
    };
  }

  return {
    PORT: port,
    HOST: host,
    NODE_ENV: nodeEnv,
    LOCAL_DEMO_MODE: localDemoMode,
    DATABASE_URL: databaseUrl,
    STOREFRONT_ORIGIN: storefrontOrigin,
    ...(auth0Issuer ? { AUTH0_ISSUER_URL: auth0Issuer } : {}),
    ...(auth0Audience ? { AUTH0_AUDIENCE: auth0Audience } : {}),
    ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    ...(superAdminMfaClaim ? { SUPER_ADMIN_MFA_CLAIM: superAdminMfaClaim } : {}),
    ...(supportContact ? { SUPPORT_CONTACT: supportContact } : {}),
  };
}
