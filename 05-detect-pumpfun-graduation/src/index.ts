/**
 * Pump.fun graduation monitor.
 * - `pumpfun:curve:{CURVE_THRESHOLD}` room: tokens crossing a bonding-curve threshold go on a watchlist.
 * - `graduated` room: migrations from every launchpad, filtered to Pump.fun.
 * - GET /tokens/multi/graduated: snapshot on start and gap fill after every reconnect.
 */
import { createDataApiClient, describeError, withRetry } from "./client.js";
import { createDatastream, onShutdown } from "./datastream.js";
import { datastreamUrl, fail, numberEnv, optionalEnv, requireApiKey } from "./env.js";
import { compactUsd, short, time } from "./format.js";
import { curvePool, destinationPool, duration, pumpfunEvidence, type TokenLike, type Watch } from "./lifecycle.js";

requireApiKey();
datastreamUrl();
const CURVE_THRESHOLD = numberEnv("CURVE_THRESHOLD", 90);
const BACKFILL_LIMIT = numberEnv("BACKFILL_LIMIT", 50);
const WATCH_TTL_HOURS = numberEnv("WATCH_TTL_HOURS", 6);
const REDUCE_SPAM = (optionalEnv("REDUCE_SPAM") ?? "true").toLowerCase() !== "false";
if (!Number.isInteger(CURVE_THRESHOLD) || CURVE_THRESHOLD < 1 || CURVE_THRESHOLD > 100) {
  fail("CURVE_THRESHOLD must be an integer from 1 to 100");
}
if (!Number.isInteger(BACKFILL_LIMIT) || BACKFILL_LIMIT < 0 || BACKFILL_LIMIT > 500) {
  fail("BACKFILL_LIMIT must be an integer from 0 to 500 (0 disables the REST gap fill)");
}
if (WATCH_TTL_HOURS <= 0) fail("WATCH_TTL_HOURS must be > 0");

const client = createDataApiClient();
const ds = createDatastream();

/** Mints that crossed the curve threshold and have not graduated yet. */
const watchlist = new Map<string, Watch>();
/** Mints already reported as graduated (insertion ordered, capped). */
const graduated = new Set<string>();
const stats = { curve: 0, graduated: 0, watchedThenGraduated: 0, ignoredOtherLaunchpads: 0 };

const WIDTHS = [8, 11, 12, 11];
function line(event: string, symbol: string, mint: string, detail: string, at = Date.now()): void {
  const cells = [time(at), event, symbol || "?", short(mint)];
  console.log([...cells.map((c, i) => c.slice(0, WIDTHS[i]).padEnd(WIDTHS[i] ?? 0)), detail].join("  "));
}

function markGraduated(mint: string): boolean {
  if (graduated.has(mint)) return false;
  graduated.add(mint);
  if (graduated.size > 20_000) graduated.delete(graduated.values().next().value as string);
  return true;
}

function onCurve(item: TokenLike): void {
  const mint = item.token?.mint;
  if (!mint || graduated.has(mint) || watchlist.has(mint)) return;
  const pool = curvePool(item);
  watchlist.set(mint, { symbol: item.token.symbol, curvePercent: pool?.curvePercentage, seenAt: Date.now() });
  stats.curve++;
  const curve = typeof pool?.curvePercentage === "number" ? `${pool.curvePercentage.toFixed(1)}%` : "n/a";
  line(`CURVE>=${CURVE_THRESHOLD}`, item.token.symbol, mint, `curve ${curve}  mcap ${compactUsd(pool?.marketCap?.usd)}  liq ${compactUsd(pool?.liquidity?.usd)}`);
}

function onGraduated(item: TokenLike, source: "live" | "rest"): void {
  const mint = item.token?.mint;
  if (!mint) return;
  const evidence = pumpfunEvidence(item, watchlist);
  if (!evidence) {
    stats.ignoredOtherLaunchpads++;
    return;
  }
  if (!markGraduated(mint)) return;
  stats.graduated++;
  const watched = watchlist.get(mint);
  watchlist.delete(mint);
  if (watched) stats.watchedThenGraduated++;
  const dest = destinationPool(item);
  const destText = dest ? `-> ${dest.market} ${short(dest.poolId)} liq ${compactUsd(dest.liquidity?.usd)}` : "-> pool n/a";
  const why = watched ? `watched ${duration(Date.now() - watched.seenAt)}` : `via ${evidence}`;
  line(source === "live" ? "GRADUATED" : "GRAD (rest)", item.token.symbol, mint, `${destText}  ${why}`);
}

function pruneWatchlist(): void {
  const cutoff = Date.now() - WATCH_TTL_HOURS * 3_600_000;
  for (const [mint, watch] of watchlist) if (watch.seenAt < cutoff) watchlist.delete(mint);
}
const pruneTimer = setInterval(pruneWatchlist, 60_000);

const GAP_FILL_MIN_INTERVAL_MS = 15_000;
let gapFillRunning = false;
let lastGapFillAt = 0;
async function gapFill(): Promise<void> {
  if (BACKFILL_LIMIT === 0 || gapFillRunning || Date.now() - lastGapFillAt < GAP_FILL_MIN_INTERVAL_MS) return;
  gapFillRunning = true;
  lastGapFillAt = Date.now();
  try {
    const rows = await withRetry("GET /tokens/multi/graduated", () =>
      client.getGraduatedTokens({ limit: BACKFILL_LIMIT, reduceSpam: REDUCE_SPAM }),
    );
    const before = stats.graduated;
    // Rows carry no graduation timestamp; the time column shows when we observed them.
    for (const item of rows) onGraduated(item, "rest");
    console.log(`[rest] ${rows.length} recent graduations checked, ${stats.graduated - before} new Pump.fun rows`);
  } catch (error) {
    console.warn(`[rest] gap fill skipped: ${describeError(error)}`);
  } finally {
    gapFillRunning = false;
  }
}

// Fires on the first connect and after every automatic reconnect.
ds.on("connected", () => void gapFill());

console.log(`Pump.fun graduation monitor: curve alerts at ${CURVE_THRESHOLD}%, REST gap fill ${BACKFILL_LIMIT} rows. Ctrl+C to stop.\n`);

const curveListener = ds.subscribe.curvePercentage("pumpfun", CURVE_THRESHOLD).on((item) => onCurve(item));
const graduatedListener = ds.subscribe.graduated().on((item) => onGraduated(item, "live"));

onShutdown(() => {
  clearInterval(pruneTimer);
  curveListener.unsubscribe();
  graduatedListener.unsubscribe();
  ds.disconnect();
  console.log(
    `\nStopped. curve alerts ${stats.curve}, Pump.fun graduations ${stats.graduated} (${stats.watchedThenGraduated} from watchlist), other launchpads ignored ${stats.ignoredOtherLaunchpads}, still watching ${watchlist.size}`,
  );
});
