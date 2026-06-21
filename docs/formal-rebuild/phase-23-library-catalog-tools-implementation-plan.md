# Phase 23 Library Catalog Tools Implementation Plan

> Status: Draft plan; no implementation started.
> Spec authority: this document plus `docs/formal-project-glossary.md`
> (`Library Catalog`), `ARCHITECTURE.md` (Public Agent Protocol namespaces and
> Stage Interface ownership), ADR-0014 (model-visible tool guidance is
> mandatory), ADR-0016 (descriptor and handler registration split), ADR-0017
> (router owns `toolName`), ADR-0019 (Public Handle Veil), ADR-0020 (declared
> error vocabulary), and ADR-0024 (registry-backed public cursor ownership
> pattern).
> Owning bounded contexts: Music Data Platform (`library.catalog.*`
> stage_adapter and catalog read orchestration), Stage Interface (public
> schemas, descriptors, handles, cursors, output veil), Server Host
> (composition only).

## Goal

Expose the owner-visible MineMusic library as explicit Public Agent Protocol
catalog tools:

```text
library.catalog.list_scopes
library.catalog.browse
library.catalog.sample
library.catalog.summary
```

These tools let an agent browse, sample, and summarize a selected library
surface without inventing lookup text and without calling providers.

The public path after Phase 23:

```text
library.catalog.list_scopes()
  -> returns reusable catalog-usable Music Scopes
  -> includes library/source_library/relation
  -> excludes provider and all

library.catalog.browse({ scope?, sort?, limit? })
  -> resolve scope to owner catalog population
  -> read owner-visible catalog rows + public description facts
  -> mint library item handles
  -> output { items: [{ item, description }], nextCursor? }

library.catalog.sample({ scope?, count, seed })
  -> resolve scope to owner catalog population
  -> choose a deterministic seeded sample from that population
  -> mint library item handles
  -> output { items: [{ item, description }] }

library.catalog.summary({ scope?, sampleCount })
  -> resolve scope to owner catalog population
  -> return timeline-spread catalog samples
  -> return kind-separated concentration signals from catalog/projection facts
```

The tools are read-only with respect to durable user/music state. They may mint
public item handles and browse cursors through Stage Interface-owned veil
registries, but they must not write Music Data Platform source-of-truth facts,
projection rows, owner relations, source-library items, provider state, Memory,
or Music Experience state.

## Decisions Already Settled

- The public tool family is `Library Catalog`, under `library.catalog.*`.
- The first tools are `list_scopes`, `browse`, `sample`, and `summary`.
- Inputs use reusable library-surface Music Scopes:
  - omitted scope means the MineMusic `library` baseline;
  - `library` means the owner-visible MineMusic library baseline;
  - `source_library` means a listed imported source-library scope;
  - `relation` means a listed positive owner-relation scope;
  - future `collection` can be added only after Collection scope vocabulary and
    availability exist.
- The aggregate `all` scope and provider scopes are not accepted by
  `library.catalog.*`.
- `library.catalog.list_scopes` lists only catalog-usable scopes:
  `library`, `source_library`, and `relation` in the first slice. It does not
  return provider scopes and does not return `all`.
- Scope `id` values are opaque pass-back identifiers. Agents must not parse
  `source_library` or `relation` ids; source-library/relation meaning, including
  saved vs. favorite, comes from the returned `description`.
- `scope: { kind: "library" }` means the owner-visible MineMusic library
  baseline as a deduplicated material population: active positive catalog
  membership included, active blocked membership excluded, provider candidates
  excluded.
- Item output is only:

```ts
type LibraryCatalogItem = {
  item: Extract<MusicItemHandle, { kind: "library" }>;
  description: PublicHandleDescription;
};
```

- Tools do not echo input scopes; scope descriptions appear only in
  `library.catalog.list_scopes` and `library`-baseline membership signals.
- `browse`:
  - returns compact public library item handles with Public Handle Descriptions;
  - returns `nextCursor` when more items are available;
  - caps `limit` at 100;
  - supports `time` order and `dictionary` order;
  - defaults to newest-first time order when no sort is requested.
