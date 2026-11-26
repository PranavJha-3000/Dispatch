import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { startDispatcher } from "./modules/events/dispatcher.js";

const app = createApp();
const server = app.listen(config.port, () => logger.info(`Dispatch listening on :${config.port}`));
const stopDispatcher = startDispatcher();

const shutdown = () => {
  stopDispatcher();
  server.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
