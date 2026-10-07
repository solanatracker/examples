import type {
  PnlMode,
  PnlV2Identity,
  PnlV2KOLPeriodParams,
  PnlV2Top90dTrader,
  PnlV2TopTradersParams,
} from "@solana-tracker/data-api";
import { createDataApiClient, run, withRetry } from "./client.js";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { compactUsd, short, table } from "./format.js";

const WINDOWS = { 1: "1d", 7: "7d", 30: "30d", 90: "90d" } as const;
type WindowDays = keyof typeof WINDOWS;
const SORTS = ["realized", "volume", "days", "roi", "win_percentage", "trades", "tokens"] as const;
const MODES = ["strict", "adjusted", "raw"] as const;
const PLATFORMS = ["axiom", "axiom-flash", "bloom", "photon"] as const;

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) fail(`${name} must be one of ${allowed.join(", ")}, got "${value}"`);
  return value as T;
}

/** Display label: name, then SNS domain, then the primary type. Unknown wallets have identity null. */
function label(identity: PnlV2Identity | null | undefined): string {
  if (!identity) return "";
  const text = identity.name || identity.sns?.domain || identity.type || "";
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

const percent = (n: number | null | undefined) => (typeof n === "number" ? `${n.toFixed(1)}%` : "n/a");

async function main(): Promise<void> {
  const client = createDataApiClient();

  const days = numberEnv("LEADERBOARD_DAYS", 30);
  if (!(days in WINDOWS)) fail(`LEADERBOARD_DAYS must be 1, 7, 30 or 90, got ${days}`);
  const window = WINDOWS[days as WindowDays];
  const sort = oneOf("LEADERBOARD_SORT", optionalEnv("LEADERBOARD_SORT") ?? "realized", SORTS);
  const pnlMode: PnlMode = oneOf("PNL_MODE", optionalEnv("PNL_MODE") ?? "strict", MODES);
  const limit = numberEnv("LIMIT", 20);
  const pages = numberEnv("PAGES", 1);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail("LIMIT must be an integer from 1 to 100");
  if (!Number.isInteger(pages) || pages < 1 || pages > 5) fail("PAGES must be an integer from 1 to 5");

  const platform = optionalEnv("PLATFORM");
  platform?.split(",").forEach((p) => oneOf("PLATFORM entry", p.trim(), PLATFORMS));

  const params: PnlV2TopTradersParams = {
    days,
    sort,
    direction: "desc",
    limit,
    pnlMode,
    excludeArbitrage: optionalEnv("EXCLUDE_ARBITRAGE") === "false" ? "false" : "true",
    ...(platform ? { platform } : {}),
    ...(optionalEnv("MIN_TRADES") ? { minTrades: numberEnv("MIN_TRADES", 20) } : {}),
    ...(optionalEnv("MIN_DAYS") ? { minDays: numberEnv("MIN_DAYS", 3) } : {}),
    ...(optionalEnv("MAX_SINGLE_TOKEN_PCT") ? { maxSingleTokenPct: numberEnv("MAX_SINGLE_TOKEN_PCT", 100) } : {}),
  };

  // 1. Top traders over a rolling window. Follow nextCursor unchanged, with the same filters.
  const traders: PnlV2Top90dTrader[] = [];
  let cursor: string | undefined;
  let hasMore = false;
  let echoedMode: PnlMode | undefined;
  for (let page = 1; page <= pages; page++) {
    const res = await withRetry(`getPnlV2TopTraders page ${page}`, () =>
      client.getPnlV2TopTraders({ ...params, ...(cursor ? { cursor } : {}) }),
    );
    traders.push(...res.traders);
    echoedMode = res.pagination.pnlMode ?? echoedMode;
    hasMore = res.pagination.hasMore;
    cursor = res.pagination.nextCursor ?? undefined;
    if (!hasMore || !cursor) break;
  }

  console.log(`\nTop Solana traders, last ${days}d, sorted by ${sort}, pnlMode ${echoedMode ?? pnlMode}\n`);
  table(
    ["#", "Wallet", "Label", "Realized", "ROI", "Token win", "Day win", "Days", "Trades"],
    traders.map((t, i) => [
      String(i + 1),
      short(t.wallet),
      label(t.identity),
      compactUsd(t.period.realized),
      percent(t.period.roi),
      percent(t.winRate),
      percent(t.period.days?.winRate),
      String(t.period.tradingDays),
      String(t.counts.trades),
    ]),
  );
  console.log(`\n${traders.length} wallet(s) shown${hasMore ? "; more pages available (raise PAGES)" : ""}`);

  // 2. KOL roster over the same window. KOL endpoints take no pnlMode.
  const kolParams: PnlV2KOLPeriodParams = { period: window, sort: "realized", direction: "desc", limit: Math.min(limit, 10) };
  const kols = await withRetry("getPnlV2KOLPeriodLeaderboard", () => client.getPnlV2KOLPeriodLeaderboard(kolParams));
  console.log(`\nKOL leaderboard, period ${window}\n`);
  table(
    ["#", "KOL", "Wallet", "Realized", "Volume", "Days", "Lifetime total"],
    kols.traders.map((k, i) => [
      String(i + 1),
      label(k.identity) || "(unlabeled)",
      short(k.wallet),
      compactUsd(k.period.realized),
      compactUsd(k.period.volume),
      String(k.period.tradingDays),
      compactUsd(k.ending.pnl.total),
    ]),
  );

  // 3. KOL roster, all-time.
  const allTime = await withRetry("getPnlV2KOLLeaderboard", () =>
    client.getPnlV2KOLLeaderboard({ sort: "realized", direction: "desc", limit: Math.min(limit, 10) }),
  );
  console.log("\nKOL leaderboard, all-time\n");
  table(
    ["#", "KOL", "Wallet", "Realized", "Unrealized", "ROI", "Token win"],
    allTime.traders.map((k, i) => [
      String(i + 1),
      label(k.identity) || "(unlabeled)",
      short(k.wallet),
      compactUsd(k.pnl.realized),
      compactUsd(k.pnl.unrealized),
      percent(k.roi),
      percent(k.winRate),
    ]),
  );
  console.log("\nLive views: https://www.solanatracker.io/leaderboard/pnl and https://www.solanatracker.io/leaderboard/kolscan");
}

run(main);
