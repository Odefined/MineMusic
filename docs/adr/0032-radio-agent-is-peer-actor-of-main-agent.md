# ADR-0032: Radio Agent Is A Peer Actor Of Main Agent Within Agent Runtime

## Status

Amended. The load-bearing decision stands — Radio is a **peer actor** of Main
within Agent Runtime (not a subprocess, handoff, or blocking subroutine). Two
mechanism details in Decision/Consequences below were later superseded and are
marked inline: the "continuous (hours-long) loop" framing (→ discrete
re-prompted runs, PB2/ADR-0037) and the "Radio directives" typed-message kind
(→ steering routed through owned radio truth, PB5; channel reserved for
Radio→Main notify/speak). Read the superseded passages through the Refinements
section at the end.

## Context

The PRD describes Radio as a "subagent under the user-facing MineMusic Agent."
The fusion Consensus describes Main and Radio as peers that coordinate through
typed messages, explicitly "not a nested subroutine" and "not a handoff target."
These framings appear to conflict.

The hard product requirement is concurrency: chat must keep working while radio
keeps working.

Agent Runtime is the MineMusic-owned area for embedded agent lifecycle and
coordination (ADR-0030). It owns Main Agent and Radio Agent as peer actors
within the same runtime, not as parent/child processes or blocking subroutines.

## Decision

Radio Agent is a peer actor of Main Agent within Agent Runtime. Both actors
are owned by Agent Runtime and coordinate through typed messages (Radio
directives, Radio results, notify/speak requests).

This satisfies both the PRD ("subagent under Main" in the architectural sense
that Main exists implies Radio may exist) and the Consensus intent ("not a
blocking nested subroutine"; Main never blocks on Radio). Radio coordinates with
the rest of the system through typed messages and the shared in-process workspace
read model (ADR-0031).

The flow is:

```text
Agent Runtime owns:
  - Main Agent actor
  - Radio Agent actor
  - typed message channel between them

Main and Radio are peers:
  - Main handles chat, tools, effects
  - Radio handles continuous radio loop
  - neither blocks the other
```

## Rejected Alternatives

- Pi subagent (external extension or third-party): rejected — adds external
  dependency, introduces lifecycle complexity (process isolation, IPC),
  and lacks ADR-0033 cancellation integration.
- Two independent peer runtimes with a hand-rolled message protocol:
  rejected — duplicates Agent Runtime's coordination purpose and decouples
  lifecycle with no product need.
- OpenAI-style handoff (full takeover, transfer of history): rejected — a
  handoff hands the conversation over and cannot model Main and Radio working
  at the same time.
- Blocking subroutine: rejected — would freeze Main while Radio works,
  violating concurrency.

## Consequences

- Agent Runtime must implement typed message channels for Main/Radio
  coordination (Radio directives, Radio results, notify/speak requests).
- Radio's loop must contain no blocking human-approval step. High-impact
  confirmations are raised as Proposal Units to the conversation side, and Radio
  keeps running (see ADR-0033 and CONTEXT.md `Proposal Unit`).
- How Radio surfaces proposals to the conversation side is an implementation
  detail over the shared read model.
- Main and Radio lifecycle are independently managed within Agent Runtime;
  neither is a subprocess or third-party extension.
- Load-bearing open verification: a continuous (hours-long) Radio loop must be
  confirmed to sustain under context compaction, provider reconnect, and memory
  growth. pi-agent-core provides no subagent lifecycle to verify; endurance
  rests on Agent Runtime's Radio supervisor, not the engine.

## Refinements (later ADRs / phase specs)

- **Radio is not a continuous loop (superseded).** Phase B PB2 changes Radio from
  the "continuous (hours-long) Radio loop" framing above to **discrete
  re-prompted bounded runs** (idle between triggers; one bounded turn per
  pacing/direction trigger). The endurance verification still applies, but to
  cross-run continuity over a durable floor (ADR-0037), not to a live long-running
  loop. Read the loop-related wording above through PB2/ADR-0037.
- **The typed Main↔Radio channel is narrowed (superseded).** Decision/Consequences
  above list "Radio directives" as one typed-message kind. Phase B PB5 removes the
  directive kind: a user's radio redirection is routed through **owned radio truth
  (commanded direction) plus a per-concern revision bump and a supervisor wake**
  (ADR-0037), not a directive payload. The typed channel is reserved for
  **Radio→Main notify/speak requests**. "How Radio surfaces proposals to the
  conversation side" (Consequences) is the raise-to-conversation path standardized
  in ADR-0038.
