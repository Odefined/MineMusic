import { refKey, type Ref } from "../contracts/kernel.js";
import type {
  SourceEntity,
  SourcePreferencePolicy,
} from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { createIdentityRepositories } from "./identity_records.js";
import {
  boundSourcesForMaterialRecords,
  materialRecordClosure,
  survivorRecordForRef,
} from "./material_bound_sources.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  DEFAULT_SOURCE_PREFERENCE_POLICY,
  rankBoundSources,
} from "./material_projection.js";

export type CreatePlaybackSourceResolverInput = {
  db: MusicDatabaseContext;
  sourcePreferencePolicy?: SourcePreferencePolicy;
};

export type PlaybackSourceResolver = {
  resolvePlaybackSources(input: ResolvePlaybackSourcesInput): Promise<PlaybackSourceResolution | undefined>;
};

export type ResolvePlaybackSourcesInput = {
  materialRef: Ref;
};

export type PlaybackSourceResolution = {
  requestedMaterialRef: Ref;
  materialRef: Ref;
  sources: readonly SourceEntity[];
};

export function createPlaybackSourceResolver(
  input: CreatePlaybackSourceResolverInput,
): PlaybackSourceResolver {
  const repositories = createIdentityRepositories({ db: input.db });
  const sourcePreferencePolicy = input.sourcePreferencePolicy
    ?? DEFAULT_SOURCE_PREFERENCE_POLICY;

  return {
    async resolvePlaybackSources(resolveInput) {
      assertMaterialRef(resolveInput.materialRef);

      const materialRecords = await materialRecordClosure({
        materialRefs: [resolveInput.materialRef],
        repositories,
      });
      const survivor = survivorRecordForRef(resolveInput.materialRef, materialRecords);
      if (survivor === undefined) {
        return undefined;
      }

      const boundSourcesByMaterialKey = await boundSourcesForMaterialRecords({
        materialRecords: [survivor],
        repositories,
      });
      const boundSources = boundSourcesByMaterialKey.get(refKey(survivor.entity.materialRef)) ?? [];

      return {
        requestedMaterialRef: resolveInput.materialRef,
        materialRef: survivor.entity.materialRef,
        sources: rankBoundSources({
          sources: boundSources,
          policy: sourcePreferencePolicy,
          purpose: "playback",
        }),
      };
    },
  };
}
