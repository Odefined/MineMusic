# Phase 1: Contract Vocabulary Reset

> Status: Implemented as active-code reset
> Phase owner: Contract vocabulary and data-boundary design
> Output type: Type contracts, contract tests, architecture guards, and matching
> docs updates

Phase 1 resets the active vocabulary used by formal v1. It is not a rename-only
slice. It deletes stale MVP material language and defines the contracts that
later query, provider, present, source-library, collection, and relation phases
must use.

## Implementation Status

Implemented on 2026-06-06:

- Old active `src/**`, `test/**`, `fixtures/**`, `skills/minemusic`, and
  launchd reset script MVP runtime roots were deleted instead of patched,
  renamed, or preserved as compatibility layers.
- `src/contracts/index.ts` now defines the formal Phase 1 contract vocabulary:
  `Ref`, `refKey(ref)`, `VersionInfo`, source/material/canonical entity and
  record contracts, source-owned `PlayableLink`, formal status axes,
  `ProviderMaterialCandidate`, and capability-aware `SourceProvider`.
- `src/stage_interface/index.ts`, `src/stage_core/index.ts`, and
  `src/server/index.ts` provide only a minimal formal skeleton needed to compile
  and test the reset.
- Pre-formal active area docs, host-adapter docs, provider docs, and operations
  docs were deleted from active `docs/`; evidence remains in archive/git
  history only.
- `test/formal/formal-contracts.test.ts` verifies contract shapes and ref
  runtime validation.
- `test/formal/active-tree.test.ts` verifies old MVP roots and deleted
  vocabulary are not active source.
- `test/formal/stage-runtime.test.ts` verifies the minimal Stage
  Interface/Core skeleton.

This implementation deliberately does not introduce `Legacy*` aliases,
compatibility adapters, or old-runtime bridges.

## Spec

### Goal

Define the formal contract model for refs, domain entities, storage records,
source facts, canonical identity, material identity, playable links, version
information, provider candidates, and material status axes.

Phase 1 must make it impossible for providers, query code, or presentation code
to keep treating provider search results, material identity anchors, storage
records, and final cards as the same object.

### Non-Goals

- Do not define ordinary query hit output fields.
- Do not define how query hits are exposed to agents.
- Do not define how query hits become final `MaterialCard` presentation output.
- Do not decide whether public query output exposes provider context, basis,
  version info, or display links.
- Do not implement the query engine.
- Do not implement `stage.recommendation.present`.
- Do not implement source-library, collection, or owner relation writes.
- Do not define recording-to-work relation schema.
- Do not define canonical provider identity evidence contracts beyond storage
  and maintenance placeholders.
- Do not add compatibility layers for `MusicMaterial`, `SourceMaterial`,
  Material Resolve, `mat:`, or `emat:`.
- Do not redefine the formal top-level architecture area taxonomy. Server Host,
  Stage Interface, Stage Core, Extension, Music Data Platform, Music
  Intelligence, Music Experience, Memory, and Effect Boundary belong to Phase 0
  architecture/glossary work; Phase 1 only depends on those boundaries.

### Owning Context

Contracts own Phase 1. Extension provider adapters, Music Data Platform, Stage
Interface, and later query/presentation work consume the contracts but do not
own their meaning.

### Allowed Reads

- `src/contracts/index.ts`
- `src/stage_interface/index.ts`
- `src/stage_core/index.ts`
- `src/server/index.ts`
- Formal contract and active-tree tests
- Phase 0 formal glossary and accepted ADRs

### Allowed Writes

- `src/contracts/index.ts`
- Contract tests
- Architecture tests or guards for forbidden imports and exact allowed keys
- Minimal Stage Interface/Core/Server skeleton needed to compile against the
  new contract vocabulary
- Documentation that records the new contract vocabulary and boundaries

### Forbidden Writes

- New query engine behavior
- Presentation card behavior beyond preventing contract leakage
- Provider rewrite behavior beyond contract conformance required for compile
  safety
