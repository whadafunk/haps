import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { config } from '../lib/config.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function migrate() {
  const pool = new Pool({ connectionString: config.DATABASE_URL })
  const db = drizzle(pool)
  await drizzleMigrate(db, { migrationsFolder: join(__dirname, 'migrations') })
  await pool.end()
}

// Allow running directly: tsx src/db/migrate.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => { console.log('Migrations applied.'); process.exit(0) })
    .catch((err) => { console.error(err); process.exit(1) })
}
