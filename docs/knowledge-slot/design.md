# Knowledge Slot Design

## Status

Current design authority. Implementation state lives in
`docs/knowledge-slot/progress.md`; historical sequencing evidence is archived
under `docs/archive/knowledge-slot/`.

## Discussion Summary

MineMusic needs the Knowledge Slot to support more than one style of knowledge
provider.

MusicBrainz-like providers are structured music databases. They naturally return
entities, stable provider refs, fields, and relationships such as artist credits,
release tracklists, labels, barcodes, recording-work links, and other advanced
relations.

Document-style knowledge bases are retrieval systems over passages from sources
such as docs, web pages, wikis, liner notes, interviews, catalog notes, or other
text corpora. They naturally return source-attributed text with retrieval
metadata.

The shared boundary is not `MusicMaterial[]`. It is provider-attributed
knowledge that can ground an LLM or feed a later review flow without becoming
MineMusic canonical authority by itself.

## Purpose

Knowledge Slot providers answer:

```text
What provider-attributed music knowledge is available for this text query or
MineMusic canonical identity?
```

They do not answer:

```text
Which MineMusic canonical identity is correct?
Is this local provisional record equal to this provider ref?
Is this playable right now?
Should this be recommended?
What confidence should MineMusic assign to an identity match?
```

Those decisions belong to Canonical Store review/apply flows, Source Grounding,
Material Resolve, Material Gate, Memory Service, or the LLM-facing
recommendation flow.

## Established Decisions

- Knowledge Slot's primary output should not be `MusicMaterial[]`.
- The old `MusicMaterial[]` Knowledge path is not kept as a compatibility
  method.
- Knowledge output is provider-attributed and source-attributed.
- Knowledge providers may return structured facts or text retrieval results.
- MusicBrainz should be a Music Knowledge provider first, not an identity
  confirmation provider.
- MusicBrainz MBIDs are provider refs and facts. They are not MineMusic
  canonical refs.
- Knowledge Slot must not emit `candidate`, `evidence`, or `confidence` as
  identity-review concepts.
- Provider search scores or retrieval scores may exist only as retrieval
  relevance, not as truth confidence or identity confidence.
- Canonical Store owns identity review, confirmation, activation, relation
  confirmation, merge, and reject decisions.
- LLM assistance belongs in Canonical Store review workflows and must not write
  directly to Canonical Store repositories.
- Knowledge provider activation should come from plugin runtime configuration.
  Plugin `config.json` is the intended configuration source. Until the loader
  exists, tests and host surfaces may pass explicit runtime options, but those
  options should not become per-provider activation switches.

## Top-Level Contract

The target shape should keep the top level small:

```ts
export type KnowledgeResult = {
  items: KnowledgeItem[];
};

export type KnowledgeItem =
  | StructuredKnowledge
  | TextKnowledge;
```

`StructuredKnowledge` covers structured provider facts.

```ts
export type StructuredKnowledge = {
  kind: "structured";
  providerId: string;
  source: KnowledgeSource;
  rootNodeId?: string;
  nodes: KnowledgeNode[];
  relations: KnowledgeRelation[];
  retrievalScore?: number;
  metadata?: Record<string, unknown>;
};
```

Structured knowledge uses provider-attributed nodes and relation objects rather
than first-slice music-specific typed objects.

```ts
export type KnowledgeNode = {
  id: string;
  ref?: Ref;
  type: string;
  label?: string;
  properties?: Record<string, unknown>;
};

export type KnowledgeRelation = {
  id?: string;
  type: string;
  endpoints: KnowledgeRelationEndpoint[];
  direction?: "forward" | "backward" | "none" | (string & {});
  phrases?: {
    forward?: string;
    reverse?: string;
    long?: string;
  };
  properties?: Record<string, unknown>;
};

export type KnowledgeRelationEndpoint = {
  nodeId: string;
  role?: string;
};
```

`KnowledgeNode.id` is stable within the `StructuredKnowledge` item. `ref` carries
a provider ref when one is available. Node `type` and relation `type` should use
music-friendly names such as `artist`, `recording`, `release`, `work`,
`artist_credit`, `appears_on_release`, or `recording_of_work`, but the contract
does not require a MusicBrainz-specific object model.

