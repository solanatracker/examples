/**
 * New pools and launches pushed to a Telegram chat. Without Telegram settings it prints the
 * messages instead, so the filter logic can be tuned before wiring up a bot.
 */
import { optionalEnv } from "../lib/env.js";
import { short } from "../lib/format.js";
import { watchTransactions } from "../lib/watch.js";
import { quoteSymbol, selectProtocols, type Launch, type NewPool } from "../protocols/index.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Telegram allows about one message per second per chat. Messages queue and send in order;
 * when a burst outruns the limit, the oldest are dropped rather than delivered minutes late.
 */
function telegram() {
  const token = optionalEnv("TELEGRAM_BOT_TOKEN");
  const chatId = optionalEnv("TELEGRAM_CHAT_ID");
  const queue: string[] = [];
  let sending = false;

  const drain = async () => {
    if (sending) return;
    sending = true;
    while (queue.length) {
      const text = queue.shift()!;
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
        });
        if (res.status === 429) {
          const body = (await res.json()) as { parameters?: { retry_after?: number } };
          queue.unshift(text);
          await sleep((body.parameters?.retry_after ?? 3) * 1000);
          continue;
        }
        if (!res.ok) console.warn(`[telegram] ${res.status}: ${(await res.text()).slice(0, 200)}`);
      } catch (err) {
        console.warn(`[telegram] ${err instanceof Error ? err.message : err}`);
      }
      await sleep(1100);
    }
    sending = false;
  };

  return (text: string) => {
    if (!token || !chatId) return console.log(`\n${text.replace(/<[^>]+>/g, "")}`);
    queue.push(text);
    if (queue.length > 50) queue.splice(0, queue.length - 50);
    void drain();
  };
}

const tx = (sig: string) => `<a href="https://www.solanatracker.io/explorer/tx/${sig}">tx</a>`;
const token = (mint: string) => `<a href="https://www.solanatracker.io/tokens/${mint}">${short(mint)}</a>`;

function poolMessage(p: NewPool, label: string) {
  // Lead with the non-quote side: that is the token people care about.
  const [main, other] = quoteSymbol(p.mintA) === "?" ? [p.mintA, p.mintB] : [p.mintB, p.mintA];
  const pair = quoteSymbol(other) === "?" ? short(other) : quoteSymbol(other);
  return `🆕 <b>New ${label} pool</b>\n${token(main)} / ${pair}\n<code>${p.pool}</code>\n${tx(p.signature)}`;
}

function launchMessage(l: Launch, label: string) {
  const name = [l.symbol && `$${l.symbol}`, l.name].filter(Boolean).join(" · ") || "Unnamed token";
  return `🚀 <b>${name}</b> launched on ${label}\n${token(l.mint)}\n<code>${l.mint}</code>\n${tx(l.signature)}`;
}

/** `notify [venues]`: Telegram alerts for new pools and launches on the chosen venues. */
export async function notify(args: string[]) {
  const protocols = selectProtocols(args[0]).filter((p) => p.pools || p.launches);
  const send = telegram();
  watchTransactions({ accountInclude: protocols.map((p) => p.programId) }, (parsed) => {
    for (const p of protocols) {
      for (const created of p.pools?.(parsed) ?? []) send(poolMessage(created, p.label));
      for (const launch of p.launches?.(parsed) ?? []) send(launchMessage(launch, p.label));
    }
  });
  const target = optionalEnv("TELEGRAM_BOT_TOKEN") ? "Telegram" : "the console (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to send)";
  console.log(`Sending new pools and launches on ${protocols.map((p) => p.label).join(", ")} to ${target}`);
}
