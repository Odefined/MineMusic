# Phase 7 Source Library Import Foundation

> Status: Implemented Phase 7 spec
> Phase owner: Music Data Platform / Library Import
> Output type: Source library import persistence foundation, local source pool
> boundaries, and implementation plan

Phase 7 rebuilds the source-library import foundation needed before local
pool query, projection-backed retrieval, recommendation, or presentation can
work.

Phase 7 is not a query phase. It should not create query hits, ranking,
projection-backed search, request-scoped candidate stores, `MaterialCard`
output, recommendation behavior, or present flow.

Phase 7 also does not create projection tables. It produces the durable source,
library membership, source-material binding, and material records that later
projection/read-model phases will consume.

## Established Inputs

Before Phase 7, current formal state provided:

- Phase 4 generic `MusicDatabase` foundation;
- Phase 5 Music Data Platform identity write commands for source,
  material, canonical, source-material binding, and material-canonical
  binding;
- Phase 6 Source Provider Slot search seam and NCM source-provider plugin;
- `SourceEntity` facts with source refs, source-owned playable links,
  availability hints, version information, artist source refs, album source
  refs, and track position;
- no runtime storage wiring;
- no Platform Library Provider slot;
- no library import/update persistence;
- no owner facts;
- no source-library local pool;
- no projection tables;
- no query engine.

Formal architecture requires:

- Music Data Platform owns Library Import / Update persistence, durable source
  records, source library items, import batches, update baselines, and
  projections created from import candidates;
- Extension owns plugin systems and capability slots;
- Platform Library Provider remains separate from Source Provider because
  account-library import/update is not ordinary provider search;
- providers must not write Music Data Platform records directly;
- Stage Interface remains the only agent-facing callable boundary and must not
  leak internal records;
- `MaterialCard` remains final Stage Interface presentation output only.

## Confirmed Decisions

### Provider Capability Boundary

Phase 7 introduces the first minimal `platform-library-provider` capability
slot under Extension.

The slot is separate from `source-provider` because account-library
import/update reads provider-account library observations rather than
performing text search.

The NCM plugin may register both:

- `source-provider`, for provider search;
- `platform-library-provider`, for saved tracks, saved albums, and followed
  artists library reads.

NCM library read mapping:

- `saved_source_track` reads the account's liked-music playlist detail and
  uses `trackIds` order plus `trackIds[].at` as the provider add timestamp
  when available; `/likelist` must not be used as the saved-track import fact
  source because it only exposes ids and playlist-level state;
- `saved_source_album` may read `/album/sublist`, preserving provider album
  source refs and `subTime` as `providerAddedAt` when available;
- `followed_source_artist` may read `/artist/sublist`, preserving provider
  artist source refs without inventing `providerAddedAt` when the provider response
  lacks a per-artist timestamp.

For NCM account-library reads, the plugin resolves the current logged-in
account through `/user/account`. If the caller supplies `providerAccountId`,
the supplied id must match that current account before saved albums, followed
artists, or liked playlist facts are read.

Formal v1 uses source album language for this phase. Old MVP wording such as
`saved_source_release` is historical evidence only and should not return to
the active Phase 7 contract.

Provider/library adapters still must not write Music Data Platform records
directly. They return normalized source-library candidates. Music Data
Platform owns durable source records, source library item records, import
batches, source-material binding decisions, and later projections.

The provider-side candidate type is `PlatformLibraryCandidate`.
It includes a full normalized `SourceEntity`, so Music Data Platform import
code receives provider-normalized source facts and never needs to parse raw
provider payloads.

```ts
type PlatformLibraryKind =
  | "saved_source_track"
  | "saved_source_album"
  | "followed_source_artist";

type PlatformLibraryCandidate = {
  sourceEntity: SourceEntity;
  libraryKind: PlatformLibraryKind;
  providerAccountId?: string;
  providerAddedAt?: string;
};

type PlatformLibraryReadInput = {
  providerAccountId?: string;
  kind: PlatformLibraryKind;
  limit?: number;
  cursor?: string;
  sessionId?: string;
};

type PlatformLibraryReadResult = {
  providerId: string;
  providerAccountId?: string;
  kind: PlatformLibraryKind;
  candidates: readonly PlatformLibraryCandidate[];
  nextCursor?: string;
  totalCountHint?: number;
};
```

The same `PlatformLibraryKind` values are used by persisted source library
items. They are source-level library facts, not material-level owner facts.

Library provider pagination uses `cursor`, not `offset`. Provider adapters may
map the shared cursor to provider-specific page, offset, or token parameters
internally.

