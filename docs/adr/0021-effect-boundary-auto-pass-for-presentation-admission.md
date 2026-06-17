# ADR-0021: Effect Boundary Auto-Pass For Presentation-Driven Admission Writes

## Status

Accepted

## Context

ADR-0010 declared tool side effects on three axes and deferred Effect Boundary
enforcement. Phase 16B landed the conservative `StageToolExecutionGate` stub:
`defaultDecision="auto"` passes only when `durableUserStateWrite=false`;
otherwise an auto durable write, a `deny`, or an unhandled posture routes to
`ask`. The intent was to fail safe before any real durable-write tool existed.

Phase 17 ships the first durable-write tool, `music.experience.present`, whose
candidate path implicitly invokes the Candidate Commit owning command
(ADR-0011) to turn an unconfirmed Material Candidate into a durable material
before rendering a MusicCard. Under the conservative stub, `present` is a
durable write, so `defaultDecision="auto"` would route to `ask` and the
candidate could not be admitted automatically — directly defeating the product
intent that presenting a discovered candidate is the act that admits it to the
library.

## Decision

The Effect Boundary auto-pass path is widened so that `defaultDecision="auto"`
passes for `durableUserStateWrite=true` when the tool is a presentation-driven
admission: the durable write is the implicit Candidate Commit invoked by a
consumption action (`present`) over an agent-supplied candidate handle,
bounded to the owning command's source/material/binding materialization (no
Canonical Record, no source writeback, no collection mutation). `deny` still
denies; `ask` remains the path for tools that do not qualify as
presentation-driven admission. The gate still records audit metadata
(`publicReason` / `internalReason`) for every auto-passed admission write.

This keeps Effect Boundary enforcement meaningful for higher-risk durable
writes (source writeback, playlist/queue mutation, canonical changes) while
allowing the discovery -> present -> admit loop to run automatically, since
`present` itself is the admission gate: an item becomes durable only when the
agent chooses to present it.

## Rejected Alternatives

- **Keep the conservative stub; route `present` to `ask`**: rejected; it
  defeats the product intent that presenting a candidate is the admission
  act, and Phase 17 ships no user-facing ask/approval loop to satisfy `ask`.
- **Per-effect granularity inside one tool** (auto for render, `ask` for the
  commit step only): rejected; the 16B gate is tool-level, not effect-level,
  and splitting one tool's effects across gate decisions adds complexity for
  no safety gain, since the commit is bounded to source/material/binding.
- **Make `present` non-durable** (render from candidate facts without
  admitting): rejected; presented items must be durable to anchor presented
  history and later play/favorite actions, and it would leave Candidate
  Commit with no caller (ADR-0011).

## Consequences

- The 16B conservative stub is replaced by an admission-aware auto rule; the
  `StageToolExecutionGate` gains a narrow "presentation-driven admission"
  qualifier rather than a blanket durable-write `ask`.
- `music.experience.present` runs `defaultDecision="auto"` end to end; audit
  metadata records each admission write for traceability.
- Effect Boundary still guards non-admission durable writes; a future tool
  that performs source writeback, queue/playlist mutation, or canonical
  change must still declare `ask` or `deny` and cannot ride this exception.
- Extends ADR-0010 (deferred enforcement) and ADR-0015 (side-effect vs
  invocation-policy separation): the widened auto path is an invocation-
  policy posture for one class of durable write, not a change to declared
  side-effect truth.
