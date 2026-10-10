import { createCoder, type Idl } from "../lib/idl.js";
import { eventsOf, instructionsOf, type ParsedTx, type ProgramEvent, type ProgramInstruction } from "../lib/parsed.js";
import { isUnder, toNumber, WSOL } from "../lib/tx.js";
import type { Trade } from "./types.js";

export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

export const coderFor = (idl: unknown) => createCoder(idl as Idl);

export const base = (tx: ParsedTx, venue: string) => ({ venue, signature: tx.signature, slot: tx.slot });

/**
 * A program's decoded instructions and events for one transaction, with a lookup that pairs an
 * event with the instruction that emitted it (same call-tree path). Events carry amounts;
 * the instruction carries the mints and accounts many events leave out.
 */
export function decode(tx: ParsedTx, coder: ReturnType<typeof createCoder>) {
  const instructions = instructionsOf(tx, coder);
  const events = eventsOf(tx, coder);
  const byPath = new Map(instructions.map((ix) => [ix.path, ix]));
  return {
    instructions,
    events,
    ixAt: (path: string): ProgramInstruction | undefined => byPath.get(path),
    eventsNamed: (...names: string[]): ProgramEvent[] => events.filter((e) => names.includes(e.name)),
    ixsNamed: (...names: string[]): ProgramInstruction[] => instructions.filter((ix) => names.includes(ix.name)),
  };
}

/** Mint of a token account, from the transaction's token balance list. */
export const mintOf = (tx: ParsedTx, account: string | undefined) => (account ? tx.balances.get(account)?.mint : undefined);

/** Sum of transfers made below `path` that match the given source/destination accounts. */
export function moved(tx: ParsedTx, path: string, match: { from?: string; to?: string }) {
  let amount = 0n;
  let mint: string | undefined;
  for (const t of tx.transfers) {
    if (!isUnder(t.path, path)) continue;
    if (match.from && t.from !== match.from) continue;
    if (match.to && t.to !== match.to) continue;
    amount += t.amount;
    mint ??= t.mint;
  }
  return { amount, mint };
}

const QUOTE_RANK = new Map([
  [USDC, 3],
  [USDT, 2],
  [WSOL, 1],
]);

/**
 * Reads a trade from the token's point of view: which side is the quote (USDC > USDT > SOL),
 * whether the trader bought or sold the other side, and the price in quote units.
 * A pair with no known quote mint (token-to-token) has no side.
 */
export function orient(trade: Trade, decimals: (mint: string) => number | undefined) {
  const inRank = QUOTE_RANK.get(trade.inputMint) ?? 0;
  const outRank = QUOTE_RANK.get(trade.outputMint) ?? 0;
  if (inRank === 0 && outRank === 0) return undefined;
  const buy = inRank > outRank;
  const [token, tokenRaw, quote, quoteRaw] = buy
    ? [trade.outputMint, trade.outputAmount, trade.inputMint, trade.inputAmount]
    : [trade.inputMint, trade.inputAmount, trade.outputMint, trade.outputAmount];
  const td = decimals(token);
  const qd = decimals(quote);
  const tokenAmount = td === undefined ? undefined : toNumber(tokenRaw, td);
  const quoteAmount = qd === undefined ? undefined : toNumber(quoteRaw, qd);
  const price = tokenAmount && quoteAmount !== undefined ? quoteAmount / tokenAmount : undefined;
  return { side: buy ? ("buy" as const) : ("sell" as const), token, quote, tokenAmount, quoteAmount, price };
}

export const quoteSymbol = (mint: string) => (mint === USDC ? "USDC" : mint === USDT ? "USDT" : mint === WSOL ? "SOL" : "?");
