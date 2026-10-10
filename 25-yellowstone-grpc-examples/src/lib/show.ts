import { orient, quoteSymbol, type Launch, type Migration, type NewPool, type Trade } from "../protocols/index.js";
import { short, time } from "./format.js";
import type { ParsedTx } from "./parsed.js";
import { formatUnits } from "./tx.js";

/** Raw amount with mint decimals when the transaction reveals them, otherwise the raw integer. */
export function amount(tx: ParsedTx, mint: string, raw: bigint): string {
  const decimals = tx.decimals(mint);
  return decimals === undefined ? `${raw} raw` : formatUnits(raw, decimals);
}

const pad = (s: string, n: number) => s.padEnd(n);
/** SOL, USDC and USDT by name; anything else as a shortened mint. */
const sym = (mint: string) => (quoteSymbol(mint) === "?" ? short(mint) : quoteSymbol(mint));

/**
 * One line per trade. Pairs with a known quote asset (SOL, USDC, USDT) read as a buy or sell of
 * the other token with a price; token-to-token swaps print both legs.
 */
export function tradeLine(trade: Trade, tx: ParsedTx): string {
  const head = `${time()}  ${pad(trade.venue, 18)}`;
  const tail = `${short(trade.trader)}  ${short(trade.signature, 6)}`;
  const o = orient(trade, tx.decimals);
  if (!o) {
    return `${head}${pad("swap", 5)} ${amount(tx, trade.inputMint, trade.inputAmount)} ${sym(trade.inputMint)} → ${amount(tx, trade.outputMint, trade.outputAmount)} ${sym(trade.outputMint)}  ${tail}`;
  }
  const [tokenRaw, quoteRaw] = o.side === "buy" ? [trade.outputAmount, trade.inputAmount] : [trade.inputAmount, trade.outputAmount];
  const q = quoteSymbol(o.quote);
  const price = o.price === undefined ? "?" : o.price.toPrecision(4);
  return `${head}${pad(o.side, 5)} ${amount(tx, o.token, tokenRaw)} ${sym(o.token)} for ${amount(tx, o.quote, quoteRaw)} ${q} @ ${price} ${q}  ${tail}`;
}

export function poolLine(p: NewPool): string {
  return `${time()}  ${pad(p.venue, 18)}pool ${p.pool}  ${sym(p.mintA)} / ${sym(p.mintB)}  by ${short(p.creator)}  ${short(p.signature, 6)}`;
}

export function launchLine(l: Launch): string {
  const name = [l.symbol, l.name].filter(Boolean).join(" · ") || "(no metadata)";
  return `${time()}  ${pad(l.venue, 18)}${name}  mint ${l.mint}  curve ${short(l.curve)}  by ${short(l.creator)}`;
}

export function migrationLine(m: Migration): string {
  return `${time()}  ${pad(m.venue, 18)}mint ${m.mint} left curve ${short(m.curve)}${m.pool ? ` → pool ${m.pool}` : ""}  ${short(m.signature, 6)}`;
}
