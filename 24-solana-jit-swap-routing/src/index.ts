import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  type MessageV0,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { short, table, time } from "./format.js";
import {
  RaptorClient,
  RaptorError,
  type FailureKind,
  type JitMode,
  type QuoteResponse,
  type SwapInstructionsResponse,
  type TransactionStatus,
  type TxVersion,
  type WireInstruction,
} from "./raptor.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const SYMBOLS: Record<string, string> = { [SOL]: "SOL", [USDC]: "USDC" };
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Largest serialized transaction a V0 or legacy packet can carry. */
const PACKET_LIMIT = 1232;
const MODES: JitMode[] = ["auto", "true", "false"];
const FINAL_STATUSES = new Set(["confirmed", "failed", "expired"]);

function parseMint(name: string, fallback: string): string {
  const value = optionalEnv(name) ?? fallback;
  if (!BASE58.test(value)) fail(`${name} is not a valid base58 mint address: "${value}"`);
  return value;
}

function parseAmount(): bigint {
  const raw = optionalEnv("AMOUNT") ?? "25000000000"; // 25 SOL: large enough for routes to differ
  if (!/^\d+$/.test(raw) || BigInt(raw) < 1n) fail(`AMOUNT must be a positive integer in base units, got "${raw}"`);
  return BigInt(raw);
}

function parseMode(): JitMode {
  const raw = (optionalEnv("JIT_MODE") ?? "auto").toLowerCase();
  if (raw !== "auto" && raw !== "true" && raw !== "false") fail(`JIT_MODE must be auto, true or false, got "${raw}"`);
  return raw;
}

function loadSigner(): Keypair | undefined {
  const secret = optionalEnv("WALLET_SECRET_KEY");
  if (!secret) return undefined;
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    return fail("WALLET_SECRET_KEY must be a base58-encoded 64-byte secret key");
  }
}

const inputMint = parseMint("INPUT_MINT", SOL);
const outputMint = parseMint("OUTPUT_MINT", USDC);
const amount = parseAmount();
const slippageBps = numberEnv("SLIPPAGE_BPS", 50);
const jitMode = parseMode();
const PRIORITY_LEVELS = ["min", "low", "auto", "medium", "high", "veryHigh", "turbo", "unsafeMax"];
const priorityFee = optionalEnv("PRIORITY_FEE") ?? "medium";
const confirmTimeoutSec = numberEnv("CONFIRM_TIMEOUT_SEC", 60);
const execute = (optionalEnv("EXECUTE") ?? "false").toLowerCase() === "true";
const signer = loadSigner();
const walletPublicKey = signer?.publicKey.toBase58() ?? optionalEnv("WALLET_PUBLIC_KEY");

if (inputMint === outputMint) fail("INPUT_MINT and OUTPUT_MINT must differ");
if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) fail("SLIPPAGE_BPS must be an integer 0-10000");
if (!PRIORITY_LEVELS.includes(priorityFee)) fail(`PRIORITY_FEE must be one of ${PRIORITY_LEVELS.join(", ")}`);
if (signer && optionalEnv("WALLET_PUBLIC_KEY") && optionalEnv("WALLET_PUBLIC_KEY") !== walletPublicKey) {
  fail("WALLET_PUBLIC_KEY does not match WALLET_SECRET_KEY. Set one or the other.");
}
if (walletPublicKey && !BASE58.test(walletPublicKey)) fail(`WALLET_PUBLIC_KEY is not a valid base58 address: "${walletPublicKey}"`);
if (execute && !signer) fail("EXECUTE=true needs WALLET_SECRET_KEY so the transaction can be signed");
if (execute && !optionalEnv("AMOUNT")) fail("EXECUTE=true needs an explicit AMOUNT. The 25 SOL default is for comparing routes, not for trading.");

