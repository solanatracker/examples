import { optionalEnv } from "./env.js";
import { usd } from "./format.js";
import { passRiskGate } from "./risk-gate.js";
import { resolveTokenMint } from "./resolve-token.js";
import { createDataApiClient } from "./client.js";

const client = createDataApiClient();
const minScore = Number(optionalEnv("MIN_RISK_SCORE", "6"));

console.log("=== Rug / risk check ===\n");

const mint = await resolveTokenMint(client);

const data = await client.getTokenInfo(mint);
const { risk } = data;
const pool = data.pools?.[0];
const symbol = data.token?.symbol || mint.slice(0, 8);

console.log(`${symbol} (${mint.slice(0, 8)}…)`);
console.log(`Risk score: ${risk?.score ?? "n/a"}/10${risk?.rugged ? "  ⚠ RUGGED" : ""}`);
if (pool) {
  console.log(`Price ${usd(pool.price?.usd)}  Liq ${usd(pool.liquidity?.usd)}  MC ${usd(pool.marketCap?.usd)}`);
}

const rows: Array<[string, string]> = [
  ["Snipers", risk?.snipers?.totalPercentage != null ? `${risk.snipers.totalPercentage.toFixed(2)}% (${risk.snipers.count ?? "?"} wallets)` : "—"],
  ["Insiders", risk?.insiders?.totalPercentage != null ? `${risk.insiders.totalPercentage.toFixed(2)}% (${risk.insiders.count ?? "?"} wallets)` : "—"],
  ["Bundlers", risk?.bundlers?.totalPercentage != null ? `${risk.bundlers.totalPercentage.toFixed(2)}% (${risk.bundlers.count ?? "?"} wallets)` : "—"],
  ["Dev holding", risk?.dev?.percentage != null ? `${risk.dev.percentage.toFixed(2)}%` : "—"],
];

console.log("\nHolder risk:");
for (const [label, value] of rows) console.log(`  ${label.padEnd(12)} ${value}`);

if (risk?.risks?.length) {
  console.log("\nFlags:");
  for (const flag of risk.risks.slice(0, 8)) {
    console.log(" ", flag.name || flag.description || JSON.stringify(flag));
  }
}

const gate = passRiskGate(risk, { minScore, maxSnipers: 20 });
console.log(`\nBot gate (min score ${minScore}): ${gate.ok ? "PASS" : "FAIL"} — ${gate.reason}`);

