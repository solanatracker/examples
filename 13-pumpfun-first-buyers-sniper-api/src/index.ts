/**
 * Pump.fun first buyers report.
 * - GET /v2/pnl/tokens/{token}/first-buyers: earliest buyers with token-scoped and lifetime PnL.
 * - GET /tokens/{token} (risk block) and GET /tokens/{token}/bundlers: sniper, insider and bundler sets.
 * - Optional WATCH_RISK=true: live sniper/insider/bundler rooms on Datastream after the report.
 */
import type { Client, SearchResult } from "@solana-tracker/data-api";
import { BASE58_MINT, dateTime, flags, holdFor, label, outcome, riskSets, summarize } from "./analyze.js";
import { createDataApiClient, describeError, run, withRetry } from "./client.js";
import { createDatastream, onShutdown } from "./datastream.js";
import { datastreamUrl, fail, numberEnv, optionalEnv, requireApiKey } from "./env.js";
import { compact, compactUsd, pct, short, table, time, usd } from "./format.js";

requireApiKey();
const TOKEN_MINT = optionalEnv("TOKEN_MINT");
const LIMIT = numberEnv("FIRST_BUYERS_LIMIT", 50);
const QUICK_FLIP_SECONDS = numberEnv("QUICK_FLIP_SECONDS", 300);
const WATCH_RISK = (optionalEnv("WATCH_RISK") ?? "false").toLowerCase() === "true";
if (TOKEN_MINT && !BASE58_MINT.test(TOKEN_MINT)) fail(`TOKEN_MINT is not a valid base58 address: "${TOKEN_MINT}"`);
if (!Number.isInteger(LIMIT) || LIMIT < 1 || LIMIT > 200) fail("FIRST_BUYERS_LIMIT must be an integer from 1 to 200");
if (QUICK_FLIP_SECONDS <= 0) fail("QUICK_FLIP_SECONDS must be > 0");
if (WATCH_RISK) datastreamUrl(); // fail fast if the stream key is missing

/** Uses TOKEN_MINT, or picks the highest 24h-volume Pump.fun token from /search. */
async function resolveMint(client: Client): Promise<string> {
  if (TOKEN_MINT) return TOKEN_MINT;
  const res = await withRetry("GET /search", () =>
    client.searchTokens({ launchpad: "pumpfun", sortBy: "volume_24h", sortOrder: "desc", limit: 5 }),
  );
  // Results can include promoted rows; prefer one that is on a Pump.fun market.
  const rows: SearchResult[] = res.data ?? [];
  const pick = rows.find((r) => r.market === "pumpfun" || r.market === "pumpfun-amm") ?? rows[0];
  if (!pick) throw new Error("search returned no Pump.fun tokens; set TOKEN_MINT");
  console.log(`TOKEN_MINT not set, using top 24h volume Pump.fun token ${pick.symbol} (${pick.mint})`);
  return pick.mint;
}

async function main(): Promise<void> {
  const client = createDataApiClient();
  const mint = await resolveMint(client);

  const [firstBuyers, info, bundlers] = await Promise.all([
    withRetry(`GET /v2/pnl/tokens/${short(mint)}/first-buyers`, () => client.getPnlV2TokenFirstBuyers(mint, { limit: LIMIT })),
    withRetry(`GET /tokens/${short(mint)}`, () => client.getTokenInfo(mint)).catch((error: unknown) => {
      console.warn(`[risk] token info unavailable: ${describeError(error)}`);
      return undefined;
    }),
    withRetry(`GET /tokens/${short(mint)}/bundlers`, () => client.getTokenBundlers(mint)).catch((error: unknown) => {
      console.warn(`[risk] bundlers unavailable: ${describeError(error)}`);
      return undefined;
    }),
  ]);

  const { meta, traders, pagination } = firstBuyers;
  const risk = info?.risk;
  console.log(`\n${meta.symbol ?? "?"} (${meta.name ?? "?"})  ${mint}`);
  console.log(`price ${usd(meta.price)}  mcap ${compactUsd(meta.marketCap)}  liq ${compactUsd(meta.liquidity)}  market ${meta.primaryMarket ?? "n/a"}`);
  if (risk) {
    console.log(
      `risk ${risk.score}/10  snipers ${risk.snipers.count} (${risk.snipers.totalPercentage.toFixed(1)}%)  insiders ${risk.insiders.count} (${risk.insiders.totalPercentage.toFixed(1)}%)  top10 ${risk.top10.toFixed(1)}%  dev ${risk.dev.percentage.toFixed(1)}%  bundlers ${bundlers ? `${bundlers.wallets.length} (${bundlers.percentage.toFixed(1)}% now)` : "n/a"}`,
    );
  }
  console.log();

  const sets = riskSets(info, bundlers);
  table(
    ["#", "Wallet", "Label", "First trade", "Invested", "Token PnL", "ROI", "State", "Held", "Lifetime PnL", "Flags"],
    traders.map((t, i) => [
      String(i + 1),
      short(t.wallet),
      label(t).slice(0, 12),
      dateTime(t.timing.firstTrade),
      compactUsd(t.invested),
      compactUsd(t.pnl.token.total),
      pct(t.roi, 0),
      outcome(t),
      holdFor(t),
      compactUsd(t.pnl.wallet?.total),
      flags(t.wallet, sets),
    ]),
  );

  const s = summarize(traders, sets, QUICK_FLIP_SECONDS);
  console.log(
    `\nSummary: ${s.rows} first buyers shown${pagination.total !== undefined ? ` of ${compact(pagination.total)}` : ""}${pagination.hasMore ? " (more pages)" : ""}`,
  );
  console.log(
    `  holding ${s.holding}, exited in profit ${s.exitedProfit}, exited at a loss ${s.exitedLoss}, moved out without selling ${s.movedOut}, quick flips (<= ${QUICK_FLIP_SECONDS}s) ${s.quickFlips}, flagged S/I/B ${s.flagged}`,
  );
  console.log(`  invested ${compactUsd(s.invested)}, token PnL ${compactUsd(s.tokenPnl)} (realized + unrealized at the current price)`);
  console.log("  Defaults exclude arbitrage wallets and zero-buy rows. Flags: S sniper, I insider, B bundler.");

  if (!WATCH_RISK) return;
  watchRisk(mint);
}

/** Live changes to the sniper, insider and bundler sets for one token. */
function watchRisk(mint: string): void {
  const ds = createDatastream();
  console.log(`\nWatching sniper, insider and bundler rooms for ${short(mint)}. Ctrl+C to stop.`);
  const move = (prev: number, now: number) => `${prev.toFixed(2)}% -> ${now.toFixed(2)}%`;
  const listeners = [
    ds.subscribe.snipers(mint).on((u) =>
      console.log(`${time()}  SNIPER   ${short(u.wallet)}  ${move(u.previousPercentage, u.percentage)}  all snipers ${u.totalSniperPercentage.toFixed(2)}%`),
    ),
    ds.subscribe.insiders(mint).on((u) =>
      console.log(`${time()}  INSIDER  ${short(u.wallet)}  ${move(u.previousPercentage, u.percentage)}  all insiders ${u.totalInsiderPercentage.toFixed(2)}%`),
    ),
    ds.subscribe.bundlers(mint).on((u) =>
      console.log(`${time()}  BUNDLER  ${short(u.wallet)}  ${move(u.previousPercentage, u.percentage)}  all bundlers ${u.totalBundlerPercentage.toFixed(2)}%`),
    ),
  ];
  onShutdown(() => {
    for (const listener of listeners) listener.unsubscribe();
    ds.disconnect();
    console.log("\nStopped.");
  });
}

run(main);