const raptor = new RaptorClient();
const connection = new Connection(optionalEnv("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com");
// Builds that are only inspected need a fee payer address, not a funded wallet.
const buildFor = walletPublicKey ?? Keypair.generate().publicKey.toBase58();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const symbol = (mint: string) => SYMBOLS[mint] ?? short(mint);

const decimals = new Map<string, number>([[SOL, 9], [USDC, 6]]);
async function loadDecimals(mint: string): Promise<void> {
  if (decimals.has(mint)) return;
  try {
    decimals.set(mint, (await connection.getTokenSupply(new PublicKey(mint))).value.decimals);
  } catch {
    // Unknown decimals: amounts print in base units.
  }
}

/** Formats base units with the mint's decimals, without floating-point rounding. */
function units(raw: bigint | string, mint: string): string {
  const value = BigInt(raw);
  const d = decimals.get(mint);
  if (d === undefined) return `${value} base units`;
  const base = 10n ** BigInt(d);
  const fraction = (value % base).toString().padStart(d, "0").slice(0, 6).replace(/0+$/, "");
  return `${(value / base).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} ${symbol(mint)}`;
}

/** Signed difference in basis points with two decimals: JIT routes usually differ by fractions of a bp. */
function bpsDelta(a: bigint, b: bigint): string {
  if (b === 0n) return "n/a";
  const hundredths = Number(((a - b) * 1_000_000n) / b);
  return `${hundredths >= 0 ? "+" : ""}${(hundredths / 100).toFixed(2)} bp`;
}

const route = (quote: QuoteResponse) => [...new Set(quote.routePlan.map((step) => step.dex))].join(" › ");

/**
 * Quotes and builds back to back. A quote's execution plan lives for a few seconds, so a build that
 * fails as stale gets one fresh quote; any other failure is the caller's to handle.
 */
async function quoteAndBuild<T>(mode: JitMode, build: (quote: QuoteResponse) => Promise<T>): Promise<{ quote: QuoteResponse; result: T }> {
  for (let attempt = 0; ; attempt++) {
    const quote = await raptor.quote({ inputMint, outputMint, amount, slippageBps, jitRouting: mode });
    try {
      return { quote, result: await build(quote) };
    } catch (error) {
      if (!(error instanceof RaptorError && error.kind === "stale-quote" && attempt === 0)) throw error;
      console.warn(`${error.message}. Quoting again.`);
    }
  }
}

// 1. The same order quoted three ways.
async function compareModes(): Promise<void> {
  console.log("\n1. Quote the same order with each jitRouting mode\n");
  const runs: Array<{ mode: JitMode; quote: QuoteResponse; ms: number }> = [];
  for (const mode of MODES) {
    const started = performance.now();
    const quote = await raptor.quote({ inputMint, outputMint, amount, slippageBps, jitRouting: mode });
    runs.push({ mode, quote, ms: performance.now() - started });
  }
  table(
    ["jitRouting", "Expected out", "Min out", "Impact", "Route", "JIT route", "Search", "Round trip"],
    runs.map(({ mode, quote, ms }) => [
      mode,
      units(quote.amountOut, outputMint),
      units(quote.minAmountOut, outputMint),
      typeof quote.priceImpact === "number" ? `${quote.priceImpact.toFixed(4)}%` : "n/a",
      route(quote),
      quote.jitRouting ? "yes" : "no",
      quote.searchMode ?? "n/a",
      `${Math.round(ms)} ms`,
    ]),
  );

  const [auto, jit, fixed] = runs.map((run) => BigInt(run.quote.amountOut)) as [bigint, bigint, bigint];
  console.log(`\nJIT vs fixed: ${bpsDelta(jit, fixed)} | auto vs fixed: ${bpsDelta(auto, fixed)} (quotes run one after another, so part of any gap is price movement)`);
  console.log(
    runs[0]?.quote.jitRouting
      ? "auto picked a JIT route for this order."
      : "auto kept a fixed route: JIT did not improve this order enough to use it.",
  );
}

const toInstruction = (ix: WireInstruction) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, "base64"),
  });

/**
 * Your instructions go before the swap. A JIT swap (`topLevelOnly`) has to be the last instruction and
 * cannot be called through CPI from your own program; an ordinary swap can be followed by cleanup.
 */
