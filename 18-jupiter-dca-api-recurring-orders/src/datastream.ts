import { Datastream } from "@solana-tracker/data-api";
import { datastreamUrl } from "./env.js";

/**
 * Creates a Datastream client with capped exponential reconnect backoff.
 * The SDK reconnects on its own and rejoins every subscribed room; these events only report it.
 * Never log the URL: it contains your Datastream key.
 */
export function createDatastream(): Datastream {
  const ds = new Datastream({
    wsUrl: datastreamUrl(),
    autoReconnect: true,
    reconnectDelay: 1_000,
    reconnectDelayMax: 30_000,
    randomizationFactor: 0.5,
  });
  ds.on("connected", () => console.log("[datastream] connected"));
  ds.on("disconnected", (socket: string) => console.warn(`[datastream] disconnected (${socket})`));
  ds.on("reconnecting", (attempt: number) => console.warn(`[datastream] reconnecting, attempt ${attempt + 1}`));
  ds.on("error", () => console.error("[datastream] connection error (check ST_DATASTREAM_KEY and plan access)"));
  return ds;
}

/** Runs cleanup once on Ctrl+C / SIGTERM, then exits. */
export function onShutdown(cleanup: () => void | Promise<void>): void {
  let closing = false;
  const handler = async () => {
    if (closing) return;
    closing = true;
    try {
      await cleanup();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
}
