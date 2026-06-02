# Platform Library Provider Slot Design

This document defines the `platform_library` capability slot. Platform Library
Provider is a plugin-slot contract, not a Library Import submodule.
Implementation state lives in `docs/platform-library-provider/progress.md`;
historical NetEase implementation sequencing is archived under
`docs/archive/platform-library-provider/`.

## Purpose

Platform Library Provider reads account-scoped music library facts from an
external platform.

It answers:

```text
What library facts can this provider read for this platform account?
```

It does not answer:

```text
Which MineMusic canonical identity is correct?
Should this item be written to a Collection?
Which import scope did the user intend?
Should the user clean up missing items?
```

Those decisions belong to Library Import, Canonical Store, Collection Service,
the LLM, and later review workflows.

## Responsibilities

The provider owns:

- platform API calls.
- platform auth or account session details.
- pagination, cursors, rate limits, and retries for platform reads.
- platform ids and provider-local response details.
- mapping platform responses into provider-slot item facts.
- reporting whether each requested library area was read completely or
  partially.
- provider account identity for account-scoped reads.

The provider does not own:

- MineMusic canonical identity decisions.
- Collection Service writes.
- Event Service writes.
- Memory creation.
- final recommendation policy.
- import/update baseline comparison.

## Account Selection

If input includes `providerAccountId`, the provider reads that account.

If input omits `providerAccountId`, the provider may use its current default
account.

Preview and read results must return:

- actual `providerAccountId` used.
- whether that provider account identity is stable.

The provider should expose a stable provider account identity when account
library reads are account-scoped, such as a platform user id or configured local
account id. It must not return provider credentials.

If multiple provider accounts are possible and no default account is known, the
provider returns `account_selection_required` instead of choosing one.

The LLM decides how to ask the user when account selection is required.

If a provider cannot expose a stable account id, it may return an explicit
fallback account id such as a local configuration id, marked unstable. Stable
and unstable provider account identities must not be mixed as the same update
baseline by Library Import.

For the first NetEase implementation, MineMusic does not store NetEase
credentials, passwords, or cookies. The NetEase Platform Library Provider
assumes the configured local NetEase API service already has any required
account session. If account-library reads fail because that service is not
logged in, the provider returns a structured login-required result rather than
asking MineMusic to manage provider credentials.

## Registration

Plugins register Platform Library Providers through the shared Plugin Registry:

```ts
await pluginRegistry.registerProvider({
  slot: "platform_library",
  providerId: provider.id,
  provider,
});
```

Registration rules:

- `provider` must implement `PlatformLibraryProvider`.
- `providerId` should be stable and should match `provider.id`.
- Provider ids are scoped by slot. The same plugin package may register a
  `source` provider and a `platform_library` provider without coupling the two
  contracts.
- The registry stores providers by slot. It must not branch on platform names,
  provider-specific source-ref kinds, import scope, or account details.
- Library Import discovers providers by the `platform_library` slot, then calls
  `preview`, `readItems`, or optional `readPage` on the selected provider.
- Registration does not choose what to import. The LLM/user-facing layer
  chooses scope before calling Library Import tools.

## Contract Shape

Provider contract:

```ts
export type PlatformLibraryArea =
  | "saved_source_tracks"
  | "saved_source_releases"
  | "saved_source_artists"
  | "playlists"
  | "listening_history";

export type PlatformLibraryAvailability =
  | "previewable"
  | "readable"
  | "unsupported"
  | "unavailable";

export type PlatformLibraryReadStatus =
  | "complete"
  | "partial"
  | "failed"
  | "unavailable";

export type PlatformLibraryCount =
  | { certainty: "exact" | "at_least"; value: number }
  | { certainty: "unknown" };

export type PlatformLibraryIssueCode =
  | "login_required"
  | "account_selection_required"
  | "account_unstable"
  | "scope_unsupported"
  | "area_unavailable"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "partial_read"
  | "malformed_response";

export type PlatformLibraryIssue = {
  code: PlatformLibraryIssueCode;
  message: string;
  retryable: boolean;
  area?: PlatformLibraryArea;
  details?: Record<string, unknown>;
};

export type PlatformLibraryAccountIdentity = {
  providerAccountId: string;
  stable: boolean;
  label?: string;
};

export type PlatformLibraryItemKind =
  | "saved_source_track"
  | "saved_source_release"
  | "saved_source_artist";

export type PlatformLibraryTargetKind =
  | "recording"
  | "release"
  | "artist";

export interface PlatformLibraryProvider {
  id: string;

  preview(input: PlatformLibraryPreviewInput): Promise<Result<PlatformLibraryPreview>>;

  readItems(input: PlatformLibraryReadInput): Promise<Result<PlatformLibraryReadResult>>;

  readPage?(input: PlatformLibraryReadPageInput): Promise<Result<PlatformLibraryReadPageResult>>;
}
```

