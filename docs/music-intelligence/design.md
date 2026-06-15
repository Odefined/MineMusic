# Music Intelligence Design

> Status: Current design authority through Phase 15D provider-search retrieval
> Scope: Internal Retrieval query service over the Music Data Platform retrieval
> read/mixed ports and provider-search port
> Not status ledger: Current implementation state lives in `progress.md`.

Music Intelligence contains Retrieval and Knowledge. The current implemented
Retrieval service turns Music Data Platform query-ready rows into compact
internal query evidence for later agent-facing tools.

Retrieval is not a Stage Interface tool and does not return `MaterialCard`.
Provider-search pools execute only through a narrow provider-search port wired
by composition. Retrieval still does not import provider plugins, refresh
projections, write facts, score user taste, or make final recommendation
judgements.

## Retrieval Query Service

```text
createRetrievalQueryService({ readPort, mixedRetrievalWorkspace?, providerSearch? })
  -> query(input) async
```

Retrieval receives a narrow `MusicDataPlatformRetrievalReadPort`. It validates
query options, normalizes caller input, owns opaque cursor strings, calls the
read port, and shapes query hits.
When `provider_search` pools are present, Retrieval also requires a
Music Data Platform mixed retrieval workspace and a narrow provider-search
port. Provider calls happen before the mixed workspace is invoked and outside
Music Data Platform database transactions.

The effective query supports:

- optional `ownerScope`, currently defaulting to the local owner scope;
- optional free-text query;
- optional single `materialKind`;
- optional typed `pools` expression with `allOf`, `anyOf`, and `noneOf`;
- `text_relevance`, `recently_added`, or `stable` ordering;
- keyset pagination through opaque cursors.

Typed pools currently include:

```text
local_catalog
source_library(ref)
owner_relation(ref)
provider_search(providerId, limit?)
```

`local_catalog`, `source_library`, and `owner_relation` map to the local
Music Data Platform retrieval read port for local-only queries. When a query
contains `provider_search`, local durable recall and provider candidates are
mixed through the Music Data Platform mixed retrieval workspace.
Provider-search pools are accepted only in `anyOf`, require effective
top-level text and `text_relevance` order, reject duplicate provider ids, cap
provider limits at 50, and map `recording | album | artist` material kinds to
source target kinds `track | album | artist`. The removed `poolFilter` input
and bare `Ref[]` pool groups are not accepted.

`sessionId` is provider-search pass-through only. It is not included in
Retrieval fingerprints, cursor identity, or result-set identity.

Retrieval normalizes text for query echo and cursor fingerprinting with
`NFKC`, trim, lowercase, whitespace collapse, and the shared
`prefix_or_v1` token helper from Contracts. Text that has no usable prefix
token, such as punctuation-only input, is treated as absent text before
Retrieval chooses its effective order or fingerprints the query.
SQL-facing tokenization, prefix-OR FTS construction, field-aware ranking, pool
algebra, ordering, and typed keyset positions remain owned by Music Data
Platform.

## Result Shape

`RetrievalQueryResult` contains:

- the effective normalized query;
- fixed basis flags for owner catalog visibility and blocked exclusion;
- compact `RetrievalQueryHit` rows in the order returned by Music Data
  Platform;
- page limit and optional opaque next cursor;
- coarse projection freshness evidence.

Each hit includes the material ref/kind, projected display text, matched
positive pool refs, optional matched text evidence, and optional text-rank
evidence. `rankScore` is present only for effective `text_relevance` queries
and is explanatory retrieval evidence, not a recommendation score.

Hit display fields come from projected material text columns. Retrieval does
not re-read structured source/material/canonical JSON, does not reconstruct
version facts, and does not expose provider payloads or playable links.

`matchedText.summary` is a small deterministic phrase derived from matched
field/token evidence, such as `title matched plainsong; version matched live`.
It is not localized and is not used for ranking.

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

The fingerprint includes owner scope, normalized text, material kind,
normalized typed pools, effective order, and the text matching strategy
`prefix_or_v1`. It excludes `limit`, `sessionId`, and the cursor value.
Local-only cursors omit `resultSetId`; mixed provider-search cursors include
the Music Data Platform result-set id and reuse the stored result set instead
of calling providers again.

Retrieval validates cursor decoding, version, JSON shape, and fingerprint
match. Music Data Platform validates the decoded typed cursor position against
its SQL ordering contract.

## Non-Goals

Retrieval does not implement:

- public Stage Interface query tools;
- provider candidate commit commands;
- SQL joins, pool algebra, FTS ranking, or raw projection-row scanning;
- query caches or new projection tables;
- projection maintenance, dirty marking, rebuilds, or writes;
- presentation cards, playable links, query-to-present, or final selection;
- taste scoring, signals, Memory scoring, or Music Experience scoring.
