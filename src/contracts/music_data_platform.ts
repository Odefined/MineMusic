// Music Data Platform contract surface — source/material identity, provider
// capability contracts, library import status, and the shared retrieval
// text-matching tokenization. This is the canonical source/material owner;
// extension (provider implementation) and music_intelligence (retrieval
// orchestration) read DOWNWARD into these types.

import type { Ref, Result } from "./kernel.js";

const prefixOrV1TokenPattern = /[\p{L}\p{N}_]+/gu;

export function tokenizePrefixOrV1Text(text: string): readonly string[] {
  return text.match(prefixOrV1TokenPattern) ?? [];
}

export function hasPrefixOrV1Token(text: string): boolean {
  return tokenizePrefixOrV1Text(text).length > 0;
}

export type VersionTag =
  | "remaster"
  | "remix"
  | "live"
  | "edit"
  | "radio_edit"
  | "extended"
  | "acoustic"
  | "unplugged"
  | "demo"
  | "deluxe"
  | "explicit"
  | "instrumental"
  | (string & {});

export type VersionInfo = {
  label?: string;
  tags?: readonly VersionTag[];
};

export type PlayableLink = {
  url: string;
  label?: string;
  requiresAccount?: boolean;
};

export type SourceNavigationLink = {
  url: string;
  label?: string;
};

// A downloadable audio source: a direct file URL (HTTP GET yields the complete
// decodable audio) plus the facts a downloader needs to name, size-check, and
// integrity-verify the file. This is deliberately separate from PlayableLink:
// playable may be an HLS/DASH manifest or a DRM stream that can stream but
// cannot be fetched as a single decodable file. Only providers that can hand
// back a true file-direct URL declare the `download_source` capability.
export type DownloadSource = {
  url: string;
  container: string;
  bitrate?: number;
  sizeBytes?: number;
  md5?: string;
  expiresAt?: string;
};

// Lyrics for a track: the main lyric text plus optional translation and
// romanization tracks. Each value is the raw LRC text the provider returns
// (timestamps preserved; the provider does not own a lossy parse). "No lyrics"
// (instrumental, not provided) is ok(undefined) at the provider method level.
export type SongLyrics = {
  lyrics: string;
  translation?: string;
  romanization?: string;
};

export type SourceEntityKind =
  | "track"
  | "album"
  | "artist";

export type SourceAvailabilityHint =
  | "playable"
  | "restricted"
  | "unavailable"
  | "unknown";

export type SourceOrigin = "provider" | "local_file";

export type SourcePreferencePurpose =
  | "descriptive_metadata"
  | "source_navigation"
  | "playback";

export type SourcePreferenceSelector =
  | { origin: "provider"; providerId: string }
  | { origin: "local_file" };

export type SourcePreferencePolicy = {
  defaultOrder: readonly SourcePreferenceSelector[];
  purposeOverrides?: Partial<Record<SourcePreferencePurpose, readonly SourcePreferenceSelector[]>>;
};

// Fields shared by both origins.
type SourceEntitySharedFields = {
  sourceRef: Ref;
  label: string;
  providerUrl?: string;
  availabilityHint?: SourceAvailabilityHint;
  versionInfo?: VersionInfo;
};

// Provider-backed source: identified by (providerId, providerEntityId), both
// required — the contract cannot be constructed without them.
export type ProviderOriginSourceEntity = SourceEntitySharedFields & {
  origin: "provider";
  providerId: string;
  providerEntityId: string;
};

// Local-file source: identified by a Local Source Root id plus MineMusic-
// normalized root-relative path. contentMd5 is a non-unique content fact for
// integrity/review surfaces, not source identity. Local sources have no provider
// identity and do not store platform-native absolute paths.
export type LocalFileOriginSourceEntity = SourceEntitySharedFields & {
  origin: "local_file";
  providerId?: never;
  providerEntityId?: never;
  filePath?: never;
  rootId: string;
  relativePath: string;
  contentMd5: string;
};

// `origin` discriminates provider-backed sources (providerId/providerEntityId
// required) from local-file sources (root/path identity, no provider). The union
// makes the per-origin contract unbreakable at construction: a provider entity
// cannot omit providerId/providerEntityId, and a local entity cannot carry a
// providerId. `origin` also lives as a source_records column, where it is the
// partial-index predicate. Same both-places pattern the codebase uses for
// kind/origin-specific lookup columns.
export type SourceEntityBase =
  | ProviderOriginSourceEntity
  | LocalFileOriginSourceEntity;

export type SourceTrack = SourceEntityBase & {
  kind: "track";
  title: string;
  artistLabels?: readonly string[];
  artistSourceRefs?: readonly Ref[];
  albumLabel?: string;
  albumSourceRef?: Ref;
  trackPosition?: SourceTrackPosition;
  durationMs?: number;
};

export type SourceTrackPosition = {
  discNumber?: string;
  trackNumber?: number;
  trackCount?: number;
};

export type SourceAlbum = SourceEntityBase & {
  kind: "album";
  title: string;
  artistLabels?: readonly string[];
  artistSourceRefs?: readonly Ref[];
  releaseDate?: string;
};

export type SourceArtist = SourceEntityBase & {
  kind: "artist";
  name: string;
  aliases?: readonly string[];
};

export type SourceEntity =
  | SourceTrack
  | SourceAlbum
  | SourceArtist;

export type MaterialEntityKind =
  | "recording"
  | "album"
  | "artist"
  | "work"
  | "release";

export type CanonicalEntityKind = MaterialEntityKind;

