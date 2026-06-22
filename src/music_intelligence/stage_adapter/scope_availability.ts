import type { Result, StageError } from "../../contracts/kernel.js";
import type { Ref } from "../../contracts/kernel.js";
import type {
  MusicTargetKind,
  NonEmptyMusicTargetKinds,
} from "../../contracts/stage_interface.js";

export type MusicSourceLibraryScopeAvailability = {
  id: string;
  ref: Ref;
  providerName?: string;
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
};

export type MusicRelationScopeAvailability = {
  id: string;
  ref: Ref;
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
};

// `targetKind` is set for a single-kind catalog-visible Collection (recording,
// album, artist) and omitted for a mixed Collection (catalog baseline). Work and
// release Collections are catalog-invisible (D7) and never enter the snapshot, so
// the type needs no CollectionKind — `targetKind` presence alone distinguishes
// the two catalog-visible shapes.
export type MusicCollectionScopeAvailability = {
  id: string;
  ref: Ref;
  collectionName: string;
  targetKind?: MusicTargetKind;
  detailText?: string;
};

export type MusicProviderScopeAvailability = {
  providerId: string;
  providerName?: string;
  targetKinds: NonEmptyMusicTargetKinds;
  detailText?: string;
};

export type MusicScopeAvailabilitySnapshot = {
  sourceLibraries: readonly MusicSourceLibraryScopeAvailability[];
  relations: readonly MusicRelationScopeAvailability[];
  providers: readonly MusicProviderScopeAvailability[];
  collections: readonly MusicCollectionScopeAvailability[];
};

export type MusicScopeAvailabilityPort = {
  listAvailableMusicScopes(input: {
    ownerScope: string;
  }): Promise<Result<MusicScopeAvailabilitySnapshot>> | Result<MusicScopeAvailabilitySnapshot>;
};

export function createInMemoryMusicScopeAvailabilityPort(
  input: MusicScopeAvailabilitySnapshot | ((ownerScope: string) => MusicScopeAvailabilitySnapshot),
): MusicScopeAvailabilityPort {
  return {
    listAvailableMusicScopes(readInput) {
      const snapshot = typeof input === "function"
        ? input(readInput.ownerScope)
        : input;

      return {
        ok: true,
        value: copySnapshot(snapshot),
      };
    },
  };
}

export function emptyMusicScopeAvailabilitySnapshot(): MusicScopeAvailabilitySnapshot {
  return {
    sourceLibraries: [],
    relations: [],
    providers: [],
    collections: [],
  };
}

// Shared by music.discovery.lookup and music.discovery.list_scopes: a scope-availability read
// failure is a retryable runtime condition, not a user-input error, so both tools surface the same
// declared code instead of re-encoding to invalid_input or passing the raw port result through.
export function scopeAvailabilityFailed(): Result<never> {
  const error: StageError = {
    code: "scope_availability_failed",
    message: "Music scope availability could not be read.",
    area: "music_intelligence",
    retryable: true,
    suggestedFix: "Retry later, or call music.discovery.list_scopes to inspect available scopes.",
  };

  return {
    ok: false,
    error,
  };
}

function copySnapshot(snapshot: MusicScopeAvailabilitySnapshot): MusicScopeAvailabilitySnapshot {
  return {
    sourceLibraries: snapshot.sourceLibraries.map((scope) => ({
      ...scope,
      ref: { ...scope.ref },
    })),
    relations: snapshot.relations.map((scope) => ({
      ...scope,
      ref: { ...scope.ref },
    })),
    providers: snapshot.providers.map((scope) => ({
      ...scope,
      targetKinds: copyNonEmptyTargetKinds(scope.targetKinds),
    })),
    collections: snapshot.collections.map((scope) => ({
      ...scope,
      ref: { ...scope.ref },
    })),
  };
}

function copyNonEmptyTargetKinds(
  targetKinds: NonEmptyMusicTargetKinds,
): NonEmptyMusicTargetKinds {
  const [first, ...rest] = targetKinds;

  return [first, ...rest];
}