- Database schema migrations except contract-only test fixtures
- Source-library, collection, owner relation, or feedback workflows
- `CONTEXT.md` in Phase 1

## Contract Decisions

### Ref

`Ref` remains the shared opaque identity reference shape:

```ts
type Ref = {
  namespace: string;
  kind: string;
  id: string;
  label?: string;
};
```

Rules:

- Delete `Ref.url`.
- `label` is a non-authoritative display/debug hint.
- Do not introduce separate `SourceRef`, `MaterialRef`, or `CanonicalRef`
  structures. Use field names such as `sourceRef`, `materialRef`, and
  `canonicalRef`.
- Base `Ref.namespace` and `Ref.kind` remain strings. Concrete contracts
  constrain allowed values.
- `namespace`, `kind`, and `id` must not contain `:`.
- `refKey(ref)` is the canonical helper for public string handles.
- Do not hand-roll `${namespace}:${kind}:${id}` outside the canonical helper.
- `PublicRefKey` is a plain string, not a branded type.
- Public APIs that may accept multiple handle domains use
  `{ handleKind, handle }`, not `mat:` or `emat:` codecs.

### Entity And Record Split

Formal v1 uses domain entities and storage records as different concepts:

| Concept | Role |
| --- | --- |
| `SourceEntity` | Durable normalized provider-side facts. |
| `MaterialEntity` | MineMusic-owned material identity anchor. |
| `CanonicalEntity` | Cross-source identity authority. |
| `SourceRecord` | Storage record for source facts and lookup columns. |
| `MaterialRecord` | Storage record for material identity persistence. |
| `CanonicalRecord` | Storage record for canonical identity maintenance. |

Records may contain SQL keys, storage indexes, denormalized lookup columns, and
maintenance fields. Entities expose refs and semantic fields only.

### Kinds

Source-side kinds:

```ts
type SourceEntityKind = "track" | "album" | "artist";
```

Material/canonical identity kinds:

```ts
type MaterialEntityKind =
  | "recording"
  | "album"
  | "artist"
  | "work"
  | "release";
```

Rules:

- `track` exists only on `SourceEntity`.
- `recording` exists on material/canonical identity.
- Ordinary provider song materialization maps `SourceEntity.track` to
  `MaterialEntity.recording`.
- Ordinary provider album materialization maps `SourceEntity.album` to
  `MaterialEntity.album`.
- `work` belongs to identity graph / canonical maintenance, not ordinary source
  materialization.
- `release` is for concrete edition, pressing, or record-collection workflows.
  Ordinary provider album materialization defaults to `album`.
- `release_group` is preserved as future identity vocabulary, but formal v1
  default flow does not use it as ordinary query target or public output kind.

### VersionInfo

Version information is first-class identity/source information, not
presentation-only title text:

```ts
type VersionTag =
  | "remaster"
  | "remix"
  | "live"
  | "edit"
  | "radio_edit"
  | "extended"
  | "acoustic"
  | "unplugged"
  | "demo"
  | "deluxe"
  | "explicit"
  | "instrumental"
  | (string & {});

type VersionInfo = {
  label?: string;
  tags?: VersionTag[];
};
```

Rules:

- `VersionInfo.label` preserves provider/user-readable wording.
- `VersionInfo.tags` carries normalized categories.
- Use one `VersionInfo` type in formal v1.
- Track/recording versus album/release semantics are determined by the owning
  entity kind.
- `SourceEntity.versionInfo` records provider/source facts.
- `MaterialEntity.versionInfo` records MineMusic's material identity judgement.
- `CanonicalEntity.versionInfo` appears only when the canonical identity itself
  is version-specific.
- Wrong-version feedback compares requested/expected version information
  against Source/Material/Canonical version information. The exact feedback
  relation schema belongs to the owner-relation phase.
- Recording-to-work relation is identity graph/canonical maintenance, not
  `VersionInfo`.

### SourceEntity

