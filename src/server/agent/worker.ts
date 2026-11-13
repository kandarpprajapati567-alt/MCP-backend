import "server-only";

import { processQueuedAgentTasks, recoverStaleAgentTasks } from "@/server/agent/task-service";

let started = false;
let ticking = false;
let lastRecoveryAt = 0;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  let processed = 0;
  try {
    processed = await processQueuedAgentTasks(3);
    if (Date.now() - lastRecoveryAt >= 60_000) {
      const recovered = await recoverStaleAgentTasks();
      lastRecoveryAt = Date.now();
      if (recovered > 0) console.warn("[agent-worker] Interrupted tasks marked failed:", recovered);
    }
  } catch (error) {
    console.error("[agent-worker] Queue cycle failed:", error instanceof Error ? error.message : "unknown error");
  } finally {
    ticking = false;
    setTimeout(() => { void tick(); }, processed > 0 ? 100 : 4_000);
  }
}

export function startAgentWorker(): void {
  if (started) return;
  started = true;
  console.info("[agent-worker] Durable task worker started; concurrency=3.");
  void tick();
}