Provider item:

```ts
export type SourceReleaseTrackPosition = {
  discNumber?: string;
  trackNumber?: number;
  trackCount?: number;
};

export type PlatformLibraryItem = {
  providerId: string;
  sourceRef: Ref;
  itemKind: PlatformLibraryItemKind;
  targetKind: PlatformLibraryTargetKind;
  label: string;
  providerAddedAt?: string;
  canonicalHints?: {
    label?: string;
    artistLabels?: string[];
    artistSourceRefs?: Ref[];
    releaseLabel?: string;
    releaseSourceRef?: Ref;
    releaseDate?: string;
    durationMs?: number;
    trackPosition?: SourceReleaseTrackPosition;
  };
};

export type PlatformLibrarySample = {
  label: string;
  itemKind?: PlatformLibraryItemKind;
  targetKind?: PlatformLibraryTargetKind;
  artistLabels?: string[];
};

export type PlatformLibraryPreviewArea = {
  area: PlatformLibraryArea;
  availability: PlatformLibraryAvailability;
  count?: PlatformLibraryCount;
  samples?: PlatformLibrarySample[];
  issues?: PlatformLibraryIssue[];
};

export type PlatformLibraryPreviewInput = {
  providerAccountId?: string;
  areas?: PlatformLibraryArea[];
  discovery?: boolean;
  sampleLimitPerArea?: number;
};

export type PlatformLibraryPreview = {
  providerId: string;
  account?: PlatformLibraryAccountIdentity;
  areas: PlatformLibraryPreviewArea[];
  issues?: PlatformLibraryIssue[];
};

export type PlatformLibraryReadAreaResult = {
  area: PlatformLibraryArea;
  status: PlatformLibraryReadStatus;
  items: PlatformLibraryItem[];
  issues?: PlatformLibraryIssue[];
};

export type PlatformLibraryReadInput = {
  providerAccountId?: string;
  areas: PlatformLibraryArea[];
  sampleLimitPerArea?: number;
};

export type PlatformLibraryReadResult = {
  providerId: string;
  account?: PlatformLibraryAccountIdentity;
  areas: PlatformLibraryReadAreaResult[];
  issues?: PlatformLibraryIssue[];
};

export type PlatformLibraryReadPageInput = {
  providerAccountId?: string;
  area: PlatformLibraryArea;
  pageSize: number;
  sampleLimitRemaining?: number;
  providerState?: unknown;
};

export type PlatformLibraryReadPageResult = {
  providerId: string;
  account?: PlatformLibraryAccountIdentity;
  area: PlatformLibraryArea;
  status: PlatformLibraryReadStatus;
  items: PlatformLibraryItem[];
  count?: PlatformLibraryCount;
  providerState?: unknown;
  hasMore: boolean;
  issues?: PlatformLibraryIssue[];
};
```

The provider item is a platform-library fact. It is not a Collection item and
not a Canonical record.

`providerAddedAt` is the provider's best item-level saved, followed, collected,
or library-add timestamp when the provider exposes one. It is a platform
provenance fact, not a MineMusic Collection timestamp and not Source Library
membership time.

`canonicalHints.trackPosition` is source release context, such as disc and
track number from a provider album tracklist. It is platform-neutral source
evidence for later review, not a Canonical Store relation and not recording
identity proof by itself.

Readable provider items must include a stable platform object `sourceRef`.
Stable means the same platform object in the same provider namespace should
return the same ref across preview, import, and later update reads.

The generic `platform_library` slot does not define provider-specific
`sourceRef.kind` values. `sourceRef.namespace`, `sourceRef.kind`, and
`sourceRef.id` are provider-owned source identity fields. Library Import
should treat them as opaque stable refs, not as MineMusic object taxonomy.
Provider plugins decide their own source ref kinds when they implement the
slot.

