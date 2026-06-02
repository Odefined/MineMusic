# Current State

MineMusic has a working TypeScript runtime for grounded music recommendations,
material identity, source/library import, collections, provider-backed
knowledge, and MCP host access.

This file summarizes current implementation state. Area-level detail lives in
the docs listed in `INDEX.md`.

## Runtime And Host Access

- MineMusic runs as a long-lived server process that owns Stage Core runtime
  creation and server-level provider/database/cache/session configuration.
- The server exposes MCP over streamable HTTP at
  `http://127.0.0.1:37373/mcp` by default.
- Codex and OpenClaw are MCP clients of that server. They should not start the
  MineMusic runtime for normal use.
- On this machine the server is managed by user `launchd` agent
  `com.minemusic.server`.
- Stage Core production runtime exposes `ready` and `stageInterface`; explicit
  harness factories remain for tests and diagnostics.

## Public Agent Surface

- Stage Interface owns tool names, descriptors, schemas, dispatch, Handbook
  lookup, and compact output projection.
- Public material handles are `materialId` values. Internal `materialRef`,
  source refs, canonical refs, repository rows, and raw provider payloads stay
  behind owning boundaries unless a diagnostic path explicitly exposes them.
- The old `library.source.list` tool is no longer public. Source Library
  browsing is through `music.pools.list` and `music.material.query`.
- `stage.recommendation.present` is the final presentation boundary for
  user-visible recommendations and typed `recommendation.presented` events.
- The Codex workflow skill lives at `skills/minemusic/SKILL.md`; its
  `HANDBOOK.md` is a snapshot. Live tool truth is available through
  `minemusic.handbook.*` tools.

## Core Capabilities

- Material Store owns Material Registry, Canonical Store, Source Entity Store,
  Source Library, confirmed source-to-canonical bindings, material relations,
  and material activity projections.
- Material Flow owns material resolve, projection, materialization, query,
  related retrieval, policy, sorting, selection, and recommendation
  presentation.
- Collection Service owns owner-scoped system/custom Collections and current
  materialRef-backed CollectionItems. ADR-0003 accepts this boundary and
  supersedes ADR-0002's earlier canonical-only Collection consequence.
- Library Import/Update consumes `platform_library` providers and writes Source
  Entity Store / Source Library state, import/update batches, provenance,
  baselines, and absence records.
- Canonical Maintenance Provisional Review is available through
  `canonical.review.list`, `canonical.review.inspect`, and
  `canonical.review.apply`.
- Source Grounding reads confirmed source-to-canonical bindings through a
  narrow `SourceGroundingEvidenceStorePort` and no longer calls Canonical Store
  source-ref APIs for ordinary source material normalization.

## Providers And Knowledge

- NetEase is the bundled read-only source provider and platform-library
  provider.
- NetEase source search returns source-backed material facts and playable web
  links when available; link display is not playback.
- NetEase platform-library reads cover saved tracks, saved releases, and
  followed artists. Playlists and listening history remain unsupported.
- NetEase saved-track import/update facts come from liked playlist detail
  `trackIds` and `trackIds[].at`, not `/likelist`.
- Music Knowledge returns provider-attributed `KnowledgeResult` values, not
  `MusicMaterial`.
- MusicBrainz is the bundled read-only Knowledge provider. It supports
  structured text search, provider-ref lookup, Canonical-context lookup/search,
  Tag Query, Field Query, selected expansions, relation focus `members`, and
  Provider HTTP Cache use.
- Knowledge provider output does not confirm identity and does not write
  Canonical Store state.

## Storage

- In-memory repositories remain the default when no database path is supplied.
- SQLite-backed storage exists for Material Store canonical/source/material
  registry state, material relations/activity, Collection, Library Import, and
  Provider HTTP Cache.
- Server env can configure database paths:
  `MINEMUSIC_MATERIAL_STORE_DB_PATH`, `MINEMUSIC_COLLECTION_DB_PATH`, and
  `MINEMUSIC_LIBRARY_IMPORT_DB_PATH`.
- Provider HTTP Cache can be configured through server runtime options and is
  passed to Knowledge provider factories.

## Architecture Inconsistencies

No architecture inconsistency is currently open in
`docs/maintenance/architecture-inconsistency-log.md`.

- `AI-001` was resolved by ADR-0003, which accepts materialRef-backed
  CollectionItems.
- `AI-002` was resolved by moving Source Grounding source-ref normalization to
  confirmed canonical bindings and adding an architecture guard against
  Canonical Store source-ref API use in `src/source/**`.

## Verification Pointers

Current verification evidence is distributed across area progress documents.
Broad project checks are:

```bash
npm test
npm run typecheck
git diff --check
```

The documentation alignment sweep used docs-only structural checks because the
intended `npm run check:docs` / `scripts/check-docs.mjs` guard is documented
but not implemented.
