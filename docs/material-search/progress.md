# Material Search Progress

This document tracks current implementation state for Material Search.
Design authority lives in `docs/material-search/design.md`.

## 2026-06-04

Material Search v1 is implemented as an internal Material Flow capability.

Implemented:

- Contracts, narrow ports, and architecture guards for Material Search.
- SQLite FTS-backed `MaterialSearchIndex` with transient SQLite support for
  tests and harnesses.
- Owner-neutral SearchDocument construction keyed by `materialRef`.
- Owner-visible pool construction and eligibility for `all`, ordinary
  `source_library`, and `collection` scopes.
- Active material-level blocked relation filtering for ordinary Search.
- Search execution with internal score, field-specific evidence, provenance,
  warnings, and opaque Search cursor.
- Stage Core wiring with centralized dirty invalidation wrappers and optional
  `MINEMUSIC_MATERIAL_SEARCH_DB_PATH` runtime configuration.
- `music.material.query` integration for `all`, ordinary `source_library`,
  and `collection`; `related` and `source_library target: "release_tracks"`
  remain on their existing paths.
- Public Query schema rename from `q` to `text` and from `returnKind` to
  `targetKind`; old aliases are not accepted by the public Stage Interface
  boundary.

Boundary coverage:

- `test/architecture/material-boundary.test.ts` guards exact Material Search
  port key sets and forbidden imports from broad stores, collection ports,
  provider/source grounding, Stage Interface outputs, storage adapters, and
  registry materialization writers.
- Stage Interface and MCP tests guard that Query publishes `text` and
  `targetKind`, not `q` or `returnKind`.

Current known non-goals:

- No public `music.material.search` tool.
- No provider/source search, resolve, recommendation intent, or semantic
  mood/vibe/tag search.
- No in-memory/Map SearchIndex fallback.
- No query-time materialization for ordinary Source Library retrieval.
- No public exposure of Search evidence, provenance, or Search cursor through
  ordinary Query output.

Verification used during implementation:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
node .tmp-test/test/architecture/material-boundary.test.js
node .tmp-test/test/storage/sqlite-material-search-index.test.js
node .tmp-test/test/material_search/material-search-document.test.js
node .tmp-test/test/material_search/material-search-visibility.test.js
node .tmp-test/test/material_search/material-search-eligibility.test.js
node .tmp-test/test/material_search/material-search-query.test.js
node .tmp-test/test/material_search/material-search-cursor.test.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```
