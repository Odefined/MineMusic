# MusicBrainz Knowledge Provider Design

## Status

Current MusicBrainz Knowledge Provider design authority. Implementation state
lives in `docs/knowledge-slot/progress.md`; historical sequencing evidence is
archived under `docs/archive/knowledge-slot/`.

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
  `release_groups`, `recordings`, `works`, `release_labels`, `tracklist`,
  `identifiers`, `urls`, `genres`, `tags`, `ratings`, and `annotation`.
- useful relation focus values: `members`.
- boundary notes: no playable links, no identity confirmation, no Canonical Store
  writes.

The description must not expose MusicBrainz API modes as separate agent actions.
It should help agents form `knowledge.query` calls, not teach MusicBrainz
API usage.

## Activation

MusicBrainz provider activation should remain a host runtime decision behind the
Knowledge slot. The local MCP runtime may register the bundled MusicBrainz
provider directly; common plugin configuration can later supply the same
provider through the generic provider-factory path.

Runtime options such as request cache location or User-Agent override should
eventually come from plugin `config.json` or explicit Stage Core configuration.
They should not decide whether the provider is enabled.

## Deterministic API Plan

Music Knowledge Service routes text queries, Canonical Store context queries,
direct `providerRef` lookups, Tag Queries, Field Queries, and provider-internal
follow-up lookups to the MusicBrainz provider. The provider derives a
MusicBrainz API plan from that routed request.

The public `KnowledgeQuery` must provide exactly one query entry: `text`,
`canonicalRef`, `providerRef`, a Tag Query represented by non-empty
`tagQuery`, or a Field Query represented by non-empty `fieldQuery`.
Invalid public query shape should be rejected by Music Knowledge Service before
routing to providers.

Empty `tagQuery` arrays are invalid query shape.
Tag strings that normalize to empty strings are also invalid query shape.
Empty `fieldQuery` objects and empty field values are invalid query shape.

`filters` is not a query entry and does not participate in query-entry mutual
exclusion. The first filter family is `filters.tags`; it can narrow or order
items found by text search, Field Search, Tag Search, or provider-ref lookup
when the returned facts include tags or genres.
Filters cannot be the only query condition.
MusicBrainz filters apply to root items returned by the query entry, not to
expanded child facts in the first implementation.
For root items with no returned tags or genres, `filters.tags.include` removes
the item and `filters.tags.exclude` does not remove it.
All include tags must be present on the root item. Any excluded tag removes the
root item.
After normalization, `filters.tags.exclude` must not overlap with
`filters.tags.include`. `filters.tags` may be used with Tag Search, but exclude
tags must not overlap with the effective Tag Query tags.
`filters.tags.include` does not need to be a subset of Tag Search query tags.
Any-of tag matching belongs to Tag Search, not to `filters.tags.include`.

When the original agent query uses `canonicalRef`, Music Knowledge Service is
responsible for reading the canonical record and finding attached MusicBrainz
provider refs and canonical context. Canonical context can include kind, label,
aliases, source refs, and provisional relations. The MusicBrainz provider must
not call Canonical Store directly.

When the query uses `providerRef`, the MusicBrainz provider treats it as the
direct MusicBrainz lookup ref. `canonicalRef` is never interpreted as a
MusicBrainz MBID; it only identifies a MineMusic Canonical Store record.

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
- related nodes and relations requested by `expand` when available in the search
  or follow-up lookup response.

If a text query requests an expansion that search does not return, the provider
must use each returned search hit's MusicBrainz ref, up to `query.limit`, and
run the deterministic lookup or browse step before returning the item. The agent
still makes one general `knowledge.query` call and does not need to know the
MusicBrainz search, lookup, or browse API.

Text-query expansion follows the same expansion rules as provider-ref lookup or
browse after the search hit supplies the provider ref. For example:

| Text search hit | Requested expansion | Follow-up step |
| --- | --- | --- |
| `artist` | `relations` + `relationFocus: ["members"]` | lookup artist relationships, then keep membership relations |
| `artist` | `release_groups` | browse release groups by artist |
| `artist` | `recordings` | browse recordings by artist |
| `artist` | `works` | browse works by artist |
| `release` | `tracklist` | lookup release with media, tracks, recordings, artist credits, release labels, and release group |
| `release_group` | `releases` | browse releases by release group |
| `recording` | `releases` | lookup recording releases first; browse by recording when lookup limits are insufficient |

