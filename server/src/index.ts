import { buildApp } from './app.js';
import { config } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrations.js';
import { Realtime } from './realtime.js';

const db = createPool(config.databaseUrl);
await migrate(db, (m) => console.log(m));
const realtime = new Realtime(config.databaseUrl);
await realtime.start();
const app = await buildApp({ db, jwtSecret: config.jwtSecret, realtime, corsOrigins: config.corsOrigins, logLevel: config.logLevel, paymentsProvider: config.paymentsProvider });

const shutdown = async () => {
  await app.close();
  await realtime.stop();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
console.log(`API listening on http://${config.host}:${config.port}`);
