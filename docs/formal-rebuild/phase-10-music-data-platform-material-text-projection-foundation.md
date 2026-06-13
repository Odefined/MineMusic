# Phase 10 Music Data Platform Material Text Projection Foundation

> Status: Implemented Phase 10 spec
> Phase owner: Music Data Platform / Material Text Projection
> Output type: Material-centered text document read model and SQLite FTS
> projection for later Music Intelligence query phases

Phase 10 establishes the material text projection foundation needed before
local pool query and public material query tools can search existing durable
materials by text.

The formal boundary name is `Material Text Projection`. "Search document" is
allowed as explanatory language, but it is not the boundary name. This phase is
owned by Music Data Platform because it derives a durable read model from
durable source/material/canonical facts. Music Intelligence will later consume
this read model for retrieval, query planning, ranking evidence, and query
result shaping.

Phase 10 is not a query engine phase. It must not implement public Stage
Interface tools, query hit output shape, pool algebra, provider search temp
candidates, query-to-present flow, or final `MaterialCard` behavior.

## Established Inputs

Before Phase 10, current formal state provides:

- `MusicDatabase` and schema contribution foundation;
- Music Data Platform identity records and write commands;
- `source_records`, `material_records`, `canonical_records`, and
  `source_material_bindings`;
- material-to-canonical binding through active material records;
- source-library facts and source-library import persistence;
- owner catalog entries/view with source-library and owner-relation producers;
- no material text document table;
- no material text FTS table;
- no local pool query engine;
- no query hit public output shape.

Formal architecture already requires:

- Music Data Platform owns durable facts, projections, and read models;
- Music Intelligence owns retrieval, query planning, ranking evidence, and
  query result evidence;
- `MaterialEntity` remains owner-neutral;
- `MaterialCard` is final Stage Interface presentation output only;
- ordinary query paths must not receive writer capabilities.

## Goal

Phase 10 must implement a material-centered text projection foundation:

- one searchable text document per active material;
- structured searchable text fields;
- compact internal document JSON for debugging and later query evidence;
- SQLite FTS support over the projected text fields;
- database-owned rebuild commands for explicit material ref rebuilds;
- architecture and behavior tests that keep text projection, query, provider
  candidates, owner facts, and presentation separate.

## Non-Goals

Phase 10 does not implement:

- public Stage Interface query/import/search tools;
- Music Intelligence query engine behavior;
- local/source-library/owner-relation/material-ref pool algebra;
- query hit public output shape;
- query-to-present flow;
- final `MaterialCard` key set;
- provider search temp candidate tables;
- provider candidate cache;
- materialization of provider candidates;
- collection facts or collection projection;
- dirty-projection scheduling, background workers, or automatic rebuild
  orchestration;
- synchronous import-path text projection refresh;
- ranking policy, recommendation policy, or presentation display seeds;
- title parsing / version extraction / NLP normalization beyond field-level
  text normalization and dedupe;
- CJK segmentation, transliteration, pinyin/kana/romaji aliases, fuzzy match,
  or typo tolerance.

## Confirmed Decisions

### Boundary Name

The formal boundary is `Material Text Projection`.

Use `material_text_documents` for the document table and `material_text_fts`
for the FTS table. Avoid naming the phase or boundary `Search Document` because
that makes the projection look like a Music Intelligence query-engine concern.

### One Active Material, One Document

`material_text_documents` is material-centered.

When a rebuild is requested for an active material, it writes one text document
keyed by `material_ref_key`. Merged, archived, missing, or otherwise non-active
material records do not produce active searchable material text documents.

Do not create separate durable text documents per source, canonical record, or
owner catalog entry in Phase 10. The later query engine should receive material
hits, not source or canonical hits that must be grouped back into materials.

### Fact Sources

Phase 10 text documents derive only from:

- `MaterialEntity`;
- currently bound `SourceEntity` values;
- optional `CanonicalEntity` when the material has a confirmed canonical
  binding.

Do not derive material text documents from:

- owner relations;
- source-library provenance;
- owner catalog provenance;
- provider scores;
- query history;
- presentation text;
- raw provider payloads;
- Stage Interface DTOs.

### Structured Fields Plus Compact JSON

Do not store only one text blob.

The document row should keep structured searchable text fields plus compact
internal document JSON. The first field set is:

```text
material_ref_key
material_kind
title_text
artist_text
album_text
version_text
alias_text
search_text
document_json
updated_at
```

The text fields are searchable projection fields. They are not display seeds
and must not be treated as final public output.

The first `material_text_documents` schema uses these constraints:

```sql
CREATE TABLE IF NOT EXISTS material_text_documents (
  material_ref_key TEXT PRIMARY KEY,
  material_kind TEXT NOT NULL,
  title_text TEXT NOT NULL DEFAULT '',
  artist_text TEXT NOT NULL DEFAULT '',
  album_text TEXT NOT NULL DEFAULT '',
  version_text TEXT NOT NULL DEFAULT '',
  alias_text TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  document_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (material_kind IN ('recording', 'album', 'artist', 'work', 'release')),
  FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
);
```

`material_kind` is a structured projection column only. Phase 10 must not copy
material kind into FTS text fields, `search_text`, or `document_json`
contributions. Later query phases should filter kind structurally, not through
text match.

`document_json` is compact internal projection structure for debugging and
later query evidence. It stores field contribution summaries, not repeated
refs or full entity snapshots.

The database stores `document_json` as `TEXT NOT NULL`. Writers must build it
with fixed JSON key order. Read records expose this column as
`documentJson: string`; callers that need to assert or inspect the debug
structure may parse it explicitly in tests or later detail tooling.

The first `document_json` shape should be compact and deterministic. Field keys
must always appear in this order: `title`, `artist`, `album`, `version`,
`alias`. Contribution object keys must always be `source`, `basis`, `value`.

```json
{
  "fields": {
    "title": [
      { "source": "primary_source", "basis": "title", "value": "plainsong" }
    ],
    "artist": [
      { "source": "bound_source", "basis": "artist", "value": "the cure" }
    ],
    "album": [],
    "version": [],
    "alias": [
      { "source": "canonical", "basis": "alias", "value": "plain song" }
    ]
  }
}
```

Allowed contribution source labels in Phase 10 are:

```text
material
primary_source
bound_source
canonical
```

Contribution `basis` labels describe which kind of source field produced the
value. Phase 10 may use basis labels such as:

```text
title
artist
album
alias
version_label
version_tag
```

Contribution `value` fields use the same normalized searchable value stored in
the text columns. They are not display wording.

Contribution arrays are ordered deterministically. Their order carries the
projection contribution priority; Phase 10 should not add separate `rank` or
`priority` fields to `document_json`.

`document_json` does not repeat `canonicalRefKey` and does not store
`sourceRefKeys`. Exact source rows can be recovered from current
`source_material_bindings`, and exact canonical binding can be recovered from
the current material record, when a later debug/detail path needs them.

`document_json` is not historical evidence. It explains the current projection
row at rebuild time at field/basis level only.

### FTS Is In Scope

Phase 10 creates both:

```text
material_text_documents
material_text_fts
```

SQLite FTS may index:

```text
title_text
artist_text
album_text
version_text
alias_text
```

`search_text` remains on `material_text_documents` as a combined read/debug
field, but it is not indexed in `material_text_fts`. FTS indexes only the
structured text fields so future field weighting or BM25-style ranking is not
distorted by duplicate indexing of the same tokens.

Use SQLite FTS5 with the `unicode61` tokenizer in Phase 10.

The first FTS table shape is:

```sql
CREATE VIRTUAL TABLE material_text_fts USING fts5(
  material_ref_key UNINDEXED,
  title_text,
  artist_text,
  album_text,
  version_text,
  alias_text,
  tokenize = 'unicode61'
)
```

`material_text_fts.material_ref_key` is an unindexed lookup field matching
`material_text_documents.material_ref_key`. Phase 10 does not introduce a
separate `document_id`.

Rebuild commands keep the document row and FTS row aligned by
`material_ref_key`.

The implementation must not assume `material_ref_key` is unique inside the FTS
table. Rebuilding a document must delete existing FTS rows for that
`material_ref_key` before inserting the new FTS row.

Phase 10 tests may verify raw SQL `MATCH` behavior against the FTS table. They
must not implement or expose a query engine.

### Rebuild Commands

Phase 10 should provide database-owned rebuild commands for:

```text
rebuildMaterialTextDocument({ materialRef })
rebuildMaterialTextDocuments({ materialRefs })
```

The command factory receives `now` as an explicit dependency:

```text
createMaterialTextProjectionCommands({ db, now })
```

`now` supplies the ISO timestamp written to `updated_at`. Tests may pass a
fixed ISO string; runtime composition may pass the current ISO timestamp.
Rebuild command implementation should not read global time directly.

The first command input shapes are:

```ts
type CreateMaterialTextProjectionCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
};

type RebuildMaterialTextDocumentInput = {
  materialRef: Ref;
};

type RebuildMaterialTextDocumentsInput = {
  materialRefs: readonly Ref[];
};
```

Single-material rebuild returns an internal summary:

```ts
type MaterialTextProjectionCommands = {
  rebuildMaterialTextDocument(
    input: RebuildMaterialTextDocumentInput,
  ): RebuildMaterialTextDocumentSummary;
  rebuildMaterialTextDocuments(
    input: RebuildMaterialTextDocumentsInput,
  ): RebuildMaterialTextDocumentsSummary;
};

type RebuildMaterialTextDocumentSummary = {
  materialRefKey: string;
  outcome: "rebuilt" | "deleted";
};
```

Batch rebuild returns an internal summary:

```ts
type RebuildMaterialTextDocumentsSummary = {
  processedMaterialCount: number;
  rebuiltDocumentCount: number;
  deletedDocumentCount: number;
  outcomes: readonly RebuildMaterialTextDocumentSummary[];
};
```

The batch command processes only caller-supplied `materialRefs`. Phase 10 does
not introduce a full database scan command for all active materials.
Batch input is deduped by `materialRefKey` before processing;
`processedMaterialCount` counts the deduped material ref count.
After dedupe, batch processing order is `materialRefKey ASC`. `outcomes`
preserves that deterministic processing order.
An empty `materialRefs` batch is a valid no-op and returns zero counts with an
empty `outcomes` array.

The commands are projection maintenance commands only. They do not write source,
material, canonical, owner relation, source library, collection, query, or
presentation facts.

Text projection is not owner-scoped. Rebuild inputs must not include
`ownerScope`.

Phase 10 does not implement dirty projection marking, scheduler/worker
orchestration, or automatic import-path refresh.

### Internal Read Port

Phase 10 should provide a narrow internal read port:

```ts
createMaterialTextProjectionRecords({ db })
```

The read-port factory input shape is:

```ts
type CreateMaterialTextProjectionRecordsInput = {
  db: MusicDatabaseContext;
};
```

First methods:

```ts
type MaterialTextProjectionReadPort = {
  getMaterialTextDocument(
    input: GetMaterialTextDocumentInput,
  ): MaterialTextDocumentRecord | undefined;
  matchMaterialTextDocuments(
    input: MatchMaterialTextDocumentsInput,
  ): readonly MaterialTextMatchRecord[];
};

type GetMaterialTextDocumentInput = {
  materialRef: Ref;
};
```

The first match input/output shapes are:

```ts
type MatchMaterialTextDocumentsInput = {
  text: string;
  limit?: number;
};

type MaterialTextDocumentRecord = {
  materialRefKey: string;
  materialKind: MaterialEntityKind;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
  searchText: string;
  documentJson: string;
  updatedAt: string;
};

type MaterialTextMatchRecord = {
  materialRefKey: string;
  materialKind: MaterialEntityKind;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
};
```

`limit` defaults to 20 and must be a positive integer no greater than 100.

`text` is normalized with the same first-version text normalization used by
documents: trim, collapse whitespace, `NFKC`, and lowercase. Empty text after
normalization is invalid.

Match input is treated as plain text, not raw SQLite FTS syntax. After
normalization, split text on whitespace, wrap each token as a quoted FTS phrase
token, escape embedded double quotes by doubling them, and join tokens with
`AND`. For example, `long season` becomes `"long" AND "season"`, not a phrase
query or caller-supplied FTS expression. Caller text must never be passed
directly into `MATCH`.

Phase 10 uses SQLite `unicode61` and whitespace-token `AND` query construction
only. It does not solve CJK segmentation, transliteration, pinyin/kana/romaji
aliases, fuzzy matching, or typo tolerance.

This internal match uses strict conjunctive token matching. Broader OR recall,
field weighting, phrase search, typo tolerance, and semantic expansion belong
to later Music Intelligence query phases.