- `sample`:
  - takes caller-provided `count` and explicit caller-provided `seed`;
  - first slice caps `count` at 100, matching the public catalog payload cap;
  - the same library state, scope, count, and seed return the same sample;
  - changing seed asks for a different sample;
  - tools do not invent time-based seeds;
  - this tool does not use the summary timeline-band sampling rule.
- `summary`:
  - takes caller-provided `sampleCount`, capped at 100;
  - returns both independent catalog evidence samples and
    frequency/concentration signals;
  - evidence samples sort the selected population by owner catalog
    `recentlyAddedAt` from earliest to latest;
  - evidence samples split that timeline into four time bands:
    `earliest 25%`, `25-50%`, `50-75%`, and `latest 25%`;
  - `sampleCount` is distributed as evenly as possible across the four bands;
  - within each band, sampling tries to avoid repeated artist text when enough
    distinct artists exist;
  - concentration signals are computed within material kind boundaries, never
    mixing `recording`, `album`, and `artist`;
  - counts belong to a specific signal and are not naked inventory statistics;
  - each signal type returns at most ten signals ordered by descending count;
  - each signal may carry at most five public item examples;
  - first-version signal types are recording artist concentration, recording
    album concentration, album artist concentration, and artist-item
    concentration;
  - for `scope: { kind: "library" }` only, returns membership signals grouped by
    the same selectable catalog scopes returned by `library.catalog.list_scopes`
    (excluding the `library` baseline itself). This lets the agent distinguish
    imported source-library membership from MineMusic relation membership using
    scope descriptions instead of parsing scope ids;
  - each membership signal carries the listed scope, a distinct-material count,
    and at most five public item examples. The same material may count under
    multiple membership signals.

## Non-Goals

- Do not replace `music.discovery.lookup`; catalog tools browse and summarize a
  selected library surface without lookup text.
- Do not call provider search, provider library APIs, provider save/like APIs,
  playback APIs, or open-world network APIs.
- Do not accept provider scopes or the aggregate `all` scope.
- Do not expose raw owner catalog rows, `owner_material_entries`,
  `owner_material_catalog_view`, material refs, source refs, relation refs,
  source-library refs, result-set ids, provider ids, provider entity ids,
  provider raw keys, or provenance JSON.
- Do not return separate display DTOs outside `description`.
- Do not return scope descriptions from browse/sample or echo input scopes.
  Scope descriptions appear only in `library.catalog.list_scopes` and
  `library`-baseline membership signals.
- Do not produce genre, style, mood, semantic, embedding, Memory, or
  long-term-preference claims.
- Do not produce final recommendation judgment.
- Do not implement collection browsing until Collection has an accepted public
  scope handle and scope availability source.
- Do not add compatibility for old MVP public library tools or old pool
  vocabulary.

## Ownership And Boundaries

Music Data Platform owns:

- the `library.catalog` instrument and `library.catalog.*` stage_adapter
  descriptor/handler registration;
- the read-only catalog control port used by the stage_adapter;
- scope-to-catalog-population resolution for library-surface scopes;
- catalog sorting, pagination input to the cursor layer, seeded sampling, and
  summary signal computation over Music Data Platform facts/projections;
- translation of expected catalog input/scope/cursor failures into declared
  public errors.

Stage Interface owns:

- `LibraryCatalog*` public input/output contract types;
- schema generation and validation;
- public library item handle minting through `HandleMintingPort`;
- the public browse cursor veil, including owner-scope isolation, TTL, public
  id minting, and `invalid_cursor` / result-window failure behavior;
- output veil guards and result summaries.

Server Host owns:

- composition only: wire concrete Music Data Platform catalog read ports,
  scope resolution, Stage Interface cursor stores, and runtime modules.

Music Intelligence does not own Library Catalog. It may continue to own
`music.discovery.*` lookup/list-scopes tooling, but `library.catalog.*` must not
depend on Retrieval, Search Core, ranking services, provider-search workspaces,
or result-set internals.

## Allowed Reads

The implementation may read:

- `owner_material_catalog_view` / `OwnerCatalogReadPort` for owner-visible
  material population and `recentlyAddedAt`;
