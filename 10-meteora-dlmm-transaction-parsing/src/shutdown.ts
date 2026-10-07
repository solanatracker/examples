/** Runs cleanup once on Ctrl+C / SIGTERM, then exits with code 0. */
export function onShutdown(cleanup: () => void | Promise<void>): void {
  let closing = false;
  const handler = async () => {
    if (closing) return;
    closing = true;
    try {
      await cleanup();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
}
