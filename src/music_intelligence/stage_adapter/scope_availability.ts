import type { Result } from "../../contracts/kernel.js";
import type {
  MusicTargetKind,
  NonEmptyMusicTargetKinds,
} from "../../contracts/stage_interface.js";

export type MusicSourceLibraryScopeAvailability = {
  id: string;
  providerName?: string;
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
};

export type MusicRelationScopeAvailability = {
  id: string;
  relationName: string;
  targetKind: MusicTargetKind;
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
  };
}

function copySnapshot(snapshot: MusicScopeAvailabilitySnapshot): MusicScopeAvailabilitySnapshot {
  return {
    sourceLibraries: snapshot.sourceLibraries.map((scope) => ({ ...scope })),
    relations: snapshot.relations.map((scope) => ({ ...scope })),
    providers: snapshot.providers.map((scope) => ({
      ...scope,
      targetKinds: copyNonEmptyTargetKinds(scope.targetKinds),
    })),
  };
}

function copyNonEmptyTargetKinds(
  targetKinds: NonEmptyMusicTargetKinds,
): NonEmptyMusicTargetKinds {
  const [first, ...rest] = targetKinds;

  return [first, ...rest];
}
