/**
 * Token lifecycle events: pools created, tokens launched on curves, curves migrating to AMMs.
 */
import { launchLine, migrationLine, poolLine } from "../lib/show.js";
import { watchTransactions } from "../lib/watch.js";
import { selectProtocols, type Protocol } from "../protocols/index.js";

function venuesWith(arg: string | undefined, has: (p: Protocol) => boolean, what: string) {
  const protocols = selectProtocols(arg).filter(has);
  if (protocols.length === 0) throw new Error(`None of the selected venues report ${what}.`);
  console.log(`Watching ${what} on ${protocols.map((p) => p.label).join(", ")}`);
  return protocols;
}

/** `pools [venues]`: new liquidity pools as they are initialized. */
export async function pools(args: string[]) {
  const protocols = venuesWith(args[0], (p) => !!p.pools, "new pools");
  watchTransactions({ accountInclude: protocols.map((p) => p.programId) }, (tx) => {
    for (const p of protocols) for (const created of p.pools?.(tx) ?? []) console.log(poolLine(created));
  });
}

/** `launches [venues]`: tokens created on launchpad bonding curves. */
export async function launches(args: string[]) {
  const protocols = venuesWith(args[0], (p) => !!p.launches, "launches");
  watchTransactions({ accountInclude: protocols.map((p) => p.programId) }, (tx) => {
    for (const p of protocols) for (const launch of p.launches?.(tx) ?? []) console.log(launchLine(launch));
  });
}

/** `migrations [venues]`: curves that completed and moved liquidity into an AMM pool. */
export async function migrations(args: string[]) {
  const protocols = venuesWith(args[0], (p) => !!p.migrations, "migrations");
  watchTransactions({ accountInclude: protocols.map((p) => p.programId) }, (tx) => {
    for (const p of protocols) for (const m of p.migrations?.(tx) ?? []) console.log(migrationLine(m));
  });
}