`totalCountHint` is optional progress/debug information. It is not a required
provider capability and is not a completion condition. Import completion is
based on missing `nextCursor`; bounded per-call processing is controlled by
the import call `limit`.

`providerAccountId` is optional at the provider slot contract boundary and on
`startImport`. If omitted, the provider/API may resolve the current logged-in
account and return the resolved account id in `PlatformLibraryReadResult`.

Real provider-account library import persistence still requires a resolved
ref-safe account id before any source library item is written. NCM saved tracks,
saved albums, and followed artists are account-library scopes, so the import
service must persist a non-empty `providerAccountId` resolved either from the
caller input or from the provider read result.

The Library Import service does not select accounts in Phase 7. When the caller
supplies `providerAccountId`, provider results must match it. When the caller
omits it, provider results must include exactly one resolved current account
id. Missing account, login-required, or account-ambiguity failures remain
provider/API failures surfaced through the import result.

`startImport` creates a batch before the first provider read. The batch may
temporarily have no resolved `providerAccountId` when the caller omitted it.
After the first successful provider read, the import service must write the
resolved account id onto the batch before writing source library item records.
If the first read cannot resolve an account id, the batch is marked failed.
Source library item records never persist without a resolved account id.

After a batch has a resolved `providerAccountId`, every later provider read for
that batch must return the same account id. Missing or mismatched account ids
on later pages fail the batch; Phase 7 must not mix different provider
accounts inside one import batch.

Persisted source library item identity is scoped by:

```text
provider_id
provider_account_id
library_kind
source_ref_key
```

### Import Write Boundary

Phase 7 import writes source-backed material anchors immediately.

For each imported `PlatformLibraryCandidate`, the Music Data Platform import
boundary should:

1. upsert the candidate's `SourceEntity` as a `SourceRecord`;
2. create or reuse a source-backed `MaterialRecord`;
3. bind the source ref to that material ref through the existing Phase 5
   `bindSourceToMaterial` command;
4. upsert the source library item record.

The material anchor remains source-backed. Phase 7 does not write canonical
records, canonical bindings, canonical review state, merge decisions, or
cross-provider identity matches.

Material refs use the global MineMusic material identity policy: every
`MaterialRef` uses an opaque MineMusic-generated id. A material ref must not
encode provider identity, source identity, canonical identity, source refs,
provider entity ids, account ids, or human-readable source text.

The same policy applies to source-backed, canonical-confirmed, unresolved, and
source-less material creation. Source-backed import idempotency comes from
checking existing `source_material_bindings` inside the import write boundary,
not from deriving material ids from source refs.

When Library Import needs a new material and no existing source binding is
found, it uses the shared material ref factory:

```text
material:recording:m_<opaque>
material:album:m_<opaque>
material:artist:m_<opaque>
material:work:m_<opaque>
material:release:m_<opaque>
```

Later canonical confirmation updates `canonicalRef` and derived identity
status; it must not require changing the material ref.

Ordinary callers must not provide material ids directly. Material creation
paths use a shared factory:

```ts
createMaterialRef(kind: MaterialEntityKind): Ref
```

Tests may inject a deterministic opaque id generator into the factory, but
business callers still receive refs from the factory rather than constructing
ids by hand.

### Import Batch Scope

Phase 7 persists import batches because real provider library import needs a
durable run boundary for paging, continuation, summary counts, and failed item
reporting.

Phase 7 does not persist update baselines. It does not decide removed-from-
library reconciliation, incremental update policy, stale item handling, or
provider-side deletion semantics.

Phase 7 batch control supports `start` and `continue` only.

```ts
type SourceLibraryImportBatchStatus =
  | "running"
  | "completed"
  | "failed";
```

It does not support cancel, pause, resume-after-cancel, stopping, or public
operation control.

`startImport` creates the batch and processes the first provider page.
`continueImport` processes the next provider page using the batch's stored
cursor. Callers do not pass cursors directly to `continueImport`.

`limit` is a per-call processing limit, not a whole-batch cap. It controls how
many provider candidates the current `startImport` or `continueImport` call may
process. Reaching `limit` ends the current call, stores the provider
`nextCursor`, and leaves the batch `running` when more provider pages remain.

The import service passes the current processing allowance down to
`PlatformLibraryReadInput.limit`:

```text
providerLimit = min(callLimitRemaining, maxNewItemsRemaining when present)
```

The provider slot must validate that a provider does not return more candidates
than requested by `PlatformLibraryReadInput.limit`. An over-limit provider
result is a provider output integrity failure, not extra work for the import
service to silently accept.

