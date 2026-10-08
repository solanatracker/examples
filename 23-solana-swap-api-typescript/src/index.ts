import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { fail, numberEnv, optionalEnv } from "./env.js";
import { short, table, time } from "./format.js";
import { RaptorClient, RaptorError, type QuoteResponse, type TransactionStatus } from "./raptor.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const FINAL_STATUSES = new Set(["confirmed", "failed", "expired"]);

function parseMint(name: string, fallback: string): string {
  const value = optionalEnv(name) ?? fallback;
  if (!BASE58.test(value)) fail(`${name} is not a valid base58 mint address: "${value}"`);
  return value;
}

function parseAmount(): bigint {
  const raw = optionalEnv("AMOUNT") ?? "10000000"; // 0.01 SOL in lamports
  if (!/^\d+$/.test(raw) || BigInt(raw) < 1n) fail(`AMOUNT must be a positive integer in base units (lamports for SOL), got "${raw}"`);
  return BigInt(raw);
}

function parseSlippage(): number | "dynamic" {
  const raw = (optionalEnv("SLIPPAGE_BPS") ?? "dynamic").toLowerCase();
  if (raw === "dynamic") return "dynamic";
  const bps = Number(raw);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) fail(`SLIPPAGE_BPS must be "dynamic" or an integer 0-10000, got "${raw}"`);
  return bps;
}

/** /swap rejects a bare number for priorityFee (422); an exact compute unit price goes in computeUnitPriceMicroLamports. */
function parsePriorityFee(): { priorityFee?: string; computeUnitPriceMicroLamports?: number } {
  const raw = optionalEnv("PRIORITY_FEE") ?? "medium";
  return /^\d+$/.test(raw) ? { computeUnitPriceMicroLamports: Number(raw) } : { priorityFee: raw };
}