`SourceEntity` represents durable normalized provider-side facts. It is not raw
provider payload and not material identity.

Required rules:

- `sourceRef.namespace = source_${providerId}`.
- `sourceRef.id = normalizeProviderEntityId(providerEntityId)` by default.
- `providerEntityId` stores the provider's original entity id.
- `providerId` itself must be ref-safe because it participates in namespace.
- `sourceRef`, `providerId`, `providerEntityId`, and source kind are explicit.
- Source track/album/artist facts must be explicit normalized fields, not
  generic `providerFacts`, `metadata`, or `raw` dumps.
- `SourceArtist` may have `aliases`.
- `SourceTrack` and `SourceAlbum` do not receive generic aliases in formal v1.
- `providerUrl` is a navigation hint. It is not a playable link and not a
  replacement for `Ref.url`.
- `links?: PlayableLink[]` may appear on normalized `SourceEntity` or in a
  future source-owned link fact table.
- `availabilityHint` is provider/source-side only. It is not final
  `MaterialAvailability`.

Forbidden on `SourceEntity`:

- `materialRef`
- `canonicalRef`
- owner relations
- owner scope
- public display links
- score
- basis/provenance
- query/presentation fields
- raw provider payload
- generic notes

### PlayableLink And PublicDisplayLink

`PlayableLink` is a source-owned internal value:

```ts
type PlayableLink = {
  url: string;
  label?: string;
  requiresAccount?: boolean;
};
```

Rules:

- No `sourceRef` inside `PlayableLink`; the owning `SourceEntity` or link fact
  row already carries source identity.
- No `expiresAt`; stale links are handled by explicit refresh/repair.
- `requiresAccount` is retained as an access constraint and may make
  availability `restricted`.
- `SourceProvider.getPlayableLinks` is for explicit refresh, repair, or account
  re-check. It is not the default extra provider call for ordinary present.

Public links use:

```ts
type PublicDisplayLink = {
  url: string;
  label?: string;
};
```

Rules:

- `PublicDisplayLink` does not contain `requiresAccount`.
- Account constraints are expressed through availability, not leaked link
  fields.
- If a candidate/source has no links, present may create a non-playable or
  restricted card with empty `displayLinks`. It must not promote missing links
  to playable state.

### MaterialEntity

`MaterialEntity` is MineMusic-owned material identity. It is not a public card,
provider search result, query hit, presentation seed, or owner-scoped object.

Allowed core fields:

- `materialRef`
- `kind`
- `lifecycleStatus`
- `identityStatus`
- `canonicalRef?`
- `primarySourceRef?`
- `sourceRefs`
- `versionInfo?`
- `createdAt?`
- `updatedAt?`

Rules:

- `materialRef.namespace = "material"`.
- `materialRef.id` is a local generated stable id.
- `canonicalRef` exists if and only if
  `identityStatus = "canonical_confirmed"`.
- `source_backed` requires `sourceRefs.length > 0` and no `canonicalRef`.
- `unresolved_identity` requires no `canonicalRef` and empty `sourceRefs`.
- `primarySourceRef`, when present, must be included in `sourceRefs`.
- `sourceRefs` may contain multiple source anchors.
- `sourceRefs` are identity anchors and default source pointers. They do not
  own links.

Forbidden on `MaterialEntity`:

- `PlayableLink[]`
- public display links
- final availability
- score
- basis/provenance
- provider raw payload
- presentation title/artists/album display seeds
- aliases
- owner policy
- owner scope
- collection ids or collection membership
- generic notes

### CanonicalEntity

`CanonicalEntity` is cross-source identity authority.

Rules:

- `canonicalRef.namespace` uses `canonical_*`.
- `canonicalRef.id` is a local canonical stable id, not a MusicBrainz or raw
  provider id.
- `aliases?: string[]` are display/search aliases only.
- `versionInfo?` appears only when the canonical identity itself is
  version-specific.
- `canonical_records.facts_json` is storage/maintenance/evidence only, not a
  generic facts field on `CanonicalEntity`.
