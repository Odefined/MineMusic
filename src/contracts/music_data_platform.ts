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

export type PublicDisplayLink = {
  url: string;
  label?: string;
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

export type SourceEntityBase = {
  sourceRef: Ref;
  providerId: string;
  providerEntityId: string;
  label: string;
  providerUrl?: string;
  links?: readonly PlayableLink[];
  availabilityHint?: SourceAvailabilityHint;
  versionInfo?: VersionInfo;
};

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

export type MaterialEntity = {
  materialRef: Ref;
  kind: MaterialEntityKind;
  lifecycleStatus: MaterialLifecycleStatus;
  identityStatus: MaterialIdentityStatus;
  canonicalRef?: Ref;
  primarySourceRef?: Ref;
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
  | "lookup"
  | "playable_links";

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