A relation is not required to pick a subject and object. Direction, when the
provider has one, is recorded as provider context. Relations with no inherent
direction can use `direction: "none"` or omit direction and rely on endpoint
roles.

`rootNodeId` is a provider-declared primary node for the structured result. It
points to a `KnowledgeNode.id` in the same item. Knowledge Service must not infer
it when the provider does not provide a single primary entity. `rootNodeId` is
review context only; it is not identity authority.

## Provider Refs

Knowledge provider refs use the shared `Ref` shape.

```ts
export type Ref = {
  namespace: string;
  kind: string;
  id: string;
  label?: string;
  url?: string;
};
```

For MusicBrainz refs:

- `namespace` is `musicbrainz`.
- `kind` is the MusicBrainz entity kind, such as `artist`, `recording`,
  `release`, `release_group`, `work`, `label`, or `track`.
- `id` is the MusicBrainz identifier for that entity.
- `label` and `url` may be included for display and source navigation.

Provider-only kinds are allowed in Knowledge refs. For example,
`{ namespace: "musicbrainz", kind: "track", id: "<mbid>" }` is valid structured
knowledge even though `track` is not currently a MineMusic canonical kind.

## Structured Result Grouping

Structured search results should return one `StructuredKnowledge` item per
provider hit.

Each hit can carry its own `rootNodeId`, `retrievalScore`, source attribution,
nodes, and relations. Lookup by exact provider ref usually returns one
structured item. Search or browse calls that produce multiple provider hits
should not merge those hits into one large structured item at the provider
boundary.

Later review, UI, or orchestration layers may group or compare items, but the
Knowledge provider contract should preserve provider result boundaries.

`TextKnowledge` covers document-style retrieval.

```ts
export type TextKnowledge = {
  kind: "text";
  providerId: string;
  source: KnowledgeSource;
  content: string;
  retrievalScore?: number;
  metadata?: Record<string, unknown>;
};
```

Shared source attribution:

```ts
export type KnowledgeSource = {
  ref?: Ref;
  url?: string;
  label?: string;
  retrievedAt?: string;
};
```

This shape intentionally avoids separate top-level types for tables, timelines,
annotations, media, and excerpts. Structured knowledge can be represented inside
`StructuredKnowledge`; textual retrieval can be represented inside `TextKnowledge`.
More item kinds should only be added if structured/text cannot express a real
provider contract without distortion.

## Structured Knowledge

`StructuredKnowledge` is for entity-and-relation providers.

Examples:

- MusicBrainz artist, recording, release, release group, work, label, and URL
  facts.
- MusicBrainz artist credits as structured credited-artist nodes or properties.
- Release media and tracklists as release-scoped structure.
- Recording duration, ISRCs, release appearances, and work links.
- Work composer, lyricist, arranger, translator, publisher, and derivative
  relations.
- Label catalog and barcode facts.

Provider-only entities may appear in structured knowledge when the source has them. For
example, MusicBrainz tracks can appear as provider facts inside a release
tracklist even though `track` is not currently a MineMusic canonical kind.

Structured knowledge must remain provider-attributed. A relation can say that
MusicBrainz relates a recording MBID to a work MBID; it cannot say that a
MineMusic provisional recording is confirmed as that MBID.

## Text Knowledge

`TextKnowledge` is for retrieval-style knowledge.

Examples:

- source passages from docs, web pages, wikis, or liner notes.
- cleaned text chunks from OCR or HTML extraction.
- source-attributed catalog notes or interview excerpts.
- provider-returned snippets that can ground LLM explanation or review.

`retrievalScore` is allowed only as retrieval relevance. It must not be reused as
identity confidence, fact confidence, memory confidence, or recommendation
score.

## Query Model

Agents should query by knowledge intent, not by provider internals or storage
shape. Structured/text should be a preference, not the business action.

Contract shape:

```ts
export type KnowledgeQuery = {
  text?: string;
  canonicalRef?: Ref;
  providerRef?: Ref;
  tagQuery?: string[];
  fieldQuery?: KnowledgeFieldQuery;
  filters?: KnowledgeFilters;
  purpose?: "lookup" | "explain" | "review" | "discover";
  formats?: Array<"structured" | "text">;
  entityKinds?: string[];
  expand?: string[];
  relationFocus?: Array<"members">;
  limit?: number;
  cursor?: string;
};

export type KnowledgeResult = {
  items: KnowledgeItem[];
  nextCursor?: string;
};

export type KnowledgeFieldQuery = {
  title?: string;
  artist?: string;
  release?: string;
  label?: string;
  date?: string;
  country?: string;
  barcode?: string;
  catalogNumber?: string;
  type?: string;
};

export type KnowledgeFilters = {
  tags?: KnowledgeTagFilter;
};

export type KnowledgeTagFilter = {
  include?: string[];
  exclude?: string[];
};
```

