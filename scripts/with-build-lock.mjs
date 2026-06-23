// Holds .tmp-test.lock while running a command, putting build+run in one
// critical section so one consumer's run is not clobbered by another build's
// publish deleting .tmp-test (#89 consumer race — "clobbered runs mid-suite").
//
// Usage: node scripts/with-build-lock.mjs "<shell command>"
//
// Scope: wraps only test:stage-core and smoke:* — build-then-run-then-exit
// consumers (the #89 mid-suite scenario). server:minemusic / start are long-lived
// and deliberately NOT wrapped (holding the lock would block test/smoke); the
// trade-off is that running server:start concurrently with test/smoke can still
// let the server's build delete .tmp-test — rely on "don't run them at once".
//
// Stale detection uses the lockfile mtime, not pid liveness — process.kill(pid, 0)
// blocks on zombie/stuck pids.
import { spawnSync } from "node:child_process";
import { closeSync, openSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(repositoryRoot, ".tmp-test.lock");
// A build+run is normally well under a minute; past this threshold a lock is
// treated as a crash orphan and taken over.
const staleMs = 10 * 60 * 1000;

async function acquireLock() {
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return;
    } catch (cause) {
      if (cause && cause.code !== "EEXIST") {
        throw cause;
      }
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      await sleep(100);
    }
  }
}

const command = process.argv.slice(2).join(" ");
if (command === "") {
  console.error("with-build-lock: missing command (expected a quoted shell command).");
  process.exit(2);
}

await acquireLock();
let exitCode = 1;
try {
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  exitCode = result.status ?? 1;
} finally {
  rmSync(lockPath, { force: true });
}
process.exit(exitCode);
