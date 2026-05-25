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

## Remaining Work

- Provider Handbook capability descriptors are not implemented yet.
- The `music.knowledge.query` Stage Interface tool is not implemented yet.
- Generic provider HTTP cache storage is not implemented yet.
- MusicBrainz Knowledge Provider is not implemented yet.