- `owner_material_entries` through a narrow read method when filtering a
  `source_library`, `relation`, or future `collection` scope;
- source-library and owner-relation scope summaries only to resolve public
  library-surface scope ids to internal refs;
- `search_metadata_documents` or a narrow derived read shape for public item
  descriptions and concentration fields;
- `material_records` only through an existing or narrow MDP read/projection port
  when needed to validate active material kind;
- Stage Interface handle/cursor registries through their public ports.

## Allowed Writes

The only allowed writes are Stage Interface runtime veil writes:

- public library item handle registrations;
- public browse cursor registrations.

No Music Data Platform durable write is allowed in this phase's catalog tools.
No command, repository write method, projection rebuild command, source-library
import command, owner-relation command, candidate-commit command, Memory write,
or Music Experience write may be called from `library.catalog.*`.

## Forbidden Imports And Dependencies

- Music Data Platform core catalog read services must not import Stage
  Interface contracts, Stage Core, Server Host, Music Intelligence, provider
  plugins, MCP transport, or presentation modules.
- `src/music_data_platform/stage_adapter/**` may import Stage Interface
  contracts and narrow Music Data Platform read ports, but must not construct
  repositories or call write commands directly.
- Server Host must not encode catalog summary semantics, sampling semantics,
  concentration grouping, relation semantics, or source-library filtering.
- Stage Interface must not own Music Data Platform fact meaning, SQL queries,
  sorting semantics, or concentration computation.
- Catalog tools must not use Retrieval/Search result-set tables or provider
  candidate caches as catalog authority.

## Public Contract

### Instrument

Use one instrument:

```text
library.catalog
```

Owner area: `music_data_platform`.

### Shared Types

```ts
type LibraryCatalogScope =
  | { kind: "library" }
  | Extract<MusicLibraryScopeHandle, { kind: "source_library" | "relation" }>;

type ListedLibraryCatalogScope =
  | ({ kind: "library"; description: MusicScopeDescription })
  | (Extract<MusicLibraryScopeHandle, { kind: "source_library" | "relation" }> & {
      description: MusicScopeDescription;
    });

type LibraryCatalogItem = {
  item: Extract<MusicItemHandle, { kind: "library" }>;
  description: PublicHandleDescription;
};
```

The first slice does not accept `all`, `provider`, or `collection`. Collection
can be added later by extending `MusicLibraryScopeHandle` and the scope
availability source.

### `library.catalog.list_scopes`

Input:

```ts
type LibraryCatalogListScopesInput = {
  kind?: "library" | "source_library" | "relation";
};
```

Output:

```ts
type LibraryCatalogListScopesOutput = {
  scopes: readonly ListedLibraryCatalogScope[];
};
```

Behavior:

- returns the catalog baseline scope `{ kind: "library" }` when `kind` is
  omitted or `library`;
- returns listed `source_library` and `relation` scopes with the same public ids
  and descriptions used by other scoped music tools;
- never returns provider scopes;
- never returns the aggregate `all` scope;
- descriptions are display metadata and not identity;
- ids are opaque pass-back identifiers; saved/favorite/source-library meaning
  is read from `description`, not from the id.

Declared errors:

| Public code | Meaning | Suggested recovery |
| --- | --- | --- |
| `invalid_input` | The optional kind filter is not `library`, `source_library`, or `relation`. | Retry with no filter or a catalog scope kind. |
| `scope_availability_failed` | Catalog scope availability could not be read. | Retry later. |

### `library.catalog.browse`

Input:

```ts
type LibraryCatalogBrowseInput =
  | {
      scope?: LibraryCatalogScope;
      sort?: "time" | "dictionary";
      limit?: number; // 1..100
    }
  | {
      cursor: string;
      limit?: number; // 1..100
    };
```

Output:

```ts
type LibraryCatalogBrowseOutput = {
  items: readonly LibraryCatalogItem[];
  nextCursor?: string;
};
```

Behavior:

- missing `scope` means `{ kind: "library" }`;
- missing `sort` means newest-first time order;
- `time` order uses owner catalog `recentlyAddedAt` descending, with a stable
  internal tie-breaker that never appears in public output;
