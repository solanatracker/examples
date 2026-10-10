import idl from "../../idl/pump.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import { camel } from "../lib/idl.js";
import { SYSTEM_PROGRAM, WSOL } from "../lib/tx.js";
import { base, coderFor, decode } from "./shared.js";
import type { ParsedTx } from "../lib/parsed.js";
import type { Protocol } from "./types.js";

const coder = coderFor(idl);

/** Curves quoted in SOL leave `quoteMint` as the default key; everything else names its quote mint. */
const quoteOf = (data: Record<string, unknown>) => {
  const mint = str(data.quoteMint);
  const sol = !mint || mint === SYSTEM_PROGRAM || mint === WSOL;
  return { mint: sol ? WSOL : mint, amount: sol ? big(data.solAmount) : big(data.quoteAmount) };
};

/**
 * The bonding curve of `mint` touched by the instruction at `path`, for instruction variants the
 * bundled IDL does not know yet. The curve owns the pool-side token account, so it is the owner of
 * a `mint` balance that is not the trader's and that the instruction passes in.
 */
function curveOf(tx: ParsedTx, path: string, mint: string, trader: string) {
  const accounts = new Set(tx.instructions.find((ix) => ix.path === path)?.accounts);
  for (const b of tx.balances.values()) {
    if (b.mint === mint && b.owner !== trader && accounts.has(b.owner)) return b.owner;
  }
  return "";
}

export const pump: Protocol = {
  id: "pump",
  label: "Pump.fun bonding curve",
  programId: coder.programId,
  coder,

  // Every buy and sell variant (including ones newer than the bundled IDL) emits TradeEvent,
  // so trades are read from the event and only the curve address comes from the instruction.
  trades(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("TradeEvent").map((e) => {
      const buy = e.data.isBuy === true;
      const quote = quoteOf(e.data);
      const mint = str(e.data.mint);
      const tokens = big(e.data.tokenAmount);
      const trader = str(e.data.user);
      return {
        ...base(tx, "pump"),
        label: camel(str(e.data.ixName)) || (buy ? "buy" : "sell"),
        path: e.path,
        trader,
        pool: d.ixAt(e.path)?.accounts.bondingCurve ?? curveOf(tx, e.path, mint, trader),
        inputMint: buy ? quote.mint : mint,
        inputAmount: buy ? quote.amount : tokens,
        outputMint: buy ? mint : quote.mint,
        outputAmount: buy ? tokens : quote.amount,
      };
    });
  },

  launches(tx) {
    return decode(tx, coder)
      .eventsNamed("CreateEvent")
      .map((e) => ({
        ...base(tx, "pump"),
        mint: str(e.data.mint),
        curve: str(e.data.bondingCurve),
        creator: str(e.data.creator) || str(e.data.user),
        name: str(e.data.name),
        symbol: str(e.data.symbol),
        uri: str(e.data.uri),
      }));
  },

  migrations(tx) {
    return decode(tx, coder)
      .eventsNamed("CompletePumpAmmMigrationEvent")
      .map((e) => ({ ...base(tx, "pump"), mint: str(e.data.mint), curve: str(e.data.bondingCurve), pool: str(e.data.pool) }));
  },
};
