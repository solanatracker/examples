import type { LighthouseMarket, LighthouseResponse, LighthouseTimeframeStats } from "@solana-tracker/data-api";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { compact, compactUsd, pct, table } from "./format.js";

export const WINDOWS = ["5m", "1h", "6h", "24h"] as const;
export type Window = (typeof WINDOWS)[number];

export const METRICS = ["volume", "transactions", "wallets", "tokensCreated", "migrations"] as const;
export type Metric = (typeof METRICS)[number];

export type Config = {
  window: Window;
  metric: Metric;
  topN: number;
  includeChildren: boolean;
  watchSeconds: number;
};

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = optionalEnv(name) ?? fallback;
  if (!(allowed as readonly string[]).includes(value)) fail(`${name} must be one of: ${allowed.join(", ")} (got "${value}")`);
  return value as T;
}

export function readConfig(): Config {
  const topN = numberEnv("TOP_N", 10);
  if (!Number.isInteger(topN) || topN < 1 || topN > 100) fail(`TOP_N must be an integer from 1 to 100, got ${topN}`);
  const watchSeconds = numberEnv("WATCH_SECONDS", 0);
  if (watchSeconds !== 0 && (watchSeconds < 15 || watchSeconds > 3600)) {
    fail(`WATCH_SECONDS must be 0 (run once) or between 15 and 3600, got ${watchSeconds}`);
  }
  return {
    window: oneOf("LIGHTHOUSE_WINDOW", WINDOWS, "1h"),
    metric: oneOf("SORT_METRIC", METRICS, "volume"),
    topN,
    includeChildren: (optionalEnv("INCLUDE_CHILD_MARKETS") ?? "false").toLowerCase() === "true",
    watchSeconds,
  };
}

/** `changePct` is 0 when the previous window was 0, so a 0 total gets "-" instead of a fake "+0.0%". */
const change = (total: number, changePct: number) => (total === 0 ? "-" : pct(changePct));

const buyShare = (stats: LighthouseTimeframeStats) =>
  stats.volume.total > 0 ? `${((stats.volume.buys / stats.volume.total) * 100).toFixed(0)}%` : "-";

/** The `all` row is the indexed overall view. Never sum the other rows: families and children overlap. */
export function printOverview(markets: LighthouseResponse): void {
  const all = markets.find((m) => m.market === "all");
  if (!all) {
    console.log("No `all` row in this response; skipping the overview.");
    return;
  }
  console.log(`Overall (${all.label})`);
  table(
    ["Window", "Volume", "Chg", "Trades", "Chg", "Wallets*", "Chg", "Launches", "Migrations", "Buy vol"],
    WINDOWS.map((w) => {
      const s = all.stats[w];
      return [
        w,
        compactUsd(s.volume.total),
        change(s.volume.total, s.volume.changePct),
        compact(s.transactions.total),
        change(s.transactions.total, s.transactions.changePct),
        compact(s.wallets.total),
        change(s.wallets.total, s.wallets.changePct),
        compact(s.tokensCreated.total),
        compact(s.migrations.total),
        buyShare(s),
      ];
    }),
  );
  console.log("* approximate unique wallets. Chg = vs the previous window of the same length.");
}

function metricTotal(market: LighthouseMarket, window: Window, metric: Metric): number {
  return market.stats[window]?.[metric]?.total ?? 0;
}

export function printLeaderboard(markets: LighthouseResponse, config: Config): void {
  const rows = markets
    .filter((m) => m.market !== "all")
    .filter((m) => config.includeChildren || !m.parent)
    .filter((m) => m.stats?.[config.window])
    .sort((a, b) => metricTotal(b, config.window, config.metric) - metricTotal(a, config.window, config.metric))
    .slice(0, config.topN);

  console.log(
    `\nTop ${rows.length} ${config.includeChildren ? "markets incl. child launchpads" : "top-level markets"}` +
      ` by ${config.metric}, ${config.window} window`,
  );
  if (rows.length === 0) {
    console.log("  no markets with data for this window");
    return;
  }
  table(
    ["#", "Market", "Label", "Parent", "Volume", "Chg", "Trades", "Wallets*", "Launches", "Migrations", "Buy vol"],
    rows.map((m, i) => {
      const s = m.stats[config.window];
      return [
        String(i + 1),
        m.market,
        m.label,
        m.parent ?? "",
        compactUsd(s.volume.total),
        change(s.volume.total, s.volume.changePct),
        compact(s.transactions.total),
        compact(s.wallets.total),
        compact(s.tokensCreated.total),
        compact(s.migrations.total),
        buyShare(s),
      ];
    }),
  );
}