Items without a stable `sourceRef` must not be returned as readable import/update
items. They may appear only as preview samples or as skipped/unavailable facts.
Library Import relies on stable source refs for idempotency, update baselines,
Platform Library Absence derivation, and Canonical Store source-ref binding.

Platform album saves should be expressed as `saved_source_release` in this slot
contract. Providers should not return `saved_album` as a separate item kind.
Grouping concrete releases into release groups is a later Canonical/Collection
concern, not a provider-slot item-kind distinction.

The first contract mapping is:

```text
saved_source_track -> recording
saved_source_release -> release
saved_source_artist -> artist
```

Provider item contracts must not include raw platform responses or a generic
metadata escape hatch. The provider should map platform data into explicit
fields needed by MineMusic. Debug fixtures or provider-local logs may retain raw
responses outside the Platform Library Provider contract.

## Ordered Area Reads

Some Library Update modes need to know whether a provider area returns library
items newest first.

Newest-first ordering is provider- and area-specific. A provider area may be
treated as newest-first only when the provider adapter can support an explicit
area-level statement such as:

- returned items carry an item-level add/follow/collect timestamp and are
  returned in descending timestamp order.
- the provider endpoint for that area is known to return newest-first library
  items, even if it does not expose the timestamp field itself.

Callers must not infer newest-first ordering from source ids, labels, release
dates, or previous MineMusic import order.

The provider descriptor or equivalent provider-owned area capability metadata
declares whether each readable area supports newest-first ordering. In current
shared contracts this is `InstrumentProviderAreaDescriptor.ordering:
"newest_first"`. Library Import consumes that capability; Stage Interface and
Library Import must not hard-code provider-specific endpoint knowledge.

`latest_until_seen` Library Update may run only for provider areas that support
newest-first ordering. Areas without this support must use full Library Update
for reliable synchronization.

## Availability

The provider should distinguish library-area availability:

```text
previewable
readable
unsupported
unavailable
```

`previewable` means the provider can return availability, counts, or bounded
samples.

`readable` means the provider can return the complete item set, or a structured
partial result if the read fails partway through.

`unsupported` means the provider can identify the area but MineMusic does not
currently support importing it.

`unavailable` means the provider theoretically supports the area but it cannot
be read in the current account/session/API state.

Previewability is not importability. Library Import can only import or update
from readable provider results.

## Read Completeness

Provider read results should report completeness per requested library area:

```text
complete
partial
failed
unavailable
```

A top-level read result may summarize the whole request, but it must not hide
per-area status. A single request can have one area complete and another area
partial or failed.

`complete` means the provider read the full item set for that area.

`partial` means the provider returned some items but cannot guarantee the full
set.

`failed` means the provider could not read the area.

`unavailable` means the area is not readable in the current account/session/API
state.

Only `complete` area results can be used by Library Import as update baselines
or to derive Platform Library Absence records.

## Counts

Provider preview counts must include certainty:

```text
exact
at_least
unknown
```

`exact` means the provider knows the complete count for that area.

`at_least` means the provider knows a lower bound, usually because it has read a
partial result.

`unknown` means the provider cannot state a count. Unknown must not be encoded
as zero.

## Errors And Warnings

Provider errors and warnings should use first-version standard codes:

```text
login_required
account_selection_required
account_unstable
scope_unsupported
area_unavailable
rate_limited
timeout
provider_unavailable
partial_read
malformed_response
```

Provider-specific details may be returned as structured detail fields, but they
must not replace the standard top-level code.

## Preview Samples

Provider preview may return bounded samples for a library area.

Sample rules:

- Samples are lightweight provider facts for preview only.
- Samples may carry only `label`, optional `itemKind`, optional `targetKind`,
  and optional `artistLabels`.
- Samples help the LLM judge whether the account and area look right.
- Samples must not carry `sourceRef`, `providerAddedAt`, `canonicalHints`, raw
  provider metadata, Canonical Store status, or Collection status.
- Samples must not be used for import/update writes.
- Samples must not create update baselines.
- Samples must not be counted as part of a complete readable result.

The first provider preview should keep samples small, such as 3-5 items per
area.
