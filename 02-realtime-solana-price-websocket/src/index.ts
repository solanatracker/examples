import type { Datastream, PriceUpdate } from "@solana-tracker/data-api";
import { createDataApiClient, describeError, withRetry } from "./client.js";
import { createDatastream, onShutdown } from "./datastream.js";
import { datastreamUrl, fail, numberEnv, optionalEnv, requireApiKey } from "./env.js";
import { compactUsd, pct, short, time, usd } from "./format.js";

/** The SDK does not export the aggregated payload type, so derive it from the subscription. */
type AggregatedPriceUpdate = Parameters<
  Parameters<ReturnType<Datastream["subscribe"]["price"]["aggregated"]>["on"]>[0]
>[0];

const SOL = "So11111111111111111111111111111111111111112";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function parseAddress(name: string, fallback?: string): string | undefined {
  const value = optionalEnv(name) ?? fallback;
  if (value !== undefined && !BASE58.test(value)) fail(`${name} is not a valid base58 address: "${value}"`);
  return value;
}

/** Prints at most one line per interval; the newest pending value wins. */
function throttle<T>(intervalMs: number, print: (value: T) => void): (value: T, force?: boolean) => void {
  let lastAt = 0;
  let pending: T | undefined;
  let timer: NodeJS.Timeout | undefined;
  return (value, force = false) => {
    const wait = intervalMs - (Date.now() - lastAt);
    if (force || wait <= 0) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
      lastAt = Date.now();
      print(value);
      return;
    }
    pending = value;
    timer ??= setTimeout(() => {
      timer = undefined;
      if (pending === undefined) return;
      lastAt = Date.now();
      print(pending);
      pending = undefined;
    }, wait);
  };
}

type Tick = {
  source: "stream" | "rest";
  /** Server-side timestamp in ms; used to drop out-of-order or older values. */
  at: number;
  price: number;
  median?: number;
  min?: number;
  max?: number;
  poolCount?: number;
  pool?: string;
  liquidity?: number;
};

function main(): void {
  // Validate every input before opening sockets.
  datastreamUrl();
  requireApiKey();
  const mint = parseAddress("TOKEN_MINT", SOL) as string;
  const poolAddress = parseAddress("POOL_ADDRESS");
  const staleAfterMs = numberEnv("STALE_AFTER_SECONDS", 30) * 1000;
  const printEveryMs = numberEnv("PRINT_INTERVAL_MS", 1000);

  const client = createDataApiClient();
  const ds = createDatastream();

  let last: Tick | undefined;
  let lastMessageAt = Date.now();
  let connectedOnce = false;
  let snapshotInFlight = false;
  let staleWarned = false;
  let ticks = 0;
  let dropped = 0;

  const printTick = throttle<Tick>(printEveryMs, (t) => {
    const range = t.min !== undefined && t.max !== undefined ? `${usd(t.min)} to ${usd(t.max)}` : "n/a";
    const spread = t.min !== undefined && t.max !== undefined && t.median ? pct(((t.max - t.min) / t.median) * 100, 2) : "";
    const pools = t.poolCount !== undefined ? `${t.poolCount} pools` : "";
    const extra = t.source === "rest" ? `liquidity ${compactUsd(t.liquidity)}` : `${pools}, range ${range} ${spread}`;
    console.log(`${time(t.at)}  ${t.source.padEnd(6)}  median ${usd(t.median ?? t.price).padEnd(12)}  primary ${usd(t.price).padEnd(12)}  ${extra}`);
  });

  /** Keeps only the newest value; streams and snapshots can arrive out of order around reconnects. */
  function accept(t: Tick, force = false): boolean {
    if (last && t.at < last.at) {
      dropped++;
      return false;
    }
    last = t;
    printTick(t, force);
    return true;
  }

  async function snapshot(reason: string): Promise<void> {
    if (snapshotInFlight) return;
    snapshotInFlight = true;
    try {
      const p = await withRetry("getPrice", () => client.getPrice(mint), { attempts: 3, timeoutMs: 10_000 });
      if (!Number.isFinite(p.price)) {
        console.warn(`[rest] no price for ${short(mint)} (${reason})`);
        return;
      }
      const applied = accept({ source: "rest", at: p.lastUpdated || Date.now(), price: p.price, liquidity: p.liquidity }, true);
      if (!applied) console.log(`[rest] ${reason} snapshot is older than the last streamed value; keeping the stream value`);
    } catch (error) {
      console.warn(`[rest] snapshot failed (${reason}): ${describeError(error)}`);
    } finally {
      snapshotInFlight = false;
    }
  }

  // 'connected' fires on the first connect and after every reconnect. The SDK has already
  // rejoined the rooms; the snapshot covers whatever changed while the socket was down.
  ds.on("connected", () => {
    void snapshot(connectedOnce ? "reconnect" : "initial");
    connectedOnce = true;
  });

  const aggregated = ds.subscribe.price.aggregated(mint);
  const aggregatedListener = aggregated.on((u: AggregatedPriceUpdate) => {
    lastMessageAt = Date.now();
    staleWarned = false;
    ticks++;
    const a = u.aggregated;
    if (!a || !Number.isFinite(a.median)) return;
    accept({
      source: "stream",
      at: u.timestamp || Date.now(),
      price: u.price,
      median: a.median,
      min: a.min,
      max: a.max,
      poolCount: a.poolCount,
      pool: u.pool,
    });
  });

  let poolRoom: string | undefined;
  let poolListener: { unsubscribe: () => void } | undefined;
  if (poolAddress) {
    const sub = ds.subscribe.price.pool(poolAddress);
    poolRoom = sub.room;
    const printPool = throttle<PriceUpdate>(printEveryMs, (u) =>
      console.log(`${time(u.time)}  pool    ${short(u.pool)}  ${usd(u.price).padEnd(12)}  quote ${u.price_quote}`),
    );
    poolListener = sub.on((u: PriceUpdate) => {
      lastMessageAt = Date.now();
      if (Number.isFinite(u.price)) printPool(u);
    });
  }

  console.log(`\nStreaming ${aggregated.room}${poolRoom ? ` and ${poolRoom}` : ""}. Ctrl+C to stop.\n`);

  // Watchdog: a silent socket and a quiet token look the same, so refresh over REST instead of guessing.
  const watchdog = setInterval(() => {
    const silentFor = Date.now() - lastMessageAt;
    if (!connectedOnce && silentFor > 20_000 && !staleWarned) {
      staleWarned = true;
      console.warn("Not connected after 20s: check ST_DATASTREAM_KEY and that your plan includes Datastream (Premium or higher).");
      return;
    }
    if (connectedOnce && silentFor > staleAfterMs && !staleWarned) {
      staleWarned = true;
      console.warn(`No price update for ${Math.round(silentFor / 1000)}s (quiet token or stalled socket); refreshing over REST.`);
      void snapshot("stale");
    }
  }, 5_000);

  onShutdown(() => {
    clearInterval(watchdog);
    aggregatedListener.unsubscribe();
    poolListener?.unsubscribe();
    ds.unsubscribe(aggregated.room);
    if (poolRoom) ds.unsubscribe(poolRoom);
    // disconnect() closes the sockets; onShutdown then exits the process, which also stops auto-reconnect.
    ds.disconnect();
    console.log(`\nStopped. ${ticks} aggregated update(s), ${dropped} out-of-order value(s) dropped, last ${usd(last?.median ?? last?.price)}.`);
  });
}

main();