function compose(res: SwapInstructionsResponse, extra: TransactionInstruction[]): TransactionInstruction[] {
  // This example requests neither a tip nor a token ledger; fail loudly rather than guess their placement.
  if (res.tipInstruction || res.tokenLedgerInstruction) throw new Error("Unexpected tip or token ledger instruction in the response");
  const head = [...res.computeBudgetInstructions, ...res.setupInstructions].map(toInstruction);
  const cleanup = res.cleanupInstruction ? [toInstruction(res.cleanupInstruction)] : [];
  if (res.topLevelOnly && cleanup.length) throw new Error("A JIT swap came with a cleanup instruction, which would break the swap-last rule");
  return [...head, ...extra, toInstruction(res.swapInstruction), ...cleanup];
}

/** Length of Solana's compact-u16 prefix for a count. */
const compactLength = (n: number) => (n < 0x80 ? 1 : n < 0x4000 ? 2 : 3);

/**
 * Wire size of a signed V0 transaction, counted field by field. `serialize()` is not a size check:
 * web3.js only throws when the message alone overflows 1232 bytes, so a transaction slightly over
 * the packet limit serializes fine and is rejected later by the network.
 */
function v0Size(message: MessageV0): number {
  const signers = message.header.numRequiredSignatures;
  const keys = message.staticAccountKeys.length;
  let size = compactLength(signers) + 64 * signers + 1 + 3 + compactLength(keys) + 32 * keys + 32;
  size += compactLength(message.compiledInstructions.length);
  for (const ix of message.compiledInstructions) {
    size += 1 + compactLength(ix.accountKeyIndexes.length) + ix.accountKeyIndexes.length + compactLength(ix.data.length) + ix.data.length;
  }
  size += compactLength(message.addressTableLookups.length);
  for (const lookup of message.addressTableLookups) {
    size += 32 + compactLength(lookup.writableIndexes.length) + lookup.writableIndexes.length;
    size += compactLength(lookup.readonlyIndexes.length) + lookup.readonlyIndexes.length;
  }
  return size;
}

/** Compiles the instructions into a V0 message against the returned lookup tables. Needs RPC. */
async function compileV0(res: SwapInstructionsResponse, instructions: TransactionInstruction[]): Promise<MessageV0> {
  const keys = res.addressLookupTableAddresses.map((a) => new PublicKey(a));
  const [infos, { blockhash }] = await Promise.all([connection.getMultipleAccountsInfo(keys), connection.getLatestBlockhash()]);
  const tables = infos.map((info, i) => {
    if (!info) throw new Error(`Lookup table ${keys[i]?.toBase58()} not found`);
    return new AddressLookupTableAccount({ key: keys[i]!, state: AddressLookupTableAccount.deserialize(info.data) });
  });
  return new TransactionMessage({ payerKey: new PublicKey(buildFor), recentBlockhash: blockhash, instructions }).compileToV0Message(tables);
}

// 2. What a JIT swap instruction looks like next to a fixed one, and how to compose around it.
async function inspectInstructions(): Promise<void> {
  console.log(`\n2. Build swap instructions for ${walletPublicKey ? short(walletPublicKey) : "a throwaway address (inspect only)"}\n`);
  const builds: Array<{ label: string; res: SwapInstructionsResponse }> = [];
  for (const mode of ["true", "false"] as const) {
    const { result } = await quoteAndBuild(mode, (quoteResponse) =>
      raptor.swapInstructions({ userPublicKey: buildFor, quoteResponse, jitRouting: mode === "true", wrapUnwrapSol: true, priorityFee }),
    );
    builds.push({ label: mode === "true" ? "JIT" : "fixed", res: result });
  }

  const memo = new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(`jit-routing-example ${Date.now()}`) });
  const rows: string[][] = [];
  let oversized = false;
  for (const { label, res } of builds) {
    const accounts = res.swapInstruction.accounts;
    const unique = new Set(accounts.map((a) => a.pubkey));
    const instructions = compose(res, [memo]);
    let size: string;
    try {
      const message = await compileV0(res, instructions);
      const bytes = v0Size(message);
      oversized ||= bytes > PACKET_LIMIT;
      size = `${bytes} B, ${message.staticAccountKeys.length} static keys${bytes > PACKET_LIMIT ? `, over by ${bytes - PACKET_LIMIT}` : ""}`;
    } catch (error) {
      size = `n/a (${error instanceof Error ? error.message.slice(0, 40) : "RPC error"})`;
    }
    rows.push([
      label,
      String(unique.size),
      String(new Set(accounts.filter((a) => a.isWritable).map((a) => a.pubkey)).size),
      String(res.addressLookupTableAddresses.length),
      String(instructions.length),
      res.topLevelOnly ? "yes" : "no",
      size,
    ]);
  }
  table(["Swap", "Accounts", "Writable", "Lookup tables", "Ixs with memo", "Top level only", "V0 size"], rows);
  console.log("\nOrder used: compute budget, setup, your memo, swap. A JIT swap must stay last and cannot be invoked from another program.");
  if (oversized) {
    console.log(
      "A composed transaction is over the packet limit and would be rejected. Drop your extra instructions, build the whole\n" +
        "transaction with /swap, or request the fixed route (jitRouting false), which needs fewer accounts.",
    );
  }
}

