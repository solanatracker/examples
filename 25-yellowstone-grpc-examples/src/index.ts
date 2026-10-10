/**
 * Yellowstone gRPC cookbook. Every recipe shares one connection helper and one set of
 * protocol decoders, so each file stays focused on the subscription it demonstrates.
 *
 *   npm start -- <recipe> [args]
 */
import { accounts, curves } from "./recipes/accounts.js";
import { decode } from "./recipes/decode.js";
import { launches, migrations, pools } from "./recipes/lifecycle.js";
import { notify } from "./recipes/notify.js";
import { price, top } from "./recipes/prices.js";
import { filters, latency, reconnect, slots } from "./recipes/stream.js";
import { pool, trades, wallet } from "./recipes/trades.js";
import { token, transactions } from "./recipes/transactions.js";
import { PROTOCOLS } from "./protocols/index.js";

type Recipe = { run: (args: string[]) => Promise<void>; usage: string; about: string; required?: number };

const RECIPES: Record<string, Recipe> = {
  // Connection
  slots: { run: slots, usage: "[seconds]", about: "Slot progression with every commitment status" },
  latency: { run: latency, usage: "[venue]", about: "Delay between the node seeing a transaction and you receiving it" },
  reconnect: { run: reconnect, usage: "[venues]", about: "Resume from the last seen slot after a disconnect, without duplicates" },
  filters: { run: filters, usage: "[venues]", about: "Change the subscription live: type +venue or -venue" },
  // Transactions
  transactions: { run: transactions, usage: "<address,...>", about: "Every transaction touching the given accounts", required: 1 },
  token: { run: token, usage: "<mint>", about: "Balance changes for one token, per wallet", required: 1 },
  // Trades
  trades: { run: trades, usage: "[venues]", about: "Every swap on the chosen venues, decoded" },
  wallet: { run: wallet, usage: "<wallet,...>", about: "Swaps made by specific wallets", required: 1 },
  pool: { run: pool, usage: "<pool,...>", about: "Swaps against specific pools or bonding curves", required: 1 },
  price: { run: price, usage: "<mint>", about: "Every fill for one token with its execution price", required: 1 },
  top: { run: top, usage: "[venues]", about: "Most traded tokens over a rolling 60s window" },
  // Lifecycle
  pools: { run: pools, usage: "[venues]", about: "New liquidity pools" },
  launches: { run: launches, usage: "[venues]", about: "New tokens on launchpad bonding curves" },
  migrations: { run: migrations, usage: "[venues]", about: "Bonding curves that graduated to an AMM" },
  // Accounts
  accounts: { run: accounts, usage: "<venue> [AccountType]", about: "Live program account state, decoded", required: 1 },
  curves: { run: () => curves(), usage: "", about: "Pump bonding curve progress milestones" },
  // Bots and tools
  notify: { run: notify, usage: "[venues]", about: "Telegram alerts for new pools and launches" },
  decode: { run: decode, usage: "<signature>", about: "Replay one transaction through the decoders (SOLANA_RPC_URL)", required: 1 },
};

function help() {
  const width = Math.max(...Object.entries(RECIPES).map(([name, r]) => `${name} ${r.usage}`.length));
  console.log("Usage: npm start -- <recipe> [args]\n\nRecipes:");
  for (const [name, r] of Object.entries(RECIPES)) console.log(`  ${`${name} ${r.usage}`.padEnd(width)}  ${r.about}`);
  console.log(`\nVenues (comma-separated, default all):\n  ${PROTOCOLS.map((p) => p.id).join(", ")}`);
}

const [name, ...args] = process.argv.slice(2);
const recipe = name ? RECIPES[name] : undefined;

if (!recipe) {
  if (name && !["help", "--help", "-h"].includes(name)) console.error(`Unknown recipe "${name}"\n`);
  help();
  process.exit(name && !["help", "--help", "-h"].includes(name) ? 1 : 0);
}

if (args.length < (recipe.required ?? 0)) {
  console.error(`Usage: npm start -- ${name} ${recipe.usage}`);
  process.exit(1);
}

recipe.run(args).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
