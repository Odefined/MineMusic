# Local Source Scan Songloft Investigation

> Status: Investigation evidence, not current design authority
> Scope: How `songloft-org/songloft` implements local music-library scanning,
> and how MineMusic should translate the useful parts into the current formal
> architecture
> Source reviewed: `songloft-org/songloft` `main` at commit
> `e015dba42403d68c72a94c2dafebcee132361e77`

## Why This Exists

MineMusic is about to add local music library scan management. Songloft is a
useful reference because it is a personal self-hosted music server whose local
library feature already covers directory scan, metadata extraction, progress,
settings, stale cleanup, and later enrichment.

This document is not a Phase spec. It records external evidence and the
translation guidance for MineMusic. Final design decisions should land in a
separate formal phase document or Music Data Platform area docs.

The resulting planning authority is
`docs/formal-rebuild/phase-26-local-source-scan-management.md`.

## Executive Summary

Songloft's core scan shape is:

1. configure one music root plus excludes and supported formats;
2. recursively discover audio files, with symlink cycle protection;
3. start one asynchronous scan at a time;
4. skip already-imported files unless `reimport` is requested;
5. skip very recently modified files to avoid half-copied audio;
6. extract tags, technical metadata, cover art, and lyrics;
7. write local songs in database batches;
8. remove stale local song rows after a trusted scan;
9. expose compact progress, cancellation, directory browsing, auto-scan, and
   optional post-scan enrichment.

MineMusic should copy the product ergonomics and some file-system edge cases,
but not Songloft's internal shape. Songloft has a single `songs` table and a
REST service that directly creates/updates/deletes song rows. MineMusic already
has local source identity, source/material binding commands, owner catalog
projections, Background Work, and Stage Interface output rules. The MineMusic
translation should be:

```text
filesystem scan adapter
-> local-file observations
-> MDP scan batch/outcome command boundary
-> createLocalSource(rootId, relativePath, contentMd5, metadata)
-> current scan-root membership
-> owner catalog / search metadata projection invalidation
-> compact library.scan.* public tools and Workbench UI controls
```

Local scan is not a new top-level `Library` area and should not be modeled as a
Platform Library Provider by default. It is local filesystem intake into
Music Data Platform-owned `SourceEntity.origin = "local_file"` facts.

## Songloft Implementation

### Runtime Assembly

Songloft reads scan settings during app initialization, constructs the scanner
and metadata extractor, then wires them into `SongService` and `ScanHandler`.
The app also rebuilds scanner state when `music_path` changes.

Evidence:

- Runtime settings and construction:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/app/app.go#L146-L225>
- Config change rebuilds scanner, updates handler/service references, updates
  title-source policy, and asynchronously cleans invalid songs:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/app/app.go#L435-L496>
- Auto-scan scheduler starts from persisted config after router setup:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/app/app.go#L417-L423>

What matters for MineMusic:

- Root/path configuration has runtime lifecycle consequences.
- Scanner rebuild belongs at a composition/runtime owner, not in a low-level
  domain module.
- MineMusic Server Host should own machine-specific absolute root paths.
  Music Data Platform should own normalized root ids, root-relative paths, and
  durable facts.

### Scanner Configuration And File Discovery

Songloft's `ScanConfig` carries:

- `MusicPath`;
- `ExcludeDirs`, matched by directory name at any depth;
- `ExcludePaths`, matched by exact cleaned path or descendants;
- `SupportedFormats`.

The scanner checks that the root exists, recursively walks it, follows symlinks
through `os.Stat`, uses `filepath.EvalSymlinks` plus a visited-real-path map to
avoid symlink loops, and filters by file extension.

Evidence:

- `ScanConfig`: <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/scanner.go#L12-L18>
- `ScanFiles` and recursive symlink-aware walk:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/scanner.go#L39-L123>
- Extension filtering and exclude rules:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/scanner.go#L125-L180>
- Directory tree and directory-name helper endpoints are backed by scanner
  helpers:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/scanner.go#L187-L260>

