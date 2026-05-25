# MusicBrainz Knowledge Provider Design

## Status

Design draft.

## Purpose

The MusicBrainz Knowledge Provider supplies provider-attributed structured music
knowledge from MusicBrainz.

It answers:

```text
What MusicBrainz facts are available through the general Knowledge query?
```

It does not answer:

```text
Which MineMusic canonical identity is correct?
Is this MineMusic provisional record equal to this MusicBrainz MBID?
Is this playable right now?
Should this be recommended?
```

Those decisions belong to Canonical Store review/apply flows, Source Grounding,
Material Resolve, Material Gate, Memory Service, or the LLM-facing
recommendation flow.

## Slot Boundary

The provider registers in the `knowledge` slot and returns `StructuredKnowledge`
items. It must not return `MusicMaterial`, playable links, identity confidence,
or Canonical Store writes.

MusicBrainz MBIDs are provider refs:

```ts
{
  namespace: "musicbrainz",
  kind: "recording",
  id: "<recording-mbid>"
}
```

Provider-only MusicBrainz entity kinds such as `track` may appear as Knowledge
refs even when they are not MineMusic canonical kinds.

## Supported Query Modes

MusicBrainz provider v1 supports three internal API modes behind the general
`knowledge.query` tool:

1. text search.
2. provider-ref lookup.
3. provider-internal browse for ref-based list expansion.

Browse is not exposed as a separate Stage Interface tool. The public tool remains
`knowledge.query`.

These modes are provider-internal. Agents should not be expected to know
MusicBrainz search, lookup, browse, MBIDs, or MusicBrainz API parameters. Agents
use text or MineMusic canonical refs through the general Knowledge Service query
shape, and may use Handbook capability descriptions to choose entity kinds and
expansions.

## Handbook Contribution

The provider may contribute a Handbook capability description for the general
Knowledge tool.

The description may include:

- provider label, such as `MusicBrainz`.
- available format, `structured`.
- supported root entity kinds: `artist`, `recording`, `release`,
  `release_group`, and `work`.
- useful expansion names: `credits`, `relations`, `releases`,
  `release_groups`, `works`, `release_labels`, `tracklist`, `identifiers`, and `urls`.
- boundary notes: no playable links, no identity confirmation, no Canonical Store
  writes.

The description must not expose MusicBrainz API modes as separate agent actions.
It should help agents form `knowledge.query` calls, not teach MusicBrainz
API usage.

## Activation

MusicBrainz provider activation should follow the common plugin configuration
path. The plugin runtime reads plugin `config.json` and registers enabled
providers into their slots.

Runtime options such as request cache location or User-Agent override should
eventually come from plugin `config.json` or explicit Stage Core configuration.
They should not decide whether the provider is enabled.

## Deterministic API Plan

Music Knowledge Service routes either text queries or provider-ref follow-up
queries to the MusicBrainz provider. The provider derives a MusicBrainz API plan
from that routed request.

The public `KnowledgeQuery` must provide exactly one of `text` or
`canonicalRef`. Invalid public query shape should be rejected by Music Knowledge
Service before routing to providers.

When the original agent query uses `canonicalRef`, Music Knowledge Service is
responsible for reading the canonical record and finding attached MusicBrainz
provider refs and canonical context. Canonical context can include kind, label,
aliases, source refs, and provisional relations. The MusicBrainz provider must
not call Canonical Store directly.

### Text Search

If the routed request contains text and no MusicBrainz provider ref, use
MusicBrainz search.

The provider searches the requested `entityKinds`. If `entityKinds` is omitted,
the provider searches `recording` only.

This default keeps text search aligned with MineMusic's common song/recording
lookup path. Agents that want artists, releases, release groups, or works should
set `entityKinds` explicitly.

Each MusicBrainz search hit returns one `StructuredKnowledge` item with:

- `rootNodeId` pointing to the hit entity node.
- `retrievalScore` from MusicBrainz search score when available.
- one MusicBrainz `Ref` on the root node.
- related nodes and edges requested by `expand` when available in the search or
  follow-up lookup response.

`query.limit` limits the number of search hits returned. Default search limit is
5. Maximum first-version limit is 50.

If the original public query used `canonicalRef` but no MusicBrainz provider ref
is attached, Music Knowledge Service may route canonical context to the
MusicBrainz provider for search. The provider may use canonical kind, label,
aliases, source refs, and provisional relations to form a MusicBrainz search
query. Returned search hits are knowledge results only. They are not identity
confirmation that the canonical identity equals a returned MBID.

