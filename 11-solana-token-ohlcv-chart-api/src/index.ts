import type { ChartDataParams, OHLCVData } from "@solana-tracker/data-api";
import { createDataApiClient, run, withRetry } from "./client.js";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { compact, pct, short, table, usd } from "./format.js";

const SOL = "So11111111111111111111111111111111111111112";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Interval values accepted by the chart endpoint, with their length in seconds. "1mn" (month) has no fixed length. */
const INTERVALS: Record<string, number | null> = {
  "1s": 1, "5s": 5, "15s": 15,
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1_800,
  "1h": 3_600, "2h": 7_200, "4h": 14_400, "6h": 21_600, "8h": 28_800, "12h": 43_200,
  "1d": 86_400, "3d": 259_200, "1w": 604_800, "1mn": null,
};
const CURRENCIES = ["usd", "eur", "sol"] as const;
type Currency = (typeof CURRENCIES)[number];
const MAX_REQUESTS = 20; // client-side guard so a typo like CHART_INTERVAL=1s over 30 days does not fire hundreds of calls

function parseAddress(name: string, fallback?: string): string | undefined {
  const value = optionalEnv(name) ?? fallback;
  if (value !== undefined && !BASE58.test(value)) fail(`${name} is not a valid base58 address: "${value}"`);
  return value;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = optionalEnv(name)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (raw === "true" || raw === "false") return raw === "true";
  return fail(`${name} must be true or false, got "${raw}"`);
}

const utc = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 16).replace("T", " ");

function money(n: number, currency: Currency, marketCap: boolean): string {
  if (currency === "usd") return marketCap ? `$${compact(n)}` : usd(n);
  const value = marketCap ? compact(n) : Math.abs(n) < 0.01 && n !== 0 ? n.toPrecision(3) : n.toFixed(n < 10 ? 4 : 2);
  return `${value} ${currency.toUpperCase()}`;
}

function isCandle(c: OHLCVData): boolean {
  return [c.open, c.high, c.low, c.close, c.volume, c.time].every(Number.isFinite);
}