Useful MineMusic takeaways:

- Support name-based and path-based excludes. Name-based excludes are good for
  NAS/system folders like `@eaDir`; exact path excludes are good for user-chosen
  subtrees.
- Preserve symlink cycle protection as a scanner-adapter guard.
- Normalize all durable identity to root-relative MineMusic paths. Do not store
  absolute machine paths inside `SourceEntity`.
- Consider a first-class directory browser for the UI, but do not expose
  arbitrary host filesystem paths through agent-facing tools.

### Scan Execution Pipeline

Songloft starts scanning through `ScanAndImportAsync(reimport)`. It rejects a
new scan when the progress manager says a scan/import is already in progress,
then runs `doScanAndImport` in a goroutine.

The scan pipeline is:

1. scan all matching files;
2. set total file count;
3. load existing local paths from the database;
4. skip existing files unless reimport is requested and prior duration is
   missing;
5. skip files modified less than 10 seconds ago;
6. delete stale local rows whose files no longer exist;
7. run four metadata workers;
8. collect all results;
9. repair obvious spam tags within a directory;
10. flush results in batches of 50 database writes;
11. optionally auto-create playlists;
12. complete progress and trigger optional fingerprint work.

Evidence:

- Async start and active-scan rejection:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/song_service.go#L292-L302>
- Worker count, batch size, and file-stability threshold:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/song_service.go#L317-L321>
- Main scan/import pipeline:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/song_service.go#L323-L505>
- Batch write path:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/song_service.go#L590-L672>
- Stale cleanup:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/song_service.go#L674-L704>

Useful MineMusic takeaways:

- The high-level phases are worth copying: discover, prefilter, extract,
  persist, reconcile, post-process.
- The 10-second stability window is a simple practical guard against half-copied
  files.
- Per-file outcomes are important. Dirty or unreadable files should not fail the
  entire root scan when the root itself is still readable.
- Batch writes matter. MineMusic should avoid per-file independent root
  transactions for large libraries.

Do not copy as-is:

- Songloft holds all metadata results in memory before flushing. MineMusic should
  prefer streaming batches through Background Work so a large library does not
  require one all-results array.
- Songloft ignores the error from `ListLocalPaths` before prefiltering. In
  MineMusic, a database read failure is a system failure and must not become an
  empty "no existing paths" result.
- Songloft's stale cleanup deletes song rows directly. MineMusic should
  reconcile current scan-root membership only after a trusted complete scan and
  should not silently destroy material identity, owner relations, Memory, or
  user-created Collection membership.
- Songloft's `ScanProgressManager.Start` guards `scanning` and `importing`, while
  `IsScanning` also treats `creating_playlists` as active. MineMusic should have
  one explicit active-batch rule rather than duplicated state tests.

### Progress And Cancellation

Songloft stores process-local progress in `ScanProgressManager`: status,
counters, current file, start/end time, and error text. Public status values
include `idle`, `scanning`, `importing`, `creating_playlists`, `completed`,
`failed`, `cancelling`, and `cancelled`.

Cancellation closes an in-memory channel. It is allowed only during scanning or
importing. Songloft explicitly disallows cancellation during the auto-playlist
phase because that phase is inside a commit-oriented operation.

Evidence:

- Status and progress shape:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/scan_progress.go#L8-L44>
- Start, progress update, completion, failure, cancellation:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/scan_progress.go#L86-L205>

MineMusic translation:

- Persist the durable batch status in MDP, not only process memory.
- Public agent output should be compact: `batchId`, `status`, `phase`, counts,
  start/end timestamps, and failure categories.
- Avoid exposing absolute file paths in agent-facing output. Use root id plus
  relative path, and expose detailed per-file failures through a separate detail
  tool if needed.
- Cancel should be domain-owned batch cancellation, not a generic
  Background Work backend API. If v1 cannot cancel safely, omit cancel rather
  than pretending the backend can interrupt every in-flight filesystem or parser
  operation.

