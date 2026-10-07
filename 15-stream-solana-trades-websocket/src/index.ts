import type { EnrichedTokenTransaction, EnrichedTrade } from "@solana-tracker/data-api";
import { createDataApiClient, describeError, withRetry } from "./client.js";
import { createDatastream, onShutdown } from "./datastream.js";
import { datastreamUrl, fail, numberEnv, optionalEnv, requireApiKey } from "./env.js";
import { compact, compactUsd, short, time, usd } from "./format.js";

const DEFAULT_TOKEN = "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SEEN_LIMIT = 5_000; // bounded dedupe memory
const MAX_GAP_PAGES = 5; // REST pages to walk back after a reconnect

/** One normalized row for both sources. REST uses volumeSol/pools, the live room uses solVolume/token. */
type Row = {
  tx: string;
  wallet: string;
  side: "buy" | "sell";
  amount: number;
  usd: number;
  sol: number;
  priceUsd: number;
  time: number; // ms
  program: string;
  label?: string;
};

function parseAddress(name: string, fallback?: string): string | undefined {
  const value = optionalEnv(name) ?? fallback;
  if (value !== undefined && !BASE58.test(value)) fail(`${name} is not a valid base58 address: "${value}"`);
  return value;
}

/** A signature can contain several swaps, so the signature alone is not a unique trade key. */
const keyOf = (r: Row) => `${r.tx}:${r.wallet}:${r.side}:${r.amount.toPrecision(8)}`;

function fromLive(t: EnrichedTokenTransaction): Row {
  return {
    tx: t.tx,
    wallet: t.wallet,
    side: t.type,
    amount: t.amount,
    usd: t.volume,
    sol: t.solVolume,
    priceUsd: t.priceUsd,
    time: t.time,
    program: t.program,
    label: t.identity?.name ?? undefined,
  };
}

function fromRest(t: EnrichedTrade): Row {
  return {
    tx: t.tx,
    wallet: t.wallet,
    side: t.type,
    amount: t.amount,
    usd: t.volume,
    sol: t.volumeSol,
    priceUsd: t.priceUsd,
    time: t.time,
    program: t.program,
    label: t.identity?.name ?? undefined,
  };
}

