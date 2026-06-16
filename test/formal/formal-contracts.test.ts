import assert from "node:assert/strict";

import type { CanonicalEntity, MaterialAvailability, MaterialEntity, MaterialEntityKind, MaterialIdentityStatus, MaterialLifecycleStatus, PlatformLibraryCandidate, PlatformLibraryKind, PlatformLibraryProvider, PlatformLibraryReadInput, PlatformLibraryReadResult, PlayableLink, ProviderMaterialCandidate, SourceAlbum, SourceArtist, SourceEntity, SourceEntityKind, SourceLibraryImportBatchStatus, SourceLibraryImportCompletionReason, SourceLibraryImportItemOutcome, SourceProvider, SourceTrack, SourceTrackPosition, VersionInfo, VersionTag } from "../../src/contracts/music_data_platform.js";
import type { CanonicalRecord, CanonicalRecordStatus, MaterialRecord, SourceRecord } from "../../src/contracts/storage.js";
import type { Ref, Result, StageError } from "../../src/contracts/kernel.js";
import type { RuntimeErrorSummary, RuntimeModuleOwnerArea, RuntimeModuleSnapshot, RuntimeModuleStatus, StageRuntimeSnapshot, StageRuntimeStatus } from "../../src/contracts/stage_core.js";
import type { StageInterfaceContract, ToolDeclaration } from "../../src/contracts/stage_interface.js";
import { assertRefSafe, refKey } from "../../src/contracts/kernel.js";
import { hasPrefixOrV1Token, tokenizePrefixOrV1Text } from "../../src/contracts/music_data_platform.js";

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

export type _sourceQueryShape = Expect<
  Equal<keyof Parameters<NonNullable<SourceProvider["search"]>>[0]["query"], "text" | "targetKinds" | "limit" | "offset">
>;

export type _sourceTrackPositionShape = Expect<
  Equal<keyof SourceTrackPosition, "discNumber" | "trackNumber" | "trackCount"> &
    Equal<SourceTrack["trackPosition"], SourceTrackPosition | undefined>
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
    Equal<ForbiddenKeys<SourceRecord, "recordId">, never> &
    Equal<ForbiddenKeys<MaterialRecord, "recordId">, never> &
    Equal<ForbiddenKeys<CanonicalRecord, "recordId">, never> &
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

export type _platformLibraryShapes = Expect<
  Equal<
    PlatformLibraryKind,
    "saved_source_track" | "saved_source_album" | "followed_source_artist"
  > &
    Equal<
      keyof PlatformLibraryCandidate,
      "sourceEntity" | "libraryKind" | "providerAccountId" | "providerAddedAt"
    > &
    Equal<PlatformLibraryCandidate["sourceEntity"], SourceEntity> &
    Equal<
      keyof PlatformLibraryReadInput,
      "providerAccountId" | "kind" | "limit" | "cursor" | "sessionId"
    > &
    Equal<
      keyof PlatformLibraryReadResult,
      "providerId" | "providerAccountId" | "kind" | "candidates" | "nextCursor" | "totalCountHint"
    > &
    Equal<
      Awaited<ReturnType<PlatformLibraryProvider["read"]>>,
      Result<PlatformLibraryReadResult>
    >
>;

export type _sourceLibraryImportControlShapes = Expect<
  Equal<SourceLibraryImportBatchStatus, "running" | "completed" | "failed"> &
    Equal<SourceLibraryImportCompletionReason, "provider_exhausted" | "max_new_items_reached"> &
    Equal<SourceLibraryImportItemOutcome, "imported" | "already_present" | "failed">
>;

export type _stageInterfaceContractShape = Expect<
  Equal<keyof StageInterfaceContract, "instruments" | "tools">
>;

export type _stageToolDeclarationShape = Expect<
  Equal<
    keyof ToolDeclaration,
    | "name"
    | "instrumentId"
    | "label"
    | "ownerArea"
    | "description"
    | "usage"
    | "examples"
    | "sideEffect"
    | "invocationPolicy"
    | "inputSchema"
    | "outputSchema"
    | "errors"
    | "allowedActions"
    | "requiresProvider"
  > &
    Equal<ForbiddenKeys<ToolDeclaration, "outputPolicy" | "runtimePolicy" | "contractVersion">, never>
>;

export type _stageErrorShape = Expect<
  Equal<keyof StageError, "code" | "message" | "area" | "retryable" | "suggestedFix" | "cause">
>;

export type _stageRuntimeStatusShape = Expect<
  Equal<StageRuntimeStatus, "created" | "initializing" | "ready" | "failed" | "stopping" | "stopped">
>;

export type _runtimeModuleStatusShape = Expect<
  Equal<RuntimeModuleStatus, "created" | "initializing" | "initialized" | "stopping" | "stopped" | "failed">
>;

export type _runtimeModuleOwnerAreas = Expect<
  Equal<
    RuntimeModuleOwnerArea,
    | "stage_core"
    | "extension"
    | "music_data_platform"
    | "music_intelligence"
    | "music_experience"
    | "memory"
    | "effect_boundary"
  >
>;

export type _runtimeSnapshotShapes = Expect<
  Equal<keyof RuntimeErrorSummary, "code" | "message" | "area"> &
    Equal<keyof RuntimeModuleSnapshot, "id" | "ownerArea" | "status" | "error"> &
    Equal<keyof StageRuntimeSnapshot, "status" | "modules" | "interfaceContract" | "error" | "cleanupErrors"> &
    Equal<ForbiddenKeys<StageRuntimeSnapshot, "handlers" | "config" | "providerDescriptors" | "dbPath">, never>
>;

const sourceRef: Ref = {
  namespace: "source_netease",
  kind: "track",
  id: "1901371647",
};
const canonicalRef: Ref = {
  namespace: "canonical_minemusic",
  kind: "recording",
  id: "canonical-1",
};

assert.equal(refKey(sourceRef), "source_netease:track:1901371647");
assert.equal(refKey(canonicalRef), "canonical_minemusic:recording:canonical-1");
assert.doesNotThrow(() => assertRefSafe(sourceRef));
assert.doesNotThrow(() => assertRefSafe(canonicalRef));
assert.throws(() => refKey({ namespace: "source:netease", kind: "track", id: "1" }));
assert.throws(() => refKey({ namespace: "source_netease", kind: "", id: "1" }));
assert.deepEqual(tokenizePrefixOrV1Text("café del mar"), ["café", "del", "mar"]);
assert.deepEqual(tokenizePrefixOrV1Text("--- !!!"), []);
assert.equal(hasPrefixOrV1Token("foo_bar"), true);
assert.equal(hasPrefixOrV1Token("--- !!!"), false);