- Provider identity indexes and evidence belong to canonical maintenance or
  storage, not Phase 1 public domain contracts.

Forbidden on `CanonicalEntity`:

- `sourceRefs`
- `materialRefs`
- playable links
- owner relations
- owner scope
- raw provider payload
- generic notes

Canonical storage status uses:

```ts
type CanonicalRecordStatus =
  | "active"
  | "provisional"
  | "merged"
  | "archived";
```

`archived` replaces rejected canonical status. `provisional` is canonical
maintenance/evidence state, not ordinary material/query/present state.

### ProviderMaterialCandidate

Formal provider/search candidates wrap source facts. They are not material
identity:

```ts
type ProviderMaterialCandidate = {
  sourceEntity: SourceEntity;
  providerScore?: number;
};
```

Rules:

- No top-level `providerEntityId`; use `sourceEntity.providerEntityId`.
- No `materialRef`.
- No `canonicalRef`.
- No `identityState`.
- No `MaterialState`.
- No owner scope.
- No timestamps.
- No rank/search text/query run id.
- No raw provider payload.
- `providerScore` is provider-native score only.
- Query output `score` is the query engine's combined relevance score.
- `providerScore` must not be persisted into `SourceEntity`.
- `sourceEntity.sourceRef` must pass ref validation before leaving the provider
  boundary.

### Status Axes

Replace generic material status/state with separate axes:

```ts
type MaterialLifecycleStatus =
  | "active"
  | "merged"
  | "archived";

type MaterialIdentityStatus =
  | "canonical_confirmed"
  | "source_backed"
  | "unresolved_identity";

type MaterialAvailability =
  | "playable"
  | "restricted"
  | "unavailable"
  | "unknown";
```

Rules:

- `MaterialAvailability` is not core `MaterialEntity` state.
- It is computed in projection/query/present from source links,
  `availabilityHint`, owner scoped corrections, and provider/account
  constraints.
- `pending_identity` is removed from material lifecycle and relation status.
- `owner_material_relations.status` keeps `active | removed | rejected` for
  owner adoption/rejection facts. That is owner relation state, not canonical
  status and not material lifecycle.

## Plan

### Step 0 - Inventory Old Vocabulary

- Search active source for:
  - `MusicMaterial`
  - `SourceMaterial`
  - `MaterialResolve`
  - `PublicMaterialResolve`
  - `MaterialState`
  - `MaterialStatus`
  - `mat:`
  - `emat:`
  - `Ref.url`
- Classify each hit as active formal contract, legacy deletion target,
  archived documentation, or test fixture.
- Do not rewrite behavior during inventory.

### Step 1 - Ref Helper And Validation

- Define or tighten `Ref`.
- Remove `Ref.url`.
- Add or tighten `refKey(ref)`.
- Add validation for `:` in `namespace`, `kind`, and `id`.
- Add tests for valid `source_netease`, `material`, and `canonical_*`
  namespaces.
- Add a guard or targeted search that discourages hand-rolled ref key template
  strings outside the helper.

### Step 2 - Entity And Record Contracts

- Define `SourceEntity`, `MaterialEntity`, and `CanonicalEntity`.
- Define or separate `SourceRecord`, `MaterialRecord`, and `CanonicalRecord`.
- Ensure records can carry storage-only fields without leaking them into
  entity contracts.
- Add contract tests for allowed key sets and invariant checks.

### Step 3 - Source Facts And Links

- Move provider-side durable facts into `SourceEntity`.
- Keep playable links source-owned.
- Ensure `PlayableLink` contains no `sourceRef` and no `expiresAt`.
- Ensure `PublicDisplayLink` contains only `url` and optional `label`.
- Add tests proving `SourceEntity.availabilityHint` is not final
  `MaterialAvailability`.

### Step 4 - VersionInfo

