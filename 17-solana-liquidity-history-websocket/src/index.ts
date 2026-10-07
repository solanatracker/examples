import type { LiquidityEvent, LiquidityUpdate } from "@solana-tracker/data-api";
import { createDataApiClient, describeError, run, withRetry } from "./client.js";
import { createDatastream, onShutdown } from "./datastream.js";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { short, table, time } from "./format.js";
import { KeyBag, dateTime, describeTokens, formatRaw, isAddress, label, matchKey, netFlow } from "./liquidity.js";

// ---- Configuration ---------------------------------------------------------
const client = createDataApiClient(); // validates ST_API_KEY first
const mint = optionalEnv("TOKEN_MINT") ?? "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN";
const pool = optionalEnv("POOL_ADDRESS");
const pages = numberEnv("HISTORY_PAGES", 3);
const pageLimit = numberEnv("PAGE_LIMIT", 100);
const enrich = optionalEnv("ENRICH_IDENTITY") === "true";
const reconcileSeconds = numberEnv("RECONCILE_INTERVAL_SECONDS", 60);
const staleMinutes = numberEnv("PROVISIONAL_TTL_MINUTES", 5);

if (!isAddress(mint)) fail(`TOKEN_MINT is not a valid Solana address: "${mint}"`);
if (pool && !isAddress(pool)) fail(`POOL_ADDRESS is not a valid Solana address: "${pool}"`);
if (!Number.isInteger(pages) || pages < 1 || pages > 20) fail("HISTORY_PAGES must be an integer from 1 to 20");
if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 500) fail("PAGE_LIMIT must be an integer from 1 to 500");
if (reconcileSeconds < 10) fail("RECONCILE_INTERVAL_SECONDS must be at least 10");
if (staleMinutes <= 0) fail("PROVISIONAL_TTL_MINUTES must be greater than 0");

type Cursor = number | string | undefined;

/** One page of liquidity-only history, newest first, for the token or token+pool scope. */
function fetchPage(cursor: Cursor, limit = pageLimit) {
  // Undefined options are omitted from the query string by the SDK.
  const params = {
    events: "liquidity",
    sortDirection: "DESC",
    limit,
    enrich: enrich ? "identity" : undefined,
    cursor,
  } as const;
  return withRetry("liquidity history", () =>
    pool ? client.getPoolTradeHistory(mint, pool, params) : client.getTokenTradeHistory(mint, params),
  );
}

// ---- 1. Backfill -----------------------------------------------------------
async function backfill(): Promise<LiquidityEvent[]> {
  const events: LiquidityEvent[] = [];
  let cursor: Cursor;
  for (let page = 1; page <= pages; page++) {
    const res = await fetchPage(cursor);
    events.push(...res.trades);
    // nextCursor is an opaque string for liquidity feeds. Pass it back unchanged;
    // check for null/undefined explicitly (a numeric cursor could be 0).
    if (!res.hasNextPage || res.nextCursor === null || res.nextCursor === undefined) break;
    cursor = res.nextCursor;
  }
  return events;
}

function printBackfill(events: LiquidityEvent[]): void {
  const scope = pool ? `${short(mint)} in pool ${short(pool)}` : short(mint);
  console.log(`\nLiquidity history for ${scope} (newest first)\n`);
  table(
    ["Time (UTC)", "Action", "Program", "Pool", "Provider", "Tokens"],
    events.slice(0, 25).map((e) => [
      dateTime(e.time),
      e.type === "add_liquidity" ? "ADD" : "REMOVE",
      e.program,
      short(e.pool),
      label(e),
      describeTokens(e),
    ]),
  );
  if (events.length > 25) console.log(`… ${events.length - 25} more rows not shown`);

  const adds = events.filter((e) => e.type === "add_liquidity").length;
  console.log(`\nBackfill: ${events.length} liquidity events (${adds} adds, ${events.length - adds} removes)`);
  const flow = netFlow(events);
  if (flow.size > 0) {
    console.log("Net token flow into pools over this window (exact, from amountRaw):");
    for (const [address, { raw, decimals }] of flow) console.log(`  ${short(address)}  ${formatRaw(raw, decimals)}`);
  }
}

