# Knowledge Slot Implementation Plan

## Status

Implementation plan.

## Goal

Implement the target Knowledge Slot contract and first MusicBrainz Knowledge
Provider without preserving the old `MusicMaterial[]` knowledge path.

## Scope

In scope:

- shared Knowledge contracts for `KnowledgeResult`, `KnowledgeItem`,
  `StructuredKnowledge`, `TextKnowledge`, `KnowledgeNode`, and
  `KnowledgeRelation`.
- `MusicKnowledgePort.query` returning `KnowledgeResult`.
- general read-only Stage Interface tool `knowledge.query`.
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
- Add `StructuredKnowledge`, `TextKnowledge`, `KnowledgeNode`,
  `KnowledgeRelation`, and related source/descriptor types.
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
  relation focus values, and boundary notes.
- Render provider capability descriptions into the general Knowledge tool
  Handbook entry.
- Do not expose provider-internal API modes or provider-specific tools.

Verification:

- Handbook render tests show MusicBrainz capability guidance under
  `knowledge.query`.

## Task 4: Stage Interface Tool

Files:

- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/dispatch.ts`
- `src/surfaces/mcp/server.ts`
- Stage Interface and MCP tests.

Work:

- Add stable tool name `knowledge.query`.
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
- Do not expose cache maintenance through `knowledge.query`.

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

- Register MusicBrainz provider in the `knowledge` slot from local MCP runtime
  composition, while preserving explicit provider injection for tests and later
  host configuration.
- Do not make a MusicBrainz-specific environment variable decide provider
  activation.
- Keep provider activation compatible with the future plugin `config.json`
  loader by routing through generic Knowledge provider factories.
- Once plugin `config.json` loading exists, map its enabled provider entries to
  Knowledge provider registration.
- Ensure provider capability appears in Handbook when registered.

Verification:

- runtime test with fixture MusicBrainz provider.
- optional live smoke script guarded by explicit opt-in, if useful.

## Task 9: Text Query Expansion And Relation Focus

Files:

- `src/contracts/index.ts`
- `src/stage_interface/schemas.ts`
- `src/providers/musicbrainz/index.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`
- `docs/knowledge-slot/design.md`
- `docs/knowledge-slot/musicbrainz-provider.md`

Work:

- Add `relationFocus?: KnowledgeRelationFocus[]` to `KnowledgeQuery`.
- Define the first allowed focus value as `members`.
- Keep `relationFocus` general. Do not expose provider-specific relationship
  names, MusicBrainz include names, or MusicBrainz API modes to agents.
- Return relationship dates and let the agent interpret them. Keep separate
  time-filtering out of this slice.
- Make MusicBrainz text search honor requested expansions by doing provider-
  internal follow-up lookup or browse for each returned search hit up to
  `query.limit`.
- For text queries such as artist + `expand: ["relations"]` +
  `relationFocus: ["members"]`, search artists, take the returned MBID
  internally, look up artist relationships, then return member facts.
- Map MusicBrainz `member of band` relationships to structured member
  relations.
- Preserve original MusicBrainz relationship type, direction, begin date, end
  date, ended flag, and attributes such as `lead vocals`.
- Keep agents on the general `knowledge.query` interface. Agents should not need
  to know MBIDs, MusicBrainz lookup, or MusicBrainz browse to ask for fuller
  knowledge.

Verification:

- Contract tests cover `relationFocus`.
- Stage Interface schema tests expose `relationFocus`.
- MusicBrainz fixture tests prove text artist query + relation expansion triggers
  search followed by lookup with artist relationships.
- MusicBrainz fixture tests prove My Bloody Valentine-style membership facts can
  return Kevin Shields, Bilinda Butcher, and David Conway with `lead vocals`
  attributes and date fields.
- Tests cover that omitting `relationFocus` preserves broad `relations`
  behavior.
- Tests cover unsupported focus values with a warning or validation error,
  depending on the chosen public contract behavior.

## Task 10: State Sync

Files:

- `INDEX.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `PROGRESS.md`
- `docs/knowledge-slot/design.md`
- `docs/knowledge-slot/implementation-plan.md`
- `docs/knowledge-slot/musicbrainz-provider.md`
- `docs/knowledge-slot/progress.md`

Work:

- Update state documents after implementation.
- Record implemented scope and remaining gaps.

