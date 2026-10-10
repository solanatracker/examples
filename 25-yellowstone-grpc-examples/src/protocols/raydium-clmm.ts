import idl from "../../idl/raydium-clmm.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import { base, coderFor, decode, mintOf } from "./shared.js";
import type { Protocol } from "./types.js";

const coder = coderFor(idl);

export const raydiumClmm: Protocol = {
  id: "raydium-clmm",
  label: "Raydium CLMM",
  programId: coder.programId,
  coder,

  trades(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("SwapEvent").map((e) => {
      const ix = d.ixAt(e.path);
      const zeroForOne = e.data.zeroForOne === true;
      // token_account_0 always holds token 0 (payer side when zero-for-one, recipient otherwise).
      const mint0 = mintOf(tx, str(e.data.tokenAccount0)) ?? (zeroForOne ? ix?.accounts.inputVaultMint : ix?.accounts.outputVaultMint) ?? "";
      const mint1 = mintOf(tx, str(e.data.tokenAccount1)) ?? (zeroForOne ? ix?.accounts.outputVaultMint : ix?.accounts.inputVaultMint) ?? "";
      const amount0 = big(e.data.amount0);
      const amount1 = big(e.data.amount1);
      return {
        ...base(tx, "raydium-clmm"),
        label: ix?.name ?? "swap",
        path: e.path,
        trader: str(e.data.sender),
        pool: str(e.data.poolState),
        inputMint: zeroForOne ? mint0 : mint1,
        inputAmount: zeroForOne ? amount0 : amount1,
        outputMint: zeroForOne ? mint1 : mint0,
        outputAmount: zeroForOne ? amount1 : amount0,
      };
    });
  },

  pools(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("PoolCreatedEvent").map((e) => ({
      ...base(tx, "raydium-clmm"),
      pool: str(e.data.poolState),
      mintA: str(e.data.tokenMint0),
      mintB: str(e.data.tokenMint1),
      creator: d.ixAt(e.path)?.accounts.poolCreator ?? tx.signer,
    }));
  },
};
