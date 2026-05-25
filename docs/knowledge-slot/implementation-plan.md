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