// A Collection's kind: any single material kind, or `mixed` (multiple kinds).
// `mixed` is Collection-only (not a MaterialEntityKind), so this union extends
// MaterialEntityKind rather than aliasing it. Lives in contracts so the
// Stage Interface (library.collection.create input / state output) can share
// the exact domain vocabulary the writer owns.
export type CollectionKind = MaterialEntityKind | "mixed";

export type MaterialLifecycleStatus =
  | "active"
  | "merged"
  | "archived";

export type MaterialIdentityStatus =
  | "canonical_confirmed"
  | "source_backed"
  | "unresolved_identity";

export type MaterialAvailability =
  | "playable"
  | "restricted"
  | "unavailable"
  | "unknown";

export type MusicRecording = {
  kind: "recording";
  materialRef: Ref;
  title: string;
  artistLabels: readonly string[];
  albumLabel?: string;
  trackPosition?: SourceTrackPosition;
  durationMs?: number;
  sourceNavigationLinks: readonly SourceNavigationLink[];
  availability: MaterialAvailability;
  versionInfo?: VersionInfo;
};

export type MusicAlbum = {
  kind: "album";
  materialRef: Ref;
  title: string;
  artistLabels?: readonly string[];
  releaseDate?: string;
  sourceNavigationLinks: readonly SourceNavigationLink[];
  availability: MaterialAvailability;
  versionInfo?: VersionInfo;
};

export type MusicArtist = {
  kind: "artist";
  materialRef: Ref;
  name: string;
  aliases?: readonly string[];
  sourceNavigationLinks: readonly SourceNavigationLink[];
  availability: MaterialAvailability;
};

export type MusicMaterial =
  | MusicRecording
  | MusicAlbum
  | MusicArtist;

export type MaterialEntity = {
  materialRef: Ref;
  kind: MaterialEntityKind;
  lifecycleStatus: MaterialLifecycleStatus;
  identityStatus: MaterialIdentityStatus;
  canonicalRef?: Ref;
  sourceRefs: readonly Ref[];
  versionInfo?: VersionInfo;
  createdAt?: string;
  updatedAt?: string;
};

export type CanonicalEntity = {
  canonicalRef: Ref;
  kind: CanonicalEntityKind;
  label: string;
  aliases?: readonly string[];
  versionInfo?: VersionInfo;
};

export type ProviderMaterialCandidate = {
  sourceEntity: SourceEntity;
  providerScore?: number;
};

export type SourceQuery = {
  text: string;
  targetKinds?: readonly SourceEntityKind[];
  limit?: number;
  offset?: number;
};

export type SourceProviderCapability =
  | "search"
  | "playable_links"
  | "download_source"
  | "entity_picture_url"
  | "song_lyrics";

export type SourceProviderDescriptor = {
  providerId: string;
  label: string;
  capabilities: readonly SourceProviderCapability[];
  accountRequired?: boolean;
};

export type SourceProvider = {
  descriptor: SourceProviderDescriptor;
  search?: (input: {
    query: SourceQuery;
    sessionId?: string;
  }) => Promise<Result<readonly ProviderMaterialCandidate[]>>;
  getPlayableLinks?: (input: {
    sourceRef: Ref;
    sessionId?: string;
  }) => Promise<Result<readonly PlayableLink[]>>;
  getDownloadSource?: (input: {
    sourceRef: Ref;
    preferredBitrate?: number;
    sessionId?: string;
  }) => Promise<Result<DownloadSource>>;
  // A public display picture URL for the entity. A track's picture is its album
  // cover; albums and artists carry their own. Pictures are public (no account
  // or copyright gating like audio), so "no picture" is an honest empty
  // (ok(undefined)) rather than an error — the provider only fails when the
  // response itself is unreachable or malformed. Pure read; no durable state.
  getEntityPictureUrl?: (input: {
    sourceRef: Ref;
    sessionId?: string;
  }) => Promise<Result<string | undefined>>;
  // Lyrics for a track. Only tracks carry lyrics; albums/artists yield
  // ok(undefined) (honest empty, never an error). "No lyrics" (instrumental,
  // not provided) is also ok(undefined); the provider only fails when the
  // response itself is unreachable or malformed. Pure read; no durable state.
  getSongLyrics?: (input: {
    sourceRef: Ref;
    sessionId?: string;
  }) => Promise<Result<SongLyrics | undefined>>;
};

export type PlatformLibraryKind =
  | "saved_source_track"
  | "saved_source_album"
  | "followed_source_artist";

export type PlatformLibraryCandidate = {
  sourceEntity: SourceEntity;
  libraryKind: PlatformLibraryKind;
  providerAccountId?: string;
  providerAddedAt?: string;
};

export type PlatformLibraryReadInput = {
  providerAccountId?: string;
  kind: PlatformLibraryKind;
  limit?: number;
  cursor?: string;
  sessionId?: string;
};

export type PlatformLibraryReadResult = {
  providerId: string;
  providerAccountId?: string;
  kind: PlatformLibraryKind;
  candidates: readonly PlatformLibraryCandidate[];
  nextCursor?: string;
  totalCountHint?: number;
};

export type PlatformLibraryProviderDescriptor = {
  providerId: string;
  label: string;
  libraryKinds: readonly PlatformLibraryKind[];
  accountRequired?: boolean;
};

export type PlatformLibraryProvider = {
  descriptor: PlatformLibraryProviderDescriptor;
  read(input: PlatformLibraryReadInput): Promise<Result<PlatformLibraryReadResult>>;
};

export type SourceLibraryImportBatchStatus =
  | "running"
  | "completed"
  | "failed";

export type SourceLibraryImportCompletionReason =
  | "provider_exhausted"
  | "max_new_items_reached";

export type SourceLibraryImportItemOutcome =
  | "imported"
  | "already_present"
  | "failed";
