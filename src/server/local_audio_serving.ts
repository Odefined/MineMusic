import { randomUUID } from "node:crypto";

import type { Result, StageError } from "../contracts/kernel.js";
import {
  MAIN_LOCAL_SOURCE_ROOT_ID,
  assertLocalSourceRootId,
  assertNormalizedLocalSourceRelativePath,
} from "../music_data_platform/local_source_path.js";
import { resolveUnderRoot } from "./local_source_path_resolver.js";

export type LocalAudioRootDirResolver = (rootId: string) => string | undefined;

export type LocalAudioRootDescriptor = {
  rootId: string;
  rootDir: string;
};

export type LocalAudioTokenAnchor = {
  rootId: string;
  relativePath: string;
  ownerScope: string;
  expiresAt: string;
};

export type LocalAudioTokenResolveResult =
  | { kind: "resolved"; anchor: LocalAudioTokenAnchor }
  | { kind: "expired" }
  | { kind: "not_found" };

export type LocalAudioTokenStore = {
  mint(input: {
    ownerScope: string;
    rootId: string;
    relativePath: string;
  }): Promise<{ token: string; expiresAt: string }>;
  resolve(input: { token: string }): Promise<LocalAudioTokenResolveResult>;
};

export type CreateInMemoryLocalAudioTokenStoreInput = {
  ttlMs: number;
  clock?: () => string;
  tokenFactory?: () => string;
};

export type LocalAudioFileResolver = {
  resolve(input: {
    rootId: string;
    relativePath: string;
  }): Result<{ absolutePath: string }>;
};

export type CreateLocalAudioFileResolverInput = {
  resolveRootDir: LocalAudioRootDirResolver;
};

export type CreateLocalAudioRootDirResolverInput = {
  mainRootDir?: string;
  scanRoots?: readonly LocalAudioRootDescriptor[];
};

export type ByteRangePlan =
  | {
      kind: "full";
      status: 200;
      start: number;
      end: number;
      contentLength: number;
    }
  | {
      kind: "partial";
      status: 206;
      start: number;
      end: number;
      contentLength: number;
      contentRange: string;
    }
  | {
      kind: "unsatisfiable";
      status: 416;
      contentRange: string;
    };

export function createInMemoryLocalAudioTokenStore(
  input: CreateInMemoryLocalAudioTokenStoreInput,
): LocalAudioTokenStore {
  if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0) {
    throw new Error("local audio token ttlMs must be a positive safe integer.");
  }

  const clock = input.clock ?? (() => new Date().toISOString());
  const tokenFactory = input.tokenFactory ?? randomLocalAudioToken;
  const bindings = new Map<string, LocalAudioTokenAnchor>();

  return {
    async mint(mintInput) {
      assertOwnerScope(mintInput.ownerScope);
      assertLocalSourceRootId(mintInput.rootId);
      assertNormalizedLocalSourceRelativePath(mintInput.relativePath);

      const now = assertComparableClock(clock());
      sweepExpiredBindings(bindings, now);
      const expiresAt = new Date(Date.parse(now) + input.ttlMs).toISOString();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const token = tokenFactory();
        if (bindings.has(token)) {
          continue;
        }

        bindings.set(token, {
          rootId: mintInput.rootId,
          relativePath: mintInput.relativePath,
          ownerScope: mintInput.ownerScope,
          expiresAt,
        });

        return { token, expiresAt };
      }

      throw new Error("Could not mint a unique local audio token.");
    },
    async resolve(resolveInput) {
      assertNonEmptyString(resolveInput.token, "token");
      const now = assertComparableClock(clock());
      const anchor = bindings.get(resolveInput.token);

      if (anchor === undefined) {
        sweepExpiredBindings(bindings, now);
        return { kind: "not_found" };
      }

      if (anchor.expiresAt <= now) {
        bindings.delete(resolveInput.token);
        sweepExpiredBindings(bindings, now);
        return { kind: "expired" };
      }

      sweepExpiredBindings(bindings, now);
      return { kind: "resolved", anchor };
    },
  };
}

function sweepExpiredBindings(
  bindings: Map<string, LocalAudioTokenAnchor>,
  now: string,
): void {
  for (const [token, anchor] of bindings.entries()) {
    if (anchor.expiresAt <= now) {
      bindings.delete(token);
    }
  }
}

