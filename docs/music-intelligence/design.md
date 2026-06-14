# Music Intelligence Design

> Status: Current design authority for Phase 12C Retrieval
> Scope: Internal Retrieval query service over the Music Data Platform retrieval
> read port
> Not status ledger: Current implementation state lives in `progress.md`.

Music Intelligence contains Retrieval and Knowledge. Phase 12C introduces only
the Retrieval query service. Retrieval turns local Music Data Platform
query-ready rows into compact internal query evidence for later agent-facing
tools.

Retrieval is not a Stage Interface tool and does not return `MaterialCard`.
It does not call source providers, refresh projections, write facts, score user
taste, or make final recommendation judgements.

## Retrieval Query Service

```text
createRetrievalQueryService({ readPort })
  -> query(input)
```

Retrieval receives a narrow `MusicDataPlatformRetrievalReadPort`. It validates
query options, normalizes caller input, owns opaque cursor strings, calls the
read port, and shapes query hits.

The effective query supports:

- optional `ownerScope`, currently defaulting to the local owner scope;
- optional free-text query;
- optional single `materialKind`;
- optional shallow pool filter with `allOf`, `anyOf`, and `noneOf`;
- `text_relevance`, `recently_added`, or `stable` ordering;
- keyset pagination through opaque cursors.

Retrieval normalizes text for query echo and cursor fingerprinting with
`NFKC`, trim, lowercase, whitespace collapse, and a minimal
`prefix_or_v1` token-presence check. Text that has no usable prefix token,
such as punctuation-only input, is treated as absent text before Retrieval
chooses its effective order or fingerprints the query. SQL-facing tokenization,
prefix-OR FTS construction, field-aware ranking, pool algebra, ordering, and
typed keyset positions remain owned by Music Data Platform.

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
  version: 1,
  queryFingerprint,
  position
}
```

The fingerprint includes owner scope, normalized text, material kind,
normalized pool refs, effective order, and the text matching strategy
`prefix_or_v1`. It excludes `limit` and the cursor value.

Retrieval validates cursor decoding, version, JSON shape, and fingerprint
match. Music Data Platform validates the decoded typed cursor position against
its SQL ordering contract.

## Non-Goals

Retrieval does not implement:

- public Stage Interface query tools;
- provider search or provider candidate materialization;
- SQL joins, pool algebra, FTS ranking, or raw projection-row scanning;
- query caches or new projection tables;
- projection maintenance, dirty marking, rebuilds, or writes;
- presentation cards, playable links, query-to-present, or final selection;
- taste scoring, signals, Memory scoring, or Music Experience scoring.
