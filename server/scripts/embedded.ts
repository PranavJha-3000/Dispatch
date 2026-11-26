import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

// Real Postgres binaries for local dev/test when Docker is unavailable.
export async function startEmbedded(opts: { dir: string; port: number; databases: string[] }) {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dir,
    user: "postgres",
    password: "postgres",
    port: opts.port,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(`${opts.dir}/PG_VERSION`)) await pg.initialise();
  await pg.start();
  for (const db of opts.databases) {
    try {
      await pg.createDatabase(db);
    } catch {
      /* already exists */
    }
  }
  return pg;
}