`maxNewItems` is an optional batch-level stop condition. It counts only newly
created source-library memberships with item outcome `imported`. It does not
count `already_present` or `failed` outcomes.

`maxNewItems` is set only when the batch starts. `continueImport` cannot add,
remove, or change the batch-level stop condition.

When `maxNewItems` is present, each provider read should be bounded by the
smaller of the per-call `limit` and the remaining new-item allowance, so the
batch does not import more new memberships than requested. If the batch reaches
`maxNewItems`, it is marked `completed` with completion reason
`max_new_items_reached`.

The import service checks remaining new-item allowance while processing
candidates. Once `importedCount === maxNewItems`, it stops processing the
current provider page, discards unprocessed candidates from that page, clears
continuation, and completes the batch with reason `max_new_items_reached`.
Unprocessed candidates are not written and are not counted.

`continueImport` semantics:

```text
running   -> process the next provider page
completed -> return current summary without new writes
failed    -> return an error; Phase 7 does not auto-retry failed batches
unknown   -> return an error
```

Completed batches are terminal regardless of completion reason. A batch
completed by `max_new_items_reached` does not retain continuation for later
import; `continueImport` returns the current result without reading the
provider.

Each Phase 7 import batch is scoped to exactly one `PlatformLibraryKind`.
Importing saved tracks, saved albums, and followed artists requires three
separate batches. A single batch does not mix scopes or maintain multiple
cursors.

Import start supports caller-selected quantity:

```ts
type SourceLibraryImportStartInput = {
  providerId: string;
  providerAccountId?: string;
  libraryKind: PlatformLibraryKind;
  limit?: number;
  maxNewItems?: number;
};

type SourceLibraryImportContinueInput = {
  batchId: string;
  limit?: number;
};
```

If `limit` is omitted, the service uses its configured default per-call limit.
`limit` must stay within the provider-read contract range of 1 through 100. It
does not decide batch completion. A batch is completed when the provider read
returns no `nextCursor`, or when optional `maxNewItems` has been reached.

```ts
type SourceLibraryImportCompletionReason =
  | "provider_exhausted"
  | "max_new_items_reached";
```

Phase 7 records structured per-item import outcomes:

```ts
type SourceLibraryImportItemOutcome =
  | "imported"
  | "already_present"
  | "failed";
```

Batch summary counts include imported, already-present, and failed items.
Failed item records may store compact error code/message plus source ref or
provider entity identity when available. They must not store raw provider
payloads or debug dumps.

Per-item failure does not fail the whole batch. A malformed or unwritable
candidate records item outcome `failed`, rolls back that item write, increments
failed counts, and lets the batch continue with later candidates.

Batch failure is reserved for provider/page/batch-scope failures such as
provider unavailable, malformed provider page result, missing or mismatched
resolved account id, cursor failure, or batch state corruption.

The import service validates provider page identity before item writes. The page
provider id, page library kind, resolved provider account, candidate library
kind, source provider id, `source_<providerId>` namespace, source ref kind, and
source entity kind must match the batch. This guard applies even when tests or
runtime wiring inject a direct `PlatformLibraryReadPort` instead of going
through the Extension slot helper.

A completed batch may have `failedCount > 0`.

`already_present` is source-library membership semantics. If the membership
for the same provider id, provider account id, library kind, and source ref is
already present, the item outcome is `already_present` even when the import
refreshes the latest `SourceEntity` facts. Material binding should be reused
rather than duplicated.

Duplicate source refs in the same provider page or batch are handled through
the same membership idempotency rule. After the first successful membership
write for a provider/account/kind/source ref, later duplicates are
`already_present`, not batch failures.

Source library items represent current known membership only. Phase 7 does not
add archived, removed, deleted, stale, or absent membership statuses.

Expected source library item fields:

```text
provider_id
provider_account_id
library_kind
source_ref_key
added_at?
provider_added_at?
first_imported_at
last_seen_at
```

`added_at` is MineMusic's local source-library membership time. It is set when
the membership is first written locally and is preserved on later imports.
`provider_added_at` is the provider-side collection/follow timestamp when the
provider exposes one. Repeat import may refresh `provider_added_at` when the
provider supplies a value, and updates `last_seen_at`. Phase 7 does not mark
items missing from a later batch as removed.

`SourceLibraryItem` does not store `material_ref_key`, `canonical_ref_key`,
display fields, query text, rank, or card seed. Material refs are obtained
through `source_material_bindings` or later projections.

### Runtime Wiring

Phase 7 wires Storage, Music Data Platform schema initialization, Extension
with the NCM plugin, and the Library Import application service into default
Server Host / Stage Core composition.

