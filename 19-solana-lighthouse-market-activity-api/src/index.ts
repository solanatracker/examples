import type { LighthouseResponse } from "@solana-tracker/data-api";
import { createDataApiClient, describeError, run, withRetry } from "./client.js";
import { time } from "./format.js";
import { printLeaderboard, printOverview, readConfig } from "./lighthouse.js";

run(async () => {
  const client = createDataApiClient(); // fails fast when ST_API_KEY is missing
  const config = readConfig();

  // Nothing to clean up for REST polling: exit at once, even mid-request.
  const stop = () => {
    console.log("\nStopped.");
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  let lastGood: { markets: LighthouseResponse; at: number } | undefined;

  for (;;) {
    try {
      const markets = await withRetry("getLighthouse", () => client.getLighthouse());
      if (!Array.isArray(markets)) throw new Error("unexpected response: expected an array of markets");
      lastGood = { markets, at: Date.now() };
    } catch (error) {
      // One-shot runs and a failing first poll surface the error; later polls keep the last good snapshot.
      if (config.watchSeconds === 0 || !lastGood) throw error;
      console.warn(`\n[${time()}] refresh failed (${describeError(error)}); showing snapshot from ${time(lastGood.at)}`);
    }

    console.log(`\nSolana market activity (Lighthouse) at ${time(lastGood.at)} UTC, ${lastGood.markets.length} markets\n`);
    printOverview(lastGood.markets);
    printLeaderboard(lastGood.markets, config);

    if (config.watchSeconds === 0) break;
    console.log(`\nNext refresh in ${config.watchSeconds}s (Ctrl+C to stop)`);
    await new Promise((resolve) => setTimeout(resolve, config.watchSeconds * 1000));
  }
});