function main(): void {
  datastreamUrl();
  requireApiKey();
  const mint = parseAddress("TOKEN_MINT", DEFAULT_TOKEN) as string;
  const pool = parseAddress("POOL_ADDRESS");
  const minUsd = numberEnv("MIN_USD", 0);
  const backfill = numberEnv("BACKFILL", 25);
  const statsEveryMs = numberEnv("STATS_SECONDS", 30) * 1000;
  const enriched = (optionalEnv("ENRICHED") ?? "false").toLowerCase() === "true";
  if (!Number.isInteger(backfill) || backfill < 1 || backfill > 500) fail("BACKFILL must be an integer from 1 to 500");
  if (minUsd < 0 || statsEveryMs < 5_000) fail("MIN_USD must be >= 0 and STATS_SECONDS >= 5");

  const client = createDataApiClient();
  const ds = createDatastream();

  const seen = new Map<string, true>();
  const stats = { buys: 0, sells: 0, buyUsd: 0, sellUsd: 0, duplicates: 0, late: 0, filtered: 0, wallets: new Set<string>() };
  let newestPrinted = 0;
  let backfilling = true;
  let buffer: Row[] = [];
  let connectedOnce = false;
  let lastMessageAt = 0;

  /** Dedupes, filters and prints one trade. Returns false if it was already seen. */
  function emit(row: Row, source: "rest" | "live" | "gap"): boolean {
    const key = keyOf(row);
    if (seen.has(key)) {
      stats.duplicates++;
      return false;
    }
    seen.set(key, true);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.keys().next().value as string);

    if (row.usd < minUsd) {
      stats.filtered++;
      return true;
    }
    const late = row.time < newestPrinted;
    if (late) stats.late++;
    newestPrinted = Math.max(newestPrinted, row.time);
    if (row.side === "buy") {
      stats.buys++;
      stats.buyUsd += row.usd;
    } else {
      stats.sells++;
      stats.sellUsd += row.usd;
    }
    stats.wallets.add(row.wallet);

    console.log(
      [
        time(row.time),
        row.side.toUpperCase().padEnd(4),
        usd(row.usd).padStart(11),
        `${row.sol.toFixed(3)} SOL`.padStart(12),
        compact(row.amount).padStart(8),
        `@ ${usd(row.priceUsd)}`.padEnd(14),
        short(row.wallet),
        row.program.padEnd(12),
        short(row.tx, 6),
        source + (late ? " (late)" : ""),
        row.label ? `[${row.label}]` : "",
      ].join("  ").trimEnd(),
    );
    return true;
  }

  /** Newest-first REST pages until a page overlaps what we have seen (or the page budget runs out). */
  async function fetchHistory(maxPages: number): Promise<Row[]> {
    const rows: Row[] = [];
    let cursor: number | string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const params = {
        limit: backfill,
        sortDirection: "DESC" as const,
        ...(enriched ? { enrich: "identity" as const } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      };
      const res = pool
        ? await withRetry("getPoolTradeHistory", () => client.getPoolTradeHistory(mint, pool, params))
        : await withRetry("getTokenTradeHistory", () => client.getTokenTradeHistory(mint, params));
      const pageRows = res.trades.map(fromRest);
      rows.push(...pageRows);
      const overlaps = pageRows.some((r) => seen.has(keyOf(r)));
      if (overlaps || !res.hasNextPage || res.nextCursor == null) break;
      cursor = res.nextCursor;
    }
    return rows.sort((a, b) => a.time - b.time); // print oldest first
  }

  async function initialBackfill(): Promise<void> {
    try {
      const rows = await fetchHistory(1);
      console.log(`Backfill: last ${rows.length} trade(s) from REST\n`);
      for (const r of rows) emit(r, "rest");
    } catch (error) {
      console.warn(`[rest] backfill failed: ${describeError(error)} (continuing with the live stream only)`);
    } finally {
      backfilling = false;
      // Trades that arrived on the socket during the backfill: flush in time order, deduped.
      const pending = buffer.sort((a, b) => a.time - b.time);
      buffer = [];
      for (const r of pending) emit(r, "live");
      console.log("\nLive:\n");
    }
  }

  async function gapFill(): Promise<void> {
    try {
      const rows = await fetchHistory(MAX_GAP_PAGES);
      let added = 0;
      for (const r of rows) if (!seen.has(keyOf(r)) && emit(r, "gap")) added++;
      console.log(`[rest] reconnect gap fill: ${added} trade(s) missed while disconnected`);
    } catch (error) {
      console.warn(`[rest] gap fill failed: ${describeError(error)}`);
    }
  }

  // 'connected' fires after the first connect and after every reconnect; the SDK has already rejoined the room.
  ds.on("connected", () => {
    if (connectedOnce) void gapFill();
    connectedOnce = true;
  });

  // Passing an options object selects the enriched overload; { enriched: false } joins the plain room.
  const sub = pool ? ds.subscribe.tx.pool(mint, pool, { enriched }) : ds.subscribe.tx.token(mint, { enriched });
  const listener = sub.on((t: EnrichedTokenTransaction) => {
    lastMessageAt = Date.now();
    if (typeof t?.tx !== "string" || (t.type !== "buy" && t.type !== "sell") || !Number.isFinite(t.volume)) return;
    const row = fromLive(t);
    if (backfilling) buffer.push(row);
    else emit(row, "live");
  });

  console.log(`\nRoom ${sub.room}${minUsd > 0 ? `, trades >= ${usd(minUsd)}` : ""}. Ctrl+C to stop.\n`);
  void initialBackfill();

  const started = Date.now();
  let hinted = false;
  const timer = setInterval(() => {
    if (!connectedOnce && !hinted && Date.now() - started > 20_000) {
      hinted = true;
      console.warn("Not connected after 20s: check ST_DATASTREAM_KEY and that your plan includes Datastream (Premium or higher).");
    }
    const quiet = lastMessageAt ? `${Math.round((Date.now() - lastMessageAt) / 1000)}s since last message` : "no live messages yet";
    console.log(
      `[stats] ${stats.buys} buys ${compactUsd(stats.buyUsd)} | ${stats.sells} sells ${compactUsd(stats.sellUsd)} | ` +
        `${stats.wallets.size} wallets | ${stats.duplicates} dupes dropped | ${stats.late} late | ${quiet}`,
    );
  }, statsEveryMs);

  onShutdown(() => {
    clearInterval(timer);
    listener.unsubscribe();
    ds.unsubscribe(sub.room);
    ds.disconnect(); // onShutdown exits the process afterwards, which also stops auto-reconnect
    const net = stats.buyUsd - stats.sellUsd;
    console.log(
      `\nStopped. ${stats.buys + stats.sells} trade(s) shown, net flow ${net >= 0 ? "+" : "-"}${compactUsd(Math.abs(net))}, ` +
        `${stats.duplicates} duplicate(s) dropped, ${stats.filtered} below MIN_USD.`,
    );
  });
}

main();