This wiring is an internal runtime seam for tests and smoke verification. It
does not expose public Stage Interface tools, public import DTOs, Handbook
entries, or agent-facing import output.

Internal Library Import service outputs are not Stage Interface compact
outputs. They may return complete internal information needed for debugging,
tests, smoke verification, and later interface projection, including batch
state, provider page metadata, item outcomes, source refs, material refs from
binding results, source library item records, and provider-normalized source
candidates. Compact agent-facing projection belongs to a future Stage
Interface output boundary.

Internal output completeness does not mean raw provider payload exposure.
Phase 7 does not persist raw provider payloads and does not include them in the
default internal service result. Provider-normalized candidates and
`SourceEntity` facts are the inspectable provider-derived data for this phase.

### Architecture Guards

Phase 7 guards should protect long-lived boundaries, not temporary phase
non-goals that future phases are expected to change.

Required guards:

- provider/plugin implementations must not import Music Data Platform or
  storage modules;
- Music Data Platform import code must not import Extension plugin
  implementations such as the NCM plugin;
- persisted source library items must not contain material refs, canonical
  refs, projection fields, query fields, rank fields, or card/presentation
  seed fields;
- material ref creation must go through the shared material ref factory and
  generated ids must be opaque, ref-safe, and free of source/provider/canonical
  identity text.

Phase 7 not exposing Stage Interface tools is a phase non-goal and acceptance
boundary, not a long-lived architecture guard. A later Stage Interface import
tool may connect through the proper public port and compact output projection.

### Documentation Updates

Phase 7 updates the phase spec and the owning area docs.

Expected documentation updates:

- `docs/music-data-platform/design.md` for Source Library Import,
  `SourceLibraryItem`, import batch, material ref factory, and write-boundary
  semantics;
- `docs/music-data-platform/ports.md` for Library Import service, repository,
  command, and consumed provider-read ports;
- `docs/music-data-platform/progress.md` after implementation;
- `docs/extension/design.md` and `docs/extension/ports.md` for the
  `platform-library-provider` slot;
- `docs/extension/progress.md` after implementation;
- `CURRENT_STATE.md`, `PROGRESS.md`, and `INDEX.md` during state sync.

Area design docs describe stable design, not mutable implementation task
status. Progress/status docs record implementation state.

## Current Working Goal

Build a narrow source-library import foundation that creates a local source
pool for later projection and query phases.

Phase 7 includes the first real NCM source-library import scopes:

- saved tracks;
- saved albums;
- followed artists.

Provider playlists are not included in Phase 7 unless explicitly added later.

The likely Phase 7 path is:

```text
Platform Library Provider candidate
-> Library Import application/write boundary
-> Music Data Platform source records
-> source library item records
-> source-backed material records
-> source-material binding through existing Phase 5 identity commands
```

This path is intentionally not:

```text
SourceProvider.search
-> QueryHit
-> MaterialCard
```

## Non-Goals

Do not implement:

- local pool query;
- query hit public output shape;
- searchable projection tables;
- source library track/album/artist projection tables;
- recommendation ranking;
- Stage Interface music tools;
- final present flow or `MaterialCard`;
- canonical review, merge, or split workflow;
- owner facts such as favorite, blocked, wrong-version, not-playable, liked,
  or disliked;
- Collection membership;
- provider account login, OAuth, cookie refresh, secrets, or reauth;
- generic dynamic plugin loading;
- compatibility layers for old MVP import behavior.

## Decision Log

Resolved Phase 7 decisions:

1. Resolved: Phase 7 must prove real NCM source-library import for saved
   tracks, saved albums, and followed artists.
2. Resolved: Phase 7 introduces the first minimal
   `platform-library-provider` capability slot under Extension.
3. Resolved: Phase 7 source library scopes are saved tracks, saved albums,
   and followed artists. Provider playlists stay out of scope.
4. Resolved: Library kind values are `saved_source_track`,
   `saved_source_album`, and `followed_source_artist`.
5. Resolved: Phase 7 import creates or reuses source-backed material anchors
   immediately, binds imported source refs to those material refs, and does
   not write canonical identity.
6. Resolved: Phase 7 persists import batches only. Update baselines,
   incremental update policy, and removed-from-library reconciliation stay out
   of scope.
7. Resolved: Phase 7 wires runtime storage and the Library Import application
   service into default Server Host / Stage Core composition as an internal
   runtime seam, without exposing Stage Interface tools.
8. Resolved: Platform Library Provider reads use cursor pagination, not the
   Phase 6 source search `offset` model.