// 3. One JIT quote built as V0 and as V1.
async function compareVersions(): Promise<void> {
  console.log("\n3. Build the same JIT order as V0 and V1\n");
  const rows: string[][] = [];
  for (const txVersion of ["V0", "V1"] satisfies TxVersion[]) {
    const { result } = await quoteAndBuild("true", (quoteResponse) =>
      raptor.buildSwap({ userPublicKey: buildFor, quoteResponse, txVersion, wrapUnwrapSol: true, priorityFee }),
    );
    const bytes = Buffer.from(result.swapTransaction, "base64");
    let shape = ["n/a", "n/a", "n/a"];
    try {
      const tx = VersionedTransaction.deserialize(bytes);
      shape = [String(tx.message.staticAccountKeys.length), String(tx.message.addressTableLookups?.length ?? 0), String(tx.message.compiledInstructions.length)];
    } catch {
      // Older @solana/web3.js releases cannot parse version 1 at all.
    }
    rows.push([txVersion, `${bytes.length} B`, `0x${bytes.subarray(0, 1).toString("hex")}`, ...shape, bytes.length <= PACKET_LIMIT ? "yes" : "no"]);
  }
  table(["txVersion", "Size", "First byte", "Static keys", "Lookup tables", "Instructions", `≤ ${PACKET_LIMIT} B`], rows);
  console.log(
    "\nV0 starts with the signature count; V1 starts with its version byte and carries every account inline, so it runs past the old packet size.\n" +
      "@solana/web3.js 1.99 can read V1 but not sign it, so this example sends V0. Fetch V1 transactions over RPC with maxSupportedTransactionVersion: 1.",
  );
}

// 4. The failures a swap client has to tell apart.
async function classifyErrors(): Promise<void> {
  console.log("\n4. Classify Raptor errors\n");
  const advice: Record<FailureKind, string> = {
    "no-route": "change the pair or size",
    "stale-quote": "quote again",
    "bad-request": "fix the request",
    transient: "retry with backoff",
  };
  const fresh = await raptor.quote({ inputMint, outputMint, amount, slippageBps, jitRouting: "false" });
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["Zero amount", () => raptor.quote({ inputMint, outputMint, amount: 0n })],
    ["Unlisted output mint", () => raptor.quote({ inputMint, outputMint: Keypair.generate().publicKey.toBase58(), amount })],
    ["Edited minAmountOut", () =>
      raptor.buildSwap({ userPublicKey: buildFor, quoteResponse: { ...fresh, minAmountOut: String(BigInt(fresh.minAmountOut) - 1n) } })],
    ["Lowercase txVersion", () => raptor.buildSwap({ userPublicKey: buildFor, quoteResponse: fresh, txVersion: "v0" as TxVersion })],
  ];
  const rows: string[][] = [];
  for (const [label, run] of cases) {
    try {
      await run();
      rows.push([label, "200", "-", "accepted", ""]);
    } catch (error) {
      if (!(error instanceof RaptorError)) throw error;
      rows.push([label, String(error.status ?? "-"), error.kind, advice[error.kind], clip(error.message.replace(/^HTTP \d+: /, ""), 48)]);
    }
  }
  table(["Case", "HTTP", "Kind", "Action", "Message"], rows);
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

