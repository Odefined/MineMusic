# Phase 22 Search Core Metadata Lookup Refactor Implementation Plan

> Status: Draft plan; no implementation started
> Owning bounded contexts: Music Intelligence / Search Core, Music Data
> Platform / Metadata Search Corpus, Extension / Source Provider Slot, Stage
> Interface / Music Discovery

## Goal

Replace the current internal Retrieval metadata/provider lookup path with a new
Search architecture for `Metadata Lookup Query`.

The phase destructively changes internal Retrieval contracts but keeps the
`music.discovery.lookup` public output contract stable unless a separately
approved Stage Interface change is made.

The first slice covers metadata lookup only:

```text
Metadata Lookup Query
-> local durable metadata search documents
-> provider search candidates
-> resolved provider hits collapse to durable material documents
-> unresolved provider candidates become runtime Metadata Lookup Documents
-> Mixed Search Set reranks selected local docs + unresolved provider docs
-> Ranked Result Set stores ordered targets and selected evidence
-> Music Discovery projects the same public lookup output shape
```

The phase intentionally does not implement description search, tag search,
similar-music search, embedding search, Memory search, or music-to-language
search behavior.

## Design Baseline

This phase follows the vocabulary in root `CONTEXT.md`:

- `Search Core`
- `Search Query`
- `Metadata Lookup Query`
- `Rerank Profile`
- `Search Target`
- `Searchable Document`
- `Metadata Search Corpus`
- `Metadata Lookup Document`
- `Metadata Field Attribution`
- `Mixed Search Set`
- `Ranked Result Set`
- `Provider Search Corpus`
- `Resolved Provider Hit`
- `Document Evidence`
- `Result Evidence`

The useful part of the old Retrieval model is kept as design evidence only:
field-aware metadata lookup, provider/local mixed lookup, candidate caching,
and result-set paging. The old `matched_token_count`, `best_field_priority`,
`rank_sort_value`, `retrieval_result_text_fts`, and `matchedTextTokensByField`
language is not the new Search domain model.

## Non-Goals

- Do not implement description search, tag search, similar-song search,
  embedding search, Memory search, music-to-language search, or LLM ranking.
- Do not add a feature flag or dual-path runtime comparison.
- Do not preserve old internal Retrieval contracts for compatibility.
- Do not delete old `material_text_*` or `retrieval_result_*` tables in this
  phase. New Search is built alongside them and cuts over when ready.
- Do not migrate old result-set rows.
- Do not write provider raw payloads into Search result rows.
- Do not treat provider/source/provenance/identity/binding data as metadata
  lookup fields.
- Do not make source count, contribution count, provider rank, or legacy
  primary-source priority into ranking weight.
- Do not introduce a persistent Mixed Search Set table in the first slice.
- Do not expose internal `Search Target`, `Metadata Lookup Document`,
  `resultSetId`, material refs, material-candidate refs, source refs, or raw
  Search evidence through the Public Agent Protocol.

## Ownership And Boundaries

Music Intelligence / Search Core owns:

- `Search Query` contracts for `Metadata Lookup Query`;
- `Rerank Profile` selection;
- orchestration of local metadata corpus and provider search corpus;
- Target Merge from documents to `material` or `material_candidate`;
- conversion from corpus-local evidence to selected `Result Evidence`;
- Ranked Result Set cursor ownership;
- internal result shaping for Music Discovery.

Music Data Platform / Metadata Search Corpus owns:

- durable material-level metadata search documents;
- metadata lookup normalization;
- Postgres full-text/trigram/exact/prefix indexed lookup;
- metadata-local rerank over the deduplicated searchable field text;
- projection rebuild commands from Music Data Platform source-of-truth facts;
- owner visibility joins and owner-scoped filter enforcement through narrow
  read ports;
- runtime material-candidate persistence for unresolved provider candidates,
  through existing Candidate/Material Candidate boundaries or a narrow Search
  command port if a new one is required.

Extension / Source Provider Slot owns:

