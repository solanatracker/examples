import type { PoolInfo, PriceData } from "@solana-tracker/data-api";
import { createDataApiClient, run, withRetry } from "./client.js";
import { fail, optionalEnv } from "./env.js";
import { compactUsd, pct, short, table, usd } from "./format.js";

const SOL = "So11111111111111111111111111111111111111112";
const DEFAULT_WATCHLIST = [
  SOL,
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
];
const MAX_BATCH = 100; // getMultiplePrices rejects more than 100 mints per call
const BASE58_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function parseMint(value: string, name: string): string {
  if (!BASE58_MINT.test(value)) fail(`${name} is not a valid base58 mint address: "${value}"`);
  return value;
}

function age(ms: number | undefined): string {
  if (!ms) return "n/a";
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const client = createDataApiClient();
  const mint = parseMint(optionalEnv("TOKEN_MINT") ?? SOL, "TOKEN_MINT");
  const watchlist = [
    ...new Set(
      (optionalEnv("WATCHLIST")?.split(",") ?? DEFAULT_WATCHLIST)
        .map((m) => m.trim())
        .filter(Boolean)
        .map((m) => parseMint(m, "WATCHLIST entry")),
    ),
  ];

  // 1. Token detail: every indexed pool with its own price and liquidity.
  const info = await withRetry("getTokenInfo", () => client.getTokenInfo(mint));
  const pools: PoolInfo[] = [...(info.pools ?? [])].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const totalLiquidity = pools.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0);

  console.log(`\n${info.token.symbol || short(mint)} (${short(mint)}): ${pools.length} pool(s), ${compactUsd(totalLiquidity)} total liquidity\n`);
  table(
    ["Market", "Pool", "Price USD", "Liquidity", "Share", "Updated"],
    pools.slice(0, 10).map((p) => [
      p.market,
      short(p.poolId),
      usd(p.price?.usd),
      compactUsd(p.liquidity?.usd),
      totalLiquidity > 0 ? `${(((p.liquidity?.usd ?? 0) / totalLiquidity) * 100).toFixed(1)}%` : "n/a",
      age(p.lastUpdated),
    ]),
  );
  if (pools.length > 10) console.log(`… ${pools.length - 10} smaller pool(s) omitted`);

  // Spread between pool prices: a wide spread means "the price" depends on which pool you ask.
  const poolPrices = pools.map((p) => p.price?.usd).filter((n): n is number => Number.isFinite(n) && n > 0);
  if (poolPrices.length > 1) {
    const low = Math.min(...poolPrices);
    const high = Math.max(...poolPrices);
    console.log(`Pool price spread: ${usd(low)} to ${usd(high)} (${(((high - low) / low) * 100).toFixed(2)}%)`);
  }

  // 2. Single price snapshot with change percentages.
  const snapshot = await withRetry("getPrice", () => client.getPrice(mint, true));
  const changes = snapshot.priceChanges;
  console.log(
    `\nSnapshot: ${usd(snapshot.price)} | liquidity ${compactUsd(snapshot.liquidity)} | ` +
      `1h ${pct(changes?.["1h"]?.priceChangePercentage)} | 24h ${pct(changes?.["24h"]?.priceChangePercentage)} | ` +
      `updated ${age(snapshot.lastUpdated)} ago`,
  );

  // 3. Coarse history points (current, 3d, 7d, 30d) for context.
  const history = await withRetry("getPriceHistory", () => client.getPriceHistory(mint));
  console.log(`History:  now ${usd(history.current)} | 3d ${usd(history["3d"])} | 7d ${usd(history["7d"])} | 30d ${usd(history["30d"])}`);

  // 4. Batch prices, keyed by mint. Join by key, never by array position.
  const batch: Record<string, PriceData> = {};
  for (const group of chunk(watchlist, MAX_BATCH)) {
    Object.assign(batch, await withRetry("getMultiplePrices", () => client.getMultiplePrices(group, true)));
  }

  console.log(`\nWatchlist (${watchlist.length} mint(s))\n`);
  table(
    ["Mint", "Price USD", "Liquidity", "Market cap", "24h", "Updated"],
    watchlist.map((m) => {
      const row = batch[m];
      if (!row || !Number.isFinite(row.price)) return [short(m), "unavailable", "", "", "", ""];
      return [
        short(m),
        usd(row.price),
        compactUsd(row.liquidity),
        compactUsd(row.marketCap),
        pct(row.priceChanges?.["24h"]?.priceChangePercentage),
        age(row.lastUpdated),
      ];
    }),
  );
}

run(main);