// ---- 2. Stream + reconcile -------------------------------------------------
type Provisional = { event: LiquidityUpdate; key: string; seenAt: number };

async function stream(): Promise<void> {
  const ds = createDatastream();
  const options = enrich ? { enriched: true } : undefined;
  const sub = pool ? ds.subscribe.liquidity.tokenPool(mint, pool, options) : ds.subscribe.liquidity.token(mint, options);
  const pending: Provisional[] = [];
  let reconciling = false;

  const listener = sub.on((event) => {
    pending.push({ event, key: matchKey(event), seenAt: Date.now() });
    const partial = event.identityStatus === "partial" ? " (identity partial)" : "";
    console.log(
      `${time(event.time)}  LIVE ${event.type === "add_liquidity" ? "ADD   " : "REMOVE"}  ${event.program.padEnd(12)} ` +
        `pool ${short(event.pool)}  by ${label(event)}${partial}  ${describeTokens(event)}  [provisional]`,
    );
  });

  // Live LP events are provisional (processed commitment) and there is no rollback message.
  // Periodically, and after every reconnect, compare them with confirmed REST history.
  async function reconcile(reason: string): Promise<void> {
    if (reconciling || pending.length === 0) return;
    reconciling = true;
    try {
      const oldest = Math.min(...pending.map((p) => p.event.time));
      const confirmed = new KeyBag();
      let cursor: Cursor;
      for (let page = 0; page < 5; page++) {
        const res = await fetchPage(cursor, 200);
        for (const row of res.trades) confirmed.add(matchKey(row));
        const last = res.trades.at(-1);
        // Stop once the page is older than the oldest provisional event (2 min margin for clock differences).
        if (!last || last.time < oldest - 120_000) break;
        if (!res.hasNextPage || res.nextCursor === null || res.nextCursor === undefined) break;
        cursor = res.nextCursor;
      }
      let matched = 0;
      let expired = 0;
      for (let i = pending.length - 1; i >= 0; i--) {
        const item = pending[i];
        if (!item) continue;
        if (confirmed.take(item.key)) {
          matched++;
          pending.splice(i, 1);
        } else if (Date.now() - item.seenAt > staleMinutes * 60_000) {
          expired++;
          pending.splice(i, 1);
          console.warn(`[reconcile] not in confirmed history after ${staleMinutes} min: ${short(item.event.tx, 6)} (dropped from view)`);
        }
      }
      console.log(`[reconcile:${reason}] confirmed ${matched}, still provisional ${pending.length}, expired ${expired}`);
    } catch (error) {
      console.warn(`[reconcile:${reason}] skipped: ${describeError(error)}`);
    } finally {
      reconciling = false;
    }
  }

  let connections = 0;
  ds.on("connected", () => {
    connections++;
    if (connections > 1) void reconcile("reconnect"); // the SDK has already rejoined the room
  });
  const timer = setInterval(() => void reconcile("interval"), reconcileSeconds * 1000);

  console.log(`\nStreaming room ${sub.room} — Ctrl+C to stop\n`);
  onShutdown(() => {
    clearInterval(timer);
    listener.unsubscribe(); // remove the callback
    ds.unsubscribe(sub.room); // leave the server room
    ds.disconnect(); // close the socket
    console.log("\nStopped.");
  });
}

run(async () => {
  const events = await backfill();
  printBackfill(events);

  if (!optionalEnv("ST_DATASTREAM_KEY")) {
    console.log(
      "\nNote: ST_DATASTREAM_KEY is not set, so the live part was skipped. " +
        "Add your Datastream key (Premium plan or higher) to stream new LP events.",
    );
    return;
  }
  await stream();
});