- provider registration and provider search invocation;
- provider-native request/response validation;
- external provider error normalization before Search maps declared provider
  failures into Search failures.

Stage Interface / Music Discovery owns:

- public `music.discovery.lookup` input/output schemas;
- public handle minting;
- public cursor wrapping;
- leak-free public result summaries.

Server Host / Runtime Composition owns:

- wiring concrete Music Data Platform, Search Core, Extension provider search,
  and Stage Interface dependencies.

## Source-Of-Truth Projection Rules

`search_metadata_documents` is a current material-level metadata search
projection. It is global by material, not owner-scoped.

Projection reads only current Music Data Platform truth:

- active `material_records`;
- current `source_material_bindings`;
- bound current `source_records`;
- active confirmed `canonical_records`, only when the material is confirmed
  canonical;
- `MaterialEntity.versionInfo`.

Projection must not treat these as searchable metadata fields:

- owner scope;
- owner catalog membership;
- source refs;
- provider ids;
- provider entity ids;
- material refs;
- canonical refs;
- source binding ids;
- provenance/attribution;
- provider raw payloads.

Projection must not use these as new Search model authority:

- `MaterialEntity.sourceRefs` as binding truth;
- `MaterialEntity.primarySourceRef`;
- legacy `primary_source` contribution role;
- source-priority ordering.

## Metadata Fields

The first durable metadata search document has exactly these searchable fields:

```text
title
artist
album
version
alias
```

Field mapping follows existing source-of-truth field meaning. Search projection
does not infer translation, romanization, localized title, or alternate-title
classification. If a value is a source title, it enters title. If a value is a
canonical alias or source artist alias, it enters alias. Future localized title
or identifier lookup requires a source/canonical fact-model change first.

Within a field:

- normalize values using Postgres-owned metadata lookup normalization;
- deduplicate by normalized value;
- merge fact-source attribution for duplicate normalized values;
- do not repeat text because multiple source records contributed the same
  normalized value.

Across fields:

- do not deduplicate;
- the same normalized value can appear in title and alias as separate field
  facts because field role changes rerank meaning.

Alias remains a recall field. Alias evidence must not be treated as primary
title evidence.

## Metadata Field Attribution

Each stored field value may keep compact `Metadata Field Attribution` for
explanation, maintenance, and debugging.

Allowed first-slice attribution categories:

```text
material_fact
bound_source_fact
canonical_fact
```

Attribution does not define searchable fields and does not add rank weight.
The concrete names may be adjusted during implementation, but they must not
restore legacy `primary_source` or source-priority semantics.

## Postgres Metadata Search Index

The durable metadata search index should be Postgres-native and field-aware.

The expected durable shape is one row per active material:

```text
search_metadata_documents
  material_ref_key
  material_kind
  title_values_json
  artist_values_json
  album_values_json
  version_values_json
  alias_values_json
  title_text
  artist_text
  album_text
  version_text
  alias_text
  search_vector
  normalization_version
  updated_at
```

The exact column names may change during implementation, but the shape must
preserve:

- structured field values with attribution;
- field-level normalized text;
- a weighted combined `tsvector`;
- indexes for full-text recall/rank;
- trigram/exact/prefix support for short and fuzzy metadata lookup.

The combined `search_vector` may use field weights such as:

```text
title   -> A
artist  -> B
album   -> B
version -> C
alias   -> D
```

This is corpus-local metadata text rerank behavior. It is not a public result
score and not cross-corpus score semantics.

Use `simple` text search configuration for first-slice metadata lookup. Do not
use `english` stemming/stop-word behavior for music names. Add `unaccent`
where available and appropriate. Enable `pg_trgm` for fuzzy/substring support.

Metadata lookup query construction should treat user input as name text, not
advanced web-search syntax. Do not default to `websearch_to_tsquery`.

## Provider Candidate Handling

Provider search remains provider-native until the provider result enters
MineMusic Search.

After provider results enter Search:

- if a provider result resolves through current source/material binding to an
  existing active material, it becomes a `Resolved Provider Hit`;
- a `Resolved Provider Hit` is only a discovery path to the material;
- it does not contribute provider metadata to rerank;
- rerank uses the durable material metadata search document;
- if a provider result does not resolve to an existing material, it becomes an
  unresolved runtime provider candidate;
- unresolved provider candidates are projected into the same
  `Metadata Lookup Document` field shape for the current query execution.

Provider raw payloads and provider order may be kept as provider evidence when
needed, but they must not define the shared metadata field model and must not
be exposed publicly.

## Mixed Search Set

`Mixed Search Set` is an execution concept, not a persisted table in the first
slice.

The first-page execution flow is:

1. Run indexed local bounded recall from durable `search_metadata_documents`.
2. Run provider search when the Search Scope includes provider lookup.
3. Resolve provider hits against current source/material bindings.
4. Keep resolved provider hits as durable material targets only.
5. Project unresolved provider candidates into runtime Metadata Lookup
   Documents.
6. Assemble selected durable material documents and unresolved runtime provider
   candidate documents into one transaction-local Mixed Search Set.
7. Run metadata-local Postgres rerank over that mixed set.
8. Write the ordered targets and selected evidence into a Ranked Result Set.

The Mixed Search Set must not copy the whole durable search index. Local recall
is bounded by the Metadata Search Corpus search policy.

## Ranked Result Set

New Search uses new `search_*` runtime result-set state. It does not mutate the
old `retrieval_result_*` tables.

Expected first-slice runtime tables:

```text
search_result_sets
search_result_rows
```

`search_result_sets` stores query identity and TTL state.

`search_result_rows` stores the final ordered snapshot:

```text
result_set_id
rank
target_kind
target_ref_key or material_candidate_ref_key
selected_evidence_json
cursor_sort_key
created_at
expires_at
```

The exact fields may change during implementation, but rows must store final
ranked targets and selected evidence, not complete Searchable Documents, raw
provider payloads, vectors, or a layered score ledger.

Cursor pages read `search_result_rows`. They must not call providers again and
must not rebuild the Mixed Search Set.

## Search Query And Rerank Profile

First-slice query shape:

```ts
type MetadataLookupSearchQuery = {
  kind: "metadata_lookup";
  lookupText: string;
  scope: SearchScope;
  rerankProfile: "relevance" | "stable";
};
```

`recently_added` is not required in the first slice. If it is later needed, it
should be introduced as a `Rerank Profile`, not as a separate query kind.

The query fingerprint must include query kind, normalized lookup text,
search scope, rerank profile, and metadata lookup normalization/index version.
This is implementation detail for cursor/result-set validity and should not be
exposed in public output.

## Failure Semantics

If Search Scope includes provider lookup and provider search fails, do not
return fabricated local-only success.

Allowed outcomes:

- local-only scope returns local metadata lookup results without calling
  providers;
- provider-included scope succeeds only if required provider search succeeds;
- provider-included scope may return an explicit declared partial/failure state
  only if Stage Interface public output explicitly owns that state.

Do not catch provider/database/system failures and convert them into empty
result success.

## Allowed Reads

Search Core may read only through narrow ports:

- Metadata Search Corpus query/read port;
- Provider Search Corpus port;
- material-candidate/cache command/read ports needed for unresolved provider
  candidates;
- Ranked Result Set read/write port;
- shared contracts and Search-owned helpers.

Metadata Search Corpus may read:

- active material records;
- current source/material bindings;
- current source records;
- active confirmed canonical records;
- material version info;
- owner catalog visibility and owner-scoped filters for query constraints;
- its own `search_metadata_documents` projection;
- declared `search_result_*` runtime rows.

Provider Search Corpus may read provider capability state only through the
Extension Source Provider Slot.

Stage Interface may read only through the Search/Music Discovery public
adapter, public handle registry, and public cursor veil.

## Allowed Writes

Metadata Search Corpus may write:

- `search_metadata_documents`;
- metadata search projection rebuild/invalidation state if the implementation
  extends existing projection maintenance;
- `search_result_sets`;
- `search_result_rows`.

Material Candidate ownership may write unresolved provider candidate runtime
state only through the owning Music Data Platform command/cache boundary.

Tests may write fixtures through existing owning commands or explicit fixture
helpers.

## Forbidden Writes And Imports

Search query execution must not write durable identity facts:

```text
source_records
material_records
canonical_records
source_material_bindings
source_library_items
owner_material_relations
owner_material_entries
```

Search query execution must not rebuild projections except through explicit
projection/rebuild commands outside the query read path.

Music Intelligence / Search Core must not import:

- Music Data Platform repositories;
- projection command implementations;
- concrete Postgres adapters;
- Extension plugin implementations;
- Stage Interface handlers;
- provider plugin modules;
- Server Host composition.

Music Data Platform metadata search modules must not import:

- Stage Interface;
- Extension plugin runtime internals;
- concrete provider plugins;
- Music Intelligence orchestration modules;
- Server Host.

Stage Interface must not expose:

- raw provider payloads;
- `Search Target` internals;
- material refs;
- source refs;
- material-candidate refs;
- result-set ids;
- search metadata document JSON;
- search vectors or DB rows.

## Expected Files

Expected new files:

- `src/music_data_platform/search_metadata_document_schema.ts`
- `src/music_data_platform/search_metadata_document_commands.ts`
- `src/music_data_platform/search_metadata_document_records.ts`
- `src/music_data_platform/search_result_set_schema.ts`
- `src/music_data_platform/search_result_set_records.ts`
- `src/music_data_platform/metadata_search_corpus.ts`
- `src/music_intelligence/core/search/contracts.ts`
- `src/music_intelligence/core/search/query_normalization.ts`
- `src/music_intelligence/core/search/cursor.ts`
- `src/music_intelligence/core/search/search_service.ts`
- `test/formal/music-data-platform-search-metadata-documents.test.ts`
- `test/formal/music-data-platform-metadata-search-corpus.test.ts`
- `test/formal/music-data-platform-search-result-set.test.ts`
- `test/formal/music-intelligence-search.test.ts`

Expected existing files to edit:

- `src/music_data_platform/index.ts`
- `src/music_data_platform/projection_maintenance_*` files if search document
  maintenance is added to the existing projection-maintenance system;
- `src/music_intelligence/core/retrieval/**` only to replace the old Retrieval
  entrypoint or adapt it to Search Core;
- `src/music_intelligence/stage_adapter/discovery_lookup.ts`
- `src/music_intelligence/errors.ts`
- `src/stage_core/index.ts`
- Server Host runtime wiring files that currently compose Retrieval;
- `test/formal/music-intelligence-retrieval.test.ts` or replacement tests;
- `test/formal/music-discovery-lookup.test.ts` if present;
- `test/formal/active-tree.test.ts`;
- `test/run-stage-core-tests.ts`;
- `docs/music-data-platform/design.md`;
- `docs/music-data-platform/ports.md`;
- `docs/music-data-platform/progress.md`;
- `docs/music-intelligence/design.md`;
- `docs/music-intelligence/ports.md`;
- `docs/music-intelligence/progress.md`;
- `docs/formal-rebuild/README.md`;
- `INDEX.md`;
- `CURRENT_STATE.md`;
- `PROGRESS.md`.

Expected files not to edit in the first slice:

- provider plugin implementation files except narrow provider-search adapter
  tests require fixture updates;
- Stage Interface public schema files unless required to keep the existing
  public output backed by new Search;
- old `retrieval_result_*` implementation files except to stop wiring them
  into `music.discovery.lookup`;
- old `material_text_*` implementation files except as donor evidence.

## Guard Plan

Add or update guards for:

- Music Intelligence Search Core must not import Music Data Platform
  repositories, projection commands, concrete Postgres modules, Stage
  Interface, Server Host, or Extension plugins.
