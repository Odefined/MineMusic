# Knowledge Slot Implementation Plan

## Status

Implementation plan.

## Goal

Implement the target Knowledge Slot contract and first MusicBrainz Knowledge
Provider without preserving the old `MusicMaterial[]` knowledge path.

## Scope

In scope:

- shared Knowledge contracts for `KnowledgeResult`, `KnowledgeItem`,
  `StructuredKnowledge`, `TextKnowledge`, `KnowledgeNode`, and `KnowledgeEdge`.
- `MusicKnowledgePort.query` returning `KnowledgeResult`.
- general read-only Stage Interface tool `music.knowledge.query`.
- provider Handbook capability descriptions.
- generic persistent provider HTTP cache storage.
- MusicBrainz Knowledge Provider.
- deterministic provider-internal MusicBrainz search, lookup, and browse API
  planning.
- tests for contracts, provider mapping, cache behavior, and Stage Interface
  exposure.

Out of scope:

- Canonical Store review/apply workflow.
- identity confirmation, merge, activate, or reject.
- provider writeback to MusicBrainz.
- playable links.
- keeping a compatibility `MusicMaterial[]` Knowledge method.

## Task 1: Shared Contracts

Files:

- `src/contracts/index.ts`
- `docs/mvp/interface-contracts.md`
- `docs/mvp/module-interfaces.md`
- tests under `test/contracts/**`

Work:

- Replace the current Knowledge result shape with `KnowledgeResult`.
- Add `StructuredKnowledge`, `TextKnowledge`, `KnowledgeNode`, `KnowledgeEdge`,
  and related source/descriptor types.
- Change `KnowledgeQuery.ref` to `canonicalRef`.
- Add `formats` and `expand`.
- Add first-version query validation rule: exactly one of `text` or
  `canonicalRef`.
- Add required Knowledge error codes:
  - `knowledge.invalid_query`
  - `knowledge.provider_unavailable`
  - `knowledge.rate_limited`
  - `knowledge.timeout`
  - `knowledge.malformed_response`

Verification:

- typecheck.
- contract tests for the new shared shapes.

## Task 2: Music Knowledge Service

Files:

- `src/ports/index.ts`
- `src/knowledge/index.ts`
- existing tests for Knowledge service or new `test/knowledge/**`

Work:

- Update `MusicKnowledgePort.query` to return `KnowledgeResult`.
- Remove the old `MusicMaterial[]` aggregation path.
- Validate public query shape before provider routing.
- Aggregate `KnowledgeItem[]` from registered Knowledge providers.
- Preserve provider warnings through `Result.warnings`.
- For `canonicalRef` queries, read canonical context through `CanonicalStorePort`
  and pass routed context to providers.
- Keep provider adapters away from Canonical Store.

Verification:

- service tests for no providers, invalid query shape, text query aggregation,
  and canonicalRef context routing.

## Task 3: Provider Descriptor And Handbook

Files:

- `src/contracts/index.ts`
- `src/knowledge/index.ts`
- `src/handbook/index.ts`
- `src/stage_interface/**`
- Handbook tests.

Work:

- Define a Knowledge provider capability descriptor.
- Let Knowledge providers describe supported formats, entity kinds, expansions,
  and boundary notes.
- Render provider capability descriptions into the general Knowledge tool
  Handbook entry.
- Do not expose provider-internal API modes or provider-specific tools.

Verification:

- Handbook render tests show MusicBrainz capability guidance under
  `music.knowledge.query`.

## Task 4: Stage Interface Tool

Files:

- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/dispatch.ts`
- `src/surfaces/mcp/server.ts`
- Stage Interface and MCP tests.

Work:

- Add stable tool name `music.knowledge.query`.
- Add input schema for `KnowledgeQuery`.
- Dispatch to `MusicKnowledgePort.query`.
- Return `KnowledgeResult`.
- Ensure the tool is read-only and does not call providers directly.

Verification:

- Stage Interface dispatch test.
- MCP schema exposure test.

## Task 5: Generic Provider HTTP Cache

Files:

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/storage/index.ts`
- `src/storage/sqlite/**`
- storage tests.

Work:

- Add provider HTTP cache record and repository contract.
- Implement in-memory cache.
- Implement SQLite-backed cache.
- Store successful JSON responses by normalized request URL.
- Track `fetchedAt` and `lastUsedAt`.
- Do not auto-expire cache entries.
- Add maintenance methods behind internal/admin boundary:
  - `listLeastRecentlyUsed`
  - `deleteUnusedSince`
  - `deleteByProvider`
  - `clearProvider`
- Do not expose cache maintenance through `music.knowledge.query`.

Verification:

- in-memory and SQLite tests for put/get, `lastUsedAt` update, persistence, and
  maintenance operations.

## Task 6: Stage Core Cache Wiring

Files:

- `src/stage_core/index.ts`
- `src/surfaces/mcp/server.ts`
- Stage Core / MCP runtime tests.

Work:

- Add optional provider HTTP cache repository injection.
- Add optional provider HTTP cache database path.
- Keep cache path configuration compatible with future plugin `config.json`
  wiring. Until that loader exists, tests and host surfaces may pass an explicit
  Stage Core option.
- Pass cache dependency to providers that need it.

Verification:

- Stage Core creation tests with injected repository and database path.
- MCP runtime config test.

## Task 7: MusicBrainz Provider

Files:

- new provider under `src/providers/musicbrainz/**`
- provider tests under `test/providers/**`

Work:

- Implement Knowledge provider registration shape.
- Implement MusicBrainz request client with:
  - project default User-Agent.
  - optional User-Agent from explicit provider configuration.
  - JSON requests.
  - rate limiter for cache misses.
  - persistent HTTP cache.
- Implement text search with default `recording` entity kind.
- Implement provider-ref lookup.
- Implement browse for ref-based list expansions.
- Implement canonical context search for:
  - `recording`.
  - `release`.
  - `artist`.
  - `release_group`.
- Do not implement canonical work context search in the first slice.
- Map MusicBrainz results to `StructuredKnowledge`.
- Include default descriptors by root kind.
- Support expansions from the design document.

Verification:

- fixture tests for recording, release, release group, artist, and work search.
- fixture tests for lookup and browse planning.
- fixture tests for artist credits, tracklist, release labels, ratings, tags,
  genres, annotations, and relationship mapping.
- cache hit/miss and rate limiter tests.

## Task 8: Runtime Registration

Files:

- `src/stage_core/index.ts`
- `src/surfaces/mcp/server.ts`
- future plugin `config.json` loader/integration files.
- plugin/Handbook tests.

Work:

- Register MusicBrainz provider in the `knowledge` slot when plugin runtime
  configuration enables it.
- Do not make a MusicBrainz-specific environment variable decide provider
  activation.
- Keep provider activation compatible with the future plugin `config.json`
  loader. The loader is not implemented yet, so first implementation tests may
  pass explicit runtime configuration or explicit provider factories directly.
- Once plugin `config.json` loading exists, map its enabled provider entries to
  Knowledge provider registration.
- Ensure provider capability appears in Handbook when registered.

Verification:

- runtime test with fixture MusicBrainz provider.
- optional live smoke script guarded by explicit opt-in, if useful.

## Task 9: State Sync

Files:

- `INDEX.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `PROGRESS.md`
- `docs/knowledge-slot/design.md`
- `docs/knowledge-slot/musicbrainz-provider.md`

Work:

- Update state documents after implementation.
- Record implemented scope and remaining gaps.

Verification:

- `git diff --name-only`.
- `npm test`.
- `npm run typecheck` if not included in `npm test`.
