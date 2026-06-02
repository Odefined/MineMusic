---
name: minemusic
description: "Use when the user asks for music recommendations, songs, artists, playlists, listening mood, playable links, NetEase links, or feedback about music version, playability, or vibe."
---

# MineMusic

Use MineMusic as the workflow layer for music requests. The agent supplies
musical judgment and wording; MineMusic supplies canonical-first material
resolution, source grounding, Stage guidance, event records, memory proposals,
and effect proposals.

MineMusic tools come from the external MineMusic server registered in global
Codex MCP client config. Server startup, MCP registration, provider databases,
caches, and session runtime settings stay in server/runtime configuration.

## Tool Discovery

Codex may expose MineMusic MCP tools through deferred tool discovery. To load a
missing MineMusic tool, first call `tool_search` with a query such as
`minemusic knowledge query` or `minemusic handbook`, then use the loaded native
`mcp__minemusic__.*` tools.

## Handbook Lookup

Use the handbook tools by lookup level:

- `minemusic.handbook.overview.read`
  - Returns the current instrument overview.
- `minemusic.handbook.instrument.read({ instrumentId })`
  - Reads one instrument section such as `minemusic.library` or
    `minemusic.music`.
- `minemusic.handbook.tool.read({ toolName })`
  - Reads one exact tool such as `music.material.query` or
    `music.material.resolve`.

Use the lookup key that matches the requested level:

- `instrumentId` is an instrument id like `minemusic.library`.
- `toolName` is a tool name like `library.update.start`.

For the exact input/output contract of one operation, use
`minemusic.handbook.tool.read` for that tool.

## Required Flow

1. Read `HANDBOOK.md` in this skill directory when you need the packaged
   MineMusic instrument and tool overview.
2. For current live handbook details:
   - use `minemusic.handbook.instrument.read({ instrumentId: "minemusic.library" })`
     when you need one instrument section;
   - use `minemusic.handbook.tool.read({ toolName: "library.update.start" })`
     when you need one exact tool's current input/output shape.
3. Call `minemusic.stage.context.read` for dynamic session context.
4. Interpret the user's listening context yourself. Phrases like "writing code",
   "walking", "late night", or "steady but quiet" describe the listening
   situation.
5. Choose one or more music candidates from your musical judgment, such as a
   song title plus artist, an artist name, or a concrete album/track candidate.
   Send provider searches as concrete title, artist, album, or release text.
6. For recommendations from a pool, collection, source library, related pool,
   or all available material, use `minemusic.music.pools.list` to discover
   query-ready pools when needed, then use `minemusic.music.material.query`
   with the requested `pool`, `constraints`, `exclude`, `order`, and `limit`.
   Use only fields shown by the live handbook/tool schema. `q` is for concrete
   title, artist, album, or release text; apply your musical judgment to the
   returned cards.
   For source-library or collection pools, treat returned cards as already
   grounded from stored library/collection assets. If a query produces zero
   usable candidates, try another pool from `music.pools.list`, resolve concrete
   seeds with `music.material.resolve.cards`, or use `music.material.related`
   when you already have a seed material id.
   For open-ended recommendations or playable-link requests, obtain intended
   `materialId` values from compact material sources such as
   `minemusic.music.material.resolve.cards`, `minemusic.music.material.query`,
   `minemusic.music.material.related`, or recent context.
   Resolve is a grounding operation; MineMusic handles source evidence behind
   the material boundary:

```json
{
  "kind": "candidate_set",
  "candidates": [
    {
      "id": "candidate-1",
      "label": "candidate song or artist",
      "expectedKind": "track",
      "query": {
        "text": "candidate song or artist",
        "limit": 3
      }
    }
  ]
}
```

7. Optionally call `minemusic.music.material.select` only after you already
   have materialIds and want reusable policy, sorting, diversity, or limit
   behavior across that set. Retrieval from collection, source library, or
   all-material pools stays in query.
   For recommendation candidate prep, pass `policy.availability: "playable"`
   for playable recommendations. Use `availability: "any"` for non-playable
   context.
8. Call `minemusic.stage.recommendation.present` with the intended ordered
   items before answering with user-visible recommendations:

```json
{
  "request": "short user request summary",
  "items": [
    {
      "materialId": "material-id-from-query-or-resolve",
      "reason": "why this card fits"
    }
  ],
  "minCards": 1
}
```

9. If `presented: true`, answer with exactly the returned cards and links. If
   `presented: false`, retry with better grounded materialIds or say plainly
   that no presentable grounded recommendation survived.
   A returned card with `status: "playable"` and links is usable for normal
   recommendations even when `identityConfidence` is `source_backed`. Refresh or
   disclaim links after the user reports a link problem.
10. Presentation events come from `minemusic.stage.recommendation.present`.
11. Use `minemusic.stage.materials.prepare` as a material sanitizer for draft
   display. Final recommendations go through
   `minemusic.stage.recommendation.present`.
12. For feedback on shown cards, interpret the user's wording yourself and
   bind the feedback to recent presentation cards with
   `minemusic.memory.feedback.record`.
13. For feedback like "remember this style", use
   `minemusic.memory.feedback.record` with `remember_preference` bound to the
   recent recommendation when possible. Use `minemusic.memory.propose` only for
   advanced evidence-backed proposals.
14. For external actions such as open, play, queue, save, source writeback, or
   notification, call `minemusic.stage.effects.propose`.

## Boundaries

- Keep provider details behind MineMusic tools.
- Keep final prose human and music-facing. Share internal buckets or raw JSON
  only when the user asks.
- Inspect version after the user reports a version mismatch.
- For tool errors or grounded non-playable results, say that plainly.
