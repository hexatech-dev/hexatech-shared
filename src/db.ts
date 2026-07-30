import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";

/**
 * Neon-hosted databases (production) use the WebSocket-based serverless
 * driver: no per-invocation TCP/TLS handshake, safe under the concurrent,
 * short-lived connections a Vercel function makes. Anything else (local
 * Postgres in dev) uses plain node-postgres, since the Neon driver can only
 * reach Neon's own proxy, not a local server.
 */
export function isNeonUrl(databaseUrl: string): boolean {
  return /neon\.tech/.test(databaseUrl);
}

export interface CreateDbOptions<TSchema extends Record<string, unknown>> {
  databaseUrl: string;
  schema: TSchema;
  /** Forwarded to node-postgres when connecting to a non-Neon host. Default 30s — Neon-compatible poolers can take several seconds on first connect. */
  localConnectionTimeoutMillis?: number;
  /** Forwarded to Drizzle's own query logger. */
  logger?: boolean;
}

/**
 * Creates a Drizzle client that works against both Neon (production) and
 * plain Postgres (local dev) from the same `DATABASE_URL`, picking the driver
 * based on the URL's host. See `isNeonUrl`.
 */
export function createDb<TSchema extends Record<string, unknown>>(
  options: CreateDbOptions<TSchema>,
) {
  const {
    databaseUrl,
    schema,
    localConnectionTimeoutMillis = 30_000,
    logger,
  } = options;

  if (isNeonUrl(databaseUrl)) {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: databaseUrl });
    return { pool, db: drizzleNeon({ client: pool, schema, logger }) };
  }

  const pool = new PgPool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: localConnectionTimeoutMillis,
  });
  return { pool, db: drizzlePg(pool, { schema, logger }) };
}
