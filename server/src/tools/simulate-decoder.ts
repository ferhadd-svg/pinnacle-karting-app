/**
 * Demo gateway with a simulated decoder.
 *   npm run simulate -- --key tdk_xxx --transponders T101,T102,T103 [--api http://localhost:3000] [--pace 45000] [--loop L1]
 */
import { parseArgs } from 'node:util';
import { runGateway } from '../gateway/index.js';
import { SimulatorAdapter } from '../gateway/simulator.js';

const { values } = parseArgs({
  options: {
    key: { type: 'string' },
    transponders: { type: 'string', default: 'T101,T102,T103,T104' },
    api: { type: 'string', default: 'http://localhost:3000' },
    pace: { type: 'string', default: '45000' },
    loop: { type: 'string', default: 'L1' },
    spool: { type: 'string', default: '.gateway-spool/events.jsonl' },
  },
});
if (!values.key) {
  console.error('--key <device api key> is required (printed by `npm run seed`)');
  process.exit(1);
}
const gw = await runGateway({
  apiUrl: values.api!,
  deviceKey: values.key,
  spoolFile: values.spool!,
  adapter: new SimulatorAdapter(values.transponders!.split(','), Number(values.pace), values.loop),
  log: (m) => console.log(new Date().toISOString(), m),
});
console.log('simulated decoder running; Ctrl+C to stop');
process.on('SIGINT', async () => {
  await gw.stop();
  process.exit(0);
});