Example:

```json
{
  "text": "My Bloody Valentine",
  "entityKinds": ["artist"],
  "expand": ["relations"],
  "relationFocus": ["members"]
}
```

This should search artists, take each returned artist MBID, look up artist
relationships for the returned artists, then return membership relationship
facts with dates and role attributes.

`query.limit` limits the number of search hits returned. Default search limit is
5. Maximum first-version limit is 50.

### Field Search

If the routed request contains a Field Query and no MusicBrainz provider ref,
use MusicBrainz indexed search with provider-specific fields derived from the
general music-domain fields. Agents must not send raw MusicBrainz Lucene syntax
or MusicBrainz field names.

Field Search is MusicBrainz indexed search, not canonical scoping or exact
identity confirmation. A returned hit remains provider-attributed knowledge.
The first MusicBrainz Field Search does not implement canonical scoped search.
For recording searches, `fieldQuery.release` maps to MusicBrainz release-style
search data. It is not a strict release-group tracklist scope.

The first Field Query field set is:

| General field | MusicBrainz mapping |
| --- | --- |
| `title` | root title field for the requested kind: `recording`, `release`, `releasegroup`, `artist`, or `work` |
| `artist` | `artist` where the MusicBrainz index supports it |
| `release` | `release` where the MusicBrainz index supports it |
| `label` | `label` where the MusicBrainz index supports it |
| `date` | `date` or `firstreleasedate`, depending on root kind |
| `country` | `country` where the MusicBrainz index supports it |
| `barcode` | `barcode` for release search |
| `catalogNumber` | `catno` for release search |
| `type` | `type`, `primarytype`, or `secondarytype`, depending on root kind |

If `entityKinds` is omitted, Field Search should search `recording`.

Unsupported fields for a requested `entityKind` should be ignored with a warning
when other fields remain usable. If no supplied field can be mapped for a
requested kind, the provider should return no items for that kind and warn.

`type` is mapped per MusicBrainz entity kind. It does not imply one global type
vocabulary across artists, release groups, releases, recordings, and works.

Multiple usable Field Query fields should be joined with `AND` in the
MusicBrainz indexed search query.

Field Query values are strings. The first MusicBrainz Field Search does not
translate array values into `OR` queries.

`date` values should be passed as escaped string terms for the mapped date field.
The first MusicBrainz Field Search does not implement date ranges.

`country` values should be uppercased and sent as two-letter country-code
terms. The provider should not translate country names to codes.

Field Search should quote or escape values when building MusicBrainz search
queries. It should not expose regular expressions, fuzzy searches, wildcards, or
arbitrary boolean operators as public Knowledge contract behavior.

Field Search may use the same opaque cursor continuation contract as Tag Search
and text search.
When `filters.tags` is present, Field Search may fetch more internal candidates
than the public `limit` so filtering can still fill the public result chunk. The
returned chunk must not exceed `limit`, and remaining candidate space should be
continued through `nextCursor`.
The first MusicBrainz implementation can use an internal candidate cap such as
`min(limit * 5, 50)`; this cap is provider implementation detail, not public
Knowledge contract.
Before applying `filters.tags`, the provider must ensure each root item has
MusicBrainz `tags` and `genres` available. If the search response does not carry
them, the provider should perform follow-up lookup for the root item before
filtering.

### Tag Search

If the routed request contains a Tag Query and no MusicBrainz provider ref, use
MusicBrainz indexed search with `tag:` clauses. The provider searches the
requested `entityKinds`. If `entityKinds` is omitted, the provider searches
`recording` only.

Supported Tag Query root kinds match the first structured knowledge root scope:

- `artist`.
- `label`.
- `recording`.
- `release`.
- `release_group`.
- `work`.

The provider mechanically normalizes `tagQuery` and `filters.tags` before
building the API request or filtering root items. It must not rewrite musical
meaning. For example, `post-rock` remains `post-rock`, while `post rock` remains
`post rock` after basic whitespace normalization. Choosing provider-useful tag
names is the agent's responsibility.

