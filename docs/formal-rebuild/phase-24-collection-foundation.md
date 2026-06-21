# Phase 24 Collection Foundation — Decisions

> Status: Planning (decisions grilled and locked; slice implementation plans
> pending).
> Owner: Music Data Platform.
> Spec authority: This is a planning and decision record, not global architecture
> authority. Architecture facts live in `ARCHITECTURE.md`, `ADR-0007`, the formal
> glossary, and `ADR-0031`..`ADR-0036`. Slice implementation plans (files, guards,
> verification, stopping conditions) will get their own slice-specific specs.

## Why This Document

Collection is the only owner-scoped write capability in Music Data Platform that
is not yet built. The 2026-06-02 Collection Service plan
(`docs/archive/collection-service/`) was archived unexecuted; its responsibilities
were split and absorbed elsewhere:

- saved / favorite / blocked + blocked filtering → `owner_material_relations`
  (Phase 9) + the catalog view's `NOT EXISTS blocked`;
- owner-relation editing tools → `library.relation.*` (Phase 19);
- catalog reads → `library.catalog.*` (Phase 23).

What remains genuinely un-built is the narrow formal Collection itself: a
user-named organizing container over materials.

The read side is pre-disposed:

- `owner_material_entries.entry_kind` already admits `'collection'`
  (`owner_catalog_schema.ts:18`);
- the catalog view aggregates entry-kind-agnostic and excludes blocked for free
  (`owner_catalog_schema.ts:77-84`);
- `library.catalog` pre-declares `{ kind: "collection", id }` as a future scope
  (`docs/formal-rebuild/phase-23-library-catalog-tools-implementation-plan.md:28`,
  glossary `Library Catalog`).

This document records the decisions settled by a grilling pass. Only grilled
decisions are recorded as locked. Slice implementation plans are deferred to
slice-specific specs.

Structural note: unlike phases 8/9, Phase 24 ships its foundation as a single
decision record rather than a paired `phase-N-foundation.md` +
`phase-N-...-implementation-plan.md`. Slice-specific implementation plans
(`phase-24-collection-foundation-slice-N-implementation-plan.md`) will be
created per slice, mirroring the implementation-plan half of the phase-8/9
split. This decision record therefore intentionally owns only the locked
decisions, invariants, deferrals, and the slice skeleton; the full
phase-document section set (non-goals, allowed reads/writes, forbidden
writes/imports, guards, verification, acceptance, stopping condition) is owned
by each slice's implementation plan, not duplicated here.

## Decision Status Convention

Each decision is marked with its basis:

- **[grilled]** — settled by user sign-off in the grilling pass;
- **[code-forced]** — settled by existing code precedent (no product latitude);
- **[invariant]** — a stated invariant to be enforced by spec text and a guard.

A decision may carry more than one basis tag when more than one applies (for
example, a code-forced mechanic the user also reviewed and confirmed).

Terminology: **scope** means a Library Catalog read scope (owner-scope-bound),
distinct from **area** (an Agent Work Basis ownership area per `ADR-0033`) —
the catalog "collection scope" and the OCC "Collection area" are different
notions. **kind** unqualified means material kind (`MaterialEntityKind`);
`collection_kind` is always qualified.

## Confirmed Decisions

### D1. Product frame and first writer — [grilled]