- Music Data Platform metadata search modules must not import Stage Interface,
  Extension plugin internals, provider plugins, Server Host, or Music
  Intelligence orchestration.
- Stage Interface public output must not leak search refs, result-set ids, raw
  provider payloads, metadata document JSON, search vectors, or internal target
  ids.
- Search query execution must not write durable identity tables.
- Metadata search projection must not use legacy `primary_source` attribution
  or source-priority ordering.
- Resolved provider hits must not create runtime provider metadata documents
  for reranking.

## Slice Plan

### Slice 22A: Metadata Search Document Projection

Create durable material-level metadata search documents and projection rebuild
commands.

Acceptance:

- active material writes exactly one metadata search document;
- missing/inactive material deletes its search document;
- searchable fields are exactly title, artist, album, version, alias;
- source/canonical/material facts map according to existing source-of-truth
  field semantics;
- field values normalize and dedupe within field;
- duplicate normalized values merge attribution;
- no `primary_source` or source-priority attribution appears in new search
  documents;
- owner scope is not stored on metadata search documents.

Verification:

```bash
npm run build:test
npm run test:stage-core -- --run test/formal/music-data-platform-search-metadata-documents.test.ts
```

### Slice 22B: Postgres Metadata Search Corpus

Implement indexed metadata lookup over durable search documents.

Acceptance:

- Postgres owns metadata lookup normalization;
- `simple` FTS configuration is used for music metadata;
- `pg_trgm` is enabled for fuzzy/substring lookup;
- exact, prefix, full-text, and fuzzy evidence can be selected;
- alias helps recall but does not behave as title evidence;
- corpus-local text rerank uses deduplicated field text;
- source/contribution count does not affect text rank.

Verification:

```bash
npm run build:test
npm run test:stage-core -- --run test/formal/music-data-platform-metadata-search-corpus.test.ts
```

### Slice 22C: New Search Result Set Foundation

Add `search_result_sets` and `search_result_rows` runtime state.

Acceptance:

- first-page search writes a TTL-backed final ordered result snapshot;
- cursor pages read the same result set and do not rerun providers;
- result rows store target identity, rank/order key, selected evidence, and
  paging data;
- result rows do not store complete documents, vectors, raw provider payloads,
  or layered score ledgers;
- expired result sets are cleaned through the owning runtime boundary.

Verification:

```bash
npm run build:test
npm run test:stage-core -- --run test/formal/music-data-platform-search-result-set.test.ts
```

### Slice 22D: Search Core Metadata Lookup

Introduce Music Intelligence Search Core for `Metadata Lookup Query`.

Acceptance:

- query input declares `kind = "metadata_lookup"`;
- Search Core does not infer description/tag/similar intent from raw text;
- supported first-slice rerank profiles are `relevance` and `stable`;
- local-only scope uses durable metadata search corpus only;
- provider-included scope invokes provider search through the narrow provider
  port;
- provider failure is explicit and not converted to local-only success;
- Search Core consumes only narrow ports.

Verification:

```bash
npm run build:test
npm run test:stage-core -- --run test/formal/music-intelligence-search.test.ts
```

### Slice 22E: Provider Mixed Metadata Lookup

Wire provider lookup into the new Search flow.

Acceptance:

- provider candidates are validated before entering Search;
- resolved provider hits collapse to existing durable material targets;
- resolved provider hits use durable material metadata documents for rerank;
- unresolved provider candidates become runtime Metadata Lookup Documents;
- Mixed Search Set is transaction-local/execution-local and not persisted;
- selected local material docs and unresolved provider docs are reranked
  together by metadata text rerank;
- duplicate final targets are collapsed;
- selected result evidence is compact and public-safe.

Verification:

```bash
npm run build:test
npm run test:stage-core -- --run test/formal/music-intelligence-search.test.ts
```

### Slice 22F: Music Discovery Cutover

Switch `music.discovery.lookup` internal implementation to new Search without a
feature flag.