Examples:

```ts
{
  text: "Intro by The xx",
  purpose: "lookup",
  entityKinds: ["recording"],
  limit: 5
}
```

```ts
{
  text: "Intro by The xx",
  purpose: "review",
  formats: ["structured"],
  entityKinds: ["recording", "release", "artist"],
  expand: ["credits", "duration", "releases", "relations"]
}
```

```ts
{
  text: "The xx Intro background and release context",
  purpose: "explain",
  formats: ["text"],
  limit: 3
}
```

```ts
{
  entityKinds: ["recording"],
  tagQuery: ["ambient", "post-rock", "neoclassicism"],
  limit: 10
}
```

```ts
{
  entityKinds: ["recording"],
  fieldQuery: {
    title: "Sacred Play Secret Place",
    artist: "matryoshka"
  },
  filters: {
    tags: {
      include: ["ambient"],
      exclude: ["new age"]
    }
  },
  limit: 5
}
```

If `formats` is omitted, the Knowledge service may return the best
available mix from registered providers.

`text` is for open knowledge lookup when no MineMusic identity is known.
`canonicalRef` is for knowledge lookup around a MineMusic canonical identity.
`providerRef` is for direct lookup of a provider-native ref when the caller
already has one from a previous Knowledge result or another trusted provider
path. It is not a Canonical Store ref.

Target `KnowledgeQuery` must provide exactly one query entry:

- `text`.
- `canonicalRef`.
- `providerRef`.
- a Tag Query, represented by non-empty `tagQuery`.
- a Field Query, represented by non-empty `fieldQuery`.

These entries are mutually exclusive. For example, `text` must not be mixed with
`tagQuery`, `fieldQuery` must not be mixed with `tagQuery`, and `canonicalRef`
or `providerRef` must not be mixed with another query entry. If a future flow
needs text as a hint for another lookup mode, it should introduce a separate
hint field rather than overloading `text`.

`filters` is not a query entry and does not participate in query-entry
mutual exclusion. It narrows or orders items found by the query entry.
Filters cannot be the only query condition. If the caller wants to search by
tags alone, it should use the Tag Query entry.

The first filter family is `filters.tags`:

```ts
filters: {
  tags: {
    include: ["ambient", "post-rock"],
    exclude: ["new age"]
  }
}
```

`filters.tags.include` is a hard condition: every returned item must carry all
listed include tags. `filters.tags.exclude` is a hard exclusion: items carrying
any excluded tag must be removed.

If a root item has no returned tags or genres, `filters.tags.include` should
remove it and `filters.tags.exclude` should not remove it.
After mechanical normalization, `filters.tags.exclude` must not overlap with
`filters.tags.include`; such overlap should be rejected as invalid query shape.
`filters.tags` may be used with the Tag Query entry. For example, a caller may
search by `tagQuery` and use `filters.tags.exclude` to remove unwanted tagged
items. `filters.tags.exclude` must also not overlap with the effective Tag Query
tags.
`filters.tags.include` does not need to be a subset of `tagQuery`; it can add
hard tag requirements after the Tag Query has found candidates.
The first tag filter does not have any-of include semantics. If the caller wants
to find items matching one or more tags, it should use the Tag Query entry.

The first filter contract includes `filters.tags` only. Do not add
`filters.fields` until field filtering has its own concrete use case and
include/exclude semantics.

Filters apply to root items returned by the query entry. They do not filter
expanded child facts in the first contract. If the caller wants recordings, it
should set `entityKinds: ["recording"]` rather than querying an artist root and
expecting `filters.tags` to filter `expand: ["recordings"]`.

Providers may fetch more internal candidates than `limit` when filters could
remove candidates before the public result chunk is filled. The returned result
chunk still must not exceed `limit`, and continuation should use `nextCursor`
when more candidates may exist.

Tag Query arrays must either be omitted or non-empty. Empty `tagQuery` arrays
should be rejected as invalid query shape rather than treated as absent.

