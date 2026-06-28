# ADR-0044: Music Experience Queue Is Bounded Runtime State

## Status

Accepted; recorded during Phase A4 after review identified that the original
Phase A projection note had been silently rewritten. Terminology amended by
`docs/formal-rebuild/agent-context-engineering-spec.md`: the legacy `Session
Context` rendering path maps to Agent Runtime Workspace Context for new work.

## Context

The Phase A spec originally allowed the slice-1 Workbench read projection to
expose the full small queue, but required A4 not to inject an unbounded queue
into the agent prompt. It named two read-side strategies: cap the Workbench read
projection, or expose a bounded shape such as `nowPlaying`, `queueHead`,
`queueTail`, `queueLength`, and `revision`, while the database truth could retain
the full queue.

During A4 implementation we instead added a hard queue cap in the Music
Experience owning command and let the legacy Session Context render the queue it
reads. That is a real product/architecture decision, not a clarification of the
original projection note, and must be recorded explicitly.

## Decision

The Music Experience logical queue is bounded runtime state. The owning queue
command enforces `MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH = 100` and rejects appends
above that bound with the expected Music Experience failure `queue_full`.

Workbench Interface and Agent Runtime Workspace Context may expose/render the
full queue because the queue itself is now bounded. They must not hide an
unbounded product queue behind prompt-only truncation.

This does not make `music_experience_queue_items` an immutable music fact table.
The table remains ordinary queue/playback runtime truth; the product invariant is
that a workspace queue cannot grow beyond the configured Phase A cap. Later
phases may change the cap or add explicit queue-management commands, but they
must do so as a Music Experience product decision rather than as an Agent Runtime
prompt-rendering workaround.

## Rejected Alternatives

- **Prompt-only truncation in agent context.** Rejected because it hides an
  unbounded product queue from the agent while allowing the underlying runtime
  state to grow without a product limit. It solves prompt size by obscuring the
  state problem.
- **Workbench-only bounded projection (`queueHead` / `queueTail` /
  `queueLength`).** Rejected for Phase A4 because the only immediate consumer is
  agent context and the product queue has no reason to be unlimited in the
  first single-writer runtime slice. A bounded projection can return later if a
  later phase needs a larger queue truth than the agent prompt should see.
- **Unbounded database truth plus read-side cap as the default architecture.**
  Rejected for the current slice because it treats queue length as a prompt
  concern instead of a Music Experience runtime-state concern.

## Consequences

- `MusicExperienceQueuePlaybackCommand.append` returns a `Result` so `queue_full`
  is an expected command failure, not a thrown invariant or a Stage-only guard.
- `music.experience.queue.append` declares and surfaces `queue_full`.
- Agent Runtime Workspace Context may render the full queue, but this remains
  safe only while the Music Experience queue bound is enforced by the owning
  command.
- If Phase B Radio or Phase C Web need different queue capacity or queue
  management behavior, that change belongs in Music Experience command semantics
  and must update this ADR or supersede it.