Acceptance:

- public output shape remains stable;
- public handles remain stable according to existing Music Discovery contract;
- public cursor wrapping remains Stage Interface-owned;
- old internal Retrieval/result-set ids do not cross the Stage Interface seam;
- provider raw payloads and Search internals do not leak;
- old Retrieval path is no longer wired into `music.discovery.lookup`;
- old tables and modules may remain in the tree until a later cleanup phase.

Verification:

```bash
npm run build:test
npm run test:stage-core
npm run typecheck
```

## Test Matrix

Metadata projection tests:

- recording source title/artist/album/version mapping;
- album source title/artist mapping;
- artist source name/alias mapping;
- canonical label/alias mapping by material kind;
- inactive material deletion;
- inactive canonical exclusion;
- bound sources, not `MaterialEntity.sourceRefs`, drive projection;
- duplicate normalized values merge attribution;
- same normalized value in different fields is not deduped across fields;
- source count does not duplicate searchable text.

Metadata corpus tests:

- title exact outranks title fuzzy;
- title exact outranks alias exact;
- alias still recalls;
- artist/album/version evidence is preserved by field;
- prefix lookup works;
- trigram fuzzy lookup works;
- punctuation or operator-looking input is treated as name text, not
  web-search syntax;
- CJK/no-space text has a trigram/substring path where Postgres supports it.

Provider mixed tests:

- unresolved provider candidate participates as runtime Metadata Lookup
  Document;
- resolved provider hit uses durable material metadata document;
- resolved provider hit does not add provider metadata boost;
- provider raw payload is not stored in result rows;
- provider failure with provider-included scope fails explicitly;
- cursor page does not call provider again.

Stage Interface tests:

- `music.discovery.lookup` public output shape remains stable;
- public handles hide material/material-candidate refs;
- public cursor hides result-set id;
- no raw provider payload or search document JSON leaks.

## Documentation Updates During Implementation

When implementation lands, update:

- `docs/music-data-platform/design.md` with metadata search document and
  result-set ownership;
- `docs/music-data-platform/ports.md` with metadata search corpus ports and
  write boundaries;
- `docs/music-data-platform/progress.md` with implemented slices;
- `docs/music-intelligence/design.md` with Search Core and Metadata Lookup
  Query flow;
- `docs/music-intelligence/ports.md` with consumed/provided Search ports;
- `docs/music-intelligence/progress.md` with implemented Search slices;
- `docs/formal-rebuild/README.md` and root state docs when the phase becomes
  active/implemented.

## ADR Candidate

Consider one ADR after the plan is accepted and before the cutover PR:

```text
ADR: Metadata Lookup Search Uses Durable Material Documents And Runtime
Unresolved Provider Documents
```

Create the ADR only if the implementation confirms the trade-off remains:

- new Search is built beside old Retrieval instead of in-place;
- durable metadata lookup documents are material-level;
- unresolved provider candidates share Metadata Lookup Document shape;
- resolved provider hits do not contribute provider metadata rerank documents;
- Mixed Search Set is execution-local, while Ranked Result Set is persisted.

## Acceptance Criteria For Phase Completion

- New Search Core handles `Metadata Lookup Query` for local and provider lookup.
- `music.discovery.lookup` uses new Search internally without a feature flag.
- Public lookup output remains stable and leak-free.
- Old Retrieval internals are no longer required for lookup execution.
- New metadata search documents are rebuilt from current source-of-truth facts.
- Provider resolved/unresolved behavior follows the rules in this plan.
- Cursor paging reads persisted `search_result_rows` and does not call
  providers again.
- Guards prevent the main boundary regressions.
- Focused formal tests and broad stage-core/typecheck verification pass.

## Stopping Condition

Stop after `music.discovery.lookup` is cut over to new Search, focused and
broad verification pass, and current-authority docs are updated for the
implemented phase. Do not delete old Retrieval tables or modules until a later
cleanup phase unless explicitly scoped.