Each tag string must remain non-empty after mechanical normalization. A tag that
normalizes to an empty string should make the query invalid rather than being
silently dropped.

`fieldQuery` is a first-class Knowledge lookup entry for common music-domain
fields. It is not a raw provider query language. The first field set is:

- `title`.
- `artist`.
- `release`.
- `label`.
- `date`.
- `country`.
- `barcode`.
- `catalogNumber`.
- `type`.

Field Query implementations should translate these fields to provider-specific
search fields internally. Agents should not send MusicBrainz Lucene syntax,
provider field names such as `arid` or `qdur`, regular expressions, fuzzy
search syntax, wildcards, or arbitrary boolean query trees through
`fieldQuery`.

Field Query fields are provider search conditions, not canonical scope or exact
identity equality. For example, `fieldQuery.artist` asks providers to search for
items with matching artist text or indexed artist data; it does not confirm that
the returned item belongs to a specific MineMusic canonical artist.
The first Field Query contract does not support canonical scoped search such as
"recordings under this confirmed canonical artist." That needs a later explicit
scope model.
For `entityKinds: ["recording"]`, `fieldQuery.release` is a provider search
condition for recordings associated with a release-like title. It is not a
strict "only this confirmed album tracklist" scope.

`fieldQuery` must contain at least one non-empty field value after mechanical
string normalization. Empty `fieldQuery` objects or fields that normalize to
empty strings should be rejected as invalid query shape.

If a Field Query omits `entityKinds`, the default entity kind is `recording`.

Multiple fields in a Field Query are conjunctive by default: providers should
look for items satisfying all usable fields. Agents that want broad free-text
matching should use `text` instead of `fieldQuery`.

Field Query values are strings in the first contract. Array values and implicit
`OR` semantics are not supported.

`date` is a string field. The first contract allows year-like or date-like
values, such as `2012` or `2012-12-12`, but does not include range fields such
as `dateFrom`, `dateTo`, or `yearRange`.

`country` uses a two-letter ISO 3166-1 alpha-2 country code. Providers may
normalize casing, but the Knowledge service should not translate country names
such as `Japan` or `日本` into country codes.

`type` is interpreted within each requested `entityKind`. It is not a global
MineMusic type vocabulary. Agents should avoid mixing `type` with multiple
entity kinds when the intended provider type meaning would be ambiguous.

`tagQuery` is a first-class Knowledge lookup entry. It is not a post-search
filter. It asks providers for entities carrying provider-attributed tags. The
default result semantics are:

- return items that match one or more effective query tags.
- rank items with more matched effective query tags earlier when the provider
  can support or approximate that ranking.
- do not treat matched tag count as recommendation score, identity confidence,
  or fact confidence.

When a Tag Query returns no items, providers may use the existing warning
channel to explain that no provider results matched the requested tags. This
does not add a field to `KnowledgeResult`.

Tag names in `tagQuery` and `filters.tags` are mechanically normalized before
query planning and comparison:

- trim leading and trailing whitespace.
- lowercase.
- Unicode normalize.
- collapse repeated whitespace.
- deduplicate.

The Knowledge service must not rewrite tag meaning. It must not perform synonym
expansion, style inference, vocabulary lookup, or spelling conversion such as
`post rock` to `post-rock`. The agent is responsible for choosing provider-useful
tag names.

Tag Query results should expose retrieval metadata without turning it into music
facts. Structured results may use item metadata such as:

```ts
metadata: {
  matchedTags: ["ambient", "post-rock"],
  matchedTagCount: 2
}
```

All tag names in this metadata use the mechanically normalized form. Provider
facts remain in `properties.tags` and `properties.genres`.

`matchedTagCount` must stay separate from `retrievalScore`. `retrievalScore`
remains provider retrieval relevance when the provider supplies one; it must not
be overwritten with tag-match count or interpreted as recommendation score.
Provider tag counts may be returned as provider facts, but the first Tag Query
contract does not use tag counts as the primary ranking rule.

A Tag Query should return tag and genre facts for root entities by default. The
agent should not need to add `expand: ["tags", "genres"]` merely to understand
why a tag result matched.

If a Tag Query omits `entityKinds`, the default entity kind is `recording`.