For canonical `recording` context:

- search MusicBrainz `recording`.
- use the canonical label as the recording title query.
- if provisional relations include `performed_by`, use artist labels as artist
  search context.
- if provisional relations include `appears_on_release`, use release labels as
  optional narrowing context.
- if provisional relations include `has_duration_ms`, use duration as comparison
  context for returned hits, not as raw text.

These fields are search context only. They do not create identity confidence.

For canonical `release` context:

- search MusicBrainz `release`.
- if barcode is available in canonical context, use barcode as the strongest
  search field.
- otherwise use the canonical label as the release title query.
- if context includes artist labels, use them as narrowing context.
- if context includes date, country, label, or release-group title, use them as
  comparison context for returned hits.
- do not use tracklist as the first search query; use tracklist after lookup as
  review context.

These fields are search context only. They do not create identity confidence.

For canonical `artist` context:

- search MusicBrainz `artist`.
- use the canonical label as the primary artist query.
- use aliases as alternate search terms, not as one combined query.
- if context includes country, type, or disambiguation-like notes, use them as
  comparison context for returned hits.
- do not use related recordings or releases as first-search fields.

These fields are search context only. They do not create identity confidence.

For canonical `release_group` context:

- search MusicBrainz `release-group`.
- use the canonical label as the release-group title query.
- if context includes artist labels, use them as narrowing context.
- if context includes primary type, secondary types, or first release date, use
  them as comparison context for returned hits.
- do not use concrete release barcodes as release-group search fields.

These fields are search context only. They do not create identity confidence.

Canonical `work` context search is not part of the first implementation design.
MineMusic models canonical `work`, and MusicBrainz can return work knowledge,
but the current runtime does not yet have a practical path that creates or uses
canonical work records. Add canonical work context search rules when that path
exists.

### Provider-Ref Lookup

If the routed request contains a MusicBrainz provider ref and no requested
expansion requires paged list results, use MusicBrainz lookup for that entity.

The lookup result returns one `StructuredKnowledge` item with:

- `rootNodeId` pointing to the looked-up entity node.
- source attribution for the MusicBrainz entity.
- nodes and edges from the lookup response.

### Browse For List Expansion

If the routed request contains a MusicBrainz provider ref and `query.expand`
requests a list expansion that can exceed lookup include limits, use browse for
that expansion.

The provider should first lookup the root entity when root details are needed,
then use browse to fetch the requested list.

`query.limit` limits browse result lists as well as search hit lists. Default
browse limit is 25. Maximum first-version limit is 50. If a browse list is
incomplete, record pagination metadata on the returned
`StructuredKnowledge` item:

```ts
metadata: {
  truncated: true;
  total?: number;
  limit: number;
  offset?: number;
}
```

Deterministic mappings:

| Query shape | API plan |
| --- | --- |
| `ref.kind = "release_group"` and `expand` includes `releases` | lookup release-group for root details, then browse releases by release group |
| `ref.kind = "artist"` and `expand` includes `release_groups` | lookup artist for root details, then browse release groups by artist |
| `ref.kind = "artist"` and `expand` includes `recordings` | lookup artist for root details, then browse recordings by artist |
| `ref.kind = "artist"` and `expand` includes `works` | lookup artist for root details, then browse works by artist |
| `ref.kind = "label"` and `expand` includes `releases` | lookup label for root details, then browse releases by label |
| `ref.kind = "recording"` and `expand` includes `releases` | lookup recording for root details, then browse releases by recording when lookup limits are insufficient |

Tracklist is not a browse expansion in the first version:

| Query shape | API plan |
| --- | --- |
| `ref.kind = "release"` and `expand` includes `tracklist` | lookup release with recordings, artist credits, release labels, and release group includes |

## First Structured Knowledge Scope

First version root entity kinds:

- `artist`.
- `recording`.
- `release`.
- `release_group`.
- `work`.

Related node kinds:

- `label`.
- `track`.
- `medium`.
- `url`.

`label`, `track`, `medium`, and `url` can appear as related structured knowledge
without becoming primary MineMusic canonical kinds.

## Expansion Mapping

Common `expand` values map to MusicBrainz data as follows:

| `expand` | MusicBrainz knowledge |
| --- | --- |
| `credits` | artist credits and credited names |
| `relations` | MusicBrainz relationships for the queried entity and included entities |
| `releases` | releases linked to recording, release group, artist, or label |
| `release_groups` | release groups linked to artist or release |
| `works` | works linked to recordings or artists |
| `release_labels` | label and catalog-number info on releases |
| `tracklist` | release media, tracks, and linked recordings |
| `identifiers` | additional provider identifiers beyond the default identifiers for the root kind |
| `urls` | URL relationships and URL entities |
| `genres` | MusicBrainz genres attached to returned entities |
| `tags` | MusicBrainz tags attached to returned entities |
| `ratings` | MusicBrainz ratings attached to returned entities |
| `annotation` | MusicBrainz annotation text attached to returned entities |

The first public contract should use these general expansion names. Provider
internals may translate them into MusicBrainz API parameters.

## Default Return Scope

Default fields by root kind:

| Root kind | Default knowledge |
| --- | --- |
| `recording` | MBID, title, disambiguation, duration, artist credit, genres, tags, rating, ISRCs |
| `release` | MBID, title, disambiguation, artist credit, date, country, status, barcode, release group, release labels/catalog numbers, genres, tags, rating |
| `release_group` | MBID, title, disambiguation, artist credit, primary type, secondary types, first release date, genres, tags, rating |
| `artist` | MBID, name, sort name, disambiguation, type, country/area, aliases, genres, tags, rating |
| `work` | MBID, title, disambiguation, type, languages, ISWCs, aliases, genres, tags, rating |

Default exclusions:

| Expansion | Reason |
| --- | --- |
| `relations` | Broad relationship graph. |
| `releases` | Potentially large linked-release list. |
| `release_groups` | Potentially large linked-release-group list. |
| `works` | Relationship-based expansion; request when needed. |
| `tracklist` | Release media and tracks can be large. |
| `urls` | URL relationships can be numerous. |
| `annotation` | Longer free-text notes. |
| `recordings` | Potentially large linked-recording list for artist or work browsing. |

`release` roots include their owning release group by default, not a
`release_groups` list. `release` roots also include `release_labels` by default.
`recording` roots include ISRCs by default. `work` roots include ISWCs by
default. Artist credits are included by default for roots that expose them.
Default descriptive fields are included when MusicBrainz returns them.

Use `expand: ["identifiers"]` when the caller wants extra provider identifiers
beyond the default identifier fields, such as additional label codes, catalog
numbers, or provider-specific identifiers.

## Node And Edge Conventions

Node `type` values should use MusicBrainz-compatible music terms:

```text
artist
recording
release
release_group
work
label
track
medium
url
```

Common edge `predicate` values:

```text
artist_credit
performed_by
composed_by
lyricist
written_by
appears_on_release
part_of_release_group
has_medium
has_track
represents_recording
recording_of_work
published_by_label
related_url
musicbrainz_relation
```

Artist credits should be represented in two forms:

- `artistCreditText` on the credited entity node for easy display.
- `artist_credit` edges from the credited entity node to artist nodes.

`artist_credit` edge properties should include:

```text
creditedName
position
```

The MusicBrainz artist MBID lives on the target artist node's `ref.id`. Do not
duplicate it on the edge. `joinPhrase` does not need a separate structured field
in the first version because `artistCreditText` preserves the display text.
Featuring credits are represented through `artistCreditText` and
`artist_credit` edges in the first version.

`artist_credit` and `performed_by` are distinct. MusicBrainz artist credits
describe how an entity is credited for display. MusicBrainz artist-recording
performer, vocal, instrument, orchestra, conductor, and similar relationships
describe contribution roles and should map to `performed_by`.

Tracklists should preserve that `recording` is the primary music entity and
`track` is a release-specific tracklist entry.

Use this structure:

```text
release --has_medium--> medium
medium --has_track--> track
track --represents_recording--> recording
```

Track node properties should hold release-specific fields such as `position`,
`number`, `title`, and `length`. Recording node properties should hold
recording-level fields such as title, duration, artist credit, and identifiers.

When a MusicBrainz relationship type is too specific for a generic predicate,
use `musicbrainz_relation` and preserve the MusicBrainz relationship type,
direction, dates, attributes, and target type in edge `properties`.

Important MusicBrainz relationship types should map to common predicates when
possible:

- performance or performer-style recording relationships -> `performed_by`.
- composer relationships -> `composed_by`.
- lyricist relationships -> `lyricist`.
- writer relationships -> `written_by`.

`performed_by` edge properties should preserve the specific MusicBrainz role and
attributes when available:

```text
role
attributes
```