async function trackUntilFinal(signature: string): Promise<TransactionStatus | undefined> {
  const deadline = Date.now() + confirmTimeoutSec * 1000;
  let notFound = 0;
  let last: TransactionStatus | undefined;
  while (Date.now() < deadline) {
    try {
      const status = await raptor.status(signature);
      if (status.status !== last?.status) console.log(`${time()}  ${status.status}${status.slot ? ` (slot ${status.slot})` : ""}`);
      last = status;
      if (FINAL_STATUSES.has(status.status)) return status;
    } catch (error) {
      // The tracker can lag the sender by a moment; tolerate a few 404s.
      if (!(error instanceof RaptorError && error.status === 404 && ++notFound <= 5)) throw error;
    }
    await sleep(1_000);
  }
  // Still pending at the deadline is not an outcome; the caller reports it as unknown.
  return last && FINAL_STATUSES.has(last.status) ? last : undefined;
}

// 5. Optional: swap for real with the chosen mode and compare what landed with what was quoted.
async function executeSwap(wallet: Keypair): Promise<void> {
  console.log(`\n5. Swap ${units(amount, inputMint)} with jitRouting=${jitMode}\n`);
  const { quote, result } = await quoteAndBuild(jitMode, (quoteResponse) =>
    raptor.buildSwap({ userPublicKey: wallet.publicKey.toBase58(), quoteResponse, txVersion: "V0", wrapUnwrapSol: true, priorityFee }),
  );
  console.log(`Quoted ${units(quote.amountOut, outputMint)} (min ${units(quote.minAmountOut, outputMint)}) via ${route(quote)}${quote.jitRouting ? ", JIT" : ""}`);

  const tx = VersionedTransaction.deserialize(Buffer.from(result.swapTransaction, "base64"));
  tx.sign([wallet]);
  // The signature is known before sending, so a timeout on /send never loses track of the transaction.
  const signature = bs58.encode(tx.signatures[0]!);
  console.log(`Sending ${signature}\nhttps://solscan.io/tx/${signature}`);
  try {
    const sent = await raptor.send(Buffer.from(tx.serialize()).toString("base64"));
    if (!sent.success) console.log("Raptor reported the send as unsuccessful; tracking the signature anyway.");
  } catch (error) {
    console.log(`Send failed (${error instanceof Error ? error.message : error}). The transaction may still land; tracking ${signature}.`);
  }

  const final = await trackUntilFinal(signature);
  if (!final) {
    console.log(`\nNo final status after ${confirmTimeoutSec}s. Check ${signature} before retrying; a retry needs a fresh quote.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nFinal: ${final.status} | slot ${final.slot ?? "n/a"} | latency ${final.latency_ms ?? "n/a"} ms${final.error ? ` | ${final.error}` : ""}`);
  const swapEvent = final.events?.find((e) => e.name === "SwapEvent")?.parsed;
  const received = swapEvent?.amountOut;
  if (typeof received === "number" || typeof received === "string") {
    const out = BigInt(received);
    console.log(`Received ${units(out, outputMint)}: ${bpsDelta(out, BigInt(quote.amountOut))} vs quote, ${bpsDelta(out, BigInt(quote.minAmountOut))} vs floor`);
  }
  if (final.status !== "confirmed") process.exitCode = 1;
}

async function main(): Promise<void> {
  await Promise.all([loadDecimals(inputMint), loadDecimals(outputMint)]);
  console.log(`\nRaptor ${raptor.baseUrl}`);
  console.log(`Order: ${units(amount, inputMint)} → ${symbol(outputMint)}, slippage ${slippageBps} bps`);

  await compareModes();
  await inspectInstructions();
  await compareVersions();
  await classifyErrors();

  if (execute && signer) await executeSwap(signer);
  else console.log("\nInspection only: nothing was signed or sent. Set AMOUNT, WALLET_SECRET_KEY and EXECUTE=true to swap.");
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