`matchMaterialTextDocuments` is an internal FTS read helper, not a query engine.
It uses `material_text_fts` for `MATCH` and joins
`material_text_documents` by `material_ref_key` to return `materialKind` and
stored text fields. FTS rows alone are not the source of truth for match
records. It does not join owner catalog pools, compute ranking policy, expose
public query hits, or shape Stage Interface output.

`matchMaterialTextDocuments` is a global owner-neutral text-index probe. It
must not be used as a user-facing search result source without a later
owner-catalog join.

Match result ordering is deterministic and ranking-free in Phase 10. Results
should be ordered by `material_ref_key ASC`; query relevance ranking belongs to
a later Music Intelligence query phase.

Match records should not return `searchText`. `search_text` is the combined
document read/debug field; callers that need full projection details can call
`getMaterialTextDocument`.

### Validation Error

Phase 10 validation failures use `MusicDataPlatformError`.

Add only this Phase 10 error code unless implementation proves another code is
necessary:

```text
music_data.material_text_projection_invalid
```

Missing documents are represented by `undefined` from the read port.
Single-material rebuild of a missing or non-active material returns
`outcome: "deleted"` after ensuring no projection rows remain.

An active material rebuild returns `outcome: "rebuilt"` and writes a
`material_text_documents` row even when all projected text fields are empty.
Empty active documents do not match non-empty FTS queries, but they still
represent a completed projection for the active material.

### Bound Sources

For one material, all currently bound source entities may contribute to the
text document.

The projection must normalize and dedupe source contributions by field before
storing text. Primary source contributions are ordered first, but duplicate
source text must not inflate the document.

If `material.primarySourceRef` exists and is currently bound to the material,
that source's contributions use source label `primary_source`. All other
current bound sources use source label `bound_source`. If `primarySourceRef` is
missing or not currently bound, all bound sources use `bound_source`.

Current bound sources are determined from `source_material_bindings` joined to
`source_records`, not from `material.entity.sourceRefs` alone.
`material.entity.primarySourceRef` is used only to label a currently bound
source as `primary_source` when that source ref is present in
`source_material_bindings`.

Do not use source-library membership as a text source. Source-library
membership is owner fact state, not source identity text.

### Field-Level Normalization And Dedupe

Text normalization and dedupe are field-level:

- title values dedupe inside `title_text`;
- artist values dedupe inside `artist_text`;
- album values dedupe inside `album_text`;
- version values dedupe inside `version_text`;
- aliases dedupe inside `alias_text`.

Phase 10 normalization uses only these first-version rules:

- trim;
- collapse whitespace;
- Unicode normalize to `NFKC`;
- lowercase with JavaScript `String.prototype.toLowerCase()`;
- dedupe by normalized value per field.

Do not use locale-dependent lowercasing such as `toLocaleLowerCase()` in Phase
10 normalization.

Text columns store normalized-deduped searchable text, not final display
wording and not raw entity JSON.

When one text column has multiple values, join them with newlines. Sort values
deterministically by contribution priority and then normalized value.

Phase 10 contribution priority is:

```text
primary_source
bound_source
material
canonical
```

`search_text` is the deterministic newline-joined combination of these
searchable fields in this order:

```text
title_text
artist_text
album_text
version_text
alias_text
```

It is not an independent source of projection semantics.

### VersionInfo Projection

`VersionInfo` participates in material text projection.

Project both:

- `VersionInfo.label`, for source/material/canonical version wording such as
  `2014 Remaster` or `Live at Wembley`;
- `VersionInfo.tags`, for normalized version categories such as `remaster`,
  `live`, `remix`, or `unplugged`.

Version text belongs in `version_text` and may be included in `search_text`.
It must not be copied into `title_text` merely because it is useful for search.

`MaterialEntity.versionInfo` contributes with source label `material`.
`SourceEntity.versionInfo` contributes with source label `primary_source` or
`bound_source` according to the bound source label. `CanonicalEntity.versionInfo`
contributes with source label `canonical`.

Phase 10 does not parse titles to infer version tags. It only projects existing
structured `VersionInfo`.

### Canonical Text

Canonical text contributes only when the material has a confirmed active
canonical binding through its current `canonicalRef`.

A confirmed active canonical binding means all of:

- `material.entity.identityStatus === "canonical_confirmed"`;
- `material.entity.canonicalRef` exists;
- the canonical record exists;
- `canonicalRecord.status === "active"`.

