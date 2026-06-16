import { randomUUID } from "node:crypto";

import type {
  HandleMintingPort,
  MusicItemHandle,
} from "../contracts/stage_interface.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import {
  createStageInterfaceHandleRegistryRecords,
  type StageInterfaceHandleRegistryRecords,
} from "./handle_registry_records.js";

export type CandidateHandleCachePort = {
  mint(input: {
    ownerScope: string;
    internalAnchor: unknown;
  }): Promise<string>;
  resolve(input: {
    ownerScope: string;
    publicId: string;
  }): Promise<unknown | undefined>;
};

export type CreateStageInterfaceHandleMintingPortInput = {
  db: MusicDatabaseContext;
  clock?: () => string;
  candidateHandles?: CandidateHandleCachePort;
  publicIdFactory?: () => string;
};

export type CreateStageInterfaceHandleMintingPortFromRecordsInput = {
  records: StageInterfaceHandleRegistryRecords;
  clock?: () => string;
  candidateHandles?: CandidateHandleCachePort;
  publicIdFactory?: () => string;
};

export function createStageInterfaceHandleMintingPort(
  input: CreateStageInterfaceHandleMintingPortInput,
): HandleMintingPort {
  return createStageInterfaceHandleMintingPortFromRecords({
    records: createStageInterfaceHandleRegistryRecords({ db: input.db }),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    ...(input.candidateHandles === undefined ? {} : { candidateHandles: input.candidateHandles }),
    ...(input.publicIdFactory === undefined ? {} : { publicIdFactory: input.publicIdFactory }),
  });
}

export function createStageInterfaceHandleMintingPortFromRecords(
  input: CreateStageInterfaceHandleMintingPortFromRecordsInput,
): HandleMintingPort {
  const clock = input.clock ?? (() => new Date().toISOString());
  const publicIdFactory = input.publicIdFactory ?? randomPublicHandleId;
  const { records } = input;

  return {
    async mint(mintInput) {
      assertOwnerScope(mintInput.ownerScope);

      if (mintInput.handleKind === "candidate") {
        if (input.candidateHandles === undefined) {
          throw new Error("Candidate handle minting requires a runtime candidate cache adapter.");
        }

        return input.candidateHandles.mint({
          ownerScope: mintInput.ownerScope,
          internalAnchor: mintInput.internalAnchor,
        });
      }

      assertHandleKind(mintInput.handleKind);
      const internalAnchorJson = stableJsonStringify(mintInput.internalAnchor);
      const existing = records.bindings.getByOwnerAnchor({
        ownerScope: mintInput.ownerScope,
        handleKind: mintInput.handleKind,
        internalAnchorJson,
      });

      if (existing !== undefined && !isExpired(existing.expiresAt, clock())) {
        return existing.publicId;
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const publicId = publicIdFactory();

        if (records.bindings.getByPublicId({ publicId }) !== undefined) {
          continue;
        }

        records.bindings.createBinding({
          publicId,
          ownerScope: mintInput.ownerScope,
          handleKind: mintInput.handleKind,
          internalAnchorJson,
          issuedAt: clock(),
        });

        return publicId;
      }

      throw new Error("Could not mint a unique Stage Interface handle id.");
    },
    async resolve(resolveInput) {
      assertOwnerScope(resolveInput.ownerScope);

      if (resolveInput.handleKind === "candidate") {
        return input.candidateHandles?.resolve({
          ownerScope: resolveInput.ownerScope,
          publicId: resolveInput.publicId,
        }) ?? undefined;
      }

      assertHandleKind(resolveInput.handleKind);
      const binding = records.bindings.getByOwnerPublicId({
        publicId: resolveInput.publicId,
        ownerScope: resolveInput.ownerScope,
        handleKind: resolveInput.handleKind,
      });

      if (binding === undefined || isExpired(binding.expiresAt, clock())) {
        return undefined;
      }

      return JSON.parse(binding.internalAnchorJson) as unknown;
    },
  };
}

export function createUnavailableHandleMintingPort(): HandleMintingPort {
  return {
    async mint() {
      throw new Error("Handle minting is not configured for this Stage Tool context.");
    },
    async resolve() {
      return undefined;
    },
  };
}

function randomPublicHandleId(): string {
  return `mh_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function assertHandleKind(handleKind: MusicItemHandle["kind"]): asserts handleKind is "library" {
  if (handleKind !== "library") {
    throw new Error("Only library handles are persisted by the Stage Interface handle registry.");
  }
}

function assertOwnerScope(ownerScope: string): void {
  if (ownerScope.trim().length === 0) {
    throw new Error("ownerScope must be a non-empty string.");
  }
}

function isExpired(expiresAt: string | undefined, now: string): boolean {
  return expiresAt !== undefined && expiresAt <= now;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableJsonValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const stable: Record<string, unknown> = {};

  for (const key of Object.keys(value).sort()) {
    stable[key] = toStableJsonValue((value as Record<string, unknown>)[key]);
  }

  return stable;
}
