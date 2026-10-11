import { randomUUID } from 'node:crypto';
import type { GatewayEvent, TimingAdapter } from './types.js';

/**
 * Simulated decoder for demos and soak tests: karts lap at a given pace with noise, plus
 * occasional duplicate reads. Timestamps are real wall-clock time (no fast-forward), so for a quick
 * demo use a short pace together with a matching session minLapUs rule.
 * Not a real protocol — real adapters replace this class.
 */
export class SimulatorAdapter implements TimingAdapter {
  readonly name = 'simulator';
  private timers: NodeJS.Timeout[] = [];
  private seq = 0;
  private bootId = randomUUID().slice(0, 8);

  constructor(
    private transponders: string[],
    private paceMs = 60_000,
    /** The decoder's loop id for the start/finish line, as mapped in the track's timing loops. */
    private loopCode = 'L1',
  ) {}

  async start(emit: (e: GatewayEvent) => void) {
    this.transponders.forEach((tx, i) => {
      const pace = this.paceMs * (1 + i * 0.012);
      const lap = () => {
        const nowUs = Date.now() * 1000;
        const event = (dt = 0): GatewayEvent => {
          const sequence = ++this.seq;
          return { eventKey: `${this.bootId}:${sequence}`, sequence, transponder: tx, loop: this.loopCode, timestamp: nowUs + dt };
        };
        emit(event());
        if (Math.random() < 0.05) emit(event(40_000)); // duplicate read 40 ms later
        const next = pace * (0.98 + Math.random() * 0.05);
        this.timers.push(setTimeout(lap, next));
      };
      this.timers.push(setTimeout(lap, 2000 + i * 900));
    });
  }

  async stop() {
    this.timers.forEach(clearTimeout);
  }

  clockOffsetUs() {
    return 0;
  }
}
