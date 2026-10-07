import Client, { CommitmentLevel, type SubscribeRequest, type SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { requireEnv } from "./env.js";

export { CommitmentLevel };

/** A complete SubscribeRequest with every filter map present. Writing a request replaces the previous one. */
export function emptyRequest(): SubscribeRequest {
  return {
    accounts: {},
    slots: {},
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    blockFooter: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.PROCESSED,
  };
}

export type StreamOptions = {
  request: SubscribeRequest;
  onUpdate: (update: SubscribeUpdate) => void;
  /** Called after every successful (re)subscribe; use it to backfill what the stream may have missed. */
  onConnect?: (reconnect: boolean) => void;
  maxBackoffMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connects, subscribes, and keeps the stream alive.
 * Answers server pings, reconnects with capped exponential backoff plus jitter,
 * and re-sends the full request on every reconnect. `done` resolves after stop().
 * `update()` swaps the whole filter set on the live stream and on every later reconnect.
 */
export function runStream(options: StreamOptions): {
  stop: () => void;
  update: (next: SubscribeRequest) => void;
  done: Promise<void>;
} {
  const endpoint = requireEnv("YELLOWSTONE_GRPC_ENDPOINT", "Yellowstone gRPC dashboard");
  const token = requireEnv("YELLOWSTONE_GRPC_TOKEN", "x-token from the same dashboard");
  const { onUpdate, onConnect, maxBackoffMs = 30_000 } = options;
  let request = options.request;

  let stopped = false;
  let current: Awaited<ReturnType<Client["subscribe"]>> | undefined;

  const consume = (stream: NonNullable<typeof current>, onHealthy: () => void, onSubscribed: () => void) =>
    new Promise<void>((resolve, reject) => {
      const finish = (err?: Error) => {
        stream.removeAllListeners();
        if (current === stream) current = undefined;
        // A dying stream can emit a second error; without a listener Node treats it as uncaught.
        stream.on("error", () => {});
        if (err && !stopped) reject(err);
        else resolve();
      };
      stream.on("data", (update: SubscribeUpdate) => {
        onHealthy();
        if (update.ping) {
          // The server pings idle streams; answer or the connection is dropped.
          stream.write({ ...emptyRequest(), ping: { id: 1 } }, (err: Error | null | undefined) => {
            if (err) console.warn(`[grpc] ping reply failed: ${err.message}`);
          });
          return;
        }
        if (update.pong) return;
        try {
          onUpdate(update);
        } catch (err) {
          console.error("[grpc] handler error:", err instanceof Error ? err.message : err);
        }
      });
      stream.on("error", (err: Error) => finish(err));
      stream.on("end", () => finish(stopped ? undefined : new Error("stream ended by server")));
      stream.on("close", () => finish(stopped ? undefined : new Error("stream closed")));
      stream.write(request, (err: Error | null | undefined) => {
        if (err) finish(err);
        else onSubscribed();
      });
    });

  let connections = 0;
  const done = (async () => {
    let attempt = 0;
    while (!stopped) {
      try {
        const client = new Client(endpoint, token, undefined);
        await client.connect();
        const stream = await client.subscribe();
        current = stream;
        console.log(attempt === 0 ? "[grpc] connected" : `[grpc] reconnected after ${attempt} attempt(s)`);
        await consume(
          stream,
          () => {
            attempt = 0; // healthy stream: reset backoff
          },
          () => onConnect?.(connections++ > 0),
        );
      } catch (err) {
        if (stopped) break;
        attempt++;
        const delay = Math.min(maxBackoffMs, 500 * 2 ** (attempt - 1)) * (0.5 + Math.random() / 2);
        console.warn(`[grpc] ${err instanceof Error ? err.message : err}; reconnecting in ${Math.round(delay)} ms`);
        await sleep(delay);
      }
    }
  })();

  return {
    update: (next) => {
      request = next;
      current?.write(next, (err: Error | null | undefined) => {
        if (err) console.warn(`[grpc] filter update failed: ${err.message}`);
      });
    },
    stop: () => {
      stopped = true;
      current?.end();
      current?.destroy();
    },
    done,
  };
}
