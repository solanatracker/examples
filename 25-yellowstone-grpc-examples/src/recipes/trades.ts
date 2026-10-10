/**
 * Decoded trades. One shared parse per transaction feeds every selected venue decoder.
 */
import { short } from "../lib/format.js";
import { tradeLine } from "../lib/show.js";
import { watchTransactions } from "../lib/watch.js";
import { PROTOCOLS, selectProtocols } from "../protocols/index.js";

/** `trades [venues]`: every swap on the chosen venues (comma-separated ids, default all). */
export async function trades(args: string[]) {
  const protocols = selectProtocols(args[0]);
  watchTransactions({ accountInclude: protocols.map((p) => p.programId) }, (tx) => {
    for (const p of protocols) for (const trade of p.trades(tx)) console.log(tradeLine(trade, tx));
  });
  console.log(`Streaming trades on ${protocols.map((p) => p.label).join(", ")}`);
}

/**
 * `wallet <address,...>`: trades made by specific wallets on any supported venue.
 * The filter matches any transaction mentioning the wallet; the decoder keeps the ones where it traded.
 */
export async function wallet(args: string[]) {
  const wallets = new Set((args[0] ?? "").split(",").filter(Boolean));
  watchTransactions({ accountInclude: [...wallets] }, (tx) => {
    for (const p of PROTOCOLS) {
      for (const trade of p.trades(tx)) if (wallets.has(trade.trader) || wallets.has(tx.signer)) console.log(tradeLine(trade, tx));
    }
  });
  console.log(`Watching trades by ${[...wallets].map((w) => short(w)).join(", ")}`);
}

/** `pool <address,...>`: trades against specific pools or bonding curves. */
export async function pool(args: string[]) {
  const pools = new Set((args[0] ?? "").split(",").filter(Boolean));
  watchTransactions({ accountInclude: [...pools] }, (tx) => {
    for (const p of PROTOCOLS) for (const trade of p.trades(tx)) if (pools.has(trade.pool)) console.log(tradeLine(trade, tx));
  });
  console.log(`Watching trades in ${[...pools].map((a) => short(a)).join(", ")}`);
}
