import type { BundlersResponse, Client, TokenDetailResponse } from "@solana-tracker/data-api";
import { createDataApiClient, describeError, run, withRetry } from "./client.js";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { compactUsd, short, table } from "./format.js";
import { evaluateRisk, normalizeFactors, type GatePolicy, type GateVerdict } from "./risk-gate.js";

const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRENDING_LIMIT = 10;

function percentEnv(name: string, fallback: number): number {
  const value = numberEnv(name, fallback);
  if (value < 0 || value > 100) fail(`${name} must be between 0 and 100, got ${value}`);
  return value;
}

function readPolicy(): GatePolicy {
  const maxScore = numberEnv("MAX_RISK_SCORE", 6);
  if (maxScore < 0 || maxScore > 10) fail(`MAX_RISK_SCORE must be between 0 and 10, got ${maxScore}`);
  return {
    maxScore,
    maxSniperPct: percentEnv("MAX_SNIPER_PCT", 20),
    maxInsiderPct: percentEnv("MAX_INSIDER_PCT", 20),
    blockDangerFactors: (optionalEnv("BLOCK_DANGER_FACTORS") ?? "true").toLowerCase() !== "false",
  };
}

/** Percent of supply. Unlike format.pct() this has no +/- sign. */
const share = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2)}%` : "n/a";

function deepestPool(info: TokenDetailResponse) {
  return [...(info.pools ?? [])].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

function printVerdict(label: string, verdict: GateVerdict): void {
  console.log(`\n${label}: ${verdict.status}`);
  for (const reason of verdict.reasons) console.log(`  - ${reason}`);
}

/** Detailed check for one mint: token info (includes `risk`) plus the dedicated bundlers endpoint. */
async function checkMint(client: Client, mint: string, policy: GatePolicy): Promise<void> {
  const info = await withRetry("getTokenInfo", () => client.getTokenInfo(mint));
  const { risk } = info;
  const pool = deepestPool(info);

  console.log(`\n${info.token?.symbol ?? "?"} (${info.token?.name ?? "unknown"})  ${short(mint, 6)}`);
  console.log(
    `Deepest pool ${short(pool?.poolId)} on ${pool?.market ?? "?"}  liquidity ${compactUsd(pool?.liquidity?.usd)}` +
      `  mcap ${compactUsd(pool?.marketCap?.usd)}  holders ${info.holders ?? "n/a"}`,
  );
  console.log(
    `Risk score ${risk?.score ?? "n/a"} / 10   rugged: ${risk?.rugged ? "yes" : "no"}` +
      `   jupiterVerified: ${risk?.jupiterVerified === undefined ? "n/a" : risk.jupiterVerified ? "yes" : "no"}`,
  );

  // risk.bundlers may be omitted from /tokens/{mint} (the SDK then fills zeros); the dedicated endpoint is authoritative.
  let bundlers: BundlersResponse | undefined;
  try {
    bundlers = await withRetry("getTokenBundlers", () => client.getTokenBundlers(mint), { attempts: 2 });
  } catch (error) {
    console.warn(`Bundler endpoint unavailable (${describeError(error)})`);
  }

  console.log("\nHolder groups (groups can overlap; do not add them up)");
  table(
    ["Group", "Wallets", "Supply held"],
    [
      ["Snipers", String(risk?.snipers?.count ?? "n/a"), share(risk?.snipers?.totalPercentage)],
      ["Insiders", String(risk?.insiders?.count ?? "n/a"), share(risk?.insiders?.totalPercentage)],
      // Not falling back to risk.bundlers: the SDK fills an all-zero category when the wire omits it.
      ["Bundlers", String(bundlers?.total ?? "unavailable"), share(bundlers?.percentage)],
      ["Developer", "-", share(risk?.dev?.percentage)],
      ["Top 10", "10", share(risk?.top10)],
    ],
  );

  const factors = normalizeFactors(risk?.risks);
  console.log(`\nRisk factors (${factors.length})`);
  if (factors.length === 0) {
    console.log("  none reported");
  } else {
    table(
      ["Level", "Factor", "Detail"],
      factors.map((f) => [f.level, f.name, f.value ?? f.description]),
    );
  }

  printVerdict(`Risk gate (MAX_RISK_SCORE=${policy.maxScore})`, evaluateRisk(risk, policy));
}

/** No mint given: screen the current 1h trending list. Each row already carries its `risk` object. */
async function checkTrending(client: Client, policy: GatePolicy): Promise<void> {
  console.log(`No TOKEN_MINT set: screening the top ${TRENDING_LIMIT} trending tokens (1h).`);
  const trending = await withRetry("getTrendingTokens", () => client.getTrendingTokens("1h"));
  const rows = trending.slice(0, TRENDING_LIMIT).map((item) => {
    const verdict = evaluateRisk(item.risk, policy);
    return {
      verdict,
      cells: [
        item.token?.symbol ?? "?",
        short(item.token?.mint),
        String(item.risk?.score ?? "n/a"),
        share(item.risk?.snipers?.totalPercentage),
        share(item.risk?.insiders?.totalPercentage),
        share(item.risk?.top10),
        verdict.status,
        verdict.reasons[0] ?? "",
      ],
    };
  });

  console.log("");
  table(["Symbol", "Mint", "Score", "Snipers", "Insiders", "Top10", "Gate", "First reason"], rows.map((r) => r.cells));

  const count = (status: GateVerdict["status"]) => rows.filter((r) => r.verdict.status === status).length;
  console.log(
    `\nRisk gate (MAX_RISK_SCORE=${policy.maxScore}) over ${rows.length} trending tokens: ` +
      `${count("PASS")} PASS, ${count("FAIL")} FAIL, ${count("UNKNOWN")} UNKNOWN`,
  );
  console.log("Set TOKEN_MINT in .env for a full breakdown of one token.");
}

run(async () => {
  const client = createDataApiClient(); // fails fast when ST_API_KEY is missing
  const policy = readPolicy();
  const mint = optionalEnv("TOKEN_MINT");
  if (mint && !MINT_PATTERN.test(mint)) fail(`TOKEN_MINT is not a base58 mint address: "${mint}"`);

  console.log("Solana rug check (score is a signal, not a guarantee)");
  console.log(
    `Policy: score <= ${policy.maxScore}, snipers <= ${policy.maxSniperPct}%, insiders <= ${policy.maxInsiderPct}%, ` +
      `danger factors ${policy.blockDangerFactors ? "block" : "allowed"}`,
  );

  if (mint) await checkMint(client, mint, policy);
  else await checkTrending(client, policy);
});