Verification:

- `git diff --name-only`.
- `npm test`.
- `npm run typecheck` if not included in `npm test`.

## Task 11: Relation Object Contract

Goal:

Replace edge-style relationship output with relation objects that do not require
`subject -> predicate -> object`.

Files:

- `src/contracts/index.ts`
- `src/stage_interface/schemas.ts`
- contract and schema tests.
- `docs/knowledge-slot/design.md`
- `docs/mvp/interface-contracts.md`
- `docs/mvp/module-interfaces.md`

Work:

- Add a shared `KnowledgeRelation` contract.
- Change `StructuredKnowledge` so provider relationships are returned as
  `relations: KnowledgeRelation[]`.
- Stop using `KnowledgeEdge` as the public way to express provider
  relationships.
- Model a relation as:
  - a relation `type`.
  - two or more endpoint node ids.
  - optional endpoint roles, such as `member`, `group`, `recording`, `work`,
    `release`, `label`, or `participant`.
  - optional provider/source fields, such as MusicBrainz direction, forward
    phrase, reverse phrase, begin date, end date, ended flag, and attributes.
- Keep `rootNodeId` as the result's primary node only. It must not define a
  relation's subject.
- Keep relation objects provider-attributed. They still do not confirm
  MineMusic canonical identity.

Verification:

- Contract tests cover a relation with endpoint roles.
- Contract tests cover a relation with no inherent direction.
- Schema tests expose `relations` and no longer require `edges`.

Commit:

- Commit this task before changing provider mapping.

## Task 12: MusicBrainz Relation Mapping

Goal:

Map MusicBrainz relationships without flattening them into fake directional
predicates such as `has_member`.

Files:

- `src/providers/musicbrainz/index.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`
- `docs/knowledge-slot/musicbrainz-provider.md`

Work:

- Change MusicBrainz relationship mapping to create `KnowledgeRelation`
  objects.
- Preserve MusicBrainz relationship facts:
  - relationship type.
  - target entity ref and node.
  - direction relative to the MusicBrainz lookup entity.
  - forward and reverse phrases when available.
  - begin date, end date, ended flag, and attributes.
- For MusicBrainz `member of band`:
  - `direction: "backward"` from a group artist means the target artist is a
    member of the root group.
  - `direction: "forward"` from a group artist means the root artist is a
    member of the target group; it must not be returned as a group member in
    `relationFocus: ["members"]`.
  - endpoint roles should make the relation readable without relying on
    `subject` or `object`.
- Keep broad `expand: ["relations"]` as broad relation retrieval, but return
  relation objects with MusicBrainz direction and phrases intact.

Verification:

- Fixture test proves Black Country, New Road member lookup includes Isaac Wood,
  The Guest, and Tyler Hyde as member relations when MusicBrainz returns
  backward `member of band`.
- Fixture test proves a forward `member of band` relation, such as
  `black midi, New Road`, is not emitted as a member of Black Country, New Road
  for `relationFocus: ["members"]`.
- Fixture tests prove relationship dates and role attributes such as
  `lead vocals` survive the mapping.

Commit:

- Commit this task before migrating non-membership structured facts.

## Task 13: Structured Fact Migration

Goal:

Move existing structured MusicBrainz links from edge output to relation output
without changing the public query behavior.

Files:

- `src/providers/musicbrainz/index.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`
- Knowledge service tests affected by result snapshots.
- Handbook or surface tests that assert result shapes.

Work:

- Convert current provider links such as artist credits, tracklist membership,
  recording-work links, release-release-group links, release labels, release
  appearances, and URL links to `KnowledgeRelation`.
- Keep simple scalar facts, such as duration, barcode, rating, tags, genres, and
  annotation, on node or relation properties as appropriate.
- Do not create subject/object equivalents under different names.
- Keep one `StructuredKnowledge` item per provider hit.
- Preserve node ids and provider refs so callers can still identify returned
  artists, recordings, releases, release groups, works, labels, tracks, and
  URLs.

Verification:

- Existing MusicBrainz fixture tests are updated to assert `relations`.
- Tests prove tracklist, release label, artist credit, recording-work, ratings,
  tags, genres, and annotation facts still return.
- `npm test` passes after the migration.

Commit:

- Commit this task after the provider tests pass.