- `dictionary` order uses the public description label ascending, with stable
  internal tie-breakers that never appear in public output;
- cursor pages accept only `{ cursor, limit? }`;
- cursor state binds owner scope, resolved catalog scope, sort, and internal
  keyset position;
- empty catalog is success with `items: []` and no cursor.

Declared errors:

| Public code | Meaning | Suggested recovery |
| --- | --- | --- |
| `invalid_input` | Input shape, scope kind, limit, sort, or cursor-page field mix is invalid. | Retry with a library-surface scope, optional `sort`, and `limit` from 1 to 100; cursor pages pass only `cursor` and optional `limit`. |
| `unknown_scope` | The public `source_library` or `relation` scope id is not currently available for this owner scope. | Call `library.catalog.list_scopes`, then retry with a current catalog scope. |
| `invalid_cursor` | The browse cursor is unknown, expired, owner-mismatched, or not a catalog cursor. | Start a fresh `library.catalog.browse` call. |

### `library.catalog.sample`

Input:

```ts
type LibraryCatalogSampleInput = {
  scope?: LibraryCatalogScope;
  count: number; // 1..100
  seed: string;
};
```

Output:

```ts
type LibraryCatalogSampleOutput = {
  items: readonly LibraryCatalogItem[];
};
```

Behavior:

- missing `scope` means `{ kind: "library" }`;
- `seed` must be caller-provided and non-empty;
- sample choice is deterministic for the same owner-visible catalog state,
  scope, count, and seed;
- the algorithm must sample from the selected population as a whole; it must not
  silently switch to recent-only sampling;
- if the population has fewer items than `count`, return all available items;
- this tool does not return time bands, signal counts, scope echoes, or
  inventory totals.

Declared errors:

| Public code | Meaning | Suggested recovery |
| --- | --- | --- |
| `invalid_input` | Scope kind, count, or seed is invalid. | Retry with a library-surface scope, `count` from 1 to 100, and a non-empty `seed`. |
| `unknown_scope` | The public `source_library` or `relation` scope id is not currently available for this owner scope. | Call `library.catalog.list_scopes`, then retry with a current catalog scope. |

### `library.catalog.summary`

Input:

```ts
type LibraryCatalogSummaryInput = {
  scope?: LibraryCatalogScope;
  sampleCount: number; // 1..100
};
```

Output:

```ts
type LibraryCatalogSummaryTimeBand =
  | "earliest_25"
  | "25_50"
  | "50_75"
  | "latest_25";

type LibraryCatalogSummarySampleBand = {
  band: LibraryCatalogSummaryTimeBand;
  items: readonly LibraryCatalogItem[];
};

type LibraryCatalogConcentrationSignal = {
  description: PublicHandleDescription;
  count: number;
  examples: readonly LibraryCatalogItem[]; // at most 5
};

type LibraryCatalogMembershipSignal = {
  scope: ListedLibraryCatalogScope;
  count: number;
  examples: readonly LibraryCatalogItem[]; // at most 5
};

type LibraryCatalogSummaryOutput = {
  samples: readonly LibraryCatalogSummarySampleBand[];
  membershipSignals?: readonly LibraryCatalogMembershipSignal[];
  concentrationSignals: {
    recordingArtists: readonly LibraryCatalogConcentrationSignal[]; // at most 10
    recordingAlbums: readonly LibraryCatalogConcentrationSignal[]; // at most 10
    albumArtists: readonly LibraryCatalogConcentrationSignal[]; // at most 10
    artistItems: readonly LibraryCatalogConcentrationSignal[]; // at most 10
  };
};
```

Behavior:

- missing `scope` means `{ kind: "library" }`;
- `scope: { kind: "library" }` summarizes the owner-visible library baseline as
  a deduplicated material population;
- sample bands are ordered from earliest to latest;
- `sampleCount` is distributed as evenly as possible across the four bands;
- if a band has fewer items than its share, use the available items and keep the
  output honest; do not fabricate items or move another band's identity;