The first concrete use of a Collection is: the user instructs the Main Agent
(in-process, explicit user intent) to organize a themed set of materials into a
named collection ("put my recent favorite jazz tracks and a few jazz artists
into a 'late-night jazz' collection; Radio can pick from it later"). The agent
creates the collection and adds items one at a time. Downstream consumption is
read-only: the agent browses/samples via `library.catalog`, and Radio (Phase B)
uses the collection as an autoplay source population.

Consequences locked by this frame:

- **First writer = Main Agent acting on explicit user instruction.** Not
  human-via-Web (Phase C, too late to validate the foundation), not agent-
  autonomous (no user-intent trigger, risks the system-collection trap), not
  import-mirror (that is source_library's territory).
- **Radio reads collections, it does not write them.** Therefore in Phase A/B
  the Collection area has exactly one writer (Main Agent). Per-area Agent Work
  Basis OCC is latent and only activates when a second writer lands in Phase C
  (the human). Slice-level concurrency work is deferred to Phase C.

### D2. Identity model — [grilled]

The Collection's identity is a system-generated opaque id; the user-given `name`
is a **mutable display label, not part of identity**.

- `collection_ref = { namespace: "collection", kind: <collection_kind>, id:
  "c_" + randomUUID() }`. The id is a non-deterministic `randomUUID`, following
  the `material_ref` pattern (`material_ref_factory.ts:35`); it is NOT a
  deterministic digest, because Collection has no stable business natural key to
  digest (name is mutable, and Q1's mixed-kind means there is no single material
  kind to key on). Non-deterministic ids are an established project pattern
  (`material_ref`, `mh_`, `lc_`, `dl_`, `srs_`), so this is not a deviation and
  needs no new ADR.
- `renameCollection` exists and changes only the `name` column; the `ref_key`,
  all `collection_items` FKs, projection `entry_ref_key`, and catalog scope
  handles are unchanged.
- `create` is **non-idempotent**: a second `create` with an existing
  `(owner_scope, name)` fails on the UNIQUE constraint and the caller (agent)
  must `list`-then-decide. This mirrors `library.relation`, where idempotency
  lives at the edit layer, not the create layer.

### D3. `collection_kind` — [grilled]

Every Collection **must declare a `collection_kind`**. The value domain is
`{ recording, album, artist, work, release, mixed }` (any single material kind
or mixed).

- `collection_items` membership must match the kind: adding an item whose
  `material.kind` disagrees with a single-kind collection is rejected as
  `kind_mismatch` (the archived plan's still-valid error code). `mixed` admits
  any material kind.
- `collection_ref.kind` carries the `collection_kind` value (consistent with
  `relation_ref.kind = relation_kind` and `source_library_ref.kind =
  library_kind`).
- `playlist` is **not** a separate entity or a type column. **A playlist is a
  `collection_kind = "recording"` Collection.** The only structural difference
  between a playlist and a generic collection is its membership constraint
  (recording-only), which is already expressed exactly by `collection_kind`.
  Whether a recording-only Collection is later played back or written back to an
  external provider is an orthogonal capability layer (Effect Boundary /
  playback), not an identity concern, and does not affect its Collection
  membership.

### D4. Ordering — [grilled]

Collection owns ordering (`ADR-0007`: "grouping, ordering, description,
collection-local notes"). v1 uses **explicit `position` + `move`**:

- `collection_items` has a `position INTEGER NOT NULL` column.
- `add` appends at `position = max(active position) + 1`.
- `move` reorders; v1 rebalance strategy is the simplest form: after a move, all
  active items of that collection are rewritten to consecutive integers
  (`1, 2, 3, ...`). Gap-based / fractional-index rebalancing is deferred.
- Catalog browse over a collection scope orders by `position`, not by
  `recently_added_at`. This requires Slice 3 to add a position sort basis to the
  catalog read path (Slice 3 open implementation question).

### D5. Removal lifecycle — [grilled]

`collections` and `collection_items` use **soft-remove**, mirroring
`owner_material_relations`:

- `status` column with values `active | removed` (a collection may also use
  `archived`).
- A partial-unique index `WHERE status = 'active'` enforces idempotent
  membership (re-adding a removed item flips it back to active rather than
  creating a duplicate row).
- `remove` / `delete` still trigger projection invalidation, so the rebuild
  naturally drops the entry.
- **No `restore` tool in v1.** Restore is later maintenance. Soft-remove's v1
  justification is auditable membership history plus projection invalidation on
  removal — not restore.
- `delete` a collection marks the collection `removed`; item rows persist but the
  collection is invisible in the catalog. `remove` an item marks that item
  `removed`; the collection itself is unaffected.

### D6. Projection correctness — [code-forced + grilled]

Collection must integrate into projection maintenance with **two** kinds,
mirroring source_library's scope-level + material-scoped split:

- `owner_catalog_collection` (scope-level): a Collection's own writes
  (`create` / `rename` / `add` / `remove` / `move` / `delete`) dirty this and
  rebuild the whole collection's entries.
- `owner_catalog_collection_material` (material-scoped): **must be added to
  `materialScopedTargets`** (`projection_maintenance_commands.ts:581-598`).

Why `materialScopedTargets` inclusion is mandatory (not optional): the rebuild
SQL for collection entries, like the existing source_library/relation rebuilds,
filters `WHERE m.lifecycle_status = 'active'`
(`owner_catalog_projection.ts:143`, `:372`). When a material goes inactive
(`material_record_written` → `materialScopedTargets`), the collection entry
pointing at it must be rebuilt or it goes stale. Without collection in
`materialScopedTargets`, that rebuild never fires — a silent staleness bug.

`source_material_binding_written` (`projection_maintenance_commands.ts:525-548`)
must **filter out** `owner_catalog_collection_material`, exactly as it already
filters out `owner_catalog_relation_material` (`:544-546`), because Collection
membership keys on `material_ref_key` and is indifferent to which source a
material is bound to. `material_record_written` does NOT filter it (lifecycle
change must re-dirty collection entries).

### D7. Concentration (read side) — [code-forced]

`library.catalog.summary` concentration is already per-material-kind partitioned
(`catalog.ts:927-962`, four fixed signals: `recording_artist`,
`recording_album`, `album_artist`, `artist_item`), and the `library` baseline
is already a mixed scope that runs this. **Collection follows the library
baseline: zero new concentration code.** A mixed Collection's members are
auto-partitioned by material kind (recordings contribute to recording signals,
albums to album signals, etc.).

**Catalog boundary:** `LibraryCatalogMaterialKind` is
`recording | album | artist` only (`library_catalog_read.ts:7`); the library
baseline SQL is `m.kind IN ('recording','album','artist')`
(`library_catalog_read.ts:66`). Therefore a `collection_kind = "work"` or
`"release"` Collection is **catalog-invisible**: its members are filtered out
by the catalog read. This matches the library baseline's existing work/release
blind spot. Such Collections remain readable via `library.collection.get` (fact
layer, not catalog). This is accepted as a catalog-side limitation, not a
Collection-side limitation.

### D8. Cursor (read side) — [code-forced]

Collection browse cursors follow the source_library/relation peers: the
`serializableScope` stores the `collectionRefKey` server-side, and the agent
receives only an opaque `lc_${randomUUID()}` cursor id from the
`LookupCursorStore` veil (`lookup_cursor_store.ts:134`, `catalog.ts:388-393`).
The store enforces ownerScope isolation and TTL
(`lookup_cursor_store.ts:111-120`), so the refKey is never agent-visible. No
veil concern; no new decision.

### D9. Agent tooling surface — [grilled]

A new tool family `library.collection.*` (three-segment, consistent with
`library.relation.*`, `library.catalog.*`, `music.experience.*`). Tool set,
one-action-per-tool (no generic `set`), mirroring `library.relation.*`:

- `library.collection.get` (read)
- `library.collection.create`
- `library.collection.rename`
- `library.collection.add`
- `library.collection.remove`
- `library.collection.move`
- `library.collection.delete`

Each edit returns the post-edit collection state; `remove` of an already-absent
item is idempotent at the agent boundary (succeeds, reports unchanged state),
mirroring `library.relation.unsave`. Outputs are compact and follow the Public
Handle Veil: no `materialRef`, no `collection_ref_key`, no `position`, no raw
rows in agent-facing output. `library.collection.get` returns compact per-item
public handles (label + availability); the Slice 4 open question is
whole-vs-paged granularity, not whether per-item signal is emitted.

## Invariants — [invariant]

These are stated invariants the spec text must declare and a guard must enforce.
They were not open product questions; they are consequences recorded for
durability.

1. **`material_ref_key` immutability.** `collection_items.material_ref_key` is
   immutable post-admission. Canonical re-resolution, material merge, or source
   re-import never relocates Collection membership. There is no canonicalRef
   sync step. Guard: a test asserting membership is unchanged after a material's
   canonical binding changes.
2. **Block does not remove membership.** Blocking a material does not touch its
   collection membership rows. Read-side exclusion comes from the catalog view's
   `NOT EXISTS (... relation_kind = 'blocked' ...)`. Unblock re-surfaces the
   member automatically. Guard: a blocked collection member is excluded via the
   view and the `collection_items` row is preserved.
3. **`library.collection.get` reads the fact table.** It reads `collection_items`
   directly (not the projection), so a `get` immediately after an `add` returns
   the added item without waiting for the pg-boss rebuild. This mirrors
   `library.relation` returning the fact row.
4. **`membershipSignals` grows a collections branch.**
   `catalog.ts:1017-1056` currently iterates only `sourceLibraries` and
   `relations`. A `collections` branch must be added so a collection scope is
   not silently invisible to `library.catalog.summary`. Guard: summary over a
   collection scope emits a non-empty `membershipSignals` array.
5. **ADR-0035 failure contract for collection targets.** Native retry per
   `ADR-0035`: the final attempt marks the target `failed` (terminal status
   row, no rethrow) and the read model stays stale (fact table authoritative)
   until a subsequent write re-dirties. The literal `retryLimit` is a code
   config value (v1 sets `3`), not ADR-mandated. Scope-level vs per-material
   rebuild granularity must consider retry blast radius.
6. **Facade `assertWorkflowFacingOwnerScope`.** Collection facade methods each
   call `assertWorkflowFacingOwnerScope(commandInput.ownerScope)` at the facade
   layer, mirroring `ownerRelations` (not `identity`, which is unwrapped).
7. **Session Context does not own Collection facts.** Collection state is read
   as an owning-area projection exposed to the in-process agent through Session
   Context's read-model aggregation (`ADR-0031`); Session Context never owns
   Collection facts (`CONTEXT.md`, Session Context section).
8. **Write boundary.** Only the owning Collection command writes Collection
   truth (`collection_commands.ts`). `collection_records.ts` is a read port
   with zero write tokens (relation-pattern, not repository-pattern). All
   collection SQL writes live in `collection_commands.ts`.

## Premise Correction — materialRef, not canonicalRef

The archived plan and the task framing assumed Collection items are
"canonical-only". This is wrong. Collection items key on `material_ref_key`,
exactly like `owner_material_relations` and `source_library_items`. Authority: `CONTEXT.md`, Collection Service section ("a Collection Item is a
member of that Collection whose product-level target is `materialRef`") and
`ADR-0007` ("organizing container for material refs").

Note: `ADR-0003` (`docs/adr/0003-materialref-backed-collections.md`) reaches the
same conclusion but its own header banner declares it pre-formal evidence
superseded by `ADR-0007` (historical context only). Its body's "Status:
Accepted" is MVP-era and demoted by the banner. Do not cite ADR-0003 as live
authority. See Deferred item: a clean load-bearing citation.

## Deferred

These are explicitly out of v1 and recorded so they are not accidentally
re-litigated:

- **Per-area Agent Work Basis OCC.** Latent in Phase A (single writer);
  activates in Phase C when the human becomes the second writer. Granularity is
  **per-area (whole Collection area)** per `ADR-0033`. Per-Collection revision
  granularity is NOT adopted — it would conflict with `ADR-0033`'s locked
  per-area granularity and would require a new accepted ADR generalizing Work
  Basis revision subdivision before any per-Collection revision enters the
  schema or `WorkbenchActionEnvelope`.
- **Restore.** `library.collection.restore` is later maintenance.
- **Events.** Collection writes do not record events in v1 (Phase 9 kept events
  out of scope). Event shape is decided fresh when a consumer exists.
- **Signal Class / Workbench Action Adapter / typed upstream actions.** Phase C
  concerns, layered when the Web boundary and a second writer land.
- **Explicit rebalance strategy beyond consecutive-integer.** Gap-based /
  fractional-index `move` rebalancing.
- **Work/release catalog visibility.** Catalog is limited to
  recording/album/artist; work/release Collections are catalog-invisible by
  design (follows the library baseline).
- **Clean materialRef-backed citation.** Record a new short ADR (or an
  `ADR-0007` amendment) that states "Collection items key on `material_ref_key`,
  not `canonicalRef`" as live formal authority, rather than leaning on the
  banner-demoted `ADR-0003`.

## Slice Skeleton

Ordering is enforced: writer → projection → catalog scope → tools. Each slice
gets its own implementation spec (files, allowed reads/writes, guards,
verification, stopping condition).

- **Slice 1 — Collection fact table + write boundary.** `collections` +
  `collection_items` schema; the 5-file writer (`collection_ref` / `schema` /
  `records` / `commands` / `service`); facade wiring into
  `source_of_truth_write_commands.ts`; `collection_written` projection
  invalidation kind registered (producer deferred). Validates the writer
  pattern in isolation.
- **Slice 2 — Collection projection producer.** `rebuildCollectionEntries` on
  `OwnerCatalogProjectionCommands`; `dispatchProjectionTarget` case; runtime
  job handler; `materialScopedTargets` + `source_material_binding_written`
  filter updates (D6). Collection entries flow into `owner_material_entries`
  with `entry_kind = 'collection'`; the view picks them up automatically.
- **Slice 3 — `library.catalog` `{ kind: "collection" }` scope.** Read port
  variant; `catalogSql` branch; scope availability `collections` array; stage
  handler cases (`resolveListedScope` / `handleLibraryCatalogListScopes` /
  `serializableScope` / `deserializeScope`); public contract variant +
  regenerated schemas; `membershipSignals` collections branch (Invariant 4);
  position sort basis (D4). Read-only slice.
- **Slice 4 — `library.collection.*` agent tools.** The tool family (D9),
  contributed through the area RuntimeModule. Gate posture for write tools is
  an open question to confirm at slice time (mirrors the Phase-A `music.experience`
  write-tool gate question).
- **Slice 5 — Concurrency + Web (Phase B/C).** Per-area OCC (Phase C) and
  Workbench Action Adapter. Deferred until a second writer lands.

## Remaining Open Questions (implementation-level)

These are implementation details to settle in slice specs, not product
decisions:

- Catalog read SQL for the collection scope variant: how `position` ordering
  (D4) is expressed given the current catalog read path orders by
  `recently_added_at` / dictionary.
- `UNIQUE(owner_scope, name)` vs `UNIQUE(owner_scope, collection_kind, name)`:
  whether same-named collections of different kinds may coexist under one owner
  (D2 chose name-in-owner uniqueness; confirm at Slice 1).
- `move` input shape: `move({ collectionRef, materialRef, before/after target })`
  vs `move({ collectionRef, materialRef, position })` (Slice 4).
- `library.collection.get` output granularity: whole-collection state vs
  paged member list (Slice 4).
- Slice 4 tool gate posture: auto-pass vs ask (mirrors `phase-A-spec`'s open
  write-tool gate question).