function parseMaxHops(): number {
  const hops = numberEnv("MAX_HOPS", 4);
  if (!Number.isInteger(hops) || hops < 1 || hops > 4) fail(`MAX_HOPS must be 1-4, got ${hops}`);
  return hops;
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
const slippageBps = parseSlippage();
const maxHops = parseMaxHops();
const dexes = optionalEnv("DEXES");
const priorityFee = parsePriorityFee();
const maxPriorityFee = optionalEnv("MAX_PRIORITY_FEE") ? numberEnv("MAX_PRIORITY_FEE", 0) : undefined;
const confirmTimeoutSec = numberEnv("CONFIRM_TIMEOUT_SEC", 60);
const execute = (optionalEnv("EXECUTE") ?? "false").toLowerCase() === "true";
const signer = loadSigner();
const walletPublicKey = signer?.publicKey.toBase58() ?? optionalEnv("WALLET_PUBLIC_KEY");

if (walletPublicKey && !BASE58.test(walletPublicKey)) fail(`WALLET_PUBLIC_KEY is not a valid base58 address: "${walletPublicKey}"`);
if (execute && !signer) fail("EXECUTE=true needs WALLET_SECRET_KEY so the transaction can be signed");
if (inputMint === outputMint) fail("INPUT_MINT and OUTPUT_MINT must differ");

const raptor = new RaptorClient();
const abort = new AbortController();
process.once("SIGINT", () => {
  console.log("\nStopping.");
  abort.abort();
});

const sleep = (ms: number) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  abort.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

function printQuote(quote: QuoteResponse): void {
  const inAmount = BigInt(quote.amountIn);
  const outAmount = BigInt(quote.amountOut);
  const minOut = BigInt(quote.minAmountOut);
  const worstCase = outAmount > 0n ? Number(((outAmount - minOut) * 10_000n) / outAmount) / 100 : 0;
  console.log(
    `In ${inAmount} ${short(quote.inputMint)} → out ${outAmount} ${short(quote.outputMint)} ` +
      `(min ${minOut}, ${worstCase.toFixed(2)}% below expected at ${quote.slippageBps} bps slippage)`,
  );
  console.log(
    `Value ${quote.swapUsdValue ? `$${quote.swapUsdValue}` : "n/a"} | price impact ${typeof quote.priceImpact === "number" ? `${quote.priceImpact.toFixed(4)}%` : "n/a"} | ` +
      `slot ${quote.contextSlot} | routed in ${(quote.timeTaken * 1000).toFixed(1)} ms\n`,
  );
  table(
    ["Hop", "DEX", "Pool", "In", "Out", "Share"],
    quote.routePlan.map((step, i) => [
      String(i + 1),
      step.dex,
      short(step.pool),
      `${step.amountIn} ${short(step.inputMint)}`,
      `${step.amountOut} ${short(step.outputMint)}`,
      `${step.percent}%`,
    ]),
  );
}

async function trackUntilFinal(signature: string): Promise<TransactionStatus | undefined> {
  const deadline = Date.now() + confirmTimeoutSec * 1000;
  let notFound = 0;
  let last: TransactionStatus | undefined;
  while (!abort.signal.aborted && Date.now() < deadline) {
    try {
      const status = await raptor.status(signature);
      if (status.status !== last?.status) console.log(`${time()}  ${status.status}${status.slot ? ` (slot ${status.slot})` : ""}`);
      last = status;
      if (FINAL_STATUSES.has(status.status)) return status;
    } catch (error) {
      // The tracker can lag the sender by a moment; tolerate a few 404s before giving up.
      if (!(error instanceof RaptorError && error.status === 404 && ++notFound <= 5)) throw error;
    }
    await sleep(1_000);
  }
  return last;
}

async function main(): Promise<void> {
  console.log(`\nRaptor ${raptor.baseUrl}`);
  console.log(`Quote: ${amount} base units of ${short(inputMint)} → ${short(outputMint)} (slippage ${slippageBps}, maxHops ${maxHops}${dexes ? `, dexes ${dexes}` : ""})\n`);

  // 1. Quote: expected output, worst-case output and the route.
  const quote = await raptor.quote({ inputMint, outputMint, amount, slippageBps, maxHops, dexes });
  printQuote(quote);

  if (!walletPublicKey) {
    console.log("\nQuote only. Set WALLET_PUBLIC_KEY to build the transaction, or WALLET_SECRET_KEY and EXECUTE=true to send it.");
    return;
  }

  // 2. Build: Raptor returns an unsigned V0 transaction for this wallet, with ATAs and SOL wrapping handled.
  const swap = await raptor.buildSwap({
    userPublicKey: walletPublicKey,
    quoteResponse: quote,
    txVersion: "V0",
    wrapUnwrapSol: true,
    ...priorityFee,
    ...(maxPriorityFee !== undefined ? { maxPriorityFee } : {}),
  });
  const txBytes = Buffer.from(swap.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);
  console.log(`\nBuilt for ${short(walletPublicKey)}: ${txBytes.length} bytes, version ${String(tx.version)}, ` +
    `${tx.message.compiledInstructions.length} instructions, ${tx.message.addressTableLookups.length} lookup table(s), ` +
    `${tx.message.header.numRequiredSignatures} signer(s)`);
  console.log(`Priority fee ${swap.prioritizationFeeLamports ?? "n/a"} lamports | valid until block height ${swap.lastValidBlockHeight}`);

  if (!execute || !signer) {
    console.log("\nDry run: transaction built but not signed. Set EXECUTE=true with WALLET_SECRET_KEY to sign and send it.");
    return;
  }

  // 3. Sign locally. The secret key never leaves this process.
  tx.sign([signer]);
  const signedBase64 = Buffer.from(tx.serialize()).toString("base64");

  // 4. Send through Jet TPU. Raptor retries in the background until the transaction confirms or expires.
  const sent = await raptor.send(signedBase64);
  console.log(`\nSent ${sent.signature} (accepted: ${sent.success})`);
  console.log(`https://solscan.io/tx/${sent.signature}`);

  // 5. Track until confirmed, failed or expired.
  const final = await trackUntilFinal(sent.signature);
  if (!final) {
    console.log(`\nNo final status after ${confirmTimeoutSec}s. Check the signature on an explorer before retrying; a retry needs a fresh quote.`);
    process.exitCode = 1;
    return;
  }
  const latency = final.latency_ms !== undefined ? `${final.latency_ms} ms` : "n/a";
  console.log(`\nFinal: ${final.status} | slot ${final.slot ?? "n/a"} | latency ${latency}${final.error ? ` | error ${final.error}` : ""}`);
  if (final.events?.length) console.log(`Events: ${final.events.map((e) => e.name).join(", ")}`);
  if (final.status !== "confirmed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}`);
  process.exitCode = 1;
});
