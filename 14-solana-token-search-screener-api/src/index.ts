import type { SearchResult } from "@solana-tracker/data-api";
import { createDataApiClient, run, withRetry } from "./client.js";
import { compact, compactUsd, short, table } from "./format.js";
import { describeFilters, matchesLocally, readConfig, toSearchParams } from "./screener.js";

function age(createdAtMs: number | undefined, now: number): string {
  if (!createdAtMs) return "n/a";
  const hours = (now - createdAtMs) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

run(async () => {
  const client = createDataApiClient(); // fails fast when ST_API_KEY is missing
  const config = readConfig();
  const now = Date.now();
  const baseParams = toSearchParams(config, now);

  console.log("Solana token screener");
  console.log(`Filters: ${describeFilters(config)}\n`);

  const byMint = new Map<string, SearchResult>();
  let dropped = 0;
  let total: number | undefined;
  let cursor: string | undefined;
  let page = 1;

  for (let fetched = 0; fetched < config.maxPages; fetched++) {
    // Prefer the cursor (faster for deep pages); fall back to page numbers if none is returned.
    const params = cursor ? { ...baseParams, cursor } : { ...baseParams, page };
    const res = await withRetry(`searchTokens page ${fetched + 1}`, () => client.searchTokens(params));
    total ??= res.total;

    for (const row of res.data ?? []) {
      if (!row.mint || byMint.has(row.mint)) continue;
      if (!matchesLocally(row, config, now)) {
        dropped++;
        continue;
      }
      byMint.set(row.mint, row);
    }

    const more = res.hasMore ?? (res.pages !== undefined && page < res.pages);
    console.log(`page ${fetched + 1}: ${res.data?.length ?? 0} rows${more ? "" : " (last page)"}`);
    if (!more) break;
    if (res.nextCursor) cursor = res.nextCursor;
    else page++;
  }

  const rows = [...byMint.values()];
  if (rows.length === 0) {
    console.log("\nNo tokens matched. Loosen MIN_LIQUIDITY_USD, MIN_VOLUME_24H_USD or MAX_RISK_SCORE.");
    return;
  }

  console.log("");
  table(
    ["#", "Symbol", "Mint", "Market", "Liquidity", "MCap", "Vol 24h", "Holders", "Risk", "Age"],
    rows.map((r, i) => [
      String(i + 1),
      (r.symbol ?? "?").slice(0, 12),
      short(r.mint),
      r.market ?? "?",
      compactUsd(r.liquidityUsd),
      compactUsd(r.marketCapUsd),
      compactUsd(r.volume_24h),
      compact(r.holders),
      r.riskScore === undefined ? "n/a" : String(r.riskScore),
      age(r.createdAt, now),
    ]),
  );

  console.log(
    `\nScreener: ${rows.length} tokens shown` +
      (total !== undefined ? ` of ${total.toLocaleString("en-US")} matches` : "") +
      (dropped ? `, ${dropped} rows dropped by local re-check (promoted or out-of-range)` : ""),
  );
});
