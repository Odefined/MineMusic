# Knowledge Slot Progress

This file records current implementation state for the Knowledge Slot and the
bundled MusicBrainz Knowledge provider. Current design authority lives in
`docs/knowledge-slot/design.md` and
`docs/knowledge-slot/musicbrainz-provider.md`.

## Current Implementation

- Shared contracts in `src/contracts/index.ts` expose `KnowledgeQuery`,
  `KnowledgeResult`, `StructuredKnowledge`, `TextKnowledge`, graph nodes,
  endpoint-based `KnowledgeRelation` objects, source attribution, provider
  capability descriptors, and generic Provider HTTP Cache records.
- `MusicKnowledgePort.query` in `src/ports/index.ts` returns
  `Result<KnowledgeResult>`.
- `src/knowledge/index.ts` validates the public query shape, enforces exactly
  one query entry (`text`, `canonicalRef`, `providerRef`, `tagQuery`, or
  `fieldQuery`), validates supported `purpose`, `formats`, `entityKinds`,
  `expand`, `relationFocus`, `limit`, tag filters, and cursor compatibility,
  aggregates registered Knowledge providers, preserves provider warnings, and
  wraps provider-local cursors into public opaque `nextCursor` values.
- `canonicalRef` queries read Canonical Store context in Music Knowledge
  Service before provider routing. Providers receive that context but do not
  call Canonical Store directly.
- Stage Interface exposes one read-only public Knowledge tool:
  `knowledge.query`, under the `minemusic.knowledge` instrument. The MCP
  surface exposes it as `minemusic.knowledge.query`.
- Handbook rendering lists provider capability descriptors on the Knowledge
  instrument without exposing provider-internal MusicBrainz API modes.
- Generic Provider HTTP Cache storage has shared repository contracts,
  in-memory and SQLite implementations, `lastUsedAt` updates on cache reads,
  and explicit least-recently-used maintenance methods. Cache maintenance is
  not exposed through `knowledge.query`.
- Stage Core accepts explicit Knowledge provider instances and generic provider
  factories. Factories receive the Stage Core Provider HTTP Cache. The default
  MineMusic server/runtime registers the bundled MusicBrainz provider when no
  explicit Knowledge providers or factories are supplied.
- `src/providers/musicbrainz/index.ts` implements a read-only Knowledge
  provider for structured MusicBrainz facts. It supports text search,
  direct MusicBrainz `providerRef` lookup, Canonical-context lookup/search,
  Tag Query, Field Query, provider-local cursor continuation, selected browse
  expansions, relation focus `members`, endpoint-based relation output, and
  successful-response Provider HTTP Cache use.
- MusicBrainz Tag Query and tag filters use provider-attributed MusicBrainz
  tags/genres only. `matchedTags` / `matchedTagCount` are retrieval metadata,
  not recommendation score, identity confidence, or fact confidence.
- MusicBrainz text queries can use search hits internally for supported
  follow-up lookup or browse expansions, so agents can ask for expanded
  structured knowledge without knowing MBIDs or MusicBrainz API modes.
- Membership-focused artist queries keep backward MusicBrainz `member of band`
  relationships as group-member facts and preserve relation type, direction,
  endpoint roles, dates, and attributes.

## Remaining Work

- Document-style Knowledge storage and indexing remain future work.
- Canonical Store LLM-assisted review/apply workflow remains separate from
  Knowledge Slot provider lookup.
- Field Query remains provider search-condition matching, not canonical scoped
  search or exact identity proof.
- Field filters, tag weights, date ranges, raw provider query syntax, and
  canonical scoped field search remain future work.
- Common plugin configuration still needs to become the durable activation path
  for bundled and third-party Knowledge providers.
- MusicBrainz browse coverage can expand beyond the currently implemented
  release-group release and artist release-group paths when concrete use cases
  need it.

## Verification Evidence

- `test/knowledge/music-knowledge-service.test.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`
- `test/storage/in-memory-provider-http-cache-repository.test.ts`
- `test/storage/sqlite-provider-http-cache-repository.test.ts`
- `test/stage_core/stage-core-factory.test.ts`
- `test/surfaces/mcp-server.test.ts`
- `npm test`
- Streamable HTTP MCP smoke against the restarted local MineMusic server
  confirmed installed `minemusic.knowledge.query` behavior for Tag Query,
  Field Query, tag include/exclude filters, cursor continuation, and
  membership-focused MusicBrainz relation output.

## Archive

Historical Knowledge Slot implementation sequencing is archived under
`docs/archive/knowledge-slot/`.