### Metadata Extraction

Songloft's metadata extractor uses the `github.com/hanxi/tag` package first,
then uses `ffprobe` when key technical fields are missing. It extracts title,
artist, album, duration, format, bitrate, sample rate, cover art, lyrics, and
ISRC. `.lrc` sidecar files override embedded lyrics. Title policy is configurable:
`tag` by default, or `filename`.

Evidence:

- Metadata config and extracted fields:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/metadata.go#L24-L66>
- Local file extraction:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/metadata.go#L153-L273>
- `ffprobe` fallback:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/metadata.go#L199-L253>
- Cover storage by content hash:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/metadata.go#L599-L653>
- Sidecar lyric lookup:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/metadata.go#L655-L677>
- Title policy:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/metadata.go#L725-L738>

MineMusic translation:

- Metadata parsing is an external-boundary adapter. Parser crashes, malformed
  tags, missing ffprobe, and unreadable files should become per-file outcomes or
  explicit batch failures at that boundary.
- MDP should receive normalized `LocalSourceDescriptiveMetadata`, not parser raw
  payloads.
- First version should likely store only facts already modeled on `SourceTrack`:
  label/title, artist labels, album label, track position, duration, version
  label/tags when detected, root-relative path, and content md5.
- Bitrate, sample rate, embedded lyrics, cover images, ISRC, and fingerprint are
  useful but need explicit fact-family or projection decisions. They should not
  be squeezed into `SourceEntity` just because Songloft has columns for them.
- Cover extraction can be deferred. If implemented, content-hash storage is a
  good physical-file policy, but public display should still go through
  Material Projection or a future media-asset projection.

### Spam Tag Repair

Songloft has a small heuristic for common bad metadata: if at least three files
in the same directory share the same `(title, artist)` pair and that pair covers
more than half the directory, it treats the tags as spam and falls back to the
filename as title.

Evidence:

- Implementation:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/song_service.go#L541-L588>
- Tests:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/fix_spam_tags_test.go#L14-L134>

MineMusic translation:

- This is product-useful, but it is a metadata-quality policy, not identity.
- If MineMusic implements it, record it as normalization policy evidence or a
  scan metadata warning. Do not silently erase the original tag facts if later
  review or debugging needs them.
- It can wait until after v1 unless real user libraries show the problem early.

### Data Model

Songloft stores local, remote, and radio entries in one `songs` table. Local
song identity is effectively `file_path` plus the row id. It indexes type,
title, artist, added time, later `file_path`, and later fingerprint. Public JSON
rewrites local playback/cover/lyrics into server endpoints.

Evidence:

- `songs` schema:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/database/migrations/0001_init.sql#L3-L26>
- Default scan config:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/database/migrations/0001_init.sql#L168-L178>
- `file_path` index:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/database/migrations/0004_songs_file_path_index.sql#L1-L6>
- Fingerprint storage:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/database/migrations/0008_songs_fingerprint.sql#L1-L10>
- Public `Song` shape and JSON rewriting:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/models/models.go#L69-L200>

MineMusic translation:

- Do not copy the single `songs` table. MineMusic already separates
  `SourceEntity`, `MaterialEntity`, source-material bindings, owner facts,
  projections, and public handles.
- Do copy the idea that local playback and cover paths should not leak raw
  filesystem paths to public callers.
- MineMusic already has the correct local-source identity direction:
  `rootId + relativePath`, with `contentMd5` as a non-unique content fact.

### API And Settings Surface

Songloft exposes a fairly complete management surface:

- `POST /scan` starts an async scan with optional `reimport`;
- `GET /scan/progress` returns scan progress;
- `POST /scan/cancel` cancels a scan;
- `GET /scan/directories` lazily browses directories under the music root;
- `GET /scan/dir-names` returns directory names for exclude autocomplete;
- `GET/PUT /settings/music-path` manages root and excludes;
- `GET/PUT /settings/scan-auto-create-include-subdirs`;
- `GET/PUT /settings/scan-auto-create-playlists`;
- `GET/PUT /settings/scan-title-source`;
- `GET/PUT /settings/auto-scan`;
- fingerprint status/start/progress endpoints.

