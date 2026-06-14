# Music Intelligence Ports

> Status: Current boundary authority for Phase 12C Retrieval
> Scope: Internal Retrieval query service and its consumed read capabilities

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `createRetrievalQueryService` | Internal callers and later Stage Interface composition | Validate and normalize retrieval query input, own opaque cursors, call the Music Data Platform retrieval read port, and shape compact query evidence hits. | `src/music_intelligence/retrieval/query_service.ts` |
| `MusicIntelligenceError` | Internal callers/tests | Area-owned errors for invalid retrieval input, invalid cursors, cursor mismatch, and result-shape invariants. | `src/music_intelligence/errors.ts` |

## Consumes

| Consumed capability | Provided by | Used for | Reads | Writes |
| --- | --- | --- | --- | --- |
| `MusicDataPlatformRetrievalReadPort` | Music Data Platform | Query owner-visible catalog/material text projections and read coarse freshness. | `searchOwnerCatalogMaterials(...)`, `getRetrievalFreshness(...)` | None |
| `Ref`, `refKey(ref)`, `MaterialEntityKind`, `hasPrefixOrV1Token(...)` | Contracts | Pool ref validation, shared token-presence fallback, query fingerprinting, and result contracts. | Contract fields and shared token helper | None |

## Retrieval Service Contract

```ts
type CreateRetrievalQueryServiceInput = {
  readPort: MusicDataPlatformRetrievalReadPort;
};

type RetrievalQueryService = {
  query(input: RetrievalQueryInput): RetrievalQueryResult;
};
```

The service is synchronous in Phase 12C because it reads synchronous local
database ports through Music Data Platform. It does not call providers, remote
services, LLMs, or network APIs.

## Dependency Rules

`src/music_intelligence/**` may import:

- shared contracts;
- `src/music_data_platform/index.ts` retrieval read-port contracts;
- its own Music Intelligence modules.

It must not import:

- Music Data Platform commands, repositories, projection record modules, or
  projection maintenance commands;
- Stage Interface, Stage Core, Server Host, Extension provider/plugin
  implementations, Storage, or concrete SQLite adapter modules;
- Music Experience, Memory, Effect Boundary, presentation, provider, or legacy
  query roots.

Retrieval must not import Music Data Platform material text normalization
helpers. Retrieval uses the shared Contracts token helper for
`prefix_or_v1` token-presence fallback, while Music Data Platform continues to
own SQL-facing tokenization and FTS query construction.

## Guards

Current active-tree guards:

- allow only the Phase 12C Music Intelligence source files;
- reject Music Intelligence imports of Stage Interface, Extension, Storage,
  provider/plugin implementations, Music Experience, Memory, Effect Boundary,
  and other unrelated roots;
- reject imports from Music Data Platform internals instead of the public
  `index.ts` boundary;
- reject mentions of low-level Music Data Platform command, repository,
  projection-record, projection-maintenance, or source-of-truth write symbols;
- reject SQL tokens in Music Intelligence source files;
- verify the query service does not sort hits after Music Data Platform returns
  rows.
