# MusicBrainz Knowledge Provider Design

## Status

Design draft. No MusicBrainz provider implementation exists yet.

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
`music.knowledge.query` tool:

1. text search.
2. provider-ref lookup.
3. provider-internal browse for ref-based list expansion.

Browse is not exposed as a separate Stage Interface tool. The public tool remains
`music.knowledge.query`.

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
  `release_groups`, `works`, `labels`, `tracklist`, `identifiers`, and `urls`.
- boundary notes: no playable links, no identity confirmation, no Canonical Store
  writes.

The description must not expose MusicBrainz API modes as separate agent actions.
It should help agents form `music.knowledge.query` calls, not teach MusicBrainz
API usage.

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
| `ref.kind = "release"` and `expand` includes `tracklist` | lookup release with recordings, artist credits, labels, and release group includes |

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
| `labels` | label info on releases |
| `tracklist` | release media, tracks, and linked recordings |
| `identifiers` | ISRCs, ISWCs, barcodes, label codes, and similar provider identifiers |
| `urls` | URL relationships and URL entities |

The first public contract should use these general expansion names. Provider
internals may translate them into MusicBrainz API parameters.

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
credited_artist
appears_on_release
part_of_release_group
has_medium
has_track
track_recording
recording_of_work
published_by_label
related_url
musicbrainz_relation
```

When a MusicBrainz relationship type is too specific for a generic predicate,
use `musicbrainz_relation` and preserve the MusicBrainz relationship type,
direction, dates, attributes, and target type in edge `properties`.

## API Constraints

The provider must follow MusicBrainz API usage expectations:

- send a meaningful User-Agent.
- respect MusicBrainz rate limits.
- request JSON responses.
- avoid unbounded browse loops.
- preserve pagination metadata when a browse result is incomplete.

Caching is recommended for implementation, but the first design decision is the
read-only contract and deterministic API plan.

## Non-Goals

- identity confirmation.
- identity confidence.
- local provisional matching.
- Canonical Store writes.
- source or playback links.
- provider writeback to MusicBrainz.
- returning `MusicMaterial`.