Evidence:

- Scan start, progress, cancel, directory endpoints:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/handlers/scan.go#L57-L192>
- Music path settings:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/handlers/scan.go#L203-L290>
- Auto playlist and title-source settings:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/handlers/scan.go#L293-L454>
- Fingerprint endpoints:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/handlers/scan.go#L456-L547>
- Auto-scan settings:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/handlers/scan.go#L549-L612>
- Router registrations:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/app/routers.go#L164-L202>

MineMusic translation:

- Agent-facing tools should be fewer and more compact than Songloft's REST
  surface.
- Suggested first public tool family:

```text
library.scan.list_roots
library.scan.start
library.scan.status
library.scan.recent_failures
```

- Add `library.scan.cancel` only if the MDP batch state and worker loop can make
  cancellation explicit and observable.
- Directory browsing and path selection should primarily belong to Workbench
  Interface / Web UI because they touch machine paths. Agent tools can list
  configured opaque roots, not arbitrary host directories.
- Auto-scan is useful but not necessary for v1. Songloft's auto-scan is an
  in-process ticker; MineMusic should not add generic recurring jobs until a
  domain-owned schedule is explicitly scoped.

### Post-Scan Playlists And Fingerprints

Songloft optionally rebuilds auto-created playlists from directory structure
after scan. It deletes old auto-created playlists, groups local songs by
directory, optionally includes parent directories, disambiguates names, chooses
covers, and bulk inserts playlist memberships.

It also optionally computes Chromaprint fingerprints after scan, using four
workers and a separate progress object.

Evidence:

- Auto-create call from scan:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/song_service.go#L507-L539>
- Auto-created playlist transaction:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/database/playlist_repository.go#L280-L455>
- Playlist naming helpers:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/database/playlist_repository.go#L568-L719>
- Fingerprint service:
  <https://github.com/songloft-org/songloft/blob/e015dba42403d68c72a94c2dafebcee132361e77/internal/services/fingerprint.go#L26-L250>

MineMusic translation:

- Directory-derived playlists map better to future Collection suggestions or
  scan-root catalog scopes, not automatic user Collection creation in v1.
- Fingerprints are valuable for duplicate detection and matching, but they are
  not required to make local scan work. Treat them as a separate analysis job.
- Do not make scan completion depend on optional enrichment jobs unless product
  semantics require it.

## MineMusic Current Anchors

The relevant MineMusic code and docs already establish these constraints:

- Local-file `SourceEntity` uses `origin: "local_file"` plus `rootId`,
  `relativePath`, and `contentMd5`; it does not carry provider ids or absolute
  paths. See `src/contracts/music_data_platform.ts`.
- `createLocalSourceRef(...)` mints opaque local source refs from root id and
  normalized relative path. See `src/music_data_platform/local_source_ref.ts`.
- `normalizeLocalSourceRelativePath(...)` rejects absolute paths, drive paths,
  control characters, empty paths, and root-escaping paths. See
  `src/music_data_platform/local_source_path.ts`.
- `createLocalSource(...)` is the owning command boundary for local-source
  registration. It writes source records, material records when needed, and
  source-material bindings through `runSourceOfTruthWrite(...)`. See
  `src/music_data_platform/local_source_commands.ts`.
- `localize_provider_source` already uses Background Work, resolves an existing
  provider source/material binding, writes a file, then registers a Local Source
  through `createLocalSource(...)`. See
  `src/music_data_platform/localize_provider_source_job.ts`.
- Source-library import already has durable batch records, per-item outcomes,
  provider-exhausted reconciliation, compact Stage Adapter output, and
  Background Work chained advance jobs. See
  `src/music_data_platform/source_library_import.ts` and
  `src/music_data_platform/source_library_records.ts`.