async function main(): Promise<void> {
  const client = createDataApiClient();
  const mint = parseAddress("TOKEN_MINT", SOL) as string;
  const pool = parseAddress("POOL_ADDRESS");
  const interval = optionalEnv("CHART_INTERVAL") ?? "1h";
  if (!(interval in INTERVALS)) fail(`CHART_INTERVAL must be one of ${Object.keys(INTERVALS).join(", ")}; got "${interval}"`);
  const currency = (optionalEnv("CHART_CURRENCY")?.toLowerCase() ?? "usd") as Currency;
  if (!CURRENCIES.includes(currency)) fail(`CHART_CURRENCY must be usd, eur or sol; got "${currency}"`);
  const marketCap = boolEnv("MARKET_CAP", false);
  const fillGaps = boolEnv("FILL_GAPS", false);
  const days = numberEnv("CHART_DAYS", 7);
  const windowCandles = numberEnv("WINDOW_CANDLES", 1_000);
  const showLast = numberEnv("SHOW_LAST", 12);
  if (days <= 0 || windowCandles < 10 || showLast < 1) fail("CHART_DAYS must be > 0, WINDOW_CANDLES >= 10 and SHOW_LAST >= 1");

  const step = INTERVALS[interval] ?? null;
  const to = Math.floor(Date.now() / 1000);
  const from = to - Math.round(days * 86_400);

  // Split long ranges into windows and fetch them sequentially. The window size is a client-side
  // choice that keeps each response small; it is not a documented server limit.
  const windows: Array<[number, number]> = [];
  const span = step ? step * windowCandles : to - from;
  for (let start = from; start < to; start += span) windows.push([start, Math.min(to, start + span - 1)]);
  if (windows.length > MAX_REQUESTS) {
    fail(`${days} day(s) of ${interval} candles needs ${windows.length} requests (limit ${MAX_REQUESTS}). Use a larger CHART_INTERVAL or fewer CHART_DAYS.`);
  }

  const byTime = new Map<number, OHLCVData>();
  let malformed = 0;
  for (const [timeFrom, timeTo] of windows) {
    const params: ChartDataParams = { tokenAddress: mint, type: interval, timeFrom, timeTo, currency, marketCap };
    const label = `chart ${utc(timeFrom)}..${utc(timeTo)}`;
    const res = pool
      ? await withRetry(label, () => client.getPoolChartData({ ...params, poolAddress: pool }))
      : await withRetry(label, () => client.getChartData(params));
    for (const c of res.oclhv ?? []) {
      if (!isCandle(c)) {
        malformed++;
        continue;
      }
      byTime.set(c.time, c); // windows can overlap at the edges; the time key dedupes them
    }
  }

  let candles = [...byTime.values()].sort((a, b) => a.time - b.time);
  const scope = pool ? `pool ${short(pool)}` : "all pools";
  const series = marketCap ? "market cap" : "price";
  if (candles.length === 0) {
    console.log(`\nNo ${interval} candles for ${short(mint)} (${scope}) in the last ${days} day(s). The token may be new, untraded or not indexed.`);
    return;
  }

  // Missing intervals: the endpoint can skip intervals with no trades. Count them, optionally fill them.
  let gapCount = 0;
  let missing = 0;
  let largestGap = 0;
  if (step) {
    const filled: OHLCVData[] = [];
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]!;
      const prev = candles[i - 1];
      if (prev) {
        const skipped = Math.round((c.time - prev.time) / step) - 1;
        if (skipped > 0) {
          gapCount++;
          missing += skipped;
          largestGap = Math.max(largestGap, skipped);
          if (fillGaps) {
            for (let k = 1; k <= skipped; k++) {
              const p = prev.close;
              filled.push({ time: prev.time + k * step, open: p, high: p, low: p, close: p, volume: 0 });
            }
          }
        }
      }
      filled.push(c);
    }
    if (fillGaps) candles = filled;
  }

  const first = candles[0]!;
  const last = candles[candles.length - 1]!;
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const volume = candles.reduce((sum, c) => sum + c.volume, 0);

  console.log(
    `\n${short(mint)} ${interval} ${series} candles in ${currency.toUpperCase()} (${scope}), ` +
      `${utc(first.time)} to ${utc(last.time)} UTC: ${candles.length} candle(s) from ${windows.length} request(s)\n`,
  );
  table(
    ["Time (UTC)", "Open", "High", "Low", "Close", "Volume", "Change"],
    candles.slice(-showLast).map((c) => [
      utc(c.time),
      money(c.open, currency, marketCap),
      money(c.high, currency, marketCap),
      money(c.low, currency, marketCap),
      money(c.close, currency, marketCap),
      c.volume === 0 && fillGaps ? "0 (filled)" : compact(c.volume),
      c.open > 0 ? pct(((c.close - c.open) / c.open) * 100, 2) : "n/a",
    ]),
  );

  console.log(
    `\nRange: open ${money(first.open, currency, marketCap)} -> close ${money(last.close, currency, marketCap)} ` +
      `(${first.open > 0 ? pct(((last.close - first.open) / first.open) * 100, 2) : "n/a"}), ` +
      `high ${money(high, currency, marketCap)}, low ${money(low, currency, marketCap)}, volume ${compact(volume)}`,
  );
  if (step) {
    console.log(
      gapCount === 0
        ? "Gaps: none"
        : `Gaps: ${gapCount} gap(s), ${missing} missing ${interval} interval(s), largest ${largestGap}${fillGaps ? " (filled flat with zero volume)" : " (set FILL_GAPS=true to fill)"}`,
    );
  }
  if (malformed > 0) console.log(`Skipped ${malformed} malformed candle(s).`);
}

run(main);
