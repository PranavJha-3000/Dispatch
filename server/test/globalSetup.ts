import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { startEmbedded } from "../scripts/embedded.js";

// Real Postgres for tests: DATABASE_URL_TEST if provided (CI/Docker), else an embedded instance.
export default async function setup() {
  let stop: (() => Promise<void>) | undefined;
  let url = process.env.DATABASE_URL_TEST;
  if (!url) {
    const dir = ".pgdata-test";
    rmSync(dir, { recursive: true, force: true });
    const pg = await startEmbedded({ dir, port: 5434, databases: ["dispatch_test"] });
    stop = () => pg.stop();
    url = "postgresql://postgres:postgres@localhost:5434/dispatch_test";
  }
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });
  return async () => {
    await stop?.();
  };
}
