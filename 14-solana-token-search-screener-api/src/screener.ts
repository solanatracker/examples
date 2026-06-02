import type { Client } from "@solana-tracker/data-api";

export type ScreenerRow = {
  symbol?: string;
  mint?: string;
  liquidityUsd?: number;
  curvePercentage?: number;
  volume_24h?: number;
  volume24h?: number;
  holders?: number;
  risk?: { score?: number };
};

export async function runProfile(client: Client, title: string, params: Record<string, unknown>) {
  const res = await client.searchTokens(params);
  const rows = (res.data ?? []) as ScreenerRow[];
  console.log(`\n=== ${title} (${rows.length} results) ===`);
  if (!rows.length) {
    console.log("  (no matches — loosen filters)");
    return;
  }
  for (const row of rows.slice(0, 8)) {
    const sym = (row.symbol || row.mint?.slice(0, 6) || "?").padEnd(8);
    const mint = row.mint ? row.mint.slice(0, 8) + "…" : "";
    const liq = row.liquidityUsd != null ? `$${Math.round(row.liquidityUsd)}` : "—";
    const curve = row.curvePercentage != null ? `${row.curvePercentage.toFixed(0)}%` : "";
    const vol = row.volume_24h ?? row.volume24h;
    const volStr = vol != null ? `vol $${Math.round(vol)}` : "";
    const risk = row.risk?.score != null ? `risk ${row.risk.score}` : "";
    console.log(`  ${sym}  ${mint.padEnd(10)} liq ${liq.padStart(8)}  ${curve.padEnd(4)}  ${volStr}  ${risk}`.trimEnd());
  }
}