Tag Query may use `expand`. The provider should first find root items by tag,
then fetch requested related knowledge around those roots when it can. `limit`
continues to limit root items in the response chunk; expanded child facts do not
become additional top-level items merely because they were fetched through an
expansion.

Tag Query may use `relationFocus` when `expand` includes `relations`.
`relationFocus` has no effect without a relationship expansion; providers may
warn about ignored relation focus instead of failing the whole query.

Tag Query is not limited to structured providers. A provider may support Tag
Query for structured items, text items, or both. A provider must not synthesize a
format it does not own; if `formats` excludes every format a provider can
return, that provider should return no items and may emit a warning.
Document-style knowledge bases may support Tag Query when their passages or
documents have provider-attributed tags, but the Tag Query contract does not
require a document storage/index design in the first implementation.

The first Tag Query contract does not include tag exclusion. Avoid fields such
as `tagMustExclude` until the product has a concrete provider-grounded need for
negative tag queries.

Tag exclusion belongs to `filters.tags.exclude`, not to the Tag Query entry.

The first Tag Query and tag filter contract does not include per-tag weights.
`tagQuery`, `filters.tags.include`, and `filters.tags.exclude` are string arrays.

`limit` controls the maximum number of items in one response chunk. `cursor` is
an opaque continuation token for continuing the same Knowledge query. `cursor`
must not expose provider offsets, provider ids, or storage details to the agent.
When a result has more data available, `KnowledgeResult.nextCursor` carries the
token for the next chunk.

`limit` is global to the whole Knowledge query response. It is not per provider,
per format, or per `entityKinds` value. Providers may fetch additional internal
candidates when needed for ranking, but the returned chunk should not exceed the
query limit.

When a Tag Query requests multiple `entityKinds`, results may be mixed across
entity kinds. The primary ordering remains tag-match quality for the whole
query, not entity-kind grouping. Agents that need separate groups should make
separate queries.

When `cursor` is supplied, all query fields except `limit` must describe the same
query as the original request. Providers or the Knowledge service should reject
detectably mismatched cursor use with a non-retryable invalid-query error.
Providers that cannot continue a query simply omit `nextCursor`.

Continuation is tied to the provider set that produced the cursor. If the
registered Knowledge provider set changes between chunks and that change is
detectable, the Knowledge service may reject the cursor as invalid rather than
mixing old and new result spaces.

Cursor creation is layered. Providers may return provider-local continuation
state to Music Knowledge Service, but the public `nextCursor` is generated by
Music Knowledge Service and remains opaque to Stage Interface and agents. A
later request gives the public cursor back to Music Knowledge Service, which
routes decoded provider-local continuation state to the appropriate providers.

`nextCursor` is a short-lived continuation token, not a bookmark or durable
knowledge identifier. It does not need to remain valid across server restarts,
provider-set changes, provider cache maintenance, or long time intervals. If a
cursor cannot be decoded or resumed, the service should reject it as invalid
rather than guessing a continuation.

`expand` asks a provider to return related knowledge around the primary query
result. It controls response breadth only. It is not an identity signal and does
not imply confidence.

Common expansion names should be readable to agents, such as `credits`,
`relations`, `releases`, `release_groups`, `recordings`, `works`,
`release_labels`, `tracklist`, `identifiers`, `urls`, `genres`, `tags`,
`ratings`, and `annotation`.
Unsupported expansions should produce warnings when possible instead of failing
the whole query.

`expand` is a request for a broader information package. It must be honored for
text queries as well as ref-backed queries whenever the provider can do so. For
example, a text query for an artist with `expand: ["relations"]` should not stop
at a search hit when the provider can use the hit's provider ref to fetch the
requested relationship facts internally.

`relations` may be too broad for common agent questions. A query may include a
coarse `relationFocus` to ask for a smaller relationship family without exposing
provider-specific relationship names:

```ts
relationFocus?: Array<"members">;
```

The first focus value is `members`, used for questions such as "who is in this
band?" or "who is the vocalist?". It filters returned relationship facts to
membership-style relationships and preserves relationship dates and attributes,
such as instruments or vocal roles. Agents should read `begin`, `end`, `ended`,
and attributes from returned facts when they need to answer a time-sensitive
question.

When `canonicalRef` is supplied, Music Knowledge Service may use Canonical Store
to read source/provider refs already attached to that canonical identity. Slot
providers must not call Canonical Store directly.