Confirmed canonical `label`, `aliases`, and `versionInfo` may contribute to the
text document. Unconfirmed canonical candidates, review evidence, and future
canonical maintenance proposals must not contribute.

### Kind-Aware Field Mapping

Map source and canonical text to searchable fields by material kind. Do not use
one generic label field for every kind.

- `recording`: source track title to `title_text`, canonical label to
  `title_text`, artist labels to `artist_text`, album label to `album_text`,
  and canonical aliases to `alias_text`.
- `album`: source album title to `title_text`, artist labels to `artist_text`,
  canonical album label to `title_text`, and canonical aliases to
  `alias_text`.
- `artist`: source artist name to `artist_text`, canonical label to
  `artist_text`, source/canonical aliases to `alias_text`, with `title_text`
  empty.
- `work` and `release`: schema support and fallback only in Phase 10; detailed
  identity-graph or record-collection semantics stay out of scope.

### Non-Active Material Cleanup

Material text projection stores active read-model rows only.

If a single-material rebuild sees a missing, merged, archived, or otherwise
non-active material, it deletes that material's text document and synchronized
FTS row. It must not preserve an inactive document row or add a
`document_status` field.

Missing material is treated as the same cleanup case and returns
`outcome: "deleted"`; Phase 10 does not introduce a not-found error for
projection rebuild.

Batch rebuild applies the same cleanup rule for each requested material ref.
Rows for materials outside the requested refs are left untouched.

Do not remap loser material documents to winner materials in the text
projection command. Winner material documents are produced by rebuilding the
winner material from current facts; loser documents are obsolete projection
rows and should be removed.

### FTS Maintenance

Phase 10 uses explicit rebuild commands to maintain both
`material_text_documents` and `material_text_fts`.

Do not use SQLite triggers or external-content FTS in Phase 10. Text projection
rebuild commands should visibly write or delete both the document row and its
FTS row in the command boundary.

For rebuilt documents, command implementation should delete existing
`material_text_fts` rows for the material ref before inserting the replacement
FTS row. For deleted documents, command implementation should delete from both
`material_text_documents` and `material_text_fts` by `material_ref_key`.

Active empty documents still synchronize FTS by deleting old FTS rows and
inserting one replacement empty FTS row. This keeps document rows and FTS rows
aligned by `material_ref_key`.

Triggers may be reconsidered in a later dirty-projection phase, but only for
marking projection targets dirty or enqueueing rebuild work. They should not
perform complex material text rebuild logic, normalization, dedupe, canonical
joins, or FTS synchronization directly.

### Material-Scoped Text Only

Material text projection is keyed by `material_ref_key` and represents
material/source/canonical searchable text.

Later query phases can join owner catalog pools with material text projection.
Phase 10 must keep these read models separate:

```text
material_text_documents -> searchable material/source/canonical text
owner_material_catalog_view -> owner-visible material pool
```

### Guards

Phase 10 must add or update architecture guards for:

- active-tree allowlist of the intended Music Data Platform text projection
  files;
- Music Data Platform forbidden imports, including Music Intelligence, Stage
  Interface, presentation, and provider implementation roots;
- Stage Interface not importing material text projection record shapes.

Behavior/type tests should also pin:

- `MaterialTextDocumentRecord` key set;
- `MaterialTextMatchRecord` key set;
- `MaterialTextProjectionCommands` key set;
- `MaterialTextProjectionReadPort` key set;
- command/read factory input and rebuild input key sets;
- rebuild summary key sets;
- `material_text_documents` `material_kind` check and `material_ref_key`
  foreign key;
- FTS column set, including that `search_text` is not indexed;
- material kind is not included in `documentJson`;
- deterministic `documentJson` field key order and contribution key order;
- match input validation for empty text and invalid limits;
- locale-independent lowercase normalization.

### File Split

Phase 10 should use this minimal Music Data Platform file split:

```text
src/music_data_platform/material_text_projection_schema.ts
src/music_data_platform/material_text_projection_records.ts
src/music_data_platform/material_text_projection_commands.ts
src/music_data_platform/material_text_normalization.ts
test/formal/music-data-platform-material-text-projection.test.ts
```

Responsibilities:

- `material_text_projection_schema.ts` owns the document and FTS schema
  contribution;
