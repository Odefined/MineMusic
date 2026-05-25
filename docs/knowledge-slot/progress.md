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

## Remaining Work

- MusicBrainz Knowledge Provider is not implemented yet.