If MusicBrainz returns no items after tag query and filter checks, the provider
may use the existing warning channel to say that no MusicBrainz results matched
the requested tags.

MusicBrainz search should use `tag:` rather than `genre:`. `genre:` is not the
reliable public search field for this use case. Example:

```text
tag:"ambient" OR tag:"post-rock" OR tag:"neoclassicism"
```

When `filters.tags.include` is present with Tag Search, the provider may include
those required tags in the internal MusicBrainz search query as an optimization,
for example:

```text
(tag:"ambient" OR tag:"post-rock") AND tag:"shoegaze"
```

The provider must still verify the final result against returned `tags` and
`genres`; the public contract does not expose the MusicBrainz query syntax.

The first MusicBrainz implementation should not push `filters.tags.exclude` into
the indexed search query. Exclusion is applied after returned `tags` and
`genres` are available.

After search, the provider must inspect returned entity facts before returning
items:

- collect tag names from both MusicBrainz `tags` and MusicBrainz `genres`.
- drop items that match none of the effective query tags.
- apply `filters.tags.include` and `filters.tags.exclude` to root items.
- compute `matchedTags` and `matchedTagCount`.
- order results by larger `matchedTagCount` first, using MusicBrainz search
  score as a provider-local tie breaker when available.

MusicBrainz search score should remain `retrievalScore`. The provider must not
overwrite it with `matchedTagCount`.

Tag Search should return `tags` and `genres` on root entity properties by
default. Agents should not need to request `expand: ["tags", "genres"]` to see
the match basis.

Tag Search may use the same expansion follow-up rules as text search. The
provider first finds root entities by tags, then uses root MusicBrainz refs for
requested lookup or browse expansions when supported. `query.limit` continues to
limit root search results, not expanded child facts.

Tag Search may use `relationFocus` when `expand` includes `relations`, using the
same focused relationship mapping as text search follow-up. If `relationFocus`
is present without `expand: ["relations"]`, the provider may warn that the focus
was ignored.

MusicBrainz Tag Search returns `StructuredKnowledge` only. If `formats` excludes
`structured`, the provider should return no MusicBrainz items and may emit a
warning rather than generating text knowledge.

`query.limit` is global to the whole tag response, not per MusicBrainz entity
kind. When a Tag Query requests multiple `entityKinds`, the provider may fetch
additional internal candidates per kind to rank mixed results, but the returned
chunk should not exceed the query limit.

Mixed-kind Tag Query results should be ordered across entity kinds by
provider-local match quality: larger `matchedTagCount` first, then MusicBrainz
search score when available, then stable provider order.
MusicBrainz tag and genre `count` values should be preserved as facts, but the
first Tag Search should not rank primarily by those counts.

The first MusicBrainz Tag Search does not implement negative tag clauses or
agent-facing tag exclusion fields.
Tag exclusion belongs to `filters.tags.exclude` after the query entry has found
candidate items.

The first MusicBrainz Tag Search does not implement per-tag weights. Importance
is not represented by tag weights in the first version.

Each returned `StructuredKnowledge` item should preserve provider facts and add
retrieval metadata:

```ts
metadata: {
  matchedTags: string[];
  matchedTagCount: number;
}
```

The tag metadata uses mechanically normalized tag names. It describes this
retrieval operation only; it is not a recommendation score, identity confidence,
or new MusicBrainz fact.

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
- nodes and relations from the lookup response.

### Browse For List Expansion

If the routed request contains a MusicBrainz provider ref and `query.expand`
requests a list expansion that can exceed lookup include limits, use browse for
that expansion.

The provider should first lookup the root entity when root details are needed,
then use browse to fetch the requested list.

`query.limit` limits browse result lists as well as search hit lists. Default
browse limit is 25. Maximum first-version limit is 50. If a browse list is
incomplete, return an opaque top-level `nextCursor` when the provider can
continue the same query. The cursor may encode MusicBrainz offsets internally,
but offsets must not be exposed as agent-facing API.

Item metadata may still record local list truncation details for explanation or
debugging:

```ts
metadata: {
  truncated: true;
  total?: number;
  limit: number;
  offset?: number;
}
```

