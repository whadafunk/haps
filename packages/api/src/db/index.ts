import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'
import { config } from '../lib/config.js'

const pool = new Pool({ connectionString: config.DATABASE_URL })
export const db = drizzle(pool, { schema })
