// Compiles the test program into a per-process staging directory, then publishes
// it to .tmp-test. Replaces `rm -rf .tmp-test && tsc ...` so concurrent
// `build:test` invocations (server:minemusic, smoke:*, test:stage-core) no longer
// share and clobber the same outDir during compilation — each build writes a
// pid-unique staging dir. Publishing retries through the brief rm+rename window
// so a concurrent build that publishes first does not fail the other; the two
// compile identical source, so the surviving output is equivalent.
import { spawnSync } from "node:child_process";
import { renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishedDir = resolve(repositoryRoot, ".tmp-test");
// Per-process staging outDir: two concurrent builds never share a compile target.
const stagingDir = resolve(repositoryRoot, `.tmp-test-staging-${process.pid}`);
const tscBin = resolve(repositoryRoot, "node_modules/typescript/bin/tsc");

// Publishes `staging` as `target`. tsc has finished writing, so the rm+rename
// pair has no concurrent writers; but two builds may publish near-simultaneously.
// When one rename loses the race (ENOTEMPTY because the other just filled
// `target`), retry — concurrent builds compile identical source, so last
// publish wins is correct semantics.
async function publishAtomically(staging, target, maxAttempts = 10) {
  for (let attempt = 0; ; attempt++) {
    rmSync(target, { recursive: true, force: true });
    try {
      renameSync(staging, target);
      return;
    } catch (cause) {
      const code = cause && cause.code;
      if ((code === "ENOTEMPTY" || code === "EPERM") && attempt < maxAttempts) {
        await sleep(20);
        continue;
      }
      rmSync(staging, { recursive: true, force: true });
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(`Test build failed to publish .tmp-test: ${message}`);
      process.exit(1);
    }
  }
}

// Clear any staging dir a previous failed run on the same pid left behind.
// (A build killed by SIGTERM, e.g. an IDE cancelling a run, can leave a stale
// staging dir under .tmp-test-staging-<pid>; .gitignore covers them and they can
// be swept manually. We do not probe other pids' liveness — that blocks on
// zombie/stuck processes.)
rmSync(stagingDir, { recursive: true, force: true });

const compiled = spawnSync(
  process.execPath,
  [tscBin, "-p", resolve(repositoryRoot, "tsconfig.test.json"), "--outDir", stagingDir],
  { stdio: "inherit" },
);

if (compiled.error !== undefined) {
  rmSync(stagingDir, { recursive: true, force: true });
  console.error(`Test build failed to start tsc: ${compiled.error.message}`);
  process.exit(1);
}
// status is null when tsc was terminated by a signal (SIGTERM/SIGKILL: IDE
// cancel, OOM-killer, CI timeout). Normalize to a non-zero code so the
// build:test contract (non-zero on failure) holds — process.exit(null) would
// otherwise coerce to exit 0 and let `build:test && ...` run a stale build.
const tscExitCode = compiled.status ?? 1;
if (tscExitCode !== 0) {
  rmSync(stagingDir, { recursive: true, force: true });
  const detail = compiled.status === null ? "interrupted by signal" : `exited ${compiled.status}`;
  console.error(`Test build failed (tsc ${detail}).`);
  process.exit(tscExitCode);
}

await publishAtomically(stagingDir, publishedDir);
console.log(`Test build published to .tmp-test.`);
// Explicit exit: under ESM + spawnSync(inherit) the event loop can otherwise
// linger after this line. The work is done; exit on our terms.
process.exit(0);
