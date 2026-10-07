import type { SearchParams, SearchResult } from "@solana-tracker/data-api";
import { fail, numberEnv, optionalEnv } from "./env.js";

/** `sortBy` values accepted by GET /search (from the OpenAPI spec). */
export const SORT_FIELDS = [
  "liquidityUsd", "marketCapUsd", "priceUsd", "volume", "volume_5m", "volume_15m", "volume_30m", "volume_1h",
  "volume_6h", "volume_12h", "volume_24h", "top10", "dev", "insiders", "snipers", "holders", "buys", "sells",
  "totalTransactions", "fees.total", "fees.totalTrading", "fees.totalTips", "createdAt", "lpBurn",
  "curvePercentage", "communityMessages",
] as const;

export type ScreenerConfig = {
  query?: string;
  markets?: string[];
  minLiquidityUsd: number;
  minVolume24hUsd: number;
  maxRiskScore: number;
  maxAgeHours?: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  pageSize: number;
  maxPages: number;
};

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = numberEnv(name, fallback);
  if (!Number.isInteger(value) || value < min || value > max) fail(`${name} must be an integer from ${min} to ${max}, got ${value}`);
  return value;
}

function nonNegative(name: string, fallback: number): number {
  const value = numberEnv(name, fallback);
  if (value < 0) fail(`${name} must be 0 or greater, got ${value}`);
  return value;
}

export function readConfig(): ScreenerConfig {
  const sortBy = optionalEnv("SORT_BY") ?? "volume_24h";
  if (!(SORT_FIELDS as readonly string[]).includes(sortBy)) fail(`SORT_BY must be one of: ${SORT_FIELDS.join(", ")}`);

  const sortOrder = (optionalEnv("SORT_ORDER") ?? "desc").toLowerCase();
  if (sortOrder !== "asc" && sortOrder !== "desc") fail(`SORT_ORDER must be asc or desc, got "${sortOrder}"`);

  const markets = optionalEnv("MARKETS")
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  for (const market of markets ?? []) {
    if (!/^[a-z0-9.:-]+$/.test(market)) fail(`MARKETS contains an invalid value: "${market}" (use ids like pumpfun-amm,raydium)`);
  }

  const maxRiskScore = numberEnv("MAX_RISK_SCORE", 6);
  if (maxRiskScore < 0 || maxRiskScore > 10) fail(`MAX_RISK_SCORE must be between 0 and 10, got ${maxRiskScore}`);

  const maxAgeHours = nonNegative("MAX_AGE_HOURS", 0);

  return {
    query: optionalEnv("SEARCH_QUERY"),
    markets: markets?.length ? markets : undefined,
    minLiquidityUsd: nonNegative("MIN_LIQUIDITY_USD", 25_000),
    minVolume24hUsd: nonNegative("MIN_VOLUME_24H_USD", 50_000),
    maxRiskScore,
    maxAgeHours: maxAgeHours > 0 ? maxAgeHours : undefined,
    sortBy,
    sortOrder,
    pageSize: intEnv("PAGE_SIZE", 20, 1, 500),
    maxPages: intEnv("MAX_PAGES", 3, 1, 20),
  };
}

/** Maps the config to GET /search query parameters. Undefined values are dropped by the SDK. */
export function toSearchParams(config: ScreenerConfig, now = Date.now()): SearchParams {
  return {
    query: config.query,
    market: config.markets, // the SDK joins arrays with commas
    minLiquidity: config.minLiquidityUsd,
    minVolume_24h: config.minVolume24hUsd,
    maxRiskScore: config.maxRiskScore,
    minCreatedAt: config.maxAgeHours ? Math.round(now - config.maxAgeHours * 3_600_000) : undefined,
    sortBy: config.sortBy,
    sortOrder: config.sortOrder,
    limit: config.pageSize,
  };
}

/**
 * `data` can include up to 5 curated/promoted rows on top of the organic page.
 * Re-check the numeric filters locally so the screen only shows rows that match it.
 */
export function matchesLocally(row: SearchResult, config: ScreenerConfig, now = Date.now()): boolean {
  if ((row.liquidityUsd ?? 0) < config.minLiquidityUsd) return false;
  if ((row.volume_24h ?? 0) < config.minVolume24hUsd) return false;
  if (typeof row.riskScore === "number" && row.riskScore > config.maxRiskScore) return false;
  if (config.maxAgeHours && (row.createdAt ?? 0) < now - config.maxAgeHours * 3_600_000) return false;
  return true;
}

export function describeFilters(config: ScreenerConfig): string {
  const parts = [
    config.query ? `query "${config.query}"` : undefined,
    config.markets ? `markets ${config.markets.join(",")}` : "all markets",
    `liquidity >= $${config.minLiquidityUsd.toLocaleString("en-US")}`,
    `24h volume >= $${config.minVolume24hUsd.toLocaleString("en-US")}`,
    `risk <= ${config.maxRiskScore}`,
    config.maxAgeHours ? `age <= ${config.maxAgeHours}h` : undefined,
    `sort ${config.sortBy} ${config.sortOrder}`,
  ];
  return parts.filter(Boolean).join(" | ");
}
