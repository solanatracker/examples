/**
 * Account streams: program state as it changes, decoded with the same IDLs as the transactions.
 */
import type { SubscribeRequestFilterAccountsFilter } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";
import { fail } from "../lib/env.js";
import { short, time } from "../lib/format.js";
import { emptyRequest, runStream } from "../lib/grpc.js";
import type { Fields } from "../lib/idl.js";
import { big, parseTx, str } from "../lib/parsed.js";
import { onShutdown } from "../lib/shutdown.js";
import { SYSTEM_PROGRAM, WSOL } from "../lib/tx.js";
import { commitment, txFilter } from "../lib/watch.js";
import { selectProtocols } from "../protocols/index.js";
import { pump } from "../protocols/pump.js";

/**
 * Programs written without Anchor have no account discriminator; their accounts are told apart by size.
 * Sizes for the layouts this project ships.
 */
const SIZED_LAYOUTS: Record<string, Record<string, number>> = {
  "raydium-amm-v4": { AmmInfo: 752 },
};

/** Up to `max` scalar fields as `key=value`, addresses shortened. Nested structs and arrays are skipped. */
function summarize(data: Fields, max = 8): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (parts.length >= max) break;
    if (typeof v === "bigint" || typeof v === "number" || typeof v === "boolean") parts.push(`${k}=${v}`);
    else if (typeof v === "string") parts.push(`${k}=${v.length > 32 ? short(v) : v}`);
  }
  return parts.join("  ");
}

/**
 * `accounts <venue> [AccountType]`: every write to accounts the program owns, decoded.
 * With a type, a memcmp filter on the 8-byte discriminator (or a size filter for non-Anchor
 * programs) keeps the server from sending anything else. Pool accounts change on every swap,
 * so expect a high rate on busy venues.
 */
export async function accounts(args: string[]) {
  const [protocol] = selectProtocols(args[0]);
  if (!protocol) return;
  const type = args[1];
  const sized = SIZED_LAYOUTS[protocol.id];
  const filters: SubscribeRequestFilterAccountsFilter[] = [];
  if (type) {
    const disc = protocol.coder.accountDiscriminator(type);
    const size = sized?.[type];
    if (size !== undefined) filters.push({ datasize: String(size) });
    else if (disc) filters.push({ memcmp: { offset: "0", bytes: disc } });
    else fail(`${protocol.label} has no account type "${type}".`);
  }

  const decode = (data: Buffer) => {
    if (sized) {
      const name = Object.entries(sized).find(([, size]) => size === data.length)?.[0];
      return name ? { name, data: protocol.coder.decodeType(name, data) } : undefined;
    }
    return protocol.coder.account(data);
  };

  const stream = runStream({
    request: { ...emptyRequest(), commitment: commitment(), accounts: { program: { owner: [protocol.programId], account: [], filters } } },
    onUpdate: ({ account }) => {
      const info = account?.account;
      if (!info) return;
      const decoded = decode(Buffer.from(info.data));
      const label = decoded?.name ?? `${info.data.length} bytes`;
      console.log(`${time()}  ${label.padEnd(16)} ${short(bs58.encode(info.pubkey))}  slot ${account.slot}  ${decoded ? summarize(decoded.data) : ""}`);
    },
  });
  onShutdown(async () => {
    stream.stop();
    await stream.done;
  });
  console.log(`Streaming ${type ?? "all"} accounts owned by ${protocol.label}`);
  await stream.done;
}

/** Tokens a fresh pump.fun curve can sell before it completes (793.1M with 6 decimals). */
const CURVE_TOKENS = 793_100_000_000_000n;
const MILESTONES = [50, 75, 90, 95, 99];

/**
 * `curves`: pump.fun bonding curves approaching graduation.
 * One subscription carries two filters: curve accounts (for reserves) and pump.fun transactions
 * (to learn which mint each curve belongs to, which the curve account does not store).
 * `update.filters` says which filter an update matched.
 */
export async function curves() {
  const disc = pump.coder.accountDiscriminator("BondingCurve");
  if (!disc) fail("BondingCurve is missing from the pump.fun IDL.");
  const mintOfCurve = new Map<string, string>();
  const reached = new Map<string, number>();

  const stream = runStream({
    request: {
      ...emptyRequest(),
      commitment: commitment(),
      accounts: { curves: { owner: [pump.programId], account: [], filters: [{ memcmp: { offset: "0", bytes: disc } }] } },
      transactions: { trades: txFilter({ accountInclude: [pump.programId] }) },
    },
    onUpdate: (update) => {
      if (update.filters.includes("trades") && update.transaction?.transaction) {
        const tx = parseTx(update.transaction.transaction, update.transaction.slot);
        for (const t of pump.trades(tx)) mintOfCurve.set(t.pool, t.inputMint === WSOL ? t.outputMint : t.inputMint);
        for (const l of pump.launches?.(tx) ?? []) mintOfCurve.set(l.curve, l.mint);
        return;
      }
      const info = update.account?.account;
      if (!info) return;
      const curve = bs58.encode(info.pubkey);
      const state = pump.coder.account(Buffer.from(info.data))?.data;
      if (!state) return;
      const remaining = big(state.realTokenReserves);
      const progress = remaining >= CURVE_TOKENS ? 0 : Number(((CURVE_TOKENS - remaining) * 10_000n) / CURVE_TOKENS) / 100;
      const mint = mintOfCurve.get(curve);
      const label = mint ?? `curve ${curve}`;

      if (state.complete === true) {
        if (reached.get(curve) !== 100) console.log(`${time()}  COMPLETE  ${label}  ready to migrate`);
        reached.set(curve, 100);
        return;
      }
      const milestone = MILESTONES.filter((m) => progress >= m).at(-1);
      if (milestone === undefined || (reached.get(curve) ?? 0) >= milestone) return;
      reached.set(curve, milestone);
      // Curves quoted in SOL leave quoteMint empty (default key); other quote mints report raw units.
      const quoteMint = str(state.quoteMint);
      const inSol = !quoteMint || quoteMint === SYSTEM_PROGRAM || quoteMint === WSOL;
      const raised = inSol ? `${(Number(big(state.realQuoteReserves)) / 1e9).toFixed(2)} SOL` : `${big(state.realQuoteReserves)} raw ${short(quoteMint)}`;
      console.log(`${time()}  ${String(milestone).padStart(3)}%      ${label}  ${progress.toFixed(1)}%  ${raised} raised`);
    },
  });

  // Both maps only grow; trim them so a long-running process stays flat.
  setInterval(() => {
    for (const map of [mintOfCurve, reached] as Map<string, unknown>[]) {
      if (map.size > 200_000) for (const k of [...map.keys()].slice(0, 50_000)) map.delete(k);
    }
  }, 60_000);
  onShutdown(async () => {
    stream.stop();
    await stream.done;
  });
  console.log(`Watching pump.fun curves cross ${MILESTONES.join("/")}% sold`);
  await stream.done;
}
