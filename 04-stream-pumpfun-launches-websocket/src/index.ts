/**
 * Pump.fun launch monitor over the Solana Tracker Datastream `latest` room.
 * - Live: keeps only messages that carry a Pump.fun bonding-curve pool (market "pumpfun").
 * - Backfill: on every (re)connect, reads GET /tokens/latest to cover the gap.
 * - Dedupe: one alert per mint per DEDUPE_MINUTES, shared by live and backfill.
 */
import { createDataApiClient, describeError, withRetry } from "./client.js";
import { createDatastream, onShutdown } from "./datastream.js";
import { datastreamUrl, fail, numberEnv, requireApiKey } from "./env.js";
import { compactUsd, short, time, usd } from "./format.js";
import { SeenMints, toLaunch, type Launch, type LaunchLike } from "./launches.js";

// Validate configuration before opening any connection.
requireApiKey();
datastreamUrl();
const MIN_LIQUIDITY_USD = numberEnv("MIN_LIQUIDITY_USD", 0);
const DEDUPE_MINUTES = numberEnv("DEDUPE_MINUTES", 30);
const BACKFILL_PAGES = numberEnv("BACKFILL_PAGES", 1);
if (MIN_LIQUIDITY_USD < 0) fail("MIN_LIQUIDITY_USD must be >= 0");
if (DEDUPE_MINUTES <= 0) fail("DEDUPE_MINUTES must be > 0");
if (!Number.isInteger(BACKFILL_PAGES) || BACKFILL_PAGES < 0 || BACKFILL_PAGES > 10) {
  fail("BACKFILL_PAGES must be an integer from 0 to 10 (GET /tokens/latest serves pages 1-10)");
}

const client = createDataApiClient();
const ds = createDatastream();
const seen = new SeenMints(DEDUPE_MINUTES * 60_000);
const stats = { live: 0, backfill: 0, filtered: 0, duplicates: 0 };

const COLUMNS = ["Time", "Src", "Symbol", "Mint", "Curve", "Liquidity", "MCap", "Risk", "Creator"];
const WIDTHS = [8, 4, 12, 11, 6, 10, 8, 5, 11];
const row = (cells: string[]) => cells.map((c, i) => c.slice(0, WIDTHS[i]).padEnd(WIDTHS[i] ?? 0)).join("  ").trimEnd();

function report(launch: Launch, source: "live" | "rest"): void {
  const liquidity = launch.pool.liquidity?.usd;
  if ((liquidity ?? 0) < MIN_LIQUIDITY_USD) {
    stats.filtered++;
    return;
  }
  if (!seen.firstSighting(launch.mint)) {
    stats.duplicates++;
    return;
  }
  stats[source === "live" ? "live" : "backfill"]++;
  console.log(
    row([
      time(source === "live" ? Date.now() : launch.createdAtMs),
      source,
      launch.symbol,
      short(launch.mint),
      typeof launch.pool.curvePercentage === "number" ? `${launch.pool.curvePercentage.toFixed(0)}%` : "n/a",
      usd(liquidity),
      compactUsd(launch.pool.marketCap?.usd),
      launch.riskScore === undefined ? "n/a" : `${launch.riskScore}/10`,
      short(launch.creator),
    ]),
  );
}

function handle(item: LaunchLike, source: "live" | "rest"): void {
  const launch = toLaunch(item);
  if (launch) report(launch, source);
}

// A rejected key or a flapping network can reconnect every second; do not hit REST each time.
const BACKFILL_MIN_INTERVAL_MS = 15_000;
let backfillRunning = false;
let lastBackfillAt = 0;
async function backfill(): Promise<void> {
  if (BACKFILL_PAGES === 0 || backfillRunning) return;
  if (Date.now() - lastBackfillAt < BACKFILL_MIN_INTERVAL_MS) return;
  backfillRunning = true;
  lastBackfillAt = Date.now();
  try {
    const rows: LaunchLike[] = [];
    for (let page = 1; page <= BACKFILL_PAGES; page++) {
      rows.push(...(await withRetry(`GET /tokens/latest?page=${page}`, () => client.getLatestTokens(page))));
    }
    const launches = rows
      .map((item) => toLaunch(item))
      .filter((launch): launch is Launch => launch !== undefined)
      .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
    console.log(`[backfill] ${launches.length} Pump.fun launches in ${rows.length} latest tokens`);
    for (const launch of launches) report(launch, "rest");
  } catch (error) {
    // Backfill is best effort: keep streaming even if REST is unavailable.
    console.warn(`[backfill] skipped: ${describeError(error)}`);
  } finally {
    backfillRunning = false;
  }
}

// "connected" fires on the first connect and after every automatic reconnect.
ds.on("connected", () => void backfill());

console.log(`Watching Pump.fun launches (min liquidity ${usd(MIN_LIQUIDITY_USD)}, dedupe ${DEDUPE_MINUTES} min). Ctrl+C to stop.\n`);
console.log(row(COLUMNS));
console.log(WIDTHS.map((w) => "-".repeat(w)).join("  "));

// Subscribing opens the connection; the SDK rejoins this room after reconnects.
const listener = ds.subscribe.latest().on((item) => handle(item, "live"));

onShutdown(() => {
  listener.unsubscribe();
  ds.disconnect();
  console.log(
    `\nStopped. live ${stats.live}, backfill ${stats.backfill}, below liquidity ${stats.filtered}, duplicates ${stats.duplicates}`,
  );
});
