# Knowledge Slot Progress

## Current Implementation State

- Shared Knowledge contracts now expose `KnowledgeResult`, `KnowledgeItem`,
  `StructuredKnowledge`, `TextKnowledge`, `KnowledgeNode`,
  `KnowledgeRelation`, `KnowledgeRelationEndpoint`, `KnowledgeSource`, and
  endpoint-based structured relations.
- The public structured Knowledge output now uses `relations` for provider
  relationship facts and no longer returns legacy `edges`.
- `KnowledgeQuery` now accepts exactly one query entry: `text`,
  `canonicalRef`, `tagQuery`, or `fieldQuery`, plus optional `filters`,
  `purpose`, `formats`, `entityKinds`, `expand`, `relationFocus`, `limit`, and
  `cursor`. The first supported relation focus is `members`.
- `KnowledgeResult` now carries optional opaque `nextCursor` continuation.
- `KnowledgeProvider.query` and `MusicKnowledgePort.query` now return
  `Result<KnowledgeResult>`.
- Shared Knowledge error codes now include invalid-query and provider failure
  cases for the target Knowledge Slot implementation.
- Music Knowledge Service now validates public query shape, including supported
  `relationFocus` values, Tag Query / Field Query mutual exclusion, tag-filter
  normalization, `purpose`, `formats`, `entityKinds`, `expand`, first-version
  `limit` bounds, and cursor-query compatibility. It aggregates
  `KnowledgeItem[]` from registered Knowledge providers, preserves provider
  warnings, passes Canonical Store context to providers for `canonicalRef`
  queries, and wraps provider-local continuation state into public opaque
  cursors. It now applies `limit` as a global response cap across providers and
  passes only the remaining item budget to later providers.
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
  artist, label, recording, release, release group, and work facts, supports
  Tag Query over provider-attributed tags, supports Field Query over mapped
  music-domain fields, supports provider-local cursor continuation for
  search-backed text, tag, and field queries with simple provider offset
  cursors, current-page root de-duplication, and internal Tag Query refill for
  filtered-empty provider pages, honors the
  provider's structured-only format capability, applies text-search `limit`
  across requested root `entityKinds`, supports
  MusicBrainz-ref lookup through Canonical context source refs, supports
  deterministic browse expansions for release-group releases and artist release
  groups, maps tracklists, labels, ratings, tags, genres, annotations, and
  selected relations to `StructuredKnowledge.relations` with endpoint roles, and
  uses the generic Provider HTTP Cache for successful JSON responses. Its
  default HTTP requester preserves non-JSON error response status codes so 429
  responses still map to `knowledge.rate_limited`.
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
- Streamable HTTP MCP smoke against the restarted local MineMusic server now
  confirms focused MusicBrainz member queries return endpoint-based
  `relations`, do not return legacy `edges`, and do not include forward
  `member of band` relations as root group members.

## Remaining Work

- Document-style Knowledge storage and indexing are not part of the first Tag
  Query implementation slice.
- Field Query remains provider search-condition matching, not strict canonical
  scoped search or exact identity proof.
- `fieldQuery.release` remains release-style search data for recording queries,
  not a strict release-group tracklist scope.
- Field filters, tag weights, date ranges, raw provider query syntax, and
  canonical scoped field search remain future work.
- Common plugin configuration still needs to become the durable activation path
  for bundled and third-party Knowledge providers.

## Verification Status

- `npm test` passes after Tasks 16-21.
- Streamable HTTP MCP smoke against the restarted local MineMusic server at
  `http://127.0.0.1:37373/mcp` confirms the installed
  `minemusic.knowledge.query` tool accepts:
  - `tagQuery` for ambient/post-rock recordings.
  - `fieldQuery.artist` plus `filters.tags.include`.
  - `fieldQuery.release` plus `filters.tags.include`.
  - `tagQuery` plus `filters.tags.exclude`.
- Fresh Codex-native MCP smoke after structured query hardening confirms
  `formats: ["text"]` returns no MusicBrainz structured items, multi-tag Tag
  Query returns a non-empty first chunk, and cursor continuation works through
  provider offsets. Cross-page repeats are allowed when the provider repeats a
  root at a later offset; the cursor avoids approximate seen-root summaries so
  it does not skip unseen roots because of false positives.
