import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('uses the exact local storefront origin by default', () => {
    expect(validateEnvironment({
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
    })).toEqual({
      PORT: 3001,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/shopademia',
      STOREFRONT_ORIGIN: 'http://localhost:3000',
    });
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
});
