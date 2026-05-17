import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  Result,
  SessionHandbook,
  SessionHandbookRef,
  StageError,
} from "../contracts/index.js";
import type { SessionHandbookStorePort } from "../ports/index.js";

export type FileSessionHandbookStoreOptions = {
  baseDirectory: string;
};

export function createFileSessionHandbookStore({
  baseDirectory,
}: FileSessionHandbookStoreOptions): SessionHandbookStorePort {
  return {
    async ensure({ sessionId, content }) {
      const path = handbookPath(baseDirectory, sessionId);
      const existing = await readHandbookFile(sessionId, path);

      if (!existing.ok) {
        return existing;
      }

      if (existing.value !== null) {
        return ok(existing.value.ref);
      }

      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf8");
      } catch (cause) {
        return storageFailure(`Could not write session handbook for '${sessionId}'.`, cause);
      }

      const written = await readHandbookFile(sessionId, path);

      if (!written.ok) {
        return written;
      }

      if (written.value === null) {
        return storageFailure(`Session handbook for '${sessionId}' was not readable after write.`);
      }

      return ok(written.value.ref);
    },

    async read({ sessionId }) {
      return readHandbookFile(sessionId, handbookPath(baseDirectory, sessionId));
    },
  };
}

function handbookPath(baseDirectory: string, sessionId: string): string {
  return join(baseDirectory, sanitizeSessionId(sessionId), "HANDBOOK.md");
}

function sanitizeSessionId(sessionId: string): string {
  const sanitized = sessionId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);

  return sanitized.length === 0 ? "session" : sanitized;
}

async function readHandbookFile(
  sessionId: string,
  path: string,
): Promise<Result<SessionHandbook | null>> {
  try {
    const content = await readFile(path, "utf8");
    const metadata = await stat(path);

    return ok({
      ref: {
        sessionId,
        path,
        revision: `sha256:${createHash("sha256").update(content).digest("hex")}`,
        updatedAt: metadata.mtime.toISOString(),
        status: "ready",
      },
      content,
    });
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") {
      return ok(null);
    }

    return storageFailure(`Could not read session handbook for '${sessionId}'.`, cause);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function storageFailure(message: string, cause?: unknown): Result<never> {
  return fail({
    code: "storage.unavailable",
    message,
    module: "storage",
    retryable: true,
    cause,
  });
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
