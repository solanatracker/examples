import { createDataApiClient } from "./client.js";
import { runProfile } from "./screener.js";

const client = createDataApiClient();

console.log("=== Token screener profiles ===");

await runProfile(client, "Near-graduation Pump.fun", {
  market: "pumpfun",
  minCurvePercentage: 85,
  maxCurvePercentage: 99,
  minLiquidity: 5000,
  sortBy: "curvePercentage",
  sortOrder: "desc",
  limit: 10,
});

await runProfile(client, "Safer high-volume", {
  minLiquidity: 50000,
  minHolders: 500,
  maxSnipers: 10,
  maxTop10: 30,
  minVolume_24h: 100000,
  sortBy: "volume_24h",
  sortOrder: "desc",
  limit: 8,
});

await runProfile(client, "Active trading", {
  minBuys: 100,
  minTotalTransactions: 200,
  minLiquidity: 25000,
  sortBy: "totalTransactions",
  sortOrder: "desc",
  limit: 8,
});

