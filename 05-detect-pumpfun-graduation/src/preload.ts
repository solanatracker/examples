import WebSocket from "ws";

// @solana-tracker/data-api checks global.WebSocket (not just globalThis)
(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
if (typeof global !== "undefined") {
  (global as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