export function createLocalAudioFileResolver(
  input: CreateLocalAudioFileResolverInput,
): LocalAudioFileResolver {
  return {
    resolve(resolveInput) {
      assertLocalSourceRootId(resolveInput.rootId);
      assertNormalizedLocalSourceRelativePath(resolveInput.relativePath);

      const rootDir = input.resolveRootDir(resolveInput.rootId);
      if (rootDir === undefined) {
        return failServerHost(
          "server_host.local_audio_root_unavailable",
          `Local audio root '${resolveInput.rootId}' is not configured.`,
          true,
        );
      }

      return {
        ok: true,
        value: {
          absolutePath: resolveUnderRoot(rootDir, resolveInput.relativePath),
        },
      };
    },
  };
}

export function createLocalAudioRootDirResolver(
  input: CreateLocalAudioRootDirResolverInput,
): LocalAudioRootDirResolver {
  const rootDirs = new Map<string, string>();
  if (input.mainRootDir !== undefined) {
    rootDirs.set(MAIN_LOCAL_SOURCE_ROOT_ID, input.mainRootDir);
  }
  for (const root of input.scanRoots ?? []) {
    assertLocalSourceRootId(root.rootId);
    rootDirs.set(root.rootId, root.rootDir);
  }
  return (rootId) => rootDirs.get(rootId);
}

export function planByteRange(input: {
  rangeHeader?: string;
  sizeBytes: number;
}): ByteRangePlan {
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
    throw new Error("sizeBytes must be a non-negative safe integer.");
  }

  if (input.rangeHeader === undefined) {
    return fullRange(input.sizeBytes);
  }

  const rangeHeader = input.rangeHeader.trim();
  if (rangeHeader.length === 0) {
    return fullRange(input.sizeBytes);
  }

  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader);
  if (match === null) {
    return unsatisfiableRange(input.sizeBytes);
  }

  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (rawStart.length === 0 && rawEnd.length === 0) {
    return unsatisfiableRange(input.sizeBytes);
  }

  if (input.sizeBytes === 0) {
    return unsatisfiableRange(input.sizeBytes);
  }

  if (rawStart.length === 0) {
    const suffixLength = parseBytePosition(rawEnd);
    if (suffixLength === undefined || suffixLength <= 0) {
      return unsatisfiableRange(input.sizeBytes);
    }
    const start = Math.max(input.sizeBytes - suffixLength, 0);
    const end = input.sizeBytes - 1;
    return partialRange(start, end, input.sizeBytes);
  }

  const start = parseBytePosition(rawStart);
  const end = rawEnd.length === 0
    ? input.sizeBytes - 1
    : parseBytePosition(rawEnd);

  if (
    start === undefined ||
    end === undefined ||
    start > end ||
    start >= input.sizeBytes
  ) {
    return unsatisfiableRange(input.sizeBytes);
  }

  return partialRange(start, Math.min(end, input.sizeBytes - 1), input.sizeBytes);
}

function fullRange(sizeBytes: number): ByteRangePlan {
  return {
    kind: "full",
    status: 200,
    start: 0,
    end: Math.max(sizeBytes - 1, 0),
    contentLength: sizeBytes,
  };
}

function partialRange(start: number, end: number, sizeBytes: number): ByteRangePlan {
  return {
    kind: "partial",
    status: 206,
    start,
    end,
    contentLength: end - start + 1,
    contentRange: `bytes ${start}-${end}/${sizeBytes}`,
  };
}

function unsatisfiableRange(sizeBytes: number): ByteRangePlan {
  return {
    kind: "unsatisfiable",
    status: 416,
    contentRange: `bytes */${sizeBytes}`,
  };
}

function parseBytePosition(value: string): number | undefined {
  if (!/^\d+$/u.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function randomLocalAudioToken(): string {
  return `lat_${randomUUID().replaceAll("-", "").slice(0, 22)}`;
}

const COMPARABLE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function assertComparableClock(now: string): string {
  if (!COMPARABLE_TIMESTAMP_PATTERN.test(now) || Number.isNaN(Date.parse(now))) {
    throw new Error(
      "local audio token clock must return a fixed-width UTC ISO timestamp (YYYY-MM-DDTHH:mm:ss.sssZ).",
    );
  }

  return now;
}

function assertOwnerScope(ownerScope: string): void {
  assertNonEmptyString(ownerScope, "ownerScope");
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function failServerHost(code: string, message: string, retryable: boolean): Result<never> {
  const error: StageError = {
    code,
    message,
    area: "server_host",
    retryable,
  };
  return { ok: false, error };
}
