# Canonical Store Interfaces

## Status

Interface design document. Current implementation progress is tracked
separately in `docs/canonical-store/progress.md`.

## Interface Layers

Canonical Store should expose three layers:

```text
CanonicalStorePort
  public business port for normal modules

CanonicalAdminPort
  restricted maintenance/admin port for identity operations

CanonicalRepository
  storage-facing implementation boundary
```

Only `CanonicalStorePort` belongs in the ordinary recommendation path.

## Public Port

`CanonicalStorePort` is for modules that need stable identity lookup or evidence
attachment.

Consumers:

- Material Resolve.
- Source Grounding.
- Memory Service.
- Music Knowledge.
- future governed Stage Interface identity tools.

Limited Event Service use is allowed only when a caller needs to validate a
target ref. Event Service should not create identity as a side effect of
recording an event.

Provider adapters, Material Gate, and host adapters must not call this port
directly.

### Proposed Shape

```ts
export type CanonicalKind =
  | "artist"
  | "work"
  | "recording"
  | "release_group"
  | "release"
  | (string & {});

export type CanonicalStatus =
  | "active"
  | "provisional"
  | "merged"
  | "rejected";

export interface CanonicalStorePort {
  get(input: {
    ref: Ref;
    followRedirects?: boolean;
  }): Promise<Result<CanonicalRecord | null>>;

  findByLabel(input: {
    label: string;
    kind?: CanonicalKind;
    includeHistorical?: boolean;
    limit?: number;
  }): Promise<Result<CanonicalRecord[]>>;

  resolveExternalRef(input: {
    ref: Ref;
    includeHistorical?: boolean;
    followRedirects?: boolean;
  }): Promise<Result<CanonicalRecord | null>>;

  createProvisional(input: {
    kind: CanonicalKind;
    label: string;
    evidence?: Ref[];
    aliases?: string[];
    reason?: string;
    evidenceEventId?: string;
  }): Promise<Result<CanonicalRecord>>;

  attachExternalRef(input: {
    canonicalRef: Ref;
    externalRef: Ref;
    evidenceEventId?: string;
    confidence?: number;
  }): Promise<Result<CanonicalRecord>>;

  addAlias(input: {
    canonicalRef: Ref;
    alias: string;
    source?: string;
  }): Promise<Result<CanonicalRecord>>;
}
```

### MVP Compatibility

The current implemented port has:

```text
get
findByLabel
resolveExternalRef
createProvisional
attachExternalRef
```

The first implementation should keep this compatibility and add optional fields
only when the storage behavior is ready.

`addAlias` can be introduced after the alias table exists.

### Current Implementation

Implemented methods:

- `get`
- `findByLabel`
- `resolveExternalRef`
- `createProvisional`
- `attachExternalRef`

Implemented behavior:

- label normalization trims, lowercases, and collapses internal whitespace.
- `findByLabel` searches primary labels and aliases.
- `findByLabel` and `resolveExternalRef` return only `active` and
  `provisional` records.
- `createProvisional` reuses existing current records by external evidence
  before creating a new provisional record; label and alias matches remain
  lookup-only candidate discovery.
- `attachExternalRef` is idempotent for refs already attached to the same
  canonical record.
- SQLite external-ref uniqueness failures are mapped to
  `canonical.external_ref_conflict` at the Canonical Store boundary.

Design-only methods and fields:

- `addAlias`
- `includeHistorical`
- `followRedirects`
- `limit`
- `aliases` input on `createProvisional`
- `reason`
- `evidenceEventId`
- `confidence`

## Public Method Semantics

### `get`

Input:

- MineMusic canonical `Ref`.

Behavior:

- returns the matching canonical record or `null`.
- does not search external refs.
- does not create records.
- may optionally follow merge redirects when `followRedirects` is true.

Consumers:

- Memory Service for stable targets.
- Material Resolve when a candidate already carries a canonical ref.
- future Stage Interface identity tools.

### `findByLabel`

Input:

- label text.
- optional kind.

Behavior:

- normalizes label.
- searches primary label and aliases.
- returns `active` and `provisional` records by default.
- returns `merged` / `rejected` only when `includeHistorical` is true.
- does not perform provider search.

Consumers:

- Material Resolve candidate preparation.
- Memory Service when explicit user feedback has only text.
- future Knowledge Service identity hints.

### `resolveExternalRef`

Input:

- source or knowledge `Ref`.

Behavior:

- looks up an already attached external ref.
- returns the attached canonical record or `null`.
- does not fuzzy match.
- does not create records.

Consumers:

- Material Resolve before source-only fallback.
- Source Grounding when normalizing source refs returned by providers.
- Memory Service when feedback targets a source ref.
- Knowledge Service when external facts include stable refs.

### `createProvisional`

Input:

- canonical kind.
- label.
- optional source/knowledge evidence refs.
- optional aliases.
- optional event evidence.

Behavior:

- runs in a transaction.
- first tries to reuse an existing active/provisional record by evidence.
- does not automatically reuse an existing active/provisional record by
  label/alias alone.
- creates a provisional record only when no evidence ref resolves to an
  existing identity.
- attaches evidence refs to the provisional record.
- does not mark the record active.

Consumers:

- Material Resolve only after a governed confirmation path.
- Memory Service for explicit wrong-version or identity feedback.
- future Stage Interface identity confirmation tools.

### `attachExternalRef`

Input:

- MineMusic canonical ref.
- external ref.
- optional confidence/event evidence.

Behavior:

- verifies the canonical record exists and is current.
- inserts the external ref evidence.
- rejects conflicts through `canonical.external_ref_conflict`.
- does not change playability.

Consumers:

- Material Resolve after a known canonical match.
- Knowledge Service when adding external identity evidence.
- admin tools.

### `addAlias`

Input:

- MineMusic canonical ref.
- alias text.
- optional source.

Behavior:

- verifies the canonical record exists and is current.
- normalizes alias.
- stores alias once per canonical record.
- does not merge records.

Consumers:

- Knowledge Service.
- admin tools.
- future user correction tools.

## Admin Port

`CanonicalAdminPort` is for operations that change identity authority. It should
not be reachable from ordinary Material Resolve, Source Grounding, or provider
adapters.

Consumers:

- future admin CLI.
- migration scripts.
- test fixtures.
- guarded Stage Interface admin tools, only if explicitly added later.

### Proposed Shape

```ts
export interface CanonicalAdminPort {
  activate(input: {
    canonicalRef: Ref;
    reason: string;
  }): Promise<Result<CanonicalRecord>>;

  reject(input: {
    canonicalRef: Ref;
    reason: string;
  }): Promise<Result<CanonicalRecord>>;

  merge(input: {
    fromRef: Ref;
    intoRef: Ref;
    reason: string;
  }): Promise<Result<CanonicalRecord>>;

  list(input: {
    kind?: CanonicalKind;
    status?: CanonicalStatus;
    limit?: number;
    cursor?: string;
  }): Promise<Result<CanonicalRecordPage>>;
}
```

`CanonicalRecordPage` can be added when list pagination is needed.

## Repository Boundary

The repository layer exists only behind Canonical Store. It may expose
database-shaped operations, but no other module should depend on those
operations.

Allowed consumers:

- Canonical Store implementation.
- storage tests.

Forbidden consumers:

- Material Resolve.
- Source Grounding.
- Memory Service.
- Event Service.
- Stage Interface.
- MCP server.
- provider adapters.
- Material Gate.

### Repository Responsibilities

The durable repository should support:

- entity lookup by canonical ref.
- entity lookup by normalized label.
- alias lookup.
- external-ref reverse lookup.
- transaction-scoped provisional creation.
- transaction-scoped external-ref attachment.
- status updates for admin operations.

It should enforce:

- external ref uniqueness.
- canonical entity existence.
- transaction atomicity.
- status validity.

## Module Access Matrix

| Module | Allowed Interface | Allowed Methods | Forbidden |
| --- | --- | --- | --- |
| Material Resolve | `CanonicalStorePort` | `get`, `findByLabel`, `resolveExternalRef`, `attachExternalRef`; `createProvisional` only after explicit confirmation path | repository, admin merge/reject |
| Source Grounding | `CanonicalStorePort` | `resolveExternalRef` for provider-returned source refs | repository, admin merge/reject, canonical creation |
| Memory Service | `CanonicalStorePort` | `get`, `resolveExternalRef`, `createProvisional` for explicit feedback | repository, provider refs as canonical authority |
| Event Service | usually none; optional `CanonicalStorePort` validation | `get` only when validating caller-provided target | creating identity while recording events |
| Music Knowledge | `CanonicalStorePort` | `resolveExternalRef`, `attachExternalRef`, `addAlias` | playability decisions, canonical merge authority |
| Stage Interface | governed tools only | public port; admin port only through explicit admin tools | repository internals |
| Source Provider | none | none | any canonical write |
| Material Gate | none | none | identity lookup or mutation |
| MCP Host Adapter | Stage Interface only | none directly | provider/repository/canonical internals |

## Error Codes

Existing stable errors:

```text
canonical.not_found
canonical.external_ref_conflict
```

Potential future errors:

```text
canonical.not_current
canonical.merge_cycle
canonical.invalid_kind
canonical.alias_conflict
```

Do not add new error codes until an implementation path and tests require them.

## First Implementation Contract

The first durable implementation should prove:

1. `createProvisional` persists a record.
2. reopening storage preserves `get`.
3. external refs persist and support `resolveExternalRef`.
4. duplicate external refs fail through the database uniqueness constraint.
5. `findByLabel` works for normalized labels.
6. source refs never become MineMusic refs.
7. provider adapters cannot import the repository.

## Progress Tracking

Implementation status, verified behavior, and remaining gaps are tracked in
`docs/canonical-store/progress.md`.
