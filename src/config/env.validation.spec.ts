import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('uses the exact local storefront origin by default', () => {
    expect(validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
    })).toEqual({
      PORT: 3001,
      HOST: '0.0.0.0',
      NODE_ENV: 'development',
      LOCAL_DEMO_MODE: false,
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      STOREFRONT_ORIGIN: 'http://localhost:3000',
    });
  });

  it('allows local demo mode only on a loopback development host', () => {
    expect(validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      HOST: '127.0.0.1',
      LOCAL_DEMO_MODE: 'true',
    }).LOCAL_DEMO_MODE).toBe(true);
    expect(() => validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      HOST: '0.0.0.0',
      LOCAL_DEMO_MODE: 'true',
    })).toThrow('LOCAL_DEMO_MODE requires development mode and a loopback HOST.');
    expect(() => validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      LOCAL_DEMO_MODE: 'true',
    })).toThrow('LOCAL_DEMO_MODE requires development mode and a loopback HOST.');
  });

  it('requires a PostgreSQL connection URL outside tests', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'development' }))
      .toThrow('DATABASE_URL is required.');
  });

  it('requires an explicit database URL in test mode without a port-5432 fallback', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test' }))
      .toThrow('DATABASE_URL is required.');
  });

  it('does not require or expose migration credentials in runtime configuration', () => {
    const runtimeEnvironment = validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:55432/shopademia_d6_disposable',
      MIGRATION_DATABASE_URL: 'postgresql://localhost:55432/migration',
    });

    expect(runtimeEnvironment.DATABASE_URL).toBe(
      'postgresql://localhost:55432/shopademia_d6_disposable',
    );
    expect(runtimeEnvironment).not.toHaveProperty('MIGRATION_DATABASE_URL');
  });

  it('rejects storefront URLs that are not an exact origin', () => {
    expect(() => validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      STOREFRONT_ORIGIN: 'http://localhost:3000/path',
    })).toThrow('STOREFRONT_ORIGIN must be an HTTP or HTTPS origin without a path or trailing slash.');
  });

  it('requires an explicit HTTPS storefront origin in production', () => {
    const productionIdentity = {
      AUTH0_ISSUER_URL: 'https://tenant.example/',
      AUTH0_AUDIENCE: 'https://api.shopademia.example',
      REDIS_URL: 'rediss://cache.example:6380',
      SUPER_ADMIN_MFA_CLAIM: 'https://shopademia.example/claims/mfa_verified',
    };
    expect(() => validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      NODE_ENV: 'production',
      ...productionIdentity,
    })).toThrow('STOREFRONT_ORIGIN is required in production.');

    expect(() => validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      NODE_ENV: 'production',
      STOREFRONT_ORIGIN: 'http://shopademia.example',
      ...productionIdentity,
    })).toThrow('STOREFRONT_ORIGIN must use HTTPS in production.');

    expect(validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      NODE_ENV: 'production',
      STOREFRONT_ORIGIN: 'https://shopademia.example',
      ...productionIdentity,
    })).toMatchObject({
      STOREFRONT_ORIGIN: 'https://shopademia.example',
      AUTH0_ISSUER_URL: 'https://tenant.example/',
      AUTH0_AUDIENCE: 'https://api.shopademia.example',
      REDIS_URL: 'rediss://cache.example:6380',
      SUPER_ADMIN_MFA_CLAIM: 'https://shopademia.example/claims/mfa_verified',
    });
  });

  it('requires production Auth0, TLS Redis, and namespaced MFA claim configuration', () => {
    const base = {
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      NODE_ENV: 'production',
      STOREFRONT_ORIGIN: 'https://shopademia.example',
      AUTH0_ISSUER_URL: 'https://tenant.example/',
      AUTH0_AUDIENCE: 'https://api.shopademia.example',
      REDIS_URL: 'rediss://cache.example:6380',
      SUPER_ADMIN_MFA_CLAIM: 'https://shopademia.example/claims/mfa_verified',
    };

    for (const name of [
      'AUTH0_ISSUER_URL',
      'AUTH0_AUDIENCE',
      'REDIS_URL',
      'SUPER_ADMIN_MFA_CLAIM',
    ] as const) {
      const invalid: Record<string, string | undefined> = { ...base };
      delete invalid[name];
      expect(() => validateEnvironment(invalid)).toThrow(`${name} is required in production.`);
    }
    expect(() => validateEnvironment({ ...base, REDIS_URL: 'redis://cache.example:6379' }))
      .toThrow('REDIS_URL must use TLS (rediss) in production.');
    expect(() => validateEnvironment({ ...base, AUTH0_ISSUER_URL: 'http://tenant.example/' }))
      .toThrow('AUTH0_ISSUER_URL must use HTTPS without credentials, query, or fragment.');
    expect(() => validateEnvironment({ ...base, SUPER_ADMIN_MFA_CLAIM: 'mfa_verified' }))
      .toThrow('SUPER_ADMIN_MFA_CLAIM must be a valid HTTPS URL.');
  });

  it('keeps support disabled unless enablement and retention-policy approval are explicit', () => {
    const settings = {
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      SUPPORT_SMTP_HOST: 'smtp.example.test',
      SUPPORT_SMTP_PORT: '587',
      SUPPORT_SMTP_SECURE: 'false',
      SUPPORT_SMTP_USER: 'mailer',
      SUPPORT_SMTP_PASSWORD: 'test-password',
      SUPPORT_EMAIL_FROM: 'noreply@example.test',
      SUPPORT_EMAIL_TO: 'support@example.test',
      SUPPORT_TICKET_RETENTION_DAYS: '30',
    };

    expect(validateEnvironment(settings).SUPPORT_CONTACT).toBeUndefined();
    expect(() => validateEnvironment({
      ...settings,
      SUPPORT_CONTACT_ENABLED: 'true',
    })).toThrow(
      'SUPPORT_RETENTION_POLICY_APPROVED must be true before support contact can be enabled.',
    );
    expect(() => validateEnvironment({
      ...settings,
      SUPPORT_CONTACT_ENABLED: 'perhaps',
    })).toThrow('SUPPORT_CONTACT_ENABLED must be true or false.');
  });

  it('requires complete contact settings after support and retention approval are enabled', () => {
    expect(() => validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      SUPPORT_CONTACT_ENABLED: 'true',
      SUPPORT_RETENTION_POLICY_APPROVED: 'true',
      SUPPORT_SMTP_HOST: 'smtp.example.test',
    })).toThrow('SUPPORT_SMTP_PORT is required when support contact is enabled.');

    expect(validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      SUPPORT_CONTACT_ENABLED: 'true',
      SUPPORT_RETENTION_POLICY_APPROVED: 'true',
      SUPPORT_SMTP_HOST: 'smtp.example.test',
      SUPPORT_SMTP_PORT: '587',
      SUPPORT_SMTP_SECURE: 'false',
      SUPPORT_SMTP_USER: 'mailer',
      SUPPORT_SMTP_PASSWORD: 'test-password',
      SUPPORT_EMAIL_FROM: 'noreply@example.test',
      SUPPORT_EMAIL_TO: 'support@example.test',
      SUPPORT_TICKET_RETENTION_DAYS: '30',
    }).SUPPORT_CONTACT).toEqual({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      user: 'mailer',
      password: 'test-password',
      from: 'noreply@example.test',
      to: 'support@example.test',
      retentionDays: 30,
    });
  });
});
