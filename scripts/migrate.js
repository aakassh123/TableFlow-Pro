import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function migrate() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_db';
    console.log('Connecting to database:', connectionString.replace(/:[^:]+@/, ':****@'));

    const pool = new Pool({ connectionString });
    const client = await pool.connect();

    try {
        console.log('Creating schema_migrations tracking table if not exists...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                version VARCHAR(100) NOT NULL UNIQUE,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
        console.log(`Found ${migrationFiles.length} migration file(s).`);

        for (const file of migrationFiles) {
            const checkRes = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
            if (checkRes.rows.length > 0) {
                console.log(`[SKIP] Migration already applied: ${file}`);
                continue;
            }

            console.log(`[RUN] Applying migration: ${file}...`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`  ✓ Applied: ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  ✗ Error in ${file}:`, err.message);
                throw err;
            }
        }

        console.log('\nAll migrations completed successfully.');
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
