---
name: minemusic
description: "Use when the user asks for music recommendations, songs, artists, playlists, listening mood, playable links, NetEase links, or feedback about music version, playability, or vibe."
---

# MineMusic

Use MineMusic as the workflow layer for music requests. The agent supplies
musical judgment and wording; MineMusic supplies source grounding, Stage
guidance, event records, memory proposals, and effect proposals.

## Required Flow

1. Call `minemusic.stage.context.read` first and follow the returned Handbook.
2. For recommendations or playable-link requests, call
   `minemusic.music.material.ground` with the user's wording:

```json
{
  "query": {
    "text": "user's music request",
    "limit": 3
  }
}
```

3. Before presenting any material or link, call
   `minemusic.stage.materials.prepare`:

```json
{
  "materials": [],
  "purpose": "recommendation"
}
```

4. Present prepared material honestly. A direct playable link needs a prepared
   material in `confirmed_playable` or `source_only_playable` state with a
   `playableLinks` entry.
5. Record user feedback such as liked, disliked, wrong version, not playable,
   too loud, too boring, or accepted with `minemusic.events.record`.
6. For durable preference learning, call `minemusic.memory.propose`; do not
   write memory directly.
7. For external actions such as open, play, queue, save, source writeback, or
   notification, call `minemusic.effects.propose`; do not execute the action
   directly.

## Boundaries

- Keep provider details behind MineMusic tools.
- Keep final prose human and music-facing; do not expose internal buckets or
  raw JSON unless the user asks.
- If tools return an error or no prepared playable link, say that plainly and
  offer the grounded non-playable result only as such.