## Task 14: Service, Handbook, And Real Tool Smoke

Goal:

Make the general Knowledge tool and installed plugin behavior match the new
relation contract.

Files:

- `src/knowledge/index.ts`
- `src/handbook/index.ts`
- `src/stage_interface/**`
- `src/surfaces/mcp/server.ts`
- `plugins/minemusic/**`
- relevant docs and generated Handbook files.

Work:

- Ensure `knowledge.query` returns the new relation shape unchanged from the
  provider.
- Update schema descriptions and Handbook text so agents ask for relation
  focus, not provider-specific MusicBrainz API details.
- Refresh the installed local plugin cache after code and Handbook changes.
- Run a real `minemusic.knowledge.query` smoke test for:
  - `Black Country, New Road` with `expand: ["relations"]` and
    `relationFocus: ["members"]`.
  - a broad artist relation query without `relationFocus`.

Verification:

- Stage Interface and MCP exposure tests pass.
- Local plugin cache matches `plugins/minemusic`.
- Real tool smoke proves the agent-facing Knowledge tool can retrieve member
  changes without treating a forward MusicBrainz relation as a group member.

Commit:

- Commit this task after the real tool smoke passes.

## Task 15: Final State Sync

Files:

- `INDEX.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `PROGRESS.md`
- `docs/knowledge-slot/design.md`
- `docs/knowledge-slot/implementation-plan.md`
- `docs/knowledge-slot/musicbrainz-provider.md`
- `docs/knowledge-slot/progress.md`

Work:

- Update global and module-local state documents after the relation migration.
- Record any remaining gaps, especially Canonical Store review/apply work and
  future provider configuration loading.

Verification:

- `git diff --name-only`.
- `npm test`.
- `npm run typecheck` if it is not included in `npm test`.

Commit:

- Commit final documentation/state sync separately.

## Task 16: Query Entry And Filter Contract

Goal:

Add the target Knowledge query contract for structured search entries and tag
filters without changing provider behavior yet.

Files:

- `src/contracts/index.ts`
- `src/knowledge/index.ts`
- `src/stage_interface/schemas.ts`
- `test/contracts/wave1-contracts.test.ts`
- `test/knowledge/music-knowledge.test.ts`
- `test/surfaces/mcp-server.test.ts`

Work:

- Add shared contracts:
  - `KnowledgeFieldQuery`.
  - `KnowledgeFilters`.
  - `KnowledgeTagFilter`.
- Add `tagQuery?: string[]`, `fieldQuery?: KnowledgeFieldQuery`,
  `filters?: KnowledgeFilters`, and `cursor?: string` to `KnowledgeQuery`.
- Add `nextCursor?: string` to `KnowledgeResult`.
- Keep query entries mutually exclusive:
  - `text`.
  - `canonicalRef`.
  - `tagQuery`.
  - `fieldQuery`.
- Keep `filters` outside query-entry mutual exclusion.
- Reject filters as the only query condition.
- Validate `filters.tags.include` and `filters.tags.exclude`:
  - arrays must be omitted or non-empty.
  - tag strings must remain non-empty after mechanical normalization.
  - `include` and `exclude` must not overlap after normalization.
- Validate `tagQuery`:
  - array must be non-empty when supplied.
  - tag strings must remain non-empty after mechanical normalization.
- Keep `filters.tags.include` as hard all-tags inclusion.
- Keep `filters.tags.exclude` as hard any-tag exclusion.
- Do not add a separate hard-include tag query field, tag weights, or field
  filters.
- Update Stage Interface schema and MCP schema exposure for the new fields.

Verification:

- Contract tests prove the new query shape and `KnowledgeResult.nextCursor`.
- Knowledge service tests reject:
  - no query entry.
  - multiple query entries.
  - filters-only queries.
  - empty tag arrays.
  - empty normalized tag values.
  - overlapping include/exclude tags.
- Surface tests prove `minemusic.knowledge.query` exposes `tagQuery`,
  `fieldQuery`, `filters`, and `cursor`.
- `npm test` passes.

Commit:

- Commit this task before provider behavior changes.

## Task 17: MusicBrainz Label Root And Shared Tag Helpers

Goal:

Prepare MusicBrainz provider support for label roots and shared tag matching
without adding new query modes yet.

Files:

- `src/providers/musicbrainz/index.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`

Work:

- Add `label` to the MusicBrainz Knowledge provider descriptor `entityKinds`.
- Add `label` search config.
- Add `label` lookup config.
- Add a label-to-`StructuredKnowledge` mapper with:
  - MBID.
  - name.
  - disambiguation.
  - type.
  - country or area when returned.
  - tags, genres, and rating when returned.
- Keep `label` as a Knowledge root, not a MineMusic canonical priority claim.
- Add shared helpers:
  - mechanical tag normalization.
  - root node tag/genre extraction.
  - `matchedTags` and `matchedTagCount` calculation.
  - root-item `filters.tags.include/exclude` application.
- Ensure tag matching reads both MusicBrainz `tags` and `genres`.

Verification:

- Provider descriptor test includes `label`.
- Fixture search/lookup tests cover a label root item.
- Helper-driven tests prove:
  - genres count as tag matches.
  - `include` requires every included tag.
  - `exclude` removes an item if any excluded tag is present.
  - root items with no tags/genres fail `include` and do not fail `exclude`.
- `npm test` passes.

Commit:

- Commit this preparation before adding tag search.

## Task 18: MusicBrainz Tag Query

Goal:

Implement `tagQuery` as a first-class Knowledge query entry through MusicBrainz
indexed search.

Files:

- `src/providers/musicbrainz/index.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`
- `test/knowledge/music-knowledge.test.ts`

Work:

- Route `tagQuery` requests separately from text and canonical lookup.
- Default `entityKinds` to `["recording"]`.
- Support tag search for:
  - `artist`.
  - `label`.
  - `recording`.
  - `release`.
  - `release_group`.
  - `work`.
- Build MusicBrainz indexed search using `tag:` clauses, such as
  `tag:"ambient" OR tag:"post-rock"`.
- Do not expose MusicBrainz query syntax to Stage Interface, Handbook, or
  callers.
- Return only root items that match at least one effective query tag.
- Sort returned root items by:
  - larger `matchedTagCount`.
  - MusicBrainz search score as tie breaker when available.
  - stable provider order.
- Add `metadata.matchedTags` and `metadata.matchedTagCount`.
- Apply `filters.tags.include/exclude` after returned `tags` and `genres` are
  available.
- Allow `filters.tags.include` with `tagQuery`; it does not need to be a subset
  of `tagQuery`.
- Reject overlap between `filters.tags.exclude` and the effective Tag Query
  tags.
- Do not push `filters.tags.exclude` into MusicBrainz search in the first
  implementation.
- `filters.tags.include` may be pushed into the internal MusicBrainz query as an
  optimization, but returned facts must still be checked.
- Preserve current text query and canonical lookup behavior.

Verification:

- Fixture tests prove the provider builds expected `tag:` search requests.
- Fixture tests prove root results must match at least one `tagQuery` tag.
- Fixture tests prove include/exclude behavior with returned tags and genres.
- Fixture tests prove `matchedTags` and `matchedTagCount` metadata.
- Fixture tests prove mixed `entityKinds` results are globally limited and
  ordered by tag match quality.
- `npm test` passes.

Commit:

- Commit this task after tag query tests pass.

## Task 19: MusicBrainz Field Query

Goal:

Implement `fieldQuery` as a provider search condition entry for MusicBrainz
indexed search.

Files:

- `src/providers/musicbrainz/index.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`
- `test/knowledge/music-knowledge.test.ts`

Work:

- Route `fieldQuery` requests separately from text, canonical lookup, and
  `tagQuery`.
- Default `entityKinds` to `["recording"]`.
- Support first-version fields:
  - `title`.
  - `artist`.
  - `release`.
  - `label`.
  - `date`.
  - `country`.
  - `barcode`.
  - `catalogNumber`.
  - `type`.
- Map fields to MusicBrainz indexed search fields per requested entity kind.
- Join usable field clauses with `AND`.
- Quote or escape field values when building MusicBrainz queries.
- Treat Field Query as provider search condition, not canonical scope or exact
  identity equality.
- Keep `fieldQuery.release` for recording search as release-style search data,
  not strict release-group tracklist scope.
- Uppercase `country` values but do not translate country names.
- Do not support arrays, implicit `OR`, fuzzy search, wildcards, raw Lucene, or
  date ranges.
- When `filters.tags` is present:
  - ensure each root item has `tags` and `genres`.
  - use follow-up lookup when search results do not include them.
  - apply include/exclude only to root items.
  - allow provider-internal over-fetch to fill the public `limit`.
- Keep internal over-fetch capped as a provider detail, for example
  `min(limit * 5, 50)`.

Verification:

- Fixture tests prove mapped MusicBrainz field queries for recording, release,
  release group, artist, work, and label where supported.
- Fixture tests prove unsupported fields for an entity kind warn or return no
  items without crashing.
- Fixture tests prove `fieldQuery.artist` plus `filters.tags.include` can return
  matching recordings.
- Fixture tests prove `fieldQuery.release` plus `filters.tags.include` remains a
  search-style query and does not claim strict album scope.
- Fixture tests prove follow-up lookup happens before tag filtering when search
  results lack tags/genres.
- `npm test` passes.

Commit:

- Commit this task after field query tests pass.

## Task 20: Knowledge Cursor Continuation

Goal:

Add opaque continuation for paged Knowledge search results without exposing
provider offsets or provider-local state to agents.

Files:

- `src/contracts/index.ts`
- `src/knowledge/index.ts`
- `src/providers/musicbrainz/index.ts`
- `test/knowledge/music-knowledge.test.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`

Work:

- Keep public input as `KnowledgeQuery.cursor?: string`.
- Keep public output as `KnowledgeResult.nextCursor?: string`.
- Make Music Knowledge Service own public cursor encoding and decoding.
- Add an internal provider continuation path so providers can receive
  provider-local continuation state without exposing it to Stage Interface or
  agents.
- Bind cursor use to the original query shape except `limit`.
- Bind cursor use to the provider set that produced the cursor.
- Treat cursor as short-lived continuation, not a bookmark.
- Return `knowledge.invalid_query` for undecodable or mismatched cursors.
- Implement MusicBrainz continuation for search-backed text, tag, and field
  queries using provider-local offset state.
- Preserve public `limit` as the returned chunk cap.

Verification:

- Service tests prove public cursor wrapping and mismatch rejection.
- Provider tests prove first page and second page use the expected MusicBrainz
  offsets.
- Provider tests prove changed query shape with an old cursor is rejected.
- Stage Interface dispatch test proves `nextCursor` returns through
  `knowledge.query`.
- `npm test` passes.

Commit:

- Commit this task after cursor tests pass.

## Task 21: Handbook, Interface Docs, And Real Smoke

Goal:

Expose the new Knowledge query capabilities to agents without teaching
provider-specific MusicBrainz API details.

Files:

- `src/handbook/index.ts`
- `src/stage_interface/**`
- `src/surfaces/mcp/**`
- `docs/mvp/interface-contracts.md`
- `docs/knowledge-slot/design.md`
- `docs/knowledge-slot/musicbrainz-provider.md`
- `docs/knowledge-slot/progress.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`

Work:

- Update Handbook generation so the Knowledge instrument describes:
  - `tagQuery`.
  - `fieldQuery`.
  - `filters.tags.include`.
  - `filters.tags.exclude`.
  - cursor continuation.
- Keep Handbook language provider-general.
- Do not expose MusicBrainz Lucene, search endpoints, lookup endpoints, browse
  endpoints, or offsets as agent actions.
- Update `docs/mvp/interface-contracts.md` only after the code contract exists.
- Update module progress with implemented scope and remaining gaps:
  - no strict canonical scoped search.
  - no strict release-group tracklist scope.
  - no field filters.
  - no tag weights.
- Restart the local MineMusic server if needed for real MCP smoke.
- Run real `minemusic.knowledge.query` smoke cases:
  - `tagQuery` for ambient/post-rock recordings.
  - `fieldQuery.artist` plus `filters.tags.include`.
  - `fieldQuery.release` plus `filters.tags.include`.
  - `tagQuery` plus `filters.tags.exclude`.

Verification:

- `npm test`.
- MCP schema exposes the new Knowledge query fields.
- Real MCP smoke proves the installed tool can call the new query forms.
- State-sync gate:
  - `git diff --name-only`.
  - report whether `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and
    `PROGRESS.md` were updated or not needed with a concrete reason.

Commit:

- Commit final interface docs, Handbook, real smoke notes, and state sync
  separately.