When `cursor` is supplied, the provider should verify that the cursor belongs to
the same effective query shape except for `limit`. Detectably mismatched cursor
use should return a non-retryable invalid-query error.
MusicBrainz cursors should bind to the provider-local API plan they continue.
The provider-local continuation state is wrapped by Music Knowledge Service into
the public opaque `nextCursor`.
The public cursor is a short-lived continuation token, not a durable MusicBrainz
bookmark.

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
- `label`.
- `recording`.
- `release`.
- `release_group`.
- `work`.

Related node kinds:

- `track`.
- `medium`.
- `url`.

`track`, `medium`, and `url` can appear as related structured knowledge without
becoming primary MineMusic canonical kinds.

## Expansion Mapping

Common `expand` values map to MusicBrainz data as follows:

| `expand` | MusicBrainz knowledge |
| --- | --- |
| `credits` | artist credits and credited names |
| `relations` | MusicBrainz relationships for the queried entity and included entities |
| `releases` | releases linked to recording, release group, artist, or label |
| `release_groups` | release groups linked to artist or release |
| `recordings` | recordings linked to artist or work |
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

### Relation Focus

`relationFocus` narrows the relationship family returned by `expand:
["relations"]` without exposing MusicBrainz relationship type names to agents.

The first supported value is `members`.

For artist roots, `members` maps to MusicBrainz artist relationships of type
`member of band` where MusicBrainz returns `direction: "backward"` from the
group artist lookup. The provider may request the broader MusicBrainz
artist-relationship include and then filter the returned relationships before
building `StructuredKnowledge`.

Returned member facts should include:

- the member artist node.
- a relation object connecting the group artist and member artist endpoints.
- `type: "member of band"` on the relation.
- `direction: "backward"` on the relation.
- endpoint roles `group` and `member`.
- `begin`, `end`, and `ended` when MusicBrainz returns them.
- relationship attributes such as `lead vocals`, `guitar`, or `drums`.

Time status is represented by the returned date fields. Agents that need to
answer current-lineup questions should read those fields and attributes.

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

## Node And Relation Conventions

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

Provider-derived structural relation `type` values:

```text
artist_credit
part_of_release_group
has_medium
has_track
represents_recording
published_by_label
```

Artist credits should be represented in two forms:

- `artistCreditText` on the credited entity node for easy display.
- `artist_credit` relations between the credited entity node and artist nodes.

`artist_credit` relation properties should include:

```text
creditedName
position
```

The MusicBrainz artist MBID lives on the target artist node's `ref.id`. Do not
duplicate it on the relation. `joinPhrase` does not need a separate structured
field in the first version because `artistCreditText` preserves the display
text. Featuring credits are represented through `artistCreditText` and
`artist_credit` relations in the first version.

`artist_credit` and MusicBrainz performance relationships are distinct. MusicBrainz artist credits
describe how an entity is credited for display. MusicBrainz artist-recording
performer, vocal, instrument, orchestra, conductor, and similar relationships
describe contribution roles and should keep their MusicBrainz relationship type.

Tracklists should preserve that `recording` is the primary music entity and
`track` is a release-specific tracklist entry.

Use this structure:

```text
has_medium endpoints: release, medium
has_track endpoints: medium, track
represents_recording endpoints: track, recording
```

Track node properties should hold release-specific fields such as `position`,
`number`, `title`, and `length`. Recording node properties should hold
recording-level fields such as title, duration, artist credit, and identifiers.

MusicBrainz relationship types from API `relations` should be kept as the
Knowledge relation `type`. Direction, dates, attributes, target type, and link
phrases should be preserved on the relation when MusicBrainz returns them.
Endpoints use the root node kind and target node kind as roles by default, such
as `recording` and `work`. MusicBrainz membership relationships use the clearer
roles `group` and `member`.

For example, a MusicBrainz `performance` relation should return:

```text
type: performance
attributes
direction
```

Examples of attribute values include `performer`, `vocal`, `instrument`, and
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

When `relationFocus` is present, fetch the smallest MusicBrainz relationship
include family that can answer that focus, then filter returned relationships
before producing Knowledge relations. For `relationFocus: ["members"]` on artist
roots, fetch artist relationships and return only membership-style relations.

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
