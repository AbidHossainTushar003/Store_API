const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const {
  MigrationConfigurationError,
  resolveMigrationDatabaseUrl,
} = require('./migration-config.cjs');

async function migrate() {
  const connectionString = resolveMigrationDatabaseUrl(process.env);
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    for (const migrationName of [
      '001-commerce.sql',
      '002-seller-applications.sql',
      '003-local-commerce.sql',
      '004-super-admin-security.sql',
      '005-seller-access.sql',
      '006-support-tickets.sql',
      '007-product-publication.sql',
      '008-seller-publication-suspension.sql',
    ]) {
      const migration = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'database', migrationName),
        'utf8',
      );
      await client.query(migration);
    }
    await client.query('COMMIT');
    console.log('Shopademia API schema is ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  if (error instanceof MigrationConfigurationError) {
    console.error(error.message);
  } else {
    console.error('Database migration failed. Database error details are withheld.');
  }
  process.exitCode = 1;
});
