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
Codex MCP client config. This skill does not start the server, configure MCP,
or own provider/database/cache/session runtime settings.

## Tool Discovery

Codex may expose MineMusic MCP tools through deferred tool discovery instead
of listing the `mcp__minemusic__` namespace in the initial active tool list.
When a MineMusic tool is not visible yet, first call `tool_search` with a
query such as `minemusic knowledge query` or `minemusic handbook`, then use the
loaded native `mcp__minemusic__.*` tools. Do not treat SDK, curl, or direct MCP
client calls as a substitute for checking native Codex tool exposure.

## Handbook Lookup

Use the handbook tools by lookup level:

- `minemusic.handbook.overview.read`
  - Returns the current instrument overview.
- `minemusic.handbook.instrument.read({ instrumentId })`
  - Reads one instrument section such as `minemusic.library` or
    `minemusic.music`.
- `minemusic.handbook.tool.read({ toolName })`
  - Reads one exact tool such as `library.source.list` or
    `music.material.resolve`.

Do not mix these lookup keys:

- `instrumentId` is an instrument id like `minemusic.library`, not a tool name.
- `toolName` is a tool name like `library.update.start`, not an instrument id.

If you need the exact input/output contract for one operation, prefer
`minemusic.handbook.tool.read` for that tool instead of guessing from the
overview snapshot.

## Required Flow

1. Read `HANDBOOK.md` in this skill directory when you need the packaged
   MineMusic instrument and tool overview.
2. For current live handbook details:
   - use `minemusic.handbook.instrument.read({ instrumentId: "minemusic.library" })`
     when you need one instrument section;
   - use `minemusic.handbook.tool.read({ toolName: "library.update.start" })`
     when you need one exact tool's current input/output shape.
3. Call `minemusic.stage.context.read` for dynamic session context.
4. Interpret the user's listening context yourself. "Writing code", "walking",
   "late night", or "not too sleepy" are listening context, not literal song
   titles.
5. Choose one or more music candidates from your musical judgment, such as a
   song title plus artist, an artist name, or a concrete album/track candidate.
   Do not send environment words like "coding", "study", or "sleepy" as
   literal provider searches unless the user actually asked for a song/title
   with that word.
6. For recommendations or playable-link requests, obtain intended
   `materialId` values from any available material source, such as
   `minemusic.music.material.resolve`, `minemusic.music.material.query`,
   `minemusic.music.material.related`, a collection, or recent context.
   Resolve is a grounding operation; source grounding is an internal evidence
   step and should not be driven one candidate at a time by the agent:

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

7. Optionally call `minemusic.music.material.select` when you want reusable
   policy, sorting, diversity, or limit behavior over candidate materialIds.
   For recommendation candidate prep, pass `policy.availability: "playable"`
   unless you are intentionally collecting non-playable context.
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
10. Do not create `recommendation.presented` manually with
   `minemusic.stage.events.record`; presentation events come from
   `minemusic.stage.recommendation.present`.
11. Use `minemusic.stage.materials.prepare` only as a legacy material sanitizer
   for non-final material display, not as the final recommendation boundary.
12. For feedback on shown cards, interpret the user's wording yourself and
   bind the feedback to recent presentation cards with
   `minemusic.memory.feedback.record`. Do not fabricate a recommendation event
   for feedback.
13. For durable preference learning, call `minemusic.memory.propose`; do not
   write memory directly.
14. For external actions such as open, play, queue, save, source writeback, or
   notification, call `minemusic.stage.effects.propose`; do not execute the action
   directly.

## Boundaries

- Keep provider details behind MineMusic tools.
- Keep final prose human and music-facing; do not expose internal buckets or
  raw JSON unless the user asks.
- If tools return an error or no prepared playable link, say that plainly and
  offer the grounded non-playable result only as such.
