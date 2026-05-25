# Knowledge Slot Design

## Status

Design draft. The current TypeScript implementation still exposes the thin MVP
`MusicMaterial[]` knowledge query path. This document records the target
contract discussion before implementation.

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
- The old `MusicMaterial[]` Knowledge path should not be kept as a compatibility
  method when the target contract is implemented.
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

## Proposed Top-Level Contract

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
  edges: KnowledgeEdge[];
  retrievalScore?: number;
  metadata?: Record<string, unknown>;
};
```

Structured knowledge uses generic graph primitives rather than first-slice
music-specific typed objects.

```ts
export type KnowledgeNode = {
  id: string;
  ref?: Ref;
  type: string;
  label?: string;
  properties?: Record<string, unknown>;
};

export type KnowledgeEdge = {
  id?: string;
  subject: string;
  predicate: string;
  object: string;
  properties?: Record<string, unknown>;
};
```

`KnowledgeNode.id` is stable within the `StructuredKnowledge` item. `ref` carries
a provider ref when one is available. `type` and `predicate` should use
music-friendly names such as `artist`, `recording`, `release`, `work`,
`artist_credit`, `appears_on_release`, or `recording_of_work`, but the contract
does not require a MusicBrainz-specific object model.

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
nodes, and edges. Lookup by exact provider ref usually returns one structured
item. Search or browse calls that produce multiple provider hits should not merge
those hits into one large structured item at the provider boundary.

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

Structured knowledge must remain provider-attributed. An edge can say that
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

Proposed target shape:

```ts
export type KnowledgeQuery = {
  text?: string;
  canonicalRef?: Ref;
  purpose?: "lookup" | "explain" | "review" | "discover";
  formats?: Array<"structured" | "text">;
  entityKinds?: string[];
  expand?: string[];
  limit?: number;
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

If `formats` is omitted, the Knowledge service may return the best
available mix from registered providers.

`text` is for open knowledge lookup when no MineMusic identity is known.
`canonicalRef` is for knowledge lookup around a MineMusic canonical identity.
Agents should not pass provider refs such as MusicBrainz MBIDs as ordinary query
input.

First-version `KnowledgeQuery` must provide exactly one of `text` or
`canonicalRef`. If both are present or both are absent, Music Knowledge should
return a non-retryable invalid-query error. If a future flow needs text as a hint
for canonical lookup, it should introduce a separate hint field rather than
overloading `text`.

`expand` asks a provider to return related knowledge around the primary query
result. It controls response breadth only. It is not an identity signal and does
not imply confidence.

Common expansion names should be readable to agents, such as `credits`,
`relations`, `releases`, `release_groups`, `works`, `labels`, `tracklist`,
`identifiers`, and `urls`. Unsupported expansions should produce warnings when
possible instead of failing the whole query.

When `canonicalRef` is supplied, Music Knowledge Service may use Canonical Store
to read source/provider refs already attached to that canonical identity. Slot
providers must not call Canonical Store directly.

A `canonicalRef` query does not require every provider to have an attached
provider ref. Providers that require a provider ref may return no items with a
warning when no usable ref exists. Providers that can use general canonical
context, such as label or aliases, may still return knowledge. No provider may
treat label-based retrieval as identity confirmation.

## Stage Interface Exposure

Stage Interface should expose Knowledge through one general read-only tool:

```text
music.knowledge.query
```

The tool accepts `KnowledgeQuery` and returns `KnowledgeResult`.

Agents should use this tool to ask for music knowledge. They should not call
provider-specific tools such as MusicBrainz search directly. Provider selection,
registration, and aggregation belong behind Music Knowledge and Plugin Slots.

Agents may query by text or by a MineMusic canonical ref. They should not need
to know provider refs such as MusicBrainz MBIDs. Provider refs may appear in
returned knowledge items, but they are not the ordinary agent-facing identity
input.

The first public tool should not write Canonical Store state. It can return
knowledge items for explanation or later review, but identity confirmation and
apply operations remain separate Canonical Store workflows.

Provider-specific filtering can be added later if a real use case needs it. It
should not be part of the first public tool contract.

Knowledge providers may contribute capability descriptions for Handbook
generation. These descriptions can tell agents what kind of knowledge is
available through the general tool, such as supported formats, entity kinds, and
expansion names.

Provider Handbook contributions must not expose provider-internal API modes or
transport details as agent actions. For example, a MusicBrainz provider may say
that it can return structured recording, release, artist, release group, and
work facts with expansions such as `credits`, `releases`, `works`, `tracklist`,
`labels`, `identifiers`, and `relations`. It should not teach agents to call
MusicBrainz search, lookup, browse, or MusicBrainz API parameters directly.

## Migration Rule

When the target contract is implemented, `MusicKnowledgePort.query` should move
directly from `MusicMaterial[]` to `KnowledgeResult`.

Do not keep a compatibility method such as `queryMaterials`. Knowledge should not
remain a material provider. Any current caller that expects `MusicMaterial[]`
must either move to `music.knowledge.query` for knowledge items or use Material
Resolve / Source Grounding for material resolution.

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

## Decision Queue

The general Knowledge Slot contract decisions in this draft are resolved enough
to plan implementation. Future design should cover the Canonical Store
LLM-assisted review/apply workflow separately.
