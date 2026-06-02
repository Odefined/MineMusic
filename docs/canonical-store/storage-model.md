# Canonical Store Storage Model

## Purpose

Canonical Store owns MineMusic identity anchors. It is not a source catalog,
player database, recommender, or preference store.

Current public contracts and architecture boundaries are defined in:

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `ARCHITECTURE.md`
- `docs/canonical-store/design.md`
- `docs/canonical-store/ports.md`

The storage model below keeps those boundaries explicit:

```text
MineMusic canonical identity
  <- source-ref / knowledge evidence
  <- aliases and labels
  <- merge / rejection state

not:
  playback availability
  provider account state
  user preference
  recommendation scoring
```

## Source References

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
3. Source refs are evidence and lookup keys.
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
- Source-ref conflict detection should be enforced by the store.
- `get`, label lookup, alias lookup, and source-ref lookup need indexes.
- Transactions matter when creating provisional records with evidence.
- SQLite is enough for local MVP persistence and testable without a service.

JSON files are acceptable for export/debug snapshots, but not for the primary
canonical identity store.

## Implemented Scope

The current durable implementation uses this SQLite model for:

- `canonical_entities`
- `canonical_source_refs`
- `canonical_aliases`
- `canonical_relations`

Canonical source refs are current canonical evidence. They are not the ordinary
Source Library binding path; Source Entity Store and Confirmed Canonical
Bindings own that path. Current Source Grounding still calls
`CanonicalStorePort.resolveSourceRef`, which is tracked as `AI-002`.

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

### `canonical_source_refs`

Stores source and knowledge evidence attached to a canonical entity.

```sql
CREATE TABLE canonical_source_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  label TEXT,
  url TEXT,
  confidence REAL,
  evidence_event_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
  UNIQUE(namespace, kind, source_id)
);
```

Indexes:

```sql
CREATE INDEX canonical_source_refs_canonical_idx
  ON canonical_source_refs(canonical_id);
```

Notes:

- The uniqueness constraint is the durable version of
  `canonical.source_ref_conflict`.
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

### `canonical_provisional_hints`

Stores source-side review facts attached to a provisional canonical subject and
provider source ref. This is separate from `canonical_relations` because facts
such as a source album track position are useful review context, but are not
durable canonical music relationships.

Imported recording context can include title, artist labels, release label,
release source ref, duration, and platform-neutral track position.

```sql
CREATE TABLE canonical_provisional_hints (
  id TEXT PRIMARY KEY,
  subject_namespace TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_namespace TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_ref_json TEXT NOT NULL,
  provider_id TEXT,
  batch_id TEXT,
  facts_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Indexes:

```sql
CREATE INDEX canonical_provisional_hints_subject_idx
  ON canonical_provisional_hints(subject_namespace, subject_kind, subject_id, kind);

CREATE INDEX canonical_provisional_hints_source_idx
  ON canonical_provisional_hints(source_namespace, source_kind, source_id);
```

Rows use deterministic ids from subject ref, source ref, and hint kind so
repeated imports update the same review hint. `source_recording_context` rows
are valid only for current provisional recordings.

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

### `resolveSourceRef({ ref })`

Lookup:

```sql
SELECT canonical_entities.*
FROM canonical_source_refs
JOIN canonical_entities
  ON canonical_entities.id = canonical_source_refs.canonical_id
WHERE canonical_source_refs.namespace = ?
  AND canonical_source_refs.kind = ?
  AND canonical_source_refs.source_id = ?
  AND canonical_entities.status IN ('active', 'provisional');
```

This is not intelligent identity resolution. It is a durable reverse lookup for
source refs already attached as evidence.

SQLite-backed repositories should use this indexed lookup directly for
`resolveSourceRef`, provisional evidence reuse, and source-ref conflict checks.
In-memory or minimal repositories may still fall back to listing records.

### `createProvisional({ kind, label, evidence })`

Run in one transaction:

1. Normalize label for storage and later candidate lookup.
2. For each evidence ref, try `resolveSourceRef`.
3. If evidence resolves to an active/provisional entity, return that entity.
4. Do not automatically reuse records by label or alias alone.
5. Insert a `provisional` row in `canonical_entities`.
6. Insert evidence refs into `canonical_source_refs`.
7. Emit or record `canonical.provisional.created` when domain events are wired.

Separate source refs may still refer to the same real-world recording. The
resulting provisional rows are source-bound identity candidates until a later
review or stronger matching process merges them.

### `attachSourceRef({ canonicalRef, sourceRef })`

Run in one transaction:

1. Ensure the canonical entity exists and is `active` or `provisional`.
2. Insert into `canonical_source_refs`.
3. If `UNIQUE(namespace, kind, source_id)` fails, return
   `canonical.source_ref_conflict`.
4. Emit or record `canonical.source_ref.attached` when domain events are
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
   - `resolveSourceRef` returns the record.
   - duplicate source ref fails after reopen.
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
