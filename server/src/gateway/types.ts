/** A passing as the gateway forwards it to POST /v1/timing/events. */
export interface GatewayEvent {
  /** Unique per device across restarts, e.g. `${bootId}:${decoderSequence}` or the vendor's passing id. */
  eventKey: string;
  sequence?: number;
  transponder: string;
  loop: string;
  /** Epoch microseconds in the decoder's clock. */
  timestamp: number;
  sourceStatus?: string;
  raw?: Record<string, unknown>;
}

/**
 * One implementation per timing provider. Adapters translate the vendor's protocol (TCP/serial/
 * WebSocket/API/file) into GatewayEvents. They must not compute laps — the server does that from
 * the raw events, so every adapter gets the same lap logic.
 */
export interface TimingAdapter {
  readonly name: string;
  start(emit: (e: GatewayEvent) => void): Promise<void>;
  stop(): Promise<void>;
  /** Decoder clock minus local clock in µs, if the protocol exposes the decoder time. */
  clockOffsetUs?(): number | null;
}
