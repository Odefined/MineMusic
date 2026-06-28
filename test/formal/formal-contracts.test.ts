import assert from "node:assert/strict";
import type { CanonicalEntity, MaterialAvailability, MaterialEntity, MaterialEntityKind, MaterialIdentityStatus, MaterialLifecycleStatus, MusicAlbum, MusicArtist, MusicMaterial, MusicRecording, PlatformLibraryCandidate, PlatformLibraryKind, PlatformLibraryProvider, PlatformLibraryReadInput, PlatformLibraryReadResult, PlayableLink, ProviderMaterialCandidate, SourceAlbum, SourceArtist, SourceEntity, SourceEntityKind, SourceLibraryImportBatchStatus, SourceLibraryImportCompletionReason, SourceLibraryImportItemOutcome, SourceNavigationLink, SourcePreferencePolicy, SourcePreferencePurpose, SourcePreferenceSelector, SourceProvider, SourceTrack, SourceTrackPosition, VersionInfo, VersionTag } from "../../src/contracts/music_data_platform.js";
import type { AgentSessionContext } from "../../src/contracts/agent_runtime.js";
import type { CanonicalRecord, CanonicalRecordStatus, MaterialRecord, SourceRecord } from "../../src/contracts/storage.js";
import type { ConcernRevision, Ref, Result, StageError } from "../../src/contracts/kernel.js";
import type { EvolvedPostureSnapshot, MusicExperiencePlaybackPlayCommandOutput, MusicExperiencePlaybackSnapshot, MusicExperiencePlaybackStatus, MusicExperienceQueueAppendCommandOutput, MusicExperienceQueueItemProvenance, MusicExperienceQueueItemSnapshot, MusicExperienceQueuePlaybackCommand, MusicExperienceRadioTruthCommand, MusicExperienceRadioTruthSnapshot, MusicExperienceSetRadioDirectionCommandOutput, MusicExperienceSnapshot, MusicExperienceWriteRadioPostureCommandOutput, RadioDirectionSnapshot, RadioDirectionValue } from "../../src/contracts/music_experience.js";
import type { RuntimeErrorSummary, RuntimeModuleOwnerArea, RuntimeModuleSnapshot, RuntimeModuleStatus, StageRuntimeSnapshot, StageRuntimeStatus } from "../../src/contracts/stage_core.js";
import type { WorkbenchMusicExperienceReadPort, WorkbenchMusicExperienceSlice, WorkspaceReadModel, WorkspaceReadModelReader } from "../../src/contracts/workbench_interface.js";
import type { LibraryImportLibraryKind, LibraryImportListSourcesInput, LibraryImportListSourcesOutput, LibraryRelationItemInput, LibraryRelationStateOutput, MusicAvailability as PublicMusicAvailability, MusicCard, MusicExperiencePresentInput, MusicExperiencePresentOutput, PublicDisplayLink, StageInterfaceContract, StageToolContext, StageToolExecutionGatePreflightResult, ToolDeclaration, ToolInvocationPolicy, MusicItemHandle } from "../../src/contracts/stage_interface.js";
import { assertRefSafe, refKey } from "../../src/contracts/kernel.js";
import { hasPrefixOrV1Token, tokenizePrefixOrV1Text } from "../../src/contracts/music_data_platform.js";
type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Expect<Check extends true> = Check;
type ForbiddenKeys<T, Keys extends PropertyKey> = Extract<keyof T, Keys>;
export type _refHasNoUrl = Expect<Equal<ForbiddenKeys<Ref, "url">, never>>;
export type _versionInfoShape = Expect<Equal<keyof VersionInfo, "label" | "tags"> & Equal<NonNullable<VersionInfo["tags"]>[number], VersionTag>>;
export type _playableLinkShape = Expect<Equal<keyof PlayableLink, "url" | "label" | "requiresAccount"> & Equal<ForbiddenKeys<PlayableLink, "sourceRef" | "expiresAt">, never>>;
export type _sourceNavigationLinkShape = Expect<Equal<keyof SourceNavigationLink, "url" | "label"> & Equal<ForbiddenKeys<SourceNavigationLink, "requiresAccount" | "sourceRef" | "expiresAt">, never>>;
export type _sourceEntityKinds = Expect<Equal<SourceEntityKind, "track" | "album" | "artist"> & Equal<SourceEntity, SourceTrack | SourceAlbum | SourceArtist>>;
export type _sourcePreferencePolicyShape = Expect<Equal<SourcePreferencePurpose, "descriptive_metadata" | "source_navigation" | "playback"> & Equal<SourcePreferenceSelector, { origin: "provider"; providerId: string } | { origin: "local_file" }> & Equal<keyof SourcePreferencePolicy, "defaultOrder" | "purposeOverrides">>;
export type _sourceQueryShape = Expect<Equal<keyof Parameters<NonNullable<SourceProvider["search"]>>[0]["query"], "text" | "targetKinds" | "limit" | "offset">>;
export type _sourceTrackPositionShape = Expect<Equal<keyof SourceTrackPosition, "discNumber" | "trackNumber" | "trackCount"> & Equal<SourceTrack["trackPosition"], SourceTrackPosition | undefined>>;
export type _sourceEntityForbiddenKeys = Expect<Equal<ForbiddenKeys<SourceEntity, "materialRef" | "canonicalRef" | "ownerScope" | "score" | "basis" | "provenance" | "displayLinks" | "links" | "raw" | "providerFacts" | "metadata" | "notes">, never>>;
type LocalSourceTrack = Extract<SourceTrack, { origin: "local_file" }>;
export type _localSourceTrackShape = Expect<Equal<LocalSourceTrack["rootId"], string> & Equal<LocalSourceTrack["relativePath"], string> & Equal<LocalSourceTrack["contentMd5"], string>>;
if (false) {
    const localSourceTrack: LocalSourceTrack = {
        origin: "local_file",
        sourceRef: { namespace: "source_local", kind: "track", id: "ls_contract" },
        rootId: "main",
        relativePath: "downloads/Artist/Album/01 - Song.flac",
        contentMd5: "abcdef0123456789abcdef0123456789",
        kind: "track",
        label: "Song",
        title: "Song",
    };
    void localSourceTrack;
    const badLocalProviderIdentity: LocalSourceTrack = {
        origin: "local_file",
        sourceRef: { namespace: "source_local", kind: "track", id: "ls_bad_provider" },
        rootId: "main",
        relativePath: "downloads/Artist/Album/02 - Song.flac",
        contentMd5: "abcdef0123456789abcdef0123456789",
        kind: "track",
        label: "Song",
        title: "Song",
        // @ts-expect-error local source identity must not use providerEntityId
        providerEntityId: "abcdef0123456789abcdef0123456789",
    };
    void badLocalProviderIdentity;
    const badLocalFilePath: LocalSourceTrack = {
        origin: "local_file",
        sourceRef: { namespace: "source_local", kind: "track", id: "ls_bad_path" },
        rootId: "main",
        relativePath: "downloads/Artist/Album/03 - Song.flac",
        contentMd5: "abcdef0123456789abcdef0123456789",
        kind: "track",
        label: "Song",
        title: "Song",
        // @ts-expect-error local source identity must not use platform-native filePath
        filePath: "/tmp/song.flac",
    };
    void badLocalFilePath;
}
export type _materialEntityShape = Expect<Equal<MaterialEntityKind, "recording" | "album" | "artist" | "work" | "release"> & Equal<MaterialLifecycleStatus, "active" | "merged" | "archived"> & Equal<MaterialIdentityStatus, "canonical_confirmed" | "source_backed" | "unresolved_identity"> & Equal<MaterialAvailability, "playable" | "restricted" | "unavailable" | "unknown"> & Equal<keyof MaterialEntity, "materialRef" | "kind" | "lifecycleStatus" | "identityStatus" | "canonicalRef" | "sourceRefs" | "versionInfo" | "createdAt" | "updatedAt">>;
export type _materialEntityForbiddenKeys = Expect<Equal<ForbiddenKeys<MaterialEntity, "links" | "playableLinks" | "displayLinks" | "availability" | "score" | "basis" | "provenance" | "ownerScope" | "collectionIds" | "aliases" | "notes" | "title" | "artists">, never>>;
export type _musicMaterialShape = Expect<Equal<MusicMaterial, MusicRecording | MusicAlbum | MusicArtist> & Equal<keyof MusicRecording, "kind" | "materialRef" | "title" | "artistLabels" | "albumLabel" | "trackPosition" | "durationMs" | "sourceNavigationLinks" | "availability" | "versionInfo"> & Equal<keyof MusicAlbum, "kind" | "materialRef" | "title" | "artistLabels" | "releaseDate" | "sourceNavigationLinks" | "availability" | "versionInfo"> & Equal<keyof MusicArtist, "kind" | "materialRef" | "name" | "aliases" | "sourceNavigationLinks" | "availability"> & Equal<MusicRecording["kind"], "recording"> & Equal<MusicAlbum["kind"], "album"> & Equal<MusicArtist["kind"], "artist"> & Equal<ForbiddenKeys<MusicMaterial, "label" | "displayLinks" | "playableLinks" | "sourceRefs" | "canonicalRef" | "primarySourceRef">, never>>;
export type _canonicalEntityShape = Expect<Equal<keyof CanonicalEntity, "canonicalRef" | "kind" | "label" | "aliases" | "versionInfo">>;
export type _recordsWrapEntities = Expect<Equal<SourceRecord["entity"], SourceEntity> & Equal<MaterialRecord["entity"], MaterialEntity> & Equal<CanonicalRecord["entity"], CanonicalEntity> & Equal<ForbiddenKeys<SourceRecord, "recordId">, never> & Equal<ForbiddenKeys<MaterialRecord, "recordId">, never> & Equal<ForbiddenKeys<CanonicalRecord, "recordId">, never> & Equal<CanonicalRecordStatus, "active" | "provisional" | "merged" | "archived">>;
export type _providerCandidateShape = Expect<Equal<keyof ProviderMaterialCandidate, "sourceEntity" | "providerScore"> & Equal<ProviderMaterialCandidate["sourceEntity"], SourceEntity> & Equal<ForbiddenKeys<ProviderMaterialCandidate, "materialRef" | "canonicalRef" | "raw" | "ownerScope" | "score">, never>>;
export type _sourceProviderSupportsPartialCapabilities = Expect<Equal<Awaited<ReturnType<NonNullable<SourceProvider["search"]>>>, Result<readonly ProviderMaterialCandidate[]>> & Equal<Awaited<ReturnType<NonNullable<SourceProvider["getPlayableLinks"]>>>, Result<readonly PlayableLink[]>>>;
export type _platformLibraryShapes = Expect<Equal<PlatformLibraryKind, "saved_source_track" | "saved_source_album" | "followed_source_artist"> & Equal<keyof PlatformLibraryCandidate, "sourceEntity" | "libraryKind" | "providerAccountId" | "providerAddedAt"> & Equal<PlatformLibraryCandidate["sourceEntity"], SourceEntity> & Equal<keyof PlatformLibraryReadInput, "providerAccountId" | "kind" | "limit" | "cursor" | "sessionId"> & Equal<keyof PlatformLibraryReadResult, "providerId" | "providerAccountId" | "kind" | "candidates" | "nextCursor" | "totalCountHint"> & Equal<Awaited<ReturnType<PlatformLibraryProvider["read"]>>, Result<PlatformLibraryReadResult>>>;
export type _sourceLibraryImportControlShapes = Expect<Equal<SourceLibraryImportBatchStatus, "running" | "completed" | "failed"> & Equal<SourceLibraryImportCompletionReason, "provider_exhausted" | "max_new_items_reached"> & Equal<SourceLibraryImportItemOutcome, "imported" | "already_present" | "failed">>;
export type _stageInterfaceContractShape = Expect<Equal<keyof StageInterfaceContract, "instruments" | "tools">>;
export type _libraryImportListSourcesPublicShape = Expect<Equal<LibraryImportLibraryKind, PlatformLibraryKind> & Equal<keyof LibraryImportListSourcesInput, string> & Equal<keyof LibraryImportListSourcesOutput, "sources"> & Equal<keyof LibraryImportListSourcesOutput["sources"][number], "providerId" | "label" | "accountRequired" | "libraryKinds"> & Equal<keyof LibraryImportListSourcesOutput["sources"][number]["libraryKinds"][number], "kind" | "label" | "description">>;
export type _stageToolDeclarationShape = Expect<Equal<keyof ToolDeclaration, "name" | "instrumentId" | "label" | "ownerArea" | "description" | "usage" | "examples" | "sideEffect" | "invocationPolicy" | "inputSchema" | "outputSchema" | "errors" | "resultSummary" | "allowedActions" | "requiresProvider"> & Equal<ForbiddenKeys<ToolDeclaration, "outputPolicy" | "runtimePolicy" | "contractVersion">, never>>;
export type _toolInvocationPolicyShape = Expect<Equal<keyof ToolInvocationPolicy, "defaultDecision" | "dataEgress" | "readOnlyHint" | "destructiveHint" | "admissionDrivenByPresentation" | "intakeDrivenByUserRequest" | "ownerRelationDrivenByUserRequest" | "collectionDrivenByUserRequest" | "maxCallsPerTurn">>;
export type _libraryRelationPublicShapes = Expect<Equal<keyof LibraryRelationItemInput, "item"> & Equal<LibraryRelationItemInput["item"]["kind"], "material"> & Equal<keyof LibraryRelationStateOutput, "relations"> & Equal<keyof LibraryRelationStateOutput["relations"], "saved" | "favorite" | "blocked">>;
export type _stageToolContextShape = Expect<Equal<keyof StageToolContext, "ownerScope" | "sessionId" | "requestId" | "actor" | "commandBasis" | "clock" | "abortSignal" | "handleMinting" | "lookupCursors" | "providerAvailability" | "executionGate" | "audit">>;
export type _stageToolExecutionGatePreflightResultShape = Expect<Equal<keyof StageToolExecutionGatePreflightResult, "decision" | "auditLevel" | "publicReason" | "internalReason"> & Equal<ForbiddenKeys<StageToolExecutionGatePreflightResult, "reason">, never>>;
export type _stageErrorShape = Expect<Equal<keyof StageError, "code" | "message" | "area" | "retryable" | "suggestedFix" | "cause">>;
export type _publicDisplayLinkShape = Expect<Equal<keyof PublicDisplayLink, "url" | "label"> & Equal<ForbiddenKeys<PublicDisplayLink, "requiresAccount" | "sourceRef" | "providerEntityId">, never>>;
export type _musicCardShape = Expect<Equal<PublicMusicAvailability, "playable" | "restricted" | "unavailable" | "unknown"> & Equal<keyof MusicCard, "kind" | "label" | "artistsText" | "albumLabel" | "displayLinks" | "availability" | "versionLabel"> & Equal<ForbiddenKeys<MusicCard, "materialRef" | "primarySourceRef" | "trackPosition" | "durationMs">, never>>;
export type _musicExperiencePresentShapes = Expect<Equal<keyof MusicExperiencePresentInput, "item"> & Equal<keyof MusicExperiencePresentOutput, "item" | "card"> & Equal<MusicExperiencePresentOutput["item"]["kind"], "material">>;
export type _concernRevisionShape = Expect<Equal<ConcernRevision, number>>;
export type _musicExperienceTruthShapes = Expect<Equal<MusicExperiencePlaybackStatus, "playing" | "paused"> & Equal<MusicExperienceQueueItemProvenance, "main_agent" | "user" | "radio_agent"> & Equal<keyof MusicExperienceQueueItemSnapshot, "position" | "materialRef" | "provenance"> & Equal<keyof MusicExperiencePlaybackSnapshot, "status" | "materialRef"> & Equal<keyof RadioDirectionSnapshot, "motif" | "activeVariations"> & Equal<RadioDirectionValue["kind"], "text" | "material" | "scope"> & Equal<keyof EvolvedPostureSnapshot, "lean" | "commandedRevisionStamp" | "stale"> & Equal<keyof MusicExperienceRadioTruthSnapshot, "radioDirectionRevision" | "direction" | "posture"> & Equal<keyof MusicExperienceSnapshot, "queueRevision" | "radioDirectionRevision" | "radioSessionRevision" | "playbackRevision" | "queue" | "playback" | "radio">>;
export type _musicExperienceCommandPortShape = Expect<Equal<keyof MusicExperienceQueuePlaybackCommand, "append" | "playNow">>;
export type _musicExperienceCommandPortFailureChannels = Expect<Equal<Awaited<ReturnType<MusicExperienceQueuePlaybackCommand["append"]>>, Result<MusicExperienceQueueAppendCommandOutput>> & Equal<Awaited<ReturnType<MusicExperienceQueuePlaybackCommand["playNow"]>>, Result<MusicExperiencePlaybackPlayCommandOutput>>>;
export type _musicExperienceRadioTruthCommandPortShape = Expect<Equal<keyof MusicExperienceRadioTruthCommand, "setRadioDirection" | "writeRadioPosture">>;
export type _musicExperienceRadioTruthCommandPortFailureChannels = Expect<Equal<Awaited<ReturnType<MusicExperienceRadioTruthCommand["setRadioDirection"]>>, Result<MusicExperienceSetRadioDirectionCommandOutput>> & Equal<Awaited<ReturnType<MusicExperienceRadioTruthCommand["writeRadioPosture"]>>, Result<MusicExperienceWriteRadioPostureCommandOutput>>>;
// ADR-0040 guard #1: the item-handle currency is exactly {material, candidate};
// the "library" item-handle kind is retired and must not reappear. ("library"
// survives only as a MusicScope baseline, not as an item-handle kind.)
export type _musicItemHandleKindSet = Expect<Equal<MusicItemHandle["kind"], "material" | "candidate">>;
export type _stageRuntimeStatusShape = Expect<Equal<StageRuntimeStatus, "created" | "initializing" | "ready" | "failed" | "stopping" | "stopped">>;
export type _runtimeModuleStatusShape = Expect<Equal<RuntimeModuleStatus, "created" | "initializing" | "initialized" | "stopping" | "stopped" | "failed">>;
export type _runtimeModuleOwnerAreas = Expect<Equal<RuntimeModuleOwnerArea, "stage_core" | "agent_runtime" | "workbench_interface" | "extension" | "music_data_platform" | "music_intelligence" | "music_experience" | "memory" | "effect_boundary">>;
export type _runtimeSnapshotShapes = Expect<Equal<keyof RuntimeErrorSummary, "code" | "message" | "area"> & Equal<keyof RuntimeModuleSnapshot, "id" | "ownerArea" | "status" | "error"> & Equal<keyof StageRuntimeSnapshot, "status" | "modules" | "interfaceContract" | "error" | "cleanupErrors"> & Equal<ForbiddenKeys<StageRuntimeSnapshot, "handlers" | "config" | "providerDescriptors" | "dbPath">, never>>;
export type _workbenchMusicExperienceSliceShape = Expect<Equal<keyof WorkbenchMusicExperienceSlice, "revision" | "queue" | "nowPlaying" | "radio">>;
export type _workspaceReadModelShape = Expect<Equal<keyof WorkspaceReadModel, "ownerScope" | "capturedAt" | "musicExperience">>;
export type _agentSessionContextIsOverWorkspaceReadModel = Expect<Equal<AgentSessionContext, WorkspaceReadModel>>;
export type _workbenchMusicExperienceReadPortShape = Expect<Equal<keyof WorkbenchMusicExperienceReadPort, "readMusicExperience">>;
export type _workspaceReadModelReaderShape = Expect<Equal<keyof WorkspaceReadModelReader, "readWorkspace">>;
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