9. Resolved: `providerAccountId` is optional at the provider slot boundary and
   on `startImport`, but real account-library import persistence requires a
   resolved non-empty account id from caller input or provider result. Source
   library item identity is scoped by provider id, provider account id, library
   kind, and source ref key.
10. Resolved: Phase 7 import batches support `start` and `continue` only, with
    statuses `running`, `completed`, and `failed`.
11. Resolved: Phase 7 records structured per-item import outcomes:
    `imported`, `already_present`, and `failed`, without raw provider payloads.
    Per-item failures do not fail the whole batch; provider/page/batch-scope
    failures do.
12. Resolved: `already_present` means the source-library membership already
    existed. Source facts may still refresh, and material binding should be
    reused. Duplicate source refs in the same page or batch use the same
    idempotency rule and do not fail the batch.
13. Resolved: Phase 7 source library items have no membership status. They
    represent current known membership with timestamps only.
14. Resolved: all `MaterialRef` ids use opaque MineMusic-generated identity.
    They must not derive from or visibly encode source/provider/canonical
    identity. Import idempotency relies on current source-material binding
    lookup, not source-derived material ids.
15. Resolved: material creation uses a shared material ref factory. Ordinary
    callers must not provide or construct material ids directly; tests may
    inject a deterministic opaque id generator behind the factory.
16. Resolved: `SourceLibraryItem` does not store `materialRef`; source-to-
    material relation is expressed through `source_material_bindings` and later
    projections.
17. Resolved: Phase 7 does not create projection tables or query read models.
    It only creates the durable source/library/binding/material facts later
    projections need.
18. Resolved: one import batch handles exactly one `PlatformLibraryKind`.
    Multi-scope import uses multiple batches rather than one mixed batch.
19. Resolved: `startImport` and `continueImport` support caller-selected
    per-call quantity through `limit`. `limit` caps provider candidates
    processed by that single call, not the whole batch and not only newly
    imported memberships. `startImport` also supports optional batch-level
    `maxNewItems`, which counts only newly created source-library memberships
    and completes the batch when reached. `continueImport` cannot change
    `maxNewItems`. Reaching `maxNewItems` stops
    processing the current provider page; unprocessed candidates are discarded
    and not counted.
20. Resolved: Import call `limit` is passed down as provider read limit using
    current remaining allowance. Provider results that exceed requested limit
    are output-integrity failures.
21. Resolved: `startImport` creates the batch and processes the first provider
    page. `continueImport` processes the next provider page from stored batch
    cursor state.
22. Resolved: `continueImport` on a completed batch returns the current
    summary without new writes. `continueImport` on a failed or unknown batch
    returns an error.
23. Resolved: internal Library Import service outputs are complete internal
    results for debugging, smoke verification, and future interface projection.
    Compact output discipline is enforced later by Stage Interface, not by
    truncating the internal service result.
24. Resolved: Phase 7 does not persist raw provider payloads and does not
    include them in default internal import outputs. Provider-normalized
    candidates and `SourceEntity` facts are the inspectable provider-derived
    data.
25. Resolved: Phase 7 architecture guards protect long-lived boundaries only:
    provider/plugin code cannot import Music Data Platform or storage; Music
    Data Platform import code cannot import plugin implementations;
    `SourceLibraryItem` cannot carry material/canonical/projection/query/card
    fields; material refs must be created through the opaque material ref
    factory. The absence of Stage Interface tools is a phase non-goal, not a
    future-blocking guard.
26. Resolved: Phase 7 updates both the phase spec and owning area docs.
    Music Data Platform and Extension design/ports/progress docs must be
    updated, with global state docs updated through the state-sync gate after
    implementation.
27. Resolved: `startImport` may omit `providerAccountId` when the provider/API
    resolves the current logged-in account. Phase 7 Library Import validates
    the resolved account id and persists it, but does not perform account
    selection itself.
28. Resolved: `startImport` creates the batch before the first provider read.
    The batch may temporarily lack a resolved account id, but the first
    successful read must resolve and persist one before source library item
    writes. If account resolution fails, the batch is marked failed.
29. Resolved: after a batch has a resolved account id, every later provider
    read must return the same account id. Missing or mismatched account ids fail
    the batch.
30. Resolved: provider library reads may return optional `totalCountHint`, but
    import completion is determined by absence of `nextCursor` or reaching
    optional batch-level `maxNewItems`, not total count and not per-call
    `limit`.
31. Resolved: Source library items persist both local and provider-side
    membership time. `added_at` is MineMusic's local membership creation time;
    `provider_added_at` is the provider-side add/collect/follow timestamp when
    available. Provider candidates expose only `providerAddedAt`, not local
    `addedAt`.
