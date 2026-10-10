import idl from "../../idl/meteora-damm-v1.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import { base, coderFor, decode, mintOf } from "./shared.js";
import type { Protocol, Trade } from "./types.js";

const coder = coderFor(idl);

export const meteoraDammV1: Protocol = {
  id: "meteora-damm-v1",
  label: "Meteora DAMM v1",
  programId: coder.programId,
  coder,

  // The Swap event has amounts only; the instruction names the pool and the trader's token accounts.
  trades(tx) {
    const d = decode(tx, coder);
    const out: Trade[] = [];
    for (const e of d.eventsNamed("Swap")) {
      const ix = d.ixAt(e.path);
      if (!ix) continue;
      out.push({
        ...base(tx, "meteora-damm-v1"),
        label: ix.name,
        path: e.path,
        trader: ix.accounts.user ?? tx.signer,
        pool: ix.accounts.pool ?? "",
        inputMint: mintOf(tx, ix.accounts.userSourceToken) ?? "",
        inputAmount: big(e.data.inAmount),
        outputMint: mintOf(tx, ix.accounts.userDestinationToken) ?? "",
        outputAmount: big(e.data.outAmount),
      });
    }
    return out;
  },

  pools(tx) {
    return decode(tx, coder)
      .eventsNamed("PoolCreated")
      .map((e) => ({
        ...base(tx, "meteora-damm-v1"),
        pool: str(e.data.pool),
        mintA: str(e.data.tokenAMint),
        mintB: str(e.data.tokenBMint),
        creator: tx.signer,
      }));
  },
};
