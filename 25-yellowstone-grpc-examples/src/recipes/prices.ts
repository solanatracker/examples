/**
 * Prices derived from executed trades: the price a swap actually filled at, per venue and pool.
 */
import { compact, pct, short, table, time } from "../lib/format.js";
import { watchTransactions } from "../lib/watch.js";
import { orient, PROTOCOLS, quoteSymbol, selectProtocols } from "../protocols/index.js";

/**
 * `price <mint>`: every fill for one token, in the quote asset of the pool it traded in.
 * The same token often trades on several venues at once; the pool column shows where.
 */
export async function price(args: string[]) {
  const mint = args[0] ?? "";
  watchTransactions({ accountInclude: [mint] }, (tx) => {
    for (const p of PROTOCOLS) {
      for (const trade of p.trades(tx)) {
        const o = orient(trade, tx.decimals);
        if (!o || o.token !== mint || o.price === undefined) continue;
        console.log(
          `${time()}  ${o.price.toPrecision(6).padStart(14)} ${quoteSymbol(o.quote).padEnd(4)}  ${o.side.padEnd(4)}  ${compact(o.tokenAmount)} tokens  ${p.id} ${short(trade.pool)}`,
        );
      }
    }
  });
  console.log(`Watching fills for ${mint}`);
}

type Fill = { at: number; price: number; quote: number; buy: boolean };

/**
 * `top [venues]`: the most traded tokens over the last minute, refreshed every 5 seconds.
 * Volume is summed in each pair's own quote asset, so SOL and USDC pairs are listed separately.
 */
export async function top(args: string[]) {
  const protocols = selectProtocols(args[0]);
  const WINDOW_MS = 60_000;
  const fills = new Map<string, Fill[]>();

  watchTransactions({ accountInclude: protocols.map((p) => p.programId) }, (tx) => {
    for (const p of protocols) {
      for (const trade of p.trades(tx)) {
        const o = orient(trade, tx.decimals);
        if (!o || o.price === undefined || o.quoteAmount === undefined) continue;
        const key = `${o.token}:${o.quote}`;
        const list = fills.get(key) ?? [];
        list.push({ at: Date.now(), price: o.price, quote: o.quoteAmount, buy: o.side === "buy" });
        fills.set(key, list);
      }
    }
  });

  setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    const rows: { cells: string[]; count: number }[] = [];
    for (const [key, list] of fills) {
      const recent = list.filter((f) => f.at >= cutoff);
      if (recent.length === 0) {
        fills.delete(key);
        continue;
      }
      fills.set(key, recent);
      const [token = "", quote = ""] = key.split(":");
      const first = recent[0]!;
      const last = recent.at(-1)!;
      const buys = recent.filter((f) => f.buy).length;
      const volume = recent.reduce((sum, f) => sum + f.quote, 0);
      rows.push({
        count: recent.length,
        cells: [
          short(token, 6),
          quoteSymbol(quote),
          String(recent.length),
          `${buys}/${recent.length - buys}`,
          compact(volume),
          last.price.toPrecision(4),
          pct(((last.price - first.price) / first.price) * 100),
        ],
      });
    }
    rows.sort((a, b) => b.count - a.count);
    if (process.stdout.isTTY) console.clear();
    console.log(`${time()}  most traded, last 60s, ${protocols.length} venue(s)\n`);
    table(["token", "quote", "trades", "buy/sell", "volume", "last", "change"], rows.slice(0, 20).map((r) => r.cells));
  }, 5_000);
}