- Add `VersionInfo` and `VersionTag`.
- Allow it on Source/Material/Canonical contracts according to role.
- Add tests that version info is not flattened into display title only.
- Do not add recording-to-work relation fields in this phase.

### Step 5 - Provider Candidate Contract

- Replace provider material candidate vocabulary with:
  `ProviderMaterialCandidate = { sourceEntity, providerScore? }`.
- Ensure providers cannot construct or return `MaterialEntity`.
- Ensure provider candidates contain no raw provider payload.
- Add provider conformance tests or architecture guards for forbidden imports
  and exact candidate key set.

### Step 6 - Remove Old Active Contracts

- Remove active exports/usages of `MusicMaterial`, `SourceMaterial`,
  `MaterialResolve*`, `PublicMaterialResolve*`, generic `MaterialState`, generic
  `MaterialStatus`, and public `mat:`/`emat:` codecs.
- If public tool deletion belongs to a later phase, isolate old tool schemas as
  explicit deletion targets instead of treating them as accepted formal
  contracts.
- Do not add compatibility adapters.

### Step 7 - Stage Interface Leak Guard

- Add or update structural tests so ordinary Stage Interface outputs do not
  expose `MaterialEntity`, `MaterialRecord`, `CanonicalEntity`,
  `CanonicalRecord`, raw provider payloads, or source refs by default.
- Keep `MaterialCard` as final presentation output under
  `src/stage_interface/outputs/**`.
- Do not decide query hit output or query-to-present flow in this phase.

### Step 8 - Verification

- Run targeted contract tests.
- Run provider conformance tests touched by the contract change.
- Run architecture tests for provider import boundaries and Stage Interface
  leakage.
- Run `npm run typecheck`.
- Run `git diff --check`.
- Run `git diff --name-only`.

## Acceptance Criteria

- No active domain/provider contract accepts or returns `MusicMaterial` or
  `SourceMaterial`.
- No active formal contract uses `MaterialResolve*` or
  `PublicMaterialResolve*`.
- No active public formal contract uses `mat:` or `emat:` codecs.
- `Ref` has no `url`; ref components cannot contain `:`.
- `refKey(ref)` is the single helper for public ref string handles.
- `SourceEntity`, `MaterialEntity`, and `CanonicalEntity` are distinct from
  `SourceRecord`, `MaterialRecord`, and `CanonicalRecord`.
- Providers compile against `ProviderMaterialCandidate` and cannot construct
  `MaterialEntity`.
- `ProviderMaterialCandidate` contains only `sourceEntity` and optional
  `providerScore`.
- `SourceEntity` contains normalized provider/source facts, provider ids,
  source refs, source-owned links, availability hints, and optional version
  info. It contains no raw/generic provider dump.
- `PlayableLink` contains no `sourceRef` and no `expiresAt`.
- `MaterialEntity` contains identity anchors only. It contains no links,
  availability, score, basis/provenance, owner scope, collection membership,
  aliases, notes, or presentation seed fields.
- `MaterialEntity` invariants hold for `canonical_confirmed`, `source_backed`,
  and `unresolved_identity`.
- `CanonicalEntity` contains identity authority and optional display/search
  aliases. It contains no source/material refs, owner facts, links, or raw
  provider payload.
- `VersionInfo` exists on source/material/canonical contracts according to
  role, and is not treated as presentation-only title text.
- `MaterialLifecycleStatus`, `MaterialIdentityStatus`, and
  `MaterialAvailability` are separate axes.
- `archived` replaces rejected canonical storage status.
- Stage Interface ordinary outputs do not expose domain entities or storage
  records by default.

## Stopping Condition

Stop Phase 1 once the formal contract vocabulary compiles, the old active
vocabulary is deleted or isolated as explicit deletion targets, and tests/guards
prove the provider, material identity, storage record, and presentation output
boundaries cannot collapse back into one object.

Do not continue into query output, query-to-present flow, source-library facts,
collection/relation storage, wrong-version relation schema, canonical identity
graph, or provider rewrite details inside Phase 1.