A `canonicalRef` query does not require every provider to have an attached
provider ref. Providers that require a provider ref may return no items with a
warning when no usable ref exists. Providers that can use general canonical
context, such as label or aliases, may still return knowledge. No provider may
treat label-based retrieval as identity confirmation.

When `providerRef` is supplied, Music Knowledge Service routes it directly to
providers and does not read Canonical Store context. A provider may ignore refs
outside its namespace or unsupported kinds.

## Stage Interface Exposure

Stage Interface should expose Knowledge through one general read-only tool:

```text
knowledge.query
```

The tool lives under the dedicated `minemusic.knowledge` instrument. It accepts
`KnowledgeQuery` and returns `KnowledgeResult`.

Agents should use this tool to ask for music knowledge. They should not call
provider-specific tools such as MusicBrainz search directly. Provider selection,
registration, and aggregation belong behind Music Knowledge and Plugin Slots.

Agents may query by text, by a MineMusic canonical ref, or by Tag Query. They
should not need to know provider refs such as MusicBrainz MBIDs. Provider refs
may appear in returned knowledge items, but they are not the ordinary
agent-facing identity input.

The first public tool should not write Canonical Store state. It can return
knowledge items for explanation or later review, but identity confirmation and
apply operations remain separate Canonical Store workflows.

Coarse relation focus is part of the general Knowledge query contract. It is not
provider-specific filtering and should not teach agents provider terms such as
MusicBrainz relationship include names.

Knowledge providers may contribute capability descriptions for Handbook
generation. These descriptions can tell agents what kind of knowledge is
available through the general tool, such as supported formats, entity kinds, and
expansion names. If a provider supports coarse relationship narrowing, the
description may also list supported `relationFocus` values.

Provider Handbook contributions must not expose provider-internal API modes or
transport details as agent actions. For example, a MusicBrainz provider may say
that it can return structured recording, release, artist, release group, and
work, and label facts with expansions such as `credits`, `relations`, `releases`,
`release_groups`, `recordings`, `works`, `release_labels`, `tracklist`,
`identifiers`, `urls`, `genres`, `tags`, `ratings`, and `annotation`. It may say
that `tagQuery` finds entities by provider-attributed tags, that
`filters.tags.include` and `filters.tags.exclude` narrow tag results, and that
`relationFocus: ["members"]` narrows relationships to band-member facts. It
should not teach agents to call MusicBrainz search, lookup, browse, offsets, or
MusicBrainz API parameters directly.

## Material Boundary

`MusicKnowledgePort.query` returns `KnowledgeResult` directly.

Knowledge does not keep a compatibility material-output method such as
`queryMaterials`, and it is not a material provider. Callers that need
playable/source-grounded material must use Material Resolve / Source Grounding
rather than `knowledge.query`.

## MusicBrainz Implications

MusicBrainz should map naturally to `StructuredKnowledge`.

The provider-specific MusicBrainz design lives in
`docs/knowledge-slot/musicbrainz-provider.md`.

First useful structured facts:

- artist: MBID, name, sort name, disambiguation, country, type, aliases, and
  relations.
- recording: MBID, title, artist credit, duration, ISRCs, release appearances,
  work relations, and recording-level relations.
- release: MBID, title, artist credit, date, country, status, barcode, labels,
  media, tracklist, and release group.
- release group: MBID, title, artist credit, primary type, secondary types,
  first release date, and releases.
- work: MBID, title, type, languages, ISWCs, attributes, recording relations,
  artist relations, and work-work relations.

MusicBrainz search scores should be represented, if needed, as retrieval
relevance only. They are not MineMusic identity confidence.

## Canonical Store Boundary

Knowledge items can feed a later Canonical Store review flow, but they must not
apply canonical changes.

Allowed later flow:

```text
Knowledge Slot -> KnowledgeItem[] -> Canonical review proposal -> governed apply
```

Forbidden flow:

```text
Knowledge provider -> direct canonical write
Knowledge provider -> identity confidence -> automatic activate/merge
LLM -> direct repository write
```

The review/apply workflow remains a separate design. It may use LLM assistance
to summarize facts, compare possible identities, and draft an apply proposal, but
Canonical Store must own the actual state transitions.

## Future Design Queue

Future design should cover the Canonical Store LLM-assisted review/apply
workflow separately.