- Music Data Platform docs say source-library import services may orchestrate
  reads and commands, but must not construct repositories directly. The same
  rule should hold for local scan.

## Recommended MineMusic Shape

### Ownership

Use this ownership split:

| Responsibility | Owner |
| --- | --- |
| Machine-specific absolute root path config and filesystem access | Server Host / runtime composition |
| File discovery and tag parsing adapter | Server Host wired adapter, consumed through narrow MDP scan port |
| Local Source identity and source/material writes | Music Data Platform |
| Scan batches, item outcomes, root membership, reconciliation | Music Data Platform |
| Background execution and retries | Background Work backend through Stage Core / Server Host wiring |
| Public tool schemas, validation, compact outputs | Stage Interface through MDP `stage_adapter` |
| Directory picker and rich management UI | Workbench Interface / Web UI |
| Recommendation judgement from scanned music | LLM / Music Intelligence later, not scan v1 |

### Internal Module Interface

The scan module should be deep: callers should not learn file walking,
metadata-parser quirks, batch persistence, and projection invalidation.

Suggested internal interface:

```ts
type LocalSourceScanService = {
  startScan(input: {
    rootId: string;
    mode: "incremental" | "reimport";
    maxItems?: number;
  }): Promise<Result<{ batchId: string }>>;

  advanceScanBatch(input: {
    batchId: string;
  }): Promise<Result<{ batch: LocalSourceScanBatchSummary }>>;

  getScanStatus(input: {
    batchId: string;
  }): Promise<Result<LocalSourceScanBatchSummary>>;
};
```

The scanner adapter behind it can expose a narrower interface, for example:

```ts
type LocalAudioFileScanner = {
  scan(input: {
    root: LocalScanRootRuntimeConfig;
    cursor?: string;
    limit: number;
    mode: "incremental" | "reimport";
  }): Promise<Result<LocalAudioFileScanPage>>;
};
```

The important constraint is that MDP receives normalized observations:

```ts
type LocalAudioFileObservation = {
  rootId: string;
  relativePath: string;
  contentMd5: string;
  modifiedAt?: string;
  sizeBytes?: number;
  metadata?: LocalSourceDescriptiveMetadata;
  warnings?: readonly LocalScanWarning[];
};
```

The observation may include runtime-only file details for item outcomes, but
only facts with a declared MDP home should be persisted.

### Durable State

Do not reuse `source_libraries` directly for local filesystem scans unless a
future phase intentionally generalizes Source Library vocabulary. The current
provider-shaped columns are `providerId`, `providerAccountId`, and
`PlatformLibraryKind`, which would make local scan look like a fake provider.

Prefer a new MDP-owned local scan fact set:

```text
local_source_scan_roots
local_source_scan_items
local_source_scan_batches
local_source_scan_item_outcomes
```

The exact names can change in the phase spec, but the responsibilities should
be:

- root row: `rootId`, display label, stable policy fields, owner scope when
  needed;
- current item row: root id plus local source ref key, added time, first seen,
  last trusted scan membership;
- batch row: batch id, root id, status, cursor/checkpoint, counters, completion
  reason, failure code/message;
- outcome row: batch id, sequence, relative path or source ref key, outcome,
  compact error/warning fields.

Reconciliation rule:

- A complete, failure-free, root-exhausted scan may remove current membership
  rows not observed in that batch.
- Cancelled, failed, partial, or `maxItems` scans must not delete current
  membership.
- Removing scan membership should not automatically delete material identity or
  owner facts. Later cleanup/archive policy can decide when an unreferenced local
  source or material should be archived.

### Stage Interface Surface

Suggested v1 public surface:

```text
library.scan.list_roots
library.scan.start
library.scan.status
library.scan.recent_failures
```

Possible later tools:

```text
library.scan.cancel
library.scan.configure_root
library.scan.list_directory
library.scan.reimport_item
library.scan.cleanup_review
```

