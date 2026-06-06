import assert from "node:assert/strict";

import type {
  CanonicalEntity,
  CanonicalRecord,
  CanonicalRecordStatus,
  MaterialAvailability,
  MaterialEntity,
  MaterialEntityKind,
  MaterialIdentityStatus,
  MaterialLifecycleStatus,
  MaterialRecord,
  PlayableLink,
  ProviderMaterialCandidate,
  Ref,
  Result,
  SourceAlbum,
  SourceArtist,
  SourceEntity,
  SourceEntityKind,
  SourceProvider,
  SourceRecord,
  SourceTrack,
  StageInterfaceContract,
  VersionInfo,
  VersionTag,
} from "../../src/contracts/index.js";
import { assertRefSafe, refKey } from "../../src/contracts/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

type ForbiddenKeys<T, Keys extends PropertyKey> = Extract<keyof T, Keys>;

export type _refHasNoUrl = Expect<
  Equal<ForbiddenKeys<Ref, "url">, never>
>;

export type _versionInfoShape = Expect<
  Equal<keyof VersionInfo, "label" | "tags"> &
    Equal<NonNullable<VersionInfo["tags"]>[number], VersionTag>
>;

export type _playableLinkShape = Expect<
  Equal<keyof PlayableLink, "url" | "label" | "requiresAccount"> &
    Equal<ForbiddenKeys<PlayableLink, "sourceRef" | "expiresAt">, never>
>;

export type _sourceEntityKinds = Expect<
  Equal<SourceEntityKind, "track" | "album" | "artist"> &
    Equal<SourceEntity, SourceTrack | SourceAlbum | SourceArtist>
>;

export type _sourceEntityForbiddenKeys = Expect<
  Equal<
    ForbiddenKeys<
      SourceEntity,
      | "materialRef"
      | "canonicalRef"
      | "ownerScope"
      | "score"
      | "basis"
      | "provenance"
      | "displayLinks"
      | "raw"
      | "providerFacts"
      | "metadata"
      | "notes"
    >,
    never
  >
>;

export type _materialEntityShape = Expect<
  Equal<MaterialEntityKind, "recording" | "album" | "artist" | "work" | "release"> &
    Equal<MaterialLifecycleStatus, "active" | "merged" | "archived"> &
    Equal<MaterialIdentityStatus, "canonical_confirmed" | "source_backed" | "unresolved_identity"> &
    Equal<MaterialAvailability, "playable" | "restricted" | "unavailable" | "unknown"> &
    Equal<
      keyof MaterialEntity,
      | "materialRef"
      | "kind"
      | "lifecycleStatus"
      | "identityStatus"
      | "canonicalRef"
      | "primarySourceRef"
      | "sourceRefs"
      | "versionInfo"
      | "createdAt"
      | "updatedAt"
    >
>;

export type _materialEntityForbiddenKeys = Expect<
  Equal<
    ForbiddenKeys<
      MaterialEntity,
      | "links"
      | "playableLinks"
      | "displayLinks"
      | "availability"
      | "score"
      | "basis"
      | "provenance"
      | "ownerScope"
      | "collectionIds"
      | "aliases"
      | "notes"
      | "title"
      | "artists"
    >,
    never
  >
>;

export type _canonicalEntityShape = Expect<
  Equal<
    keyof CanonicalEntity,
    "canonicalRef" | "kind" | "label" | "aliases" | "versionInfo"
  >
>;

export type _recordsWrapEntities = Expect<
  Equal<SourceRecord["entity"], SourceEntity> &
    Equal<MaterialRecord["entity"], MaterialEntity> &
    Equal<CanonicalRecord["entity"], CanonicalEntity> &
    Equal<CanonicalRecordStatus, "active" | "provisional" | "merged" | "archived">
>;

export type _providerCandidateShape = Expect<
  Equal<keyof ProviderMaterialCandidate, "sourceEntity" | "providerScore"> &
    Equal<ProviderMaterialCandidate["sourceEntity"], SourceEntity> &
    Equal<ForbiddenKeys<ProviderMaterialCandidate, "materialRef" | "canonicalRef" | "raw" | "ownerScope" | "score">, never>
>;

export type _sourceProviderSupportsPartialCapabilities = Expect<
  Equal<
    Awaited<ReturnType<NonNullable<SourceProvider["search"]>>>,
    Result<readonly ProviderMaterialCandidate[]>
  > &
    Equal<
      Awaited<ReturnType<NonNullable<SourceProvider["getPlayableLinks"]>>>,
      Result<readonly PlayableLink[]>
    >
>;

export type _stageInterfaceContractShape = Expect<
  Equal<keyof StageInterfaceContract, "instruments" | "tools">
>;

const sourceRef: Ref = {
  namespace: "source_netease",
  kind: "track",
  id: "1901371647",
};

assert.equal(refKey(sourceRef), "source_netease:track:1901371647");
assert.doesNotThrow(() => assertRefSafe(sourceRef));
assert.throws(() => refKey({ namespace: "source:netease", kind: "track", id: "1" }));
assert.throws(() => refKey({ namespace: "source_netease", kind: "", id: "1" }));
