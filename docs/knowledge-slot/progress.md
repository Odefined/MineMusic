# Knowledge Slot Progress

## Current Implementation State

- Shared Knowledge contracts now expose `KnowledgeResult`, `KnowledgeItem`,
  `StructuredKnowledge`, `TextKnowledge`, `KnowledgeNode`, `KnowledgeEdge`, and
  `KnowledgeSource`.
- `KnowledgeQuery` now accepts exactly one of `text` or `canonicalRef`, plus
  optional `purpose`, `formats`, `entityKinds`, `expand`, and `limit`.
- `KnowledgeProvider.query` and `MusicKnowledgePort.query` now return
  `Result<KnowledgeResult>`.
- Shared Knowledge error codes now include invalid-query and provider failure
  cases for the target Knowledge Slot implementation.
- Music Knowledge Service now validates public query shape, aggregates
  `KnowledgeItem[]` from registered Knowledge providers, preserves provider
  warnings, and passes Canonical Store context to providers for `canonicalRef`
  queries.
- Provider descriptors now carry Knowledge capability metadata for supported
  formats, entity kinds, expansions, and boundary notes, and Handbook rendering
  includes those fields on the owning music instrument.
- The read-only `music.knowledge.query` Stage Interface tool is now exposed
  through stable tool descriptors, dispatch, input schema, Stage Core wiring, and
  MCP tool definitions.
- Generic Provider HTTP Cache storage now has shared entry/repository contracts,
  in-memory storage, SQLite storage, `lastUsedAt` updates on read, and explicit
  least-recently-used maintenance operations.
- Stage Core now creates and exposes Provider HTTP Cache storage. Callers can
  inject a repository directly or provide a database path for SQLite-backed
  cache storage, and the default MCP runtime accepts an explicit cache path
  option.
- MusicBrainz Knowledge Provider now exists as a read-only Knowledge provider.
  It exposes a Knowledge capability descriptor, supports text search for
  artist, recording, release, release group, and work facts, supports
  MusicBrainz-ref lookup through Canonical context source refs, supports
  deterministic browse expansions for release-group releases and artist release
  groups, maps tracklists, labels, ratings, tags, genres, annotations, and
  selected relations to `StructuredKnowledge`, and uses the generic Provider
  HTTP Cache for successful JSON responses.

## Remaining Work

- Runtime MusicBrainz registration through future plugin `config.json` remains
  future work. The current implementation can be instantiated explicitly in
  tests or host wiring without adding a MusicBrainz-specific environment
  variable.
