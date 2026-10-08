import { defineConfig } from 'drizzle-kit'

// Generates SQL migrations only; apply them with the `db:migrate:*` scripts, never
// `drizzle-kit push`. Timestamp prefixes sort every new migration after the baseline,
// drizzle/0001_initial_d1_schema.sql, which keeps the name the D1 ledgers already record.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  migrations: { prefix: 'timestamp' }
})
