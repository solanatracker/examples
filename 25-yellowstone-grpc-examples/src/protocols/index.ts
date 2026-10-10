import { fluxbeam } from "./fluxbeam.js";
import { meteoraDammV1 } from "./meteora-damm-v1.js";
import { meteoraDammV2 } from "./meteora-damm-v2.js";
import { meteoraDbc } from "./meteora-dbc.js";
import { meteoraDlmm } from "./meteora-dlmm.js";
import { moonshot } from "./moonshot.js";
import { orcaWhirlpool } from "./orca-whirlpool.js";
import { pump } from "./pump.js";
import { pumpAmm } from "./pump-amm.js";
import { raydiumAmmV4 } from "./raydium-amm-v4.js";
import { raydiumClmm } from "./raydium-clmm.js";
import { raydiumCpmm } from "./raydium-cpmm.js";
import { raydiumLaunchlab } from "./raydium-launchlab.js";
import type { Protocol } from "./types.js";

export type { Launch, Migration, NewPool, Protocol, Trade } from "./types.js";
export { orient, quoteSymbol } from "./shared.js";

export const PROTOCOLS: Protocol[] = [
  pump,
  pumpAmm,
  raydiumAmmV4,
  raydiumClmm,
  raydiumCpmm,
  raydiumLaunchlab,
  meteoraDlmm,
  meteoraDammV1,
  meteoraDammV2,
  meteoraDbc,
  orcaWhirlpool,
  moonshot,
  fluxbeam,
];

const byId = new Map(PROTOCOLS.map((p) => [p.id, p]));
const byProgram = new Map(PROTOCOLS.map((p) => [p.programId, p]));

/** Resolves CLI arguments like `pump-amm,meteora-dlmm` (or `all`) to protocols, exiting on a typo. */
export function selectProtocols(arg: string | undefined): Protocol[] {
  if (!arg || arg === "all") return PROTOCOLS;
  return arg.split(",").map((id) => {
    const p = byId.get(id.trim());
    if (!p) throw new Error(`Unknown venue "${id}". Choose from: ${PROTOCOLS.map((x) => x.id).join(", ")}`);
    return p;
  });
}

export const protocolForProgram = (programId: string) => byProgram.get(programId);