- within each band, prefer distinct `artistText` when enough distinct artist
  text exists in the band;
- concentration signals are computed only from available catalog/projection
  facts:
  - `recordingArtists`: material kind `recording`, grouped by recording artist
    text;
  - `recordingAlbums`: material kind `recording`, grouped by recording album
    text;
  - `albumArtists`: material kind `album`, grouped by album artist text;
  - `artistItems`: material kind `artist`, grouped by artist item label;
- skip empty grouping text instead of inventing `unknown` buckets;
- counts are per signal within its kind boundary;
- example items are public item handles with descriptions and are capped at
  five per signal;
- signal lists are ordered by descending count, then stable public description
  label;
- `membershipSignals` appears only when summarizing the `library` baseline;
- each membership signal corresponds to one selectable `source_library` or
  `relation` scope from `library.catalog.list_scopes`;
- each membership signal carries that listed scope, including its description;
- `membershipSignals.count` counts distinct materials within that selectable
  scope; the same material may count under multiple membership signals;
- `membershipSignals.examples` carries at most five public item examples from
  that selectable scope.

Declared errors:

| Public code | Meaning | Suggested recovery |
| --- | --- | --- |
| `invalid_input` | Scope kind or sampleCount is invalid. | Retry with a library-surface scope and `sampleCount` from 1 to 100. |
| `unknown_scope` | The public `source_library` or `relation` scope id is not currently available for this owner scope. | Call `library.catalog.list_scopes`, then retry with a current catalog scope. |

## PR 23A: Public Contract And Tool Descriptor Skeleton

> Depends on: current Phase 18/19 `library.*` namespace and tool framework.
> Shippable standalone: yes. Descriptors and generated schemas compile; runtime
> module may contribute no handlers until PR 23C.

### Goal

Add the Stage Interface public contract for `library.catalog.*` and an MDP
stage_adapter home without implementing catalog reads yet.

### What lands

- `src/contracts/stage_interface.ts`:
  - `LibraryCatalogScope`;
  - `ListedLibraryCatalogScope`;
  - `LibraryCatalogListScopesInput` / `Output`;
  - `LibraryCatalogItem`;
  - `LibraryCatalogBrowseInput` / `Output`;
  - `LibraryCatalogSampleInput` / `Output`;
  - `LibraryCatalogSummaryInput` / `Output`;
  - concentration signal and summary band types.
- `scripts/generate-stage-interface-schemas.mjs`: include the new schema
  targets and overlay numeric caps for `limit`, `count`, and `sampleCount`.
- `src/contracts/generated/stage_interface_schemas.ts`: regenerated schemas.
- `src/music_data_platform/stage_adapter/catalog.ts`: instrument,
  descriptors, result summaries, and registration factory skeletons.
- `src/music_data_platform/stage_adapter/index.ts`: export catalog adapter
  symbols.
- Descriptor policy:
  - `durableUserStateWrite: false`;
  - `externalCall: false`;
  - `dataEgress: "none"`;
  - `readOnlyHint: true`;
  - `destructiveHint: false`;
  - `browse.runtimeStateWrite` follows the browse cursor decision in PR 23B;
    sample/summary have no domain/runtime mutation beyond public handle veil
    minting.

### Guards

- Generated output schemas must pass the existing Stage Interface output veil
  guard.
- Descriptor tests assert tool names, instrument id, owner area, side effects,
  invocation policy, declared errors, and model-visible usage guidance.
- Schema tests reject provider scopes, `all`, empty seeds, out-of-range counts,
  and cursor-page field mixing.
- `library.catalog.list_scopes` schema accepts only catalog scope kind filters.

### Verification

`npm run typecheck`; `npm run build:test`.

### Acceptance

The public contract compiles, schemas are generated, descriptors exist, and no
runtime tool reads or writes catalog data yet.

## PR 23B: Catalog Read Port, Scope Resolution, And Browse Cursor Store

> Depends on: PR 23A.
> Shippable standalone: yes, as internal read/cursor foundation with unit
> tests.

### Goal

Create the internal read and cursor foundation needed by the catalog
tools.

### What lands

