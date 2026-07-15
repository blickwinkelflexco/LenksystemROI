import { Pool } from "pg";

/**
 * Ein einzelner, über Hot-Reloads / Serverless-Invocations hinweg
 * wiederverwendeter Connection-Pool.
 */
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!connectionString) {
    throw new Error(
      "Keine Datenbank-Verbindung konfiguriert. Bitte POSTGRES_URL (oder DATABASE_URL) setzen.",
    );
  }

  // Managed-Postgres (Neon/Vercel/Supabase) erfordert SSL. `sslmode=require`
  // in der URL genügt normalerweise; wir setzen rejectUnauthorized locker,
  // weil viele Anbieter mit eigenem CA arbeiten.
  const needsSsl = !/localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
}

export function pool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = makePool();
  }
  return global.__pgPool;
}

export async function query<T = any>(
  text: string,
  params: any[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await pool().query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

/** Transaktions-Helfer: garantiert COMMIT/ROLLBACK und Client-Release. */
export async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

let schemaReady = false;

/**
 * Legt Tabellen an, falls noch nicht vorhanden. Idempotent und billig genug,
 * um vor Bedarf einmal pro Prozess aufgerufen zu werden.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS codes (
      id            SERIAL PRIMARY KEY,
      sheet_row     INTEGER,
      code_type     TEXT NOT NULL DEFAULT '',
      code          TEXT UNIQUE NOT NULL,
      status        TEXT NOT NULL DEFAULT 'available',
      customer_name TEXT,
      email         TEXT,
      order_date    TEXT,
      note          TEXT,
      reserved_by   TEXT,
      reserved_at   TIMESTAMPTZ,
      activated_by  TEXT,
      activated_at  TIMESTAMPTZ,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_codes_type_status ON codes (code_type, status);`);

  await query(`
    CREATE TABLE IF NOT EXISTS history (
      id            SERIAL PRIMARY KEY,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      employee      TEXT NOT NULL DEFAULT '',
      customer      TEXT NOT NULL DEFAULT '',
      code_type     TEXT NOT NULL DEFAULT '',
      code          TEXT NOT NULL DEFAULT '',
      sheet_row     INTEGER,
      action        TEXT NOT NULL DEFAULT 'issued',
      active        BOOLEAN NOT NULL DEFAULT true
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_history_created ON history (created_at DESC);`);

  await query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id            INTEGER PRIMARY KEY DEFAULT 1,
      last_sync_at  TIMESTAMPTZ,
      last_result   TEXT,
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);
  await query(`INSERT INTO sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);

  schemaReady = true;
}
