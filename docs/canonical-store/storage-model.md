# Canonical Store Storage Model

## Purpose

Canonical Store owns MineMusic identity anchors. It is not a source catalog,
player database, recommender, or preference store.

Project contracts define the public shape in:

- `docs/mvp/interface-contracts.md`
- `docs/mvp/module-interfaces.md`
- `docs/mvp/module-boundaries.md`
- `ARCHITECTURE.md`

The storage model below keeps those boundaries explicit:

```text
MineMusic canonical identity
  <- external source / knowledge evidence
  <- aliases and labels
  <- merge / rejection state

not:
  playback availability
  provider account state
  user preference
  recommendation scoring
```

## External References

This model follows the shape of established music metadata systems without
copying them wholesale:

- MusicBrainz separates core music entities such as artist, recording, release,
  release group, work, and URL, and represents relationships between them.
- MusicBrainz treats aliases and external URLs as complementary/relationship
  data, not as the entity itself.
- ListenBrainz listen payloads keep identifiers such as `recording_mbid`,
  `release_mbid`, `release_group_mbid`, and external IDs as distinct metadata.
- beets persists music-library metadata in SQLite through a small database
  abstraction.
- Navidrome persistent IDs prefer stable external identifiers such as
  MusicBrainz IDs when available, then fall back to configurable metadata.

Reference links:

- MusicBrainz Database: https://musicbrainz.org/doc/MusicBrainz_Database
- MusicBrainz Schema: https://musicbrainz.org/doc/MusicBrainz_Database/Schema
- ListenBrainz JSON payloads: https://listenbrainz.readthedocs.io/en/latest/users/json.html
- beets Library Database API: https://docs.beets.io/en/v2.0.0/dev/library.html
- Navidrome Persistent IDs: https://www.navidrome.org/docs/usage/configuration/persistent-ids/

## Design Principles

1. MineMusic canonical refs are MineMusic-owned.
2. Source refs never become canonical authority by accident.
3. External refs are evidence and lookup keys.
4. `recording`, `work`, `artist`, `release_group`, and `release` should stay
   distinct.
5. A source `track` is usually source-context evidence, not a MineMusic core
   entity kind.
6. Provisional identities are allowed, but they must be visibly provisional.
7. Merges and rejections must leave redirects or explicit terminal state.
8. Playability remains outside Canonical Store.

## Recommended First Durable Store

Use SQLite for the first durable Canonical Store implementation.

Reason:

- Canonical identity needs uniqueness constraints.
- External-ref conflict detection should be enforced by the store.
- `get`, label lookup, alias lookup, and external-ref lookup need indexes.
- Transactions matter when creating provisional records with evidence.
- SQLite is enough for local MVP persistence and testable without a service.

JSON files are acceptable for export/debug snapshots, but not for the primary
canonical identity store.

## Implemented Scope

The current durable implementation uses this SQLite model for:

- `canonical_entities`
- `canonical_external_refs`
- `canonical_aliases`

`canonical_redirects` remains design-only until merge behavior exists.

Implementation files:

- `src/storage/sqlite/canonical-schema.ts`
- `src/storage/sqlite/canonical-repository.ts`
- `src/storage/sqlite/index.ts`

Verification files:

- `test/storage/sqlite-canonical-store.test.ts`
- `test/integration/canonical-persistence.test.ts`

## Tables

### `canonical_entities`

Stores MineMusic-owned identity anchors.

```sql
CREATE TABLE canonical_entities (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL DEFAULT 'minemusic',
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  status TEXT NOT NULL,
  merged_into_id TEXT,
  disambiguation TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('active', 'provisional', 'merged', 'rejected'))
);
```

Indexes:

```sql
CREATE INDEX canonical_entities_kind_label_idx
  ON canonical_entities(kind, normalized_label);

CREATE INDEX canonical_entities_status_idx
  ON canonical_entities(status);
```

Notes:

- `id` is the MineMusic local id.
- Public `Ref` is reconstructed as `{ namespace, kind, id, label }`.
- `merged_into_id` is set only when `status = 'merged'`.
- `metadata_json` is for non-query-critical notes only.

### `canonical_external_refs`

Stores source and knowledge evidence attached to a canonical entity.

```sql
CREATE TABLE canonical_external_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  label TEXT,
  url TEXT,
  confidence REAL,
  evidence_event_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
  UNIQUE(namespace, kind, external_id)
);
```

Indexes:

```sql
CREATE INDEX canonical_external_refs_canonical_idx
  ON canonical_external_refs(canonical_id);
```

Notes:

- The uniqueness constraint is the durable version of
  `canonical.external_ref_conflict`.
