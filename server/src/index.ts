import { MODEL_FAST, MODEL_HEAVY, PORT } from "./config";
import { createApp } from "./app";
import { initStore, type ProjectStore } from "./store";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason instanceof Error ? reason.stack || reason.message : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.stack || err.message);
});

async function main() {
  const { store, mongoError } = await initStore();
  const app = createApp(store, mongoError, { serveWeb: true });
  const server = app.listen(PORT, () => {
    console.log(`[server] Protoforge API on http://localhost:${PORT} (storage=${store.kind}, heavy=${MODEL_HEAVY}, fast=${MODEL_FAST})`);
  });
  server.on("error", (err) => {
    console.error("[server] listen error:", err.message);
    process.exit(1);
  });
  const shutdown = async (sig: string) => {
    console.log(`[server] ${sig} received, shutting down`);
    server.close();
    await closeStore(store);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

async function closeStore(store: ProjectStore) {
  try {
    await store.close();
  } catch (err) {
    console.error("[store] close failed:", (err as Error).message);
  }
}

main().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
