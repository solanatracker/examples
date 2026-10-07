import type { PnlMode, PnlV2Identity, PnlV2WalletHistoryParams } from "@solana-tracker/data-api";
import { createDataApiClient, run } from "./client.js";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { short, table } from "./format.js";
import { money, percent, type Currency } from "./money.js";
import { pollUntilReady } from "./queued.js";

const DEFAULT_WALLET = "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o"; // sample wallet from the PnL v2 docs
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CURRENCIES = ["usd", "sol", "eur"] as const;
const PERIODS = ["1d", "7d", "14d", "30d", "90d", "all"] as const;
const MODES = ["strict", "adjusted", "raw"] as const;
type Period = NonNullable<PnlV2WalletHistoryParams["period"]>;

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) fail(`${name} must be one of ${allowed.join(", ")}, got "${value}"`);
  return value as T;
}

function label(identity: PnlV2Identity | null | undefined): string {
  return identity?.name || identity?.sns?.domain || identity?.type || "unlabeled";
}

const date = (ms: number | null | undefined) => (typeof ms === "number" ? new Date(ms).toISOString().slice(0, 10) : "n/a");

function duration(secs: number | null | undefined): string {
  if (typeof secs !== "number") return "n/a";
  if (secs < 60) return `${secs.toFixed(1)}s`;
  if (secs < 3600) return `${(secs / 60).toFixed(1)}m`;
  if (secs < 86400) return `${(secs / 3600).toFixed(1)}h`;
  return `${(secs / 86400).toFixed(1)}d`;
}

async function main(): Promise<void> {
  const client = createDataApiClient();
  const wallet = optionalEnv("WALLET_ADDRESS") ?? DEFAULT_WALLET;
  if (!BASE58.test(wallet)) fail(`WALLET_ADDRESS is not a valid base58 address: "${wallet}"`);
  const currency: Currency = oneOf("PNL_CURRENCY", optionalEnv("PNL_CURRENCY") ?? "usd", CURRENCIES);
  const period: Period = oneOf("PNL_PERIOD", optionalEnv("PNL_PERIOD") ?? "30d", PERIODS);
  const pnlMode: PnlMode = oneOf("PNL_MODE", optionalEnv("PNL_MODE") ?? "strict", MODES);
  const historyRows = numberEnv("HISTORY_ROWS", 14);
  const maxWaitMs = numberEnv("PNL_QUEUE_MAX_WAIT_SEC", 120) * 1000;
  if (!Number.isInteger(historyRows) || historyRows < 1 || historyRows > 1000) fail("HISTORY_ROWS must be 1 to 1000");
  if (maxWaitMs < 0) fail("PNL_QUEUE_MAX_WAIT_SEC must be 0 or more");

  // 1. Summary: lifetime realized/unrealized PnL. Accepts pnlMode and currency (converted at current spot).
  const overview = await pollUntilReady(
    "summary",
    () => client.getPnlV2WalletOverview(wallet, { pnlMode, currency }),
    maxWaitMs,
  );
  if (!overview) {
    console.log(`\nPnL for ${wallet} is still queued after ${maxWaitMs / 1000}s. Try again later.`);
    return;
  }
  const cur: Currency = overview.currency ?? "usd";
  const s = overview.summary;
  console.log(`\nSummary for ${wallet} (${label(overview.identity)})`);
  console.log(`pnlMode ${overview.pnlMode ?? pnlMode}, currency ${cur.toUpperCase()}, updated ${overview.updatedAt ?? "n/a"}\n`);
  table(
    ["Metric", "Value"],
    [
      ["Realized PnL", money(s.pnl.realized, cur, true)],
      ["Unrealized PnL", money(s.pnl.unrealized, cur, true)],
      ["Total PnL", money(s.pnl.total, cur, true)],
      ["Invested", money(s.invested, cur)],
      ["Open positions (cost / value)", `${money(s.openPositions.cost, cur)} / ${money(s.openPositions.value, cur)}`],
      ["ROI", percent(s.roi)],
      ["Win rate (closed tokens)", `${percent(overview.analysis.winRate)} of ${overview.analysis.tokens.closed}`],
      ["Trades (buys / sells)", `${s.counts.trades} (${s.counts.buys} / ${s.counts.sells})`],
      ["Tokens traded", String(s.counts.tokensTraded)],
      ["Avg hold time", duration(s.timing.avgHoldTimeSecs)],
      ["First / last trade", `${date(s.timing.firstTrade)} / ${date(s.timing.lastTrade)}`],
      ["Platforms", overview.tags.platforms.join(", ") || "none"],
      ["Arbitrage wallet", overview.tags.isArbitrage ? "yes" : "no"],
    ],
  );

  // 2. History: daily snapshots, converted per day at that day's reference rate. No pnlMode here.
  const history = await pollUntilReady(
    "history",
    () => client.getPnlV2WalletHistory(wallet, { period, currency }),
    maxWaitMs,
  );
  if (history) {
    const hc: Currency = history.currency ?? "usd";
    const days = history.days.slice(-historyRows);
    console.log(`\nDaily history, ${period} (${hc.toUpperCase()}), last ${days.length} of ${history.days.length} day(s)\n`);
    table(
      ["Date", "Realized", "Buys", "Sells", "Volume", "Cumulative total"],
      days.map((d) => [
        d.date,
        money(d.activity.pnl.realized, hc, true),
        String(d.activity.counts.buys),
        String(d.activity.counts.sells),
        money(d.activity.volume.total, hc),
        money(d.cumulative.pnl.total, hc, true),
      ]),
    );
    const sum = history.summary;
    console.log(
      `\nTrading days ${sum.days.trading} (${sum.days.positive} up, ${sum.days.negative} down), ` +
        `day win rate ${percent(sum.winRate)}, realized ${money(sum.totals.realizedPnl, hc, true)}, ` +
        `volume ${money(sum.totals.volume, hc)}`,
    );
  }

  // 3. Performance: streaks, drawdown, best and worst day over the same window.
  const perf = await pollUntilReady(
    "performance",
    () => client.getPnlV2WalletPerformance(wallet, { period, currency }),
    maxWaitMs,
  );
  if (perf) {
    const pc: Currency = perf.currency ?? "usd";
    console.log(`\nPerformance, ${perf.window}-day window (${pc.toUpperCase()})\n`);
    table(
      ["Metric", "Value"],
      [
        ["Realized PnL", money(perf.totals.realizedPnl, pc, true)],
        ["Volume", money(perf.totals.volume, pc)],
        ["Trades in window", String(perf.totals.trades)],
        ["Best day", perf.bestDay ? `${perf.bestDay.date} ${money(perf.bestDay.realizedPnl, pc, true)}` : "n/a"],
        ["Worst day", perf.worstDay ? `${perf.worstDay.date} ${money(perf.worstDay.realizedPnl, pc, true)}` : "n/a"],
        ["Longest win / loss streak", `${perf.streaks.positive ?? "n/a"} / ${perf.streaks.negative ?? "n/a"} day(s)`],
        ["Max drawdown", `${money(perf.drawdown.amount, pc)} (${percent(perf.drawdown.percent)})`],
      ],
    );
  }

  if (cur !== "usd") {
    console.log(`\nNote: ${short(wallet)} values are converted from USD at read time; ROI, counts and percentages are not.`);
  }
}

run(main);