- A narrow MDP catalog read port, for example
  `src/music_data_platform/library_catalog_read.ts`, returning internal records
  shaped for catalog projection. The core read port returns plain internal
  display text; the stage_adapter maps it to `PublicHandleDescription`:

```ts
type LibraryCatalogRecord = {
  materialRef: Ref;
  materialKind: "recording" | "album" | "artist";
  recentlyAddedAt: string;
  descriptionLabel: string;
  artistText?: string;
  albumText?: string;
};
```

  The exact internal names may change, but the port must expose only the data
  needed by catalog tools.
- Scope resolution for:
  - library baseline;
  - source-library public scope id to source-library ref;
  - relation public scope id to owner-relation pool ref;
  - future collection left out.
- `library.catalog.list_scopes` and catalog scope resolution use the same scope
  availability source so returned ids are exactly the ids accepted by
  browse/sample/summary.
- Shared relation-scope id generation moved out of the private Server Host
  helper so `music.discovery.list_scopes`, `library.catalog.list_scopes`, and
  `library.catalog.*` resolve the same public ids.
- Stage Interface catalog browse cursor registry:
  - either a sibling store to `LookupCursorStore` or a deliberately renamed
    public cursor store if that refactor is kept small;
  - public ids are opaque and owner-scoped;
  - cursor payload stores resolved catalog scope, sort, and internal keyset
    position as opaque JSON owned by the catalog handler;
  - cursor pages revalidate the payload shape after resolution.

### Guards

- MDP catalog core read code must not import Stage Interface, Music
  Intelligence, Server Host, provider plugins, transport code, or write
  commands.
- Stage Interface cursor code must not know catalog SQL or Music Data Platform
  fact meaning.
- Cursor owner-scope mismatch returns `invalid_cursor`.
- Scope id mismatch returns `unknown_scope`, not an empty success.

### Verification

`npm run typecheck`; `npm run build:test`; focused catalog read/cursor tests.

### Acceptance

Internal tests can resolve library/source-library/relation scopes, read the
expected owner-visible catalog population, and register/resolve catalog browse
cursors without exposing internal refs.

## PR 23C: `library.catalog.browse`

> Depends on: PR 23A and PR 23B.
> Shippable standalone: yes.

### Goal

Implement paged catalog browsing.

### What lands

- `library.catalog.browse` handler in the MDP stage_adapter.
- Server Host runtime module for Library Catalog, or an extension of the
  existing Music Data Platform library runtime module, wired through
  composition only.
- Time-order query:
  - `recentlyAddedAt DESC`;
  - stable internal tie-breaker;
  - public default when `sort` is omitted.
- Dictionary-order query:
  - public description label ascending;
  - stable internal tie-breaker.
- Cursor-page isolation: cursor pages accept only `cursor` and optional
  `limit`.
- Public output: `{ items, nextCursor? }`; each item has `{ item, description
  }`.

### Guards

- Output sample veil tests reject material refs, source refs, relation refs,
  provider raw ids, and provenance keys.
- Tests prove provider scopes and `all` are rejected.
- Tests prove scope echoes and scope descriptions are absent from browse
  output.
- Tests prove newest-first default and dictionary ordering.
- Tests prove cursor replay preserves original scope and sort and rejects mixed
  cursor-page fields.

### Verification

`npm run typecheck`; `npm run build:test`; catalog browse formal tests; agent
path test through Stage Interface dispatch.

### Acceptance

An agent can browse the library baseline and listed source-library/relation
scopes with stable pagination and leak-free public item handles.

## PR 23D: `library.catalog.sample`

> Depends on: PR 23A and PR 23B.
> Shippable standalone: yes.

### Goal

Implement deterministic seeded sampling over the selected catalog population.

### What lands

- `library.catalog.sample` handler.
- Deterministic sampling using only selected population identity, caller seed,
  and stable internal ordering. A stable hash over `(seed, material identity)`
  is acceptable as long as internal identity never appears in public output.
- Count cap and validation: `1..100`.
- Public output: `{ items }`; each item has `{ item, description }`.

### Guards