Examples of role values include `performer`, `vocal`, `instrument`, and
`conductor`.

Common node `properties` should include MusicBrainz descriptive fields when
available:

```text
genres
tags
rating
disambiguation
annotation
```

In the first implementation, annotation may be stored as `properties.annotation`
on the relevant node.

Full MusicBrainz relationships should be fetched when `expand` includes
`relations`. Artist credits and the default descriptive fields above are not
considered full relationships for this rule.

`works` is a narrow expansion for work links. `relations` is the broad
relationship expansion and includes work links when available.

URL relationships should be fetched when `expand` includes `urls` or
`relations`.

`rating` should preserve MusicBrainz public community rating shape:

```ts
rating: {
  value: number;
  votesCount?: number;
}
```

The first implementation should not request authenticated `user-ratings`.

`genres` and `tags` should preserve MusicBrainz structure instead of flattening
to strings:

```ts
genres: Array<{
  id?: string;
  name: string;
  count?: number;
  disambiguation?: string;
}>;

tags: Array<{
  name: string;
  count?: number;
}>;
```

## Persistent HTTP Cache

The first MusicBrainz implementation should use persistent HTTP response cache,
not only in-memory cache.

Cache record:

```ts
type ProviderHttpCacheEntry = {
  providerId: "musicbrainz";
  cacheKey: string;
  requestUrl: string;
  responseJson: unknown;
  status: number;
  fetchedAt: string;
  lastUsedAt: string;
};
```

Rules:

- cache successful MusicBrainz JSON responses by normalized request URL.
- cache entries do not expire automatically.
- reads should use cache by default when a matching entry exists.
- cache cleanup is explicit maintenance work.
- cleanup should be based on `lastUsedAt`, not `fetchedAt`.
- maintenance may list least-recently-used entries, clear entries unused for a
  chosen duration, keep the most recently used N entries, or clear the
  MusicBrainz cache.
- `fetchedAt` records when the response was fetched from MusicBrainz.
- `lastUsedAt` records when the cached response was most recently used.
- failed responses should not be cached in the first implementation.

The cache is provider HTTP cache, not a Knowledge Store and not Canonical Store.

Storage should be a generic provider HTTP cache repository, not a
MusicBrainz-specific table. The first SQLite-backed implementation can serve
MusicBrainz first, but the boundary should allow later providers such as
Discogs, Wikidata, or document providers to reuse the same cache.

Stage Core should inject the cache dependency into providers that need it.
Plugin `config.json` or explicit Stage Core configuration may later provide the
cache database path.

Cache maintenance should exist behind an internal or admin boundary, not the
ordinary agent-facing music tool surface. Useful maintenance operations include:

```text
listLeastRecentlyUsed
deleteUnusedSince
deleteByProvider
clearProvider
```

These operations may be exposed later through scripts or governed admin tools.
They should not be part of `knowledge.query`.

## API Constraints

The provider must follow MusicBrainz API usage expectations:

- send a meaningful User-Agent.
- respect MusicBrainz rate limits.
- request JSON responses.
- avoid unbounded browse loops.
- preserve pagination metadata when a browse result is incomplete.

The first implementation should use a project default MusicBrainz User-Agent.
Optional User-Agent override should come from plugin `config.json` or explicit
provider configuration once that configuration path exists.

MusicBrainz network requests should pass through a provider-internal rate
limiter:

- cache hits do not wait on the rate limiter.
- cache misses wait before making MusicBrainz HTTP requests.
- default public API rate is at most 1 request per second.
- tests should be able to inject a fake clock or no-wait limiter.

Expected provider error mapping:

```text
knowledge.provider_unavailable
knowledge.rate_limited
knowledge.timeout
knowledge.malformed_response
```

These error codes should be added to shared contracts when implementation starts.

## MusicBrainz References

- MusicBrainz API: <https://musicbrainz.org/doc/MusicBrainz_API>
- MusicBrainz API examples: <https://musicbrainz.org/doc/MusicBrainz_API/Examples>
- Artist credits: <https://musicbrainz.org/doc/Artist_Credits>
- Artist-recording relationship types:
  <https://musicbrainz.org/relationships/artist-recording>
- Artist relationship guide:
  <https://musicbrainz.org/doc/Artist_Relationship_Guide_for_Artists>

## Non-Goals

- identity confirmation.
- identity confidence.
- local provisional matching.
- Canonical Store writes.
- source or playback links.
- provider writeback to MusicBrainz.
- returning `MusicMaterial`.
