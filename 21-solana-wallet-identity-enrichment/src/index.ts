import { createDataApiClient, run, withRetry } from "./client.js";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { compact, compactUsd, short, table, time, usd } from "./format.js";
import { badge, countBy, displayName, roleDetail } from "./identity.js";

const DEFAULT_MINT = "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN"; // token used in the SDK and API docs examples
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function main(): Promise<void> {
  const client = createDataApiClient();
  const mint = optionalEnv("TOKEN_MINT") ?? DEFAULT_MINT;
  if (!BASE58.test(mint)) fail(`TOKEN_MINT is not a valid base58 mint address: "${mint}"`);
  const limit = numberEnv("LIMIT", 100);
  const showRows = numberEnv("SHOW_ROWS", 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) fail("LIMIT must be an integer from 1 to 500");
  if (!Number.isInteger(showRows) || showRows < 1) fail("SHOW_ROWS must be a positive integer");

  // 1. Recent swaps with current wallet identity attached. Unknown wallets come back with identity: null.
  const history = await withRetry("getTokenTradeHistory", () =>
    client.getTokenTradeHistory(mint, { enrich: "identity", limit, sortDirection: "DESC" }),
  );
  const trades = history.trades;
  console.log(`\nLast ${trades.length} swap(s) for ${mint}, identity enriched\n`);
  table(
    ["Time", "Side", "Wallet", "Label", "Badge", "Volume", "Tags"],
    trades.slice(0, showRows).map((t) => [
      time(t.time),
      t.type,
      short(t.wallet),
      displayName(t.identity, t.wallet).slice(0, 20),
      badge(t.identity),
      usd(t.volume),
      (t.identity?.tags ?? []).join(","),
    ]),
  );

  // 2. Coverage: how much of the flow is labeled, and by what.
  const wallets = new Map(trades.map((t) => [t.wallet, t.identity ?? null]));
  const labeledWallets = [...wallets.values()].filter((id) => id !== null).length;
  const labeledTrades = trades.filter((t) => t.identity).length;
  const labeledVolume = trades.filter((t) => t.identity).reduce((sum, t) => sum + (t.volume ?? 0), 0);
  const totalVolume = trades.reduce((sum, t) => sum + (t.volume ?? 0), 0);
  console.log(
    `\nLabeled: ${labeledTrades}/${trades.length} trades, ${labeledWallets}/${wallets.size} wallets, ` +
      `${totalVolume > 0 ? ((labeledVolume / totalVolume) * 100).toFixed(1) : "0.0"}% of volume`,
  );
  const byTag = countBy([...wallets.values()], (id) => id?.tags ?? []);
  if (byTag.length > 0) console.log(`Wallets by tag: ${byTag.map(([tag, n]) => `${tag} ${n}`).join(", ")}`);

  // 3. Top holders with identity: token-scoped roles (pool, developer) resolve against this mint.
  const holders = await withRetry("getTokenHolders", () => client.getTokenHolders(mint, "identity"));
  console.log(`\nTop holders (${compact(holders.total)} total), identity enriched\n`);
  table(
    ["#", "Wallet", "Label", "Badge", "Role / detail", "Supply", "Value"],
    holders.accounts.slice(0, showRows).map((h, i) => [
      String(i + 1),
      short(h.wallet),
      displayName(h.identity, h.wallet).slice(0, 20),
      badge(h.identity),
      roleDetail(h.identity).slice(0, 28),
      `${h.percentage.toFixed(2)}%`,
      compactUsd(h.value?.usd),
    ]),
  );
  const infra = holders.accounts.filter((h) => h.identity?.pool || h.identity?.exchange);
  const infraShare = infra.reduce((sum, h) => sum + h.percentage, 0);
  console.log(`\nPool and exchange accounts among top holders: ${infra.length}, holding ${infraShare.toFixed(2)}% of supply`);
}

run(main);