- `source:netease / track / 22644323` maps to one canonical entity at most.
- The row does not imply the source item is currently playable.

### `canonical_aliases`

Stores alternate labels for lookup and display matching.

```sql
CREATE TABLE canonical_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  locale TEXT,
  source TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
  UNIQUE(canonical_id, normalized_alias)
);
```

Indexes:

```sql
CREATE INDEX canonical_aliases_lookup_idx
  ON canonical_aliases(normalized_alias);
```

### `canonical_relations`

Stores provisional relation context attached to a canonical subject. Imported
recording hints use this table for relations such as `performed_by`,
`appears_on_release`, and `has_duration_ms`. When provider hints include
stable source refs for artists or releases, `object_ref_json` points at the
resolved canonical artist/release record; Library Import creates a provisional
target only when no source-ref binding exists. Label-only hints can still be
retained in `object_label`.

```sql
CREATE TABLE canonical_relations (
  id TEXT PRIMARY KEY,
  subject_namespace TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_kind TEXT NOT NULL,
  object_ref_json TEXT,
  object_label TEXT,
  object_value_json TEXT,
  source_namespace TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_ref_json TEXT NOT NULL,
  provider_id TEXT,
  batch_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Relation rows are source-bound provisional context. They do not confirm that two
source refs identify the same or different real-world recording.

### `canonical_redirects`

Optional for the first implementation, but required before real merge behavior.

```sql
CREATE TABLE canonical_redirects (
  old_canonical_id TEXT PRIMARY KEY,
  new_canonical_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
```

## Port Mapping

### `get({ ref })`

Lookup:

```sql
SELECT *
FROM canonical_entities
WHERE namespace = ?
  AND kind = ?
  AND id = ?;
```

If the entity is `merged`, implementation may either return the merged record
as-is or follow `canonical_redirects`. The MVP should document whichever
behavior it chooses before exposing merge operations.

### `findByLabel({ label, kind })`

Lookup current identities by normalized primary label and aliases:

```text
canonical_entities.normalized_label
UNION
canonical_aliases.normalized_alias
```

Return only `active` and `provisional` entities by default. `merged` and
`rejected` records are historical state, not normal lookup hits.

### `resolveExternalRef({ ref })`

Lookup:

```sql
SELECT canonical_entities.*
FROM canonical_external_refs
JOIN canonical_entities
  ON canonical_entities.id = canonical_external_refs.canonical_id
WHERE canonical_external_refs.namespace = ?
  AND canonical_external_refs.kind = ?
  AND canonical_external_refs.external_id = ?
  AND canonical_entities.status IN ('active', 'provisional');
```

This is not intelligent identity resolution. It is a durable reverse lookup for
external refs already attached as evidence.

### `createProvisional({ kind, label, evidence })`

Run in one transaction:

1. Normalize label for storage and later candidate lookup.
2. For each evidence ref, try `resolveExternalRef`.
3. If evidence resolves to an active/provisional entity, return that entity.
4. Do not automatically reuse records by label or alias alone.
5. Insert a `provisional` row in `canonical_entities`.
6. Insert evidence refs into `canonical_external_refs`.
7. Emit or record `canonical.provisional.created` when domain events are wired.

Separate source refs may still refer to the same real-world recording. The
resulting provisional rows are source-bound identity candidates until a later
review or stronger matching process merges them.

### `attachExternalRef({ canonicalRef, externalRef })`

Run in one transaction:

1. Ensure the canonical entity exists and is `active` or `provisional`.
2. Insert into `canonical_external_refs`.
3. If `UNIQUE(namespace, kind, external_id)` fails, return
   `canonical.external_ref_conflict`.
4. Emit or record `canonical.external_ref.attached` when domain events are
   wired.

## Migration Path

1. Keep the current `CanonicalStorePort`.
2. Add a SQLite-backed `CanonicalRecordRepository` or a dedicated
   Canonical Store storage adapter behind the same port.
3. Preserve in-memory repositories for deterministic unit tests.
4. Add persistence tests:
   - create provisional.
   - reopen store.
   - `get` returns the record.
   - `resolveExternalRef` returns the record.
   - duplicate external ref fails after reopen.
5. Only after that, consider alias search, merge operations, and richer entity
   relationships.

Track implementation progress for this migration in
`docs/canonical-store/progress.md`.

## Open Questions

- Whether `track` should ever become a MineMusic canonical kind, or remain only
  source-context evidence for `recording`.
- Whether merge redirects should be followed inside `get` or exposed as a
  separate status for callers to handle.
- How much MusicBrainz-style entity relationship modeling MineMusic needs before
  the first durable memory implementation.
