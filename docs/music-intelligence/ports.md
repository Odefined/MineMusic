# Music Intelligence Ports

> Status: Current boundary authority through Phase 22 metadata lookup search
> Scope: Internal Retrieval-compatible metadata lookup query service and its consumed search/provider
> capabilities

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `createMetadataLookupRetrievalQueryService` | Internal callers and Stage Interface composition | Validate and normalize Retrieval query input, own opaque cursors, map local durable pools to the Music Data Platform metadata lookup search workspace, execute provider-search pools through a narrow provider-search port, and shape compact query evidence hits. | `src/music_intelligence/core/search/metadata_lookup_retrieval_adapter.ts` |
| `RetrievalProviderSearchPort` | Server Host composition adapter | Narrow provider-search capability consumed by Retrieval without importing Extension or provider plugins. | `src/music_intelligence/core/retrieval/contracts.ts` |
| `MusicIntelligenceError` | Internal callers/tests | Area-owned errors for invalid retrieval input, provider-search pool validation, provider-search unavailable/failed/invalid-result mapping, invalid retrieval cursors, and result-shape invariants. | `src/music_intelligence/errors.ts` |

## Consumes

| Consumed capability | Provided by | Used for | Reads | Writes |
| --- | --- | --- | --- | --- |
| `MusicDataPlatformMetadataLookupSearchWorkspace` | Music Data Platform | Build/read metadata lookup result sets and candidate cache pages through the owning Music Data Platform boundary. | `searchMetadataLookupResultSet(...)` | None from Retrieval; Music Data Platform owns internal runtime writes. |
| `RetrievalProviderSearchPort` | Server Host composition, backed by Extension Runtime | Search source providers for provider-search pools without depending on provider/plugin internals. | `search(...)` | None |
| `Ref`, `refKey(ref)`, `MaterialEntityKind`, `hasPrefixOrV1Token(...)` | Contracts | Pool ref validation, shared token-presence fallback, query fingerprinting, and result contracts. | Contract fields and shared token helper | None |

## Retrieval Service Contract

```ts
type CreateMetadataLookupRetrievalQueryServiceInput = {
  searchWorkspace: MusicDataPlatformMetadataLookupSearchWorkspace;
  providerSearch?: RetrievalProviderSearchPort;
};

type RetrievalQueryService = {
  query(input: RetrievalQueryInput): Promise<RetrievalQueryResult>;
};
```

The service is async because provider-search pools can call provider search
through the narrow provider-search port. Local-only metadata lookup uses the
same async API without provider calls.

`RetrievalQueryInput` uses typed `pools`, not the removed `poolFilter` field.
The query service maps only durable local pools to the Music Data Platform
metadata lookup search workspace:

```text
local_catalog -> local owner catalog base / no-op in the workspace input
source_library(ref) -> source_library ref in durablePoolFilter
owner_relation(ref) -> owner_material_relation_pool ref in durablePoolFilter
provider_search(providerId, limit?) -> provider search input, then metadata lookup workspace providerCandidates
```

The Music Data Platform metadata lookup workspace must not accept the full
provider-aware `RetrievalPool` union.

Provider-search execution rules:

- provider-search pools are accepted only in `anyOf`;
- provider-search requires effective top-level text and `text_relevance`;
- provider ids must be unique within the query;
- provider limit defaults to `min(query.limit * 2, 50)` and cannot exceed 50;
- material kind maps only `recording -> track`, `album -> album`, and
  `artist -> artist`;
- `sessionId` is passed to providers but excluded from fingerprints and cursor
  identity;
- cursor pages reuse the metadata lookup result set and do not call providers
  again.

## Dependency Rules

`src/music_intelligence/**` may import:

- shared contracts;
- `src/music_data_platform/index.ts` metadata lookup search workspace
  contracts;
- its own Music Intelligence modules.

It must not import:

- Music Data Platform commands, repositories, projection record modules, or
  projection maintenance commands;
- Stage Interface, Stage Core, Server Host, Extension provider/plugin
  implementations, Storage, or concrete storage adapter modules;
- Music Experience, Memory, Effect Boundary, presentation, provider, or legacy
  query roots.

Retrieval must not import Music Data Platform material text or search metadata
normalization helpers. Retrieval uses the shared Contracts token helper for
`prefix_or_v1` token-presence fallback in compatibility normalization, while
Music Data Platform owns SQL-facing metadata lookup normalization, recall, and
reranking.

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
  rows;
- verify Music Intelligence does not mention Music Data Platform runtime
  result-set/cache table names and does not sort hits after Music Data Platform
  returns rows;
- verify Retrieval does not import Extension/server/provider internals and
  provider plugins do not import Music Data Platform write/storage modules.