Public output policy:

- return opaque `rootId` and `batchId`;
- include compact counts and status;
- expose root-relative paths only when useful and never absolute paths;
- keep raw parser output, database rows, provider facts, and filesystem errors
  out of the agent-facing surface;
- use separate detail tools for failures rather than bloating `status`.

### First Implementation Slice

Recommended next phase sequence:

1. Scanner adapter spike:
   - choose metadata parser/ffprobe strategy;
   - implement root-relative walk, format filter, excludes, symlink loop guard,
     and file stability threshold;
   - produce normalized observations without durable writes.

2. MDP scan records and commands:
   - add batch/outcome/current-membership schema;
   - add command-owned writes;
   - add trusted-complete reconciliation;
   - add projection invalidation scopes.

3. Background scan job:
   - submit scan batch;
   - advance by bounded pages;
   - call `createLocalSource(...)` for each observation;
   - record item outcomes;
   - never store parser raw payloads in job state.

4. Catalog integration:
   - make scanned local items owner-visible through owner catalog projection;
   - add scan-root catalog scopes if needed by `library.catalog.*`.

5. Stage Adapter tools:
   - expose compact `library.scan.*` operations;
   - add output leak tests and exact schema tests.

6. Workbench controls:
   - root selection/status/progress/failure UI;
   - directory browser via UI-only runtime capability if needed.

7. Optional enrichments:
   - cover asset extraction;
   - lyrics;
   - fingerprints and duplicate detection;
   - directory-derived Collection suggestions;
   - scheduled auto-scan.

## Product Decisions Still Needed

1. Should v1 support exactly one configured scan root, or multiple roots?
2. Are scan roots separate from the Main Local Source Root used by localize, or
   does v1 scan under `main` only?
3. Should disappeared files remove only scan membership, mark local source
   unavailable, or propose cleanup for user review?
4. Should first scan import cover art and lyrics, or only metadata fields needed
   for lookup/catalog?
5. Should agent tools be allowed to configure paths, or should path selection be
   UI-only because it is machine-local and potentially sensitive?
6. Is auto-scan required for the first usable product, or can manual scan plus
   visible status ship first?

My recommendation for v1:

- support one explicit configured root first;
- expose manual scan, status, compact failures, and catalog visibility;
- store root-relative local source identity and metadata;
- do not implement auto scan, fingerprints, cover extraction, or directory
  playlist creation in the first slice;
- reconcile membership only after complete successful scans;
- route all durable writes through MDP commands and Background Work.

## Guard Plan For MineMusic

Add project-native guards when implementing:

- scanner adapter tests for formats, excludes, symlink loops, missing roots,
  root-relative normalization, and recently modified files;
- command tests for batch lifecycle, per-item outcomes, idempotent
  `createLocalSource` replay, and content drift;
- reconciliation tests proving failed/cancelled/partial scans do not remove
  membership;
- forbidden import guard so scanner adapters do not import Stage Interface and
  Stage Interface handlers do not import repositories;
- writer-capability guard so scan orchestration uses MDP commands, not
  repository writes;
- public output leak tests forbidding absolute paths, raw parser payloads,
  storage rows, and internal ref keys;
- performance tests or query-plan checks for 10k file scans and membership
  reconciliation.

## Bottom Line

Songloft is best used as a product and edge-case reference, not as an
architecture template. MineMusic should borrow:

- local root + excludes;
- symlink-safe recursive discovery;
- stable-file skip;
- per-file outcomes;
- compact progress;
- batch writes;
- trusted-complete stale reconciliation;
- optional post-scan enrichment.

MineMusic should not borrow:

- a single `songs` table as identity truth;
- raw absolute file paths as public or durable identity;
- handler-owned durable side effects;
- direct service/repository writes from scan orchestration;
- broad fallback that turns storage/provider/system failure into empty success;
- automatic deletion of user-visible music truth during partial scans.