- `material_text_projection_records.ts` owns the internal read port;
- `material_text_projection_commands.ts` owns rebuild commands;
- `material_text_normalization.ts` owns area-internal text normalization and
  field-level dedupe helpers;
- the formal test file owns behavior, type-shape, and boundary regression
  coverage for this phase.

### Public Area Exports

The Music Data Platform barrel may export the Phase 10 schema contribution,
command factory, read-port factory, and public record/summary/input/output
types needed by internal composition and tests:

```ts
musicDataPlatformMaterialTextProjectionSchema
createMaterialTextProjectionCommands
createMaterialTextProjectionRecords
type MaterialTextDocumentRecord
type MaterialTextMatchRecord
type MaterialTextProjectionCommands
type MaterialTextProjectionReadPort
type CreateMaterialTextProjectionCommandsInput
type CreateMaterialTextProjectionRecordsInput
type GetMaterialTextDocumentInput
type RebuildMaterialTextDocumentInput
type RebuildMaterialTextDocumentsInput
type RebuildMaterialTextDocumentSummary
type RebuildMaterialTextDocumentsSummary
type MatchMaterialTextDocumentsInput
```

Do not export normalization/dedupe helpers such as:

```ts
normalizeMaterialText
dedupeTextValues
```

Those helpers remain area-internal implementation details.

### Runtime Schema Wiring

Default Music Data Platform runtime initialization should include the material
text projection schema contribution.

Schema order should remain explicit. Phase 10 should append the text projection
schema after existing Music Data Platform schemas:

```text
musicDataPlatformIdentitySchema
musicDataPlatformSourceLibrarySchema
musicDataPlatformOwnerCatalogEntriesSchema
musicDataPlatformOwnerRelationSchema
musicDataPlatformOwnerCatalogViewSchema
musicDataPlatformMaterialTextProjectionSchema
```

Material text projection schema depends on identity facts semantically, but it
does not depend on owner catalog view contents.

### Rebuild Invocation

Phase 10 provides rebuild commands only.

It does not call material text rebuild from source-library import, identity
commands, owner relation commands, runtime startup, or public tools.

Rebuild invocation policy belongs to a later dirty-projection/background
maintenance phase.

## Acceptance Tests

Phase 10 behavior tests should cover at least:

- recording text projection: source track title, artist labels, album label,
  confirmed canonical label, and source/material/canonical `VersionInfo` enter
  the expected text fields; FTS can match title, artist, and version tag text;
- album text projection: source album title, artist labels, confirmed canonical
  label, and confirmed canonical aliases enter the expected fields; FTS can
  match alias text;
- artist text projection: source artist name and confirmed canonical label enter
  `artist_text`, and source/canonical aliases enter `alias_text`;
- multiple bound sources: field-level normalization and dedupe are applied,
  and currently bound `primarySourceRef` contribution sorts first;
- bound source truth: projection reads current source bindings from
  `source_material_bindings` joined to `source_records`, and does not treat
  stale `material.entity.sourceRefs` as an independent binding source;
- confirmed canonical binding: canonical label, aliases, and structured
  `VersionInfo` contribute through compact field contribution summaries;
- non-confirmed canonical exclusion: canonical text does not contribute when
  material identity is not `canonical_confirmed`, `canonicalRef` is missing, the
  canonical record is missing, or the canonical record status is not `active`;
- active empty material projection: an active material with no source,
  confirmed active canonical, or version text still rebuilds to an empty
  document with `outcome: "rebuilt"` and one replacement empty FTS row;
- material merge/archive cleanup: rebuilding a non-active material deletes its
  document and FTS row, and batch rebuild applies the same cleanup to requested
  refs;
- FTS maintenance cleanup: after rebuilding a merged loser or archived material,
  `getMaterialTextDocument` returns `undefined` and `MATCH` by loser-only text
  returns no loser row;
- repeated rebuild FTS cleanup: rebuilding the same material twice and matching
  by title returns exactly one row;
- match input escaping: inputs such as `foo OR bar`, `foo AND bar`,
  `foo NOT bar`, `NEAR(foo bar)`, `abc*`, `-title`, `"quoted"`, and `a:b` are
  treated as ordinary text tokens, not FTS operators, prefix queries, negation,
  phrase syntax, or column queries;
- strict conjunctive match: multi-token input requires all normalized tokens to
  match in Phase 10.
