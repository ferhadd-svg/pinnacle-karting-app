import { config } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrations.js';

const pool = createPool(config.databaseUrl);
await migrate(pool, console.log);
console.log('migrations up to date');
await pool.end();
