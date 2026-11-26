import { startEmbedded } from "./embedded.js";

// Local dev database: `npm run dev:db` (keeps running until Ctrl+C).
const pg = await startEmbedded({ dir: ".pgdata", port: 5433, databases: ["dispatch"] });
console.log("Postgres ready: postgresql://postgres:postgres@localhost:5433/dispatch");
process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});
