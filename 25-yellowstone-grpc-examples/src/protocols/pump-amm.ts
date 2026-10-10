import idl from "../../idl/pump-amm.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import { base, coderFor, decode, mintOf } from "./shared.js";
import type { Protocol } from "./types.js";

const coder = coderFor(idl);

export const pumpAmm: Protocol = {
  id: "pump-amm",
  label: "PumpSwap AMM",
  programId: coder.programId,
  coder,

  trades(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("BuyEvent", "SellEvent").map((e) => {
      const ix = d.ixAt(e.path);
      const baseMint = ix?.accounts.baseMint ?? mintOf(tx, str(e.data.userBaseTokenAccount)) ?? "";
      const quoteMint = ix?.accounts.quoteMint ?? mintOf(tx, str(e.data.userQuoteTokenAccount)) ?? "";
      const buy = e.name === "BuyEvent";
      // Pool-side amounts (before the LP, protocol and creator fees the event lists separately).
      const baseAmount = big(buy ? e.data.baseAmountOut : e.data.baseAmountIn);
      const quoteAmount = big(buy ? e.data.quoteAmountIn : e.data.quoteAmountOut);
      return {
        ...base(tx, "pump-amm"),
        label: ix?.name ?? (buy ? "buy" : "sell"),
        path: e.path,
        trader: str(e.data.user),
        pool: str(e.data.pool),
        inputMint: buy ? quoteMint : baseMint,
        inputAmount: buy ? quoteAmount : baseAmount,
        outputMint: buy ? baseMint : quoteMint,
        outputAmount: buy ? baseAmount : quoteAmount,
      };
    });
  },

  pools(tx) {
    return decode(tx, coder)
      .eventsNamed("CreatePoolEvent")
      .map((e) => ({
        ...base(tx, "pump-amm"),
        pool: str(e.data.pool),
        mintA: str(e.data.baseMint),
        mintB: str(e.data.quoteMint),
        creator: str(e.data.creator),
      }));
  },
};