- Same state + same scope + same count + same seed returns the same items.
- Changing seed can change the selected items.
- Sampling is over the selected population as a whole and is not recent-only.
- If count exceeds population, output contains the whole population once.
- No summary time bands, no concentration counts, no input echo, no scope
  descriptions.

### Verification

`npm run typecheck`; `npm run build:test`; catalog sample formal tests.

### Acceptance

An agent can request a repeatable sample from a library surface by passing an
explicit seed.

## PR 23E: `library.catalog.summary`

> Depends on: PR 23A, PR 23B, and PR 23D's item projection helper.
> Shippable standalone: yes.

### Goal

Implement the catalog summary tool that gives the agent quick taste/tendency
evidence without unsupported semantic claims.

### What lands

- `library.catalog.summary` handler.
- Timeline-band evidence sampling:
  - sort selected population by `recentlyAddedAt` earliest to latest;
  - split into four equal time bands;
  - distribute `sampleCount` as evenly as possible across bands;
  - within each band, prefer distinct `artistText` when possible;
  - output each band with public item handles and descriptions.
- Concentration signals:
  - `recordingArtists`;
  - `recordingAlbums`;
  - `albumArtists`;
  - `artistItems`;
  - each list capped at ten signals;
  - each signal has `description`, `count`, and up to five example items;
  - signal counts are computed within material kind boundaries.

### Guards

- Tests prove `recording`, `album`, and `artist` facts are not mixed in one
  count.
- Tests prove no naked top-level kind counts are returned.
- Tests prove each signal list is capped at ten and sorted by count descending.
- Tests prove each signal has at most five examples.
- Tests prove `sampleCount` is spread across four time bands as evenly as
  possible.
- Tests prove artist de-duplication is attempted within each band when enough
  distinct artist text exists.
- Tests prove genre/style/mood/Memory/recommendation fields are absent.

### Verification

`npm run typecheck`; `npm run build:test`; catalog summary formal tests; output
veil sample tests.

### Acceptance

An agent can call `library.catalog.summary` and receive a compact,
implementation-backed view of the selected library surface: timeline-spread
public evidence samples plus kind-separated concentration signals.

## PR 23F: Server Host Wiring, Agent Path, MCP Smoke, And State Sync

> Depends on: PR 23C, PR 23D, and PR 23E.
> Shippable standalone: final integration slice.

### Goal

Mount Library Catalog in the default runtime and verify it through the real
agent-facing path.

### What lands

- Server Host default module wiring for Library Catalog.
- Production `StageToolContext` additions for catalog cursors if PR 23B adds a
  cursor store sibling.
- Database schema contribution wiring for catalog cursor registry, if needed.
- Agent-path tests:
  - tool contract appears in `StageInterfaceContract`;
  - dispatch can call list_scopes/browse/sample/summary;
  - MCP rendering exposes descriptors and structured content without raw
    anchors.
- Docs/state sync:
  - update `docs/formal-rebuild/README.md`;
  - update `INDEX.md`;
  - update `CURRENT_STATE.md` and `PROGRESS.md` only when implementation lands;
  - update area docs if the catalog read port changes Music Data Platform
    current design/ports/progress.

### Guards

- Active-tree import guard for MDP core/stage_adapter boundaries.
- Output veil guard for all four tool outputs.
- Contract registry guard that `library.catalog.*` descriptors have handlers in
  the runtime.
- MCP smoke path proves tool names and schema payloads are available through
  the transport.

### Verification

`npm run typecheck`; `npm run build:test`; `npm run test:stage-core`;
targeted MCP stdio smoke if the final wiring changes transport-visible tool
catalog output.

### Acceptance

The default MineMusic runtime exposes `library.catalog.list_scopes`,
`library.catalog.browse`, `library.catalog.sample`, and
`library.catalog.summary` through Stage Interface and MCP with leak-free public
outputs and no provider calls or durable catalog writes.

## Stopping Condition

Phase 23 is complete when all four `library.catalog.*` tools are available in
the default runtime, covered by contract/read/agent-path tests, and reflected
in the appropriate root and area state documents. Until then, this file is a
draft implementation plan, not implemented behavior.
