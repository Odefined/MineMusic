# Music Intelligence Design

> Status: Current design authority through Phase 22 metadata lookup search
> Scope: Internal lookup-query service over the Music Data
> Platform metadata lookup search workspace and provider-search port
> Not status ledger: Current implementation state lives in `progress.md`.

Music Intelligence contains Retrieval and Knowledge. The current implemented
The lookup-query service turns Music Data Platform metadata lookup rows
into compact internal query evidence for Stage lookup.

Retrieval is not a Stage Interface tool and does not return `MaterialCard`.
Provider-search pools execute only through a narrow provider-search port wired
by composition. Retrieval still does not import provider plugins, refresh
projections, write facts, score user taste, or make final recommendation
judgements.

## Retrieval Query Service

```text
createMetadataLookupRetrievalQueryService({ searchWorkspace, providerSearch? })
  -> query(input) async
```

Retrieval receives a narrow `MusicDataPlatformMetadataLookupSearchWorkspace`.
It validates query options, normalizes caller input, owns opaque cursor
strings, calls the workspace, and shapes query hits. When `provider_search`
pools are present, Retrieval also requires a narrow provider-search port.
Provider calls happen before the workspace is invoked and outside Music Data
Platform database transactions.

The effective query supports:

- optional `ownerScope`, currently defaulting to the local owner scope;
- optional free-text query;
- optional single `materialKind`;
- optional typed `pools` expression with `allOf`, `anyOf`, and `noneOf`;
- `text_relevance` ordering for metadata lookup;
- keyset pagination through opaque cursors.

Typed pools currently include:

```text
local_catalog
source_library(ref)
owner_relation(ref)
provider_search(providerId, limit?)
```

`local_catalog`, `source_library`, and `owner_relation` map to durable
metadata lookup pool filters. When a query contains `provider_search`, local
durable recall and unresolved provider candidates are mixed through the
Music Data Platform metadata lookup search workspace.
Provider-search pools are accepted only in `anyOf`, require effective
top-level text and `text_relevance` order, reject duplicate provider ids, cap
provider limits at 50, and map `recording | album | artist` material kinds to
source target kinds `track | album | artist`.

`sessionId` is provider-search pass-through only. It is not included in
metadata lookup fingerprints, cursor identity, or result-set identity.

Retrieval normalizes text for query echo with
`NFKC`, trim, lowercase, whitespace collapse, and the shared
`prefix_token` token helper from Contracts. Text that has no usable prefix
token, such as punctuation-only input, is treated as absent text before
Retrieval chooses its effective order. The metadata lookup adapter then builds
a metadata-specific `mlqf_` query fingerprint from owner scope, lookup text,
material kind, normalized pools, rerank profile, normalization version, and
index version. SQL-facing tokenization, recall, reranking, pool algebra, and
typed keyset positions remain owned by Music Data Platform.

## Result Shape

`RetrievalQueryResult` contains:

- the effective normalized query;
- fixed basis flags for owner catalog visibility and blocked exclusion;
- compact `RetrievalQueryHit` rows in the order returned by Music Data
  Platform;
- page limit and optional opaque next cursor.

Each hit includes the material ref/kind or material-candidate ref, projected
display text, matched positive pool refs, and Postgres text-rank evidence.
`rankScore` is explanatory retrieval evidence, not a recommendation score.

Hit display fields come from Music Data Platform metadata lookup rows.
Retrieval does not re-read structured source/material/canonical JSON, does not
reconstruct version facts, and does not expose provider payloads or playable
links.

## Cursor Ownership

Retrieval cursors are internal base64url JSON payloads:

```text
{
  version: 2,
  queryFingerprint,
  position,
  resultSetId?
}
```

The metadata lookup fingerprint includes owner scope, lookup text, material
kind, normalized typed pools, rerank profile, normalization version, and index
version. It excludes `limit`, `sessionId`, and the cursor value. Metadata
lookup cursors include the Music Data Platform result-set id and reuse the
stored result set instead of calling providers again.

Retrieval validates cursor decoding, version, JSON shape, and fingerprint
match. Music Data Platform validates the decoded typed cursor position against
its SQL ordering contract.

## Non-Goals

Retrieval does not implement:

- public Stage Interface query tools;
- provider candidate commit commands;
- SQL joins, pool algebra, FTS/trigram recall, reranking, or raw projection-row
  scanning;
- independent query caches or Music Intelligence-owned projection tables;
- projection maintenance, dirty marking, rebuilds, or writes;
- presentation cards, playable links, query-to-present, or final selection;
- taste scoring, signals, Memory scoring, or Music Experience scoring.
