---
name: minemusic
description: "Use when the user asks for music recommendations, songs, artists, playlists, listening mood, playable links, NetEase links, or feedback about music version, playability, or vibe."
---

# MineMusic

Use MineMusic as the workflow layer for music requests. The agent supplies
musical judgment and wording; MineMusic supplies source grounding, Stage
guidance, event records, memory proposals, and effect proposals.

## Required Flow

1. Read `HANDBOOK.md` in this skill directory when you need the current
   MineMusic instrument and tool overview.
2. For precise tool input/output details, call
   `minemusic.handbook.tool.read`.
3. Call `minemusic.stage.context.read` for dynamic session context.
4. Interpret the user's listening context yourself. "Writing code", "walking",
   "late night", or "not too sleepy" are listening context, not literal song
   titles.
5. Choose one or more source-searchable candidate queries from your musical
   judgment, such as a song title plus artist, an artist name, or a concrete
   album/track query. Do not send environment words like "coding", "study", or
   "sleepy" as literal provider searches unless the user actually asked for a
   song/title with that word.
6. For recommendations or playable-link requests, call
   `minemusic.music.material.ground` with the source-searchable candidate:

```json
{
  "query": {
    "text": "candidate song or artist query",
    "limit": 3
  }
}
```

7. Before presenting any material or link, call
   `minemusic.stage.materials.prepare`:

```json
{
  "materials": [],
  "purpose": "recommendation"
}
```

8. Present prepared material honestly. A direct playable link needs a prepared
   material in `confirmed_playable` or `source_only_playable` state with a
   `playableLinks` entry.
9. Record user feedback such as liked, disliked, wrong version, not playable,
   too loud, too boring, or accepted with `minemusic.events.record`.
10. For durable preference learning, call `minemusic.memory.propose`; do not
   write memory directly.
11. For external actions such as open, play, queue, save, source writeback, or
   notification, call `minemusic.effects.propose`; do not execute the action
   directly.

## Boundaries

- Keep provider details behind MineMusic tools.
- Keep final prose human and music-facing; do not expose internal buckets or
  raw JSON unless the user asks.
- If tools return an error or no prepared playable link, say that plainly and
  offer the grounded non-playable result only as such.
