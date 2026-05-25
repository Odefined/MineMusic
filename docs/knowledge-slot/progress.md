# Knowledge Slot Progress

## Current Implementation State

- Shared Knowledge contracts now expose `KnowledgeResult`, `KnowledgeItem`,
  `StructuredKnowledge`, `TextKnowledge`, `KnowledgeNode`, `KnowledgeEdge`, and
  `KnowledgeSource`.
- `KnowledgeQuery` now accepts exactly one of `text` or `canonicalRef`, plus
  optional `purpose`, `formats`, `entityKinds`, `expand`, `relationFocus`, and
  `limit`. The first supported relation focus is `members`.
- `KnowledgeProvider.query` and `MusicKnowledgePort.query` now return
  `Result<KnowledgeResult>`.
- Shared Knowledge error codes now include invalid-query and provider failure
  cases for the target Knowledge Slot implementation.
- Music Knowledge Service now validates public query shape, including supported
  `relationFocus` values, aggregates `KnowledgeItem[]` from registered
  Knowledge providers, preserves provider warnings, and passes Canonical Store
  context to providers for `canonicalRef` queries.
- Provider descriptors now carry Knowledge capability metadata for supported
  formats, entity kinds, expansions, relation focus values, and boundary notes,
  and Handbook rendering includes those fields on the dedicated Knowledge
  instrument.
- The read-only `knowledge.query` Stage Interface tool is now exposed
  through the `minemusic.knowledge` instrument, stable tool descriptors,
  dispatch, input schema, Stage Core wiring, and MCP tool definitions.
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
  selected relations to `StructuredKnowledge`, maps artist membership
  relationships to `has_member`, and uses the generic Provider HTTP Cache for
  successful JSON responses.
- MusicBrainz text queries now honor expansion requests that require follow-up
  provider calls for supported cases. The provider can search by text, use the
  returned MusicBrainz ref internally for lookup or browse, and return expanded
  facts without requiring the agent to know MusicBrainz MBIDs.
- Stage Core now accepts explicit Knowledge provider instances and generic
  Knowledge provider factories. Factories receive the Stage Core Provider HTTP
  Cache, so MusicBrainz can be registered without a provider-specific
  environment-variable switch. The default MCP runtime forwards the same
  explicit Knowledge provider options.
- The default local MCP runtime now registers the bundled MusicBrainz Knowledge
  provider when no explicit Knowledge providers or factories are supplied. This
  makes the installed `minemusic.knowledge.query` path usable for MusicBrainz
  facts without exposing a MusicBrainz-specific agent tool.

## Remaining Work

- Common plugin configuration still needs to become the durable activation path
  for bundled and third-party Knowledge providers.
