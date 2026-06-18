import { randomUUID } from "node:crypto";

import type { Result, StageError } from "../contracts/kernel.js";
import type { LookupCursorStore } from "../contracts/stage_interface.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import {
  createStageInterfaceLookupCursorRegistryRecords,
  type StageInterfaceLookupCursorRegistryRecords,
} from "./lookup_cursor_registry_records.js";

export type CreateLookupCursorStoreInput = {
  db: MusicDatabaseContext;
  ttlMs: number;
  clock?: () => string;
  cursorIdFactory?: () => string;
};

export type CreateLookupCursorStoreFromRecordsInput = {
  records: StageInterfaceLookupCursorRegistryRecords;
  ttlMs: number;
  clock?: () => string;
  cursorIdFactory?: () => string;
};

export const DEFAULT_LOOKUP_CURSOR_TTL_MS = 30 * 60 * 1000;

export function createLookupCursorStore(input: CreateLookupCursorStoreInput): LookupCursorStore {
  return createLookupCursorStoreFromRecords({
    records: createStageInterfaceLookupCursorRegistryRecords({ db: input.db }),
    ttlMs: input.ttlMs,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    ...(input.cursorIdFactory === undefined ? {} : { cursorIdFactory: input.cursorIdFactory }),
  });
}

export function createUnavailableLookupCursorStore(): LookupCursorStore {
  return {
    register() {
      throw new Error("Lookup cursor store is not available in this Stage Tool Context.");
    },
    resolve() {
      throw new Error("Lookup cursor store is not available in this Stage Tool Context.");
    },
  };
}

// Persisted (SQLite) implementation of LookupCursorStore. Replaces the prior
// stateless AES-256-GCM cursor codec: the cursor is now a short unguessable id,
// and the retrieval context lives server-side under ownerScope isolation + TTL.
// This is transport-agnostic (HTTP/stdio) and keeps the agent-facing nextCursor
// compact instead of a several-hundred-char encrypted blob.
export function createLookupCursorStoreFromRecords(
  input: CreateLookupCursorStoreFromRecordsInput,
): LookupCursorStore {
  if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0) {
    throw new Error("lookup cursor ttlMs must be a positive safe integer.");
  }

  const clock = input.clock ?? (() => new Date().toISOString());
  const cursorIdFactory = input.cursorIdFactory ?? randomLookupCursorId;

  return {
    register(registerInput) {
      assertOwnerScope(registerInput.ownerScope);
      const now = assertComparableClock(clock());

      // internalCursor is the opaque retrieval nextCursor, stored verbatim as a
      // TEXT string (the DB column is named internal_cursor_json for historical
      // reasons but it is not JSON). queryInput is the lookup handler's retrieval
      // query context and is the only JSON-serialized field on this binding.
      const internalCursor = registerInput.internalCursor;
      const queryInputJson = JSON.stringify(registerInput.queryInput);
      const expiresAt = new Date(Date.parse(now) + input.ttlMs).toISOString();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const cursorId = cursorIdFactory();

        // PK collision on a fresh random id is astronomically unlikely; retry.
        if (
          input.records.bindings.getByOwnerCursor({
            cursorId,
            ownerScope: registerInput.ownerScope,
          }) !== undefined
        ) {
          continue;
        }

        input.records.bindings.createBinding({
          cursorId,
          ownerScope: registerInput.ownerScope,
          internalCursor,
          queryInputJson,
          issuedAt: now,
          expiresAt,
        });

        return cursorId;
      }

      throw new Error("Could not mint a unique lookup cursor id.");
    },
    resolve(resolveInput) {
      assertOwnerScope(resolveInput.ownerScope);
      const now = assertComparableClock(clock());

      const binding = input.records.bindings.getByOwnerCursor({
        cursorId: resolveInput.cursorId,
        ownerScope: resolveInput.ownerScope,
      });

      // Unknown id OR ownerScope mismatch both surface as invalid_cursor: a
      // cursor from another owner is never resolvable here, indistinguishable
      // from a forged/expunged id to the caller.
      if (binding === undefined) {
        return invalidCursor("music.discovery.lookup cursor is unknown for this owner.");
      }

      if (binding.expiresAt <= now) {
        return resultWindowExpired("music.discovery.lookup result window expired.");
      }

      return {
        ok: true,
        value: {
          internalCursor: binding.internalCursor,
          queryInput: JSON.parse(binding.queryInputJson) as unknown,
        },
      };
    },
  };
}

function randomLookupCursorId(): string {
  return `lc_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

// The cursor expiry comparison relies on lexicographic ordering of fixed-width
// UTC ISO timestamps (YYYY-MM-DDTHH:mm:ss.sssZ), mirroring the invariant in
// src/stage_interface/handle_registry_records.ts and the lookup handler.
const LOOKUP_COMPARABLE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function assertComparableClock(now: string): string {
  if (!LOOKUP_COMPARABLE_TIMESTAMP_PATTERN.test(now) || Number.isNaN(Date.parse(now))) {
    throw new Error(
      "lookup cursor clock must return a fixed-width UTC ISO timestamp (YYYY-MM-DDTHH:mm:ss.sssZ).",
    );
  }

  return now;
}

function assertOwnerScope(ownerScope: string): void {
  if (ownerScope.trim().length === 0) {
    throw new Error("ownerScope must be a non-empty string.");
  }
}

function invalidCursor(message: string): Result<never> {
  return fail({
    code: "invalid_cursor",
    message,
    retryable: true,
    suggestedFix: "Start a fresh first-page music.discovery.lookup call.",
  });
}

function resultWindowExpired(message: string): Result<never> {
  return fail({
    code: "result_window_expired",
    message,
    retryable: true,
    suggestedFix: "Start a fresh first-page music.discovery.lookup call.",
  });
}

function fail(input: {
  code: string;
  message: string;
  retryable: boolean;
  suggestedFix?: string;
}): Result<never> {
  const error: StageError = {
    code: input.code,
    message: input.message,
    area: "music_intelligence",
    retryable: input.retryable,
    ...(input.suggestedFix === undefined ? {} : { suggestedFix: input.suggestedFix }),
  };

  return {
    ok: false,
    error,
  };
}
