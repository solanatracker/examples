import idl from "../../idl/meteora-damm-v2.json" with { type: "json" };
import { big, num, str } from "../lib/parsed.js";
import { base, coderFor, decode } from "./shared.js";
import type { Protocol } from "./types.js";

const coder = coderFor(idl);
type SwapResult = { includedFeeInputAmount?: bigint; outputAmount?: bigint };

export const meteoraDammV2: Protocol = {
  id: "meteora-damm-v2",
  label: "Meteora DAMM v2",
  programId: coder.programId,
  coder,

  trades(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("EvtSwap2").map((e) => {
      const ix = d.ixAt(e.path);
      const aToB = num(e.data.tradeDirection) === 0;
      const result = (e.data.swapResult ?? {}) as SwapResult;
      const a = ix?.accounts.tokenAMint ?? "";
      const b = ix?.accounts.tokenBMint ?? "";
      return {
        ...base(tx, "meteora-damm-v2"),
        label: ix?.name ?? "swap",
        path: e.path,
        trader: ix?.accounts.payer ?? tx.signer,
        pool: str(e.data.pool),
        inputMint: aToB ? a : b,
        inputAmount: big(result.includedFeeInputAmount),
        outputMint: aToB ? b : a,
        outputAmount: big(result.outputAmount),
      };
    });
  },

  pools(tx) {
    return decode(tx, coder)
      .eventsNamed("EvtInitializePool")
      .map((e) => ({
        ...base(tx, "meteora-damm-v2"),
        pool: str(e.data.pool),
        mintA: str(e.data.tokenAMint),
        mintB: str(e.data.tokenBMint),
        creator: str(e.data.creator) || tx.signer,
      }));
  },
};
