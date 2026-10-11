import { Spool } from './spool.js';
import type { TimingAdapter } from './types.js';
import { Uploader } from './uploader.js';

export interface GatewayOptions {
  apiUrl: string;
  deviceKey: string;
  spoolFile: string;
  adapter: TimingAdapter;
  log?: (msg: string) => void;
}

/** Runs one adapter → durable spool → uploader, plus a heartbeat with the decoder clock offset. */
export async function runGateway(o: GatewayOptions) {
  const spool = new Spool(o.spoolFile);
  const backlog = await spool.open();
  if (backlog) o.log?.(`resuming with ${backlog} unsent events from spool`);
  const uploader = new Uploader(spool, { apiUrl: o.apiUrl, deviceKey: o.deviceKey, log: o.log });
  const uploading = uploader.run();

  await o.adapter.start((e) => {
    void spool.push(e).then(() => uploader.notify());
  });

  const heartbeat = setInterval(() => {
    fetch(`${o.apiUrl}/v1/timing/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-key': o.deviceKey },
      body: JSON.stringify({ clockOffsetUs: o.adapter.clockOffsetUs?.() ?? undefined }),
    }).catch(() => {});
  }, 5000);

  return {
    spool,
    stop: async () => {
      clearInterval(heartbeat);
      await o.adapter.stop();
      uploader.stop();
      await uploading;
    },
  };
}
