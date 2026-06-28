# Agent Context Engineering Spec

> Status: current design authority
> Scope: Agent Runtime context assembly for embedded MineMusic agents
> Owners: Agent Runtime for agent-facing context assembly; Workbench Interface
> and area-owned projections for current workspace state; Stage Interface for
> callable tools.

## Purpose

MineMusic has more than one embedded agent actor. Main Agent and Radio Agent
must not each invent a separate way to describe the same workspace state to the
model. They share one context engineering model and one Workspace Context
section vocabulary.

This spec defines the context rails, ownership boundaries, and refactor target
for Agent Runtime context assembly. It is the authority for Phase B Radio
runtime prompt/context repair and for future Main/Radio context work until a
formal Agent Runtime area doc supersedes it.

## Non-Goals

- This spec does not define Music Experience durable state, queue commands,
  radio truth writes, or playback behavior.
- This spec does not define Stage Interface tool schemas or public tool output
  contracts.
- This spec does not define Memory storage, Knowledge retrieval, or Web AG-UI
  serialization.
- This spec does not require Main and Radio to see the same context content.
  It requires them to use the same context assembly model.

## Context Rails

Every model run is assembled from six rails. Implementations may render or
encode these rails differently, but they must keep the rail boundaries intact.

### 1. Actor Instruction

Static actor identity, responsibilities, behavioral rules, and prohibitions.

Examples:

- Main Agent is the user-facing workspace agent.
- Radio Agent is a bounded refill actor.
- Radio acts through tools and does not write Music Experience state directly.

Actor Instruction is not current workspace state, not tool availability, and not
run payload.

### 2. Capability Context

The current actor's callable capability set and call environment.

Includes:

- available tool names;
- tool schemas, descriptions, usage guidance, side-effect declarations, and
  invocation policy;
- actor-scoped tool packs;
- dispatch context such as actor identity, stage session id, and injected
  command basis.

Capability Context is not the place for queue contents, radio direction, user
music taste, or transcript history.

### 3. Workspace Context

The agent-readable current-state projection of the shared workspace. Agent
Runtime owns one Workspace Context assembler for embedded agents. The assembler
receives `{ actor, ownerScope }`, reads the area facts needed by that actor's
declared sections, selects those actor-declared workspace-visible sections,
applies shared compression rules, and emits the encoded Workspace Context.

The caller does not pass an ad hoc section list. Section selection belongs to the
actor declaration consumed by the shared assembler. Main and Radio may receive
different selected sections, but both use the same assembler, section
vocabulary, compression rules, and encoding rules.

Workspace Context is organized by workspace-visible sections, not by internal
architecture area names. The section vocabulary is shared across actors. An
actor or run may receive only some sections, but the selected sections keep the
same names and shapes.

Compression means removing repeated semantic structure, not truncating facts the
actor needs. The compression rules are:

- **define once**: do not repeat field meanings that are already defined by the
  section contract;
- **UI sectioning selects facts**: choose current facts by workspace-visible
  sections, not by storage records or internal area blobs;
- **no narration**: emit compact data, not actor-specific prose;
- **attention signals**: keep the small cues the actor needs for the next
  decision, while omitting empty fields and redundant metadata.

Workspace Context leaves may be compact strings. A string leaf is still a
structured public encoding when the section contract defines its grammar. This
is preferred where repeating object keys would add semantic noise.

Current section vocabulary starts with:

- `listening`: now-playing and queue facts visible in the listening workspace;
- `radio`: current radio direction, posture, and relevant current revisions.

`listening` section shape:

```json
{
  "listening": {
    "nowPlaying": null,
    "queue": "0. <label> - <artistsText> [material:mh_...]\n1. <label> [material:mh_...]"
  }
}
```

Rules:

- Queue order is the line order. Do not repeat a `position` object field when the
  line index already carries visible order.
- Each queue line ends with the agent-facing public item handle string such as
  `[material:mh_...]`, not an internal ref, storage row, projection record,
  material ref, database id, or `{ kind, id }` object the agent must reconstruct.
- The handle kind is not repeated as a separate field when the bracket handle
  already carries `[material:...]`.
- A material queue handle is minted from the owning `materialRef` through the
  stateful public handle registry behind `HandleMintingPort`. The public
  `[material:mh_<opaque>]` value is a pass-back handle, not an id, ref, or
  stable material identity claim.
- `label` is required in each queue line.
- `artistsText` is optional and is omitted from the line when absent.
- `queueLength` may exist only as an auxiliary compressed summary. It must never
  replace the queue lines when the actor needs current-queue identity.

`radio` section shape:

```json
{
  "radio": {
    "direction": "motif: ...\nactiveVariation: ...",
    "posture": "lean: ...\nstale: false",
    "directionRevision": 7
  }
}
```

Rules:

- `direction` is the current commanded radio direction.
- `posture` is the current evolved radio posture as projected for the workspace.
- `directionRevision` is the current workspace direction revision. Scalar values
  remain scalar; do not wrap them in redundant metadata objects.
- Basis revisions for a run are Invocation Context, not Workspace Context.
- `runId`, `wakeReason`, and `suggestedAppendCount` are Invocation Context, not
  Workspace Context.
- Empty fields are omitted. Owner scope, capture timestamp, source area name,
  storage metadata, and renderer/debug metadata do not belong in Workspace
  Context.

The active Phase B implementation may only need `listening` and `radio`, but
those are not Radio-specific sections. They are shared Workspace Context
sections selected for the current actor/run.

Workspace Context is current fact. It must not be reconstructed from transcript
messages, tool-result history, actor-specific prompt text, or a pre-composed
area blob such as a `musicExperience` read-model object. It also must not contain
durable user taste memory except where an owning area has projected it as
current workspace state.

The old Workbench-to-Agent Runtime composition seam is retired for new work:
`WorkspaceReadModel`, `WorkspaceReadModelReader`, `readWorkspace`,
`WorkbenchMusicExperienceReadPort` as an agent composition seam,
`createWorkspaceReadModelComposer`, the old `session_context.ts` pass-through,
and separate renderers such as `renderAgentSessionContextForSystemPrompt` and
`renderRadioRunSystemPrompt` are implementation artifacts to delete or replace.
The root cause is that the old seam read one area, emitted a `musicExperience`
blob, then let each agent re-render that blob independently.

### 4. Invocation Context

The envelope for this specific run or turn.

Examples:

- Main user turn text and turn-scoped instructions;
- Radio `runId`;
- Radio `wakeReason`;
- Radio `suggestedAppendCount`;
- Radio basis revisions such as `radioDirectionRevision` and
  `radioSessionRevision`.

Invocation Context may repeat identifiers that also appear in Workspace
Context, but only with explicit semantics. For example, current
`radio.directionRevision` is a Workspace Context fact; basis
`radioDirectionRevision` is the revision this run will check at commit time.

Radio refill invocation shape:

```json
{
  "run": {
    "kind": "radio_refill",
    "runId": "radio-job-...",
    "wakeReason": "low_watermark",
    "suggestedAppendCount": 5,
    "basis": {
      "radioDirectionRevision": 7,
      "radioSessionRevision": 1
    }
  }
}
```

Rules:

- Invocation Context is passed to pi as the new message for the run through
  `agent.prompt(...)`.
- Radio refill invocation is JSON, not prose such as
  `"Radio refill run: low_watermark; target about 5 tracks"`.
- `basis` revisions are run preconditions; they are not Workspace Context
  current facts.
- `kind` identifies the invocation type without relying on prose.

### 5. Continuity Context

Conversation and execution continuity.

Includes:

- transcript messages;
- compaction summaries;
- branch/session summaries;
- prior tool-result messages retained in transcript.

Continuity Context records what happened before. It is not current workspace
truth. If a tool result changed durable or runtime state, the next current fact
must enter Workspace Context through owning facts/projections, not by scraping
transcript messages.

### 6. Knowledge / Memory Context

Retrieved knowledge, user taste memory, and other reference material used for
reasoning.

Includes:

- durable taste memory and explicit preference rules;
- Music Intelligence or Knowledge retrieval results;
- Handbook or documentation snippets;
- search/reference material loaded for the current task.

Knowledge / Memory Context may influence future choices. It must not rewrite
Workspace Context. If Memory says the user dislikes a style but the current
queue contains that style, the queue fact remains true.

Phase B starts this rail with `userTasteHint`, generated from the existing
`library.catalog.summary` public output. It is a lightweight hint about the
user's library-shaped taste, not durable Memory.

```json
{
  "knowledgeMemory": {
    "userTasteHint": {
      "source": "library.catalog.summary",
      "summary": {}
    }
  }
}
```

Rules:

- `userTasteHint.summary` reuses the existing `library.catalog.summary` public
  output shape; Agent Runtime must not invent a parallel catalog-summary schema
  for context.
- Agent Runtime obtains `userTasteHint` through a narrow internal context
  provider/read port composed by Server Host. It must not call the
  `library.catalog.summary` Stage tool as if it were a model.
- The context provider may reuse the same underlying catalog-summary read
  capability that powers `library.catalog.summary`, but Stage Interface remains
  the owner of the public tool boundary.
- `userTasteHint` helps Main or Radio choose music closer to the user's library
  tendencies.
- `userTasteHint` is a hint, not a hard rule.
- `userTasteHint` is not durable Memory and must not be presented as "the user
  explicitly said".
- `userTasteHint` must not overwrite Workspace Context facts such as current
  queue, now-playing, or radio direction.
- `userTasteHint` must not trigger Memory writes by itself.

## Assembly Rules

1. Agent Runtime owns context assembly for embedded agents.
2. Workbench Interface owns the shared workspace interaction state/read model.
3. Area-owned projections own the facts they expose into Workspace Context.
4. Stage Interface owns callable tool declarations and tool-call routing; Agent
   Runtime may select an actor-specific tool pack for Capability Context.
5. Pi owns the provider-facing loop mechanics: `systemPrompt`, `messages`,
   `tools`, lifecycle events, tool execution, and compaction hooks. MineMusic
   owns the content placed into those rails.
6. Each actor declares which workspace-visible sections it needs. The shared
   assembly mechanism chooses those sections from `{ actor, ownerScope }`,
   applies shared compression rules, and emits the encoded Workspace Context.
   Separate actor-owned selection, compression, or hand-written re-expression of
   the same workspace state is not allowed.
7. A rail may be empty for an actor or run. Empty rails are explicit absence,
   not a fallback for failed reads.

## Pi Provider Context Mapping

MineMusic must map the six context rails onto pi's real provider context shape.
Pi does not expose a generic fourth "context" channel. The low-level `Agent`
snapshots only:

```ts
{
  systemPrompt,
  messages,
  tools,
}
```

Source anchors:

- `node_modules/@earendil-works/pi-agent-core/dist/agent.js:271-276` snapshots
  `systemPrompt`, `messages`, and `tools`;
- `node_modules/@earendil-works/pi-agent-core/dist/agent.js:217-263` turns
  `prompt(input)` into new user message(s) before the run;
- `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:42-54`
  appends those prompt messages to the current context and emits `agent_start`;
- `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:116-123`
  appends tool-result messages into the running context;
- `node_modules/@earendil-works/pi-agent-core/dist/harness/agent-harness.js:255-294`
  builds the same provider shape from session messages, system prompt, and
  active tools.

The MineMusic mapping is:

| Context rail | Pi/provider surface | Rule |
| --- | --- | --- |
| Actor Instruction | `systemPrompt` | Stable actor instructions are part of the prompt state refreshed by Agent Runtime. |
| Capability Context | `tools` plus Stage Interface tool metadata | Tool declarations and actor tool packs enter through pi tools. Tool usage policy may also be summarized in Actor Instruction, but tool availability is not Workspace Context. |
| Workspace Context | `systemPrompt` as compact encoded context | Shared Workspace Context assembly emits the encoded Workspace Context and Agent Runtime places it into the prompt state before the pi context snapshot. |
| Invocation Context | new `messages` passed to `agent.prompt(...)` | A user turn or Radio run payload is the run's prompt/envelope. It is not mixed into Workspace Context. |
| Continuity Context | `messages` | Pi transcript, compaction summaries, prior user/assistant/tool-result messages, and restored transcript live in messages. |
| Knowledge / Memory Context | `systemPrompt` or explicit retrieved messages, depending on retrieval owner | When loaded before the model call, retrieved memory/knowledge is encoded as its own structured rail, not merged into Workspace Context. |

This mapping is load-bearing. Agent Runtime may refresh `state.systemPrompt`
before a run-start snapshot, may set `state.tools`, and may call
`agent.prompt(...)` with the Invocation Context. It must not invent a parallel
provider-context carrier or treat transcript messages as current workspace
truth.

## Main And Radio Application

Main Agent and Radio Agent use the same Workspace Context section vocabulary.
They may receive different selected sections for a run, but there is no
Main-specific or Radio-specific Workspace Context shape.

Radio's queue dedupe context belongs to Workspace Context. Radio's
`runId`, wake reason, suggested append count, and basis revisions belong to
Invocation Context. Radio's transcript belongs to Continuity Context. Radio's
tool pack and injected command basis belong to Capability Context.

The old pattern of a Radio-only `Radio Run Floor` carrying hand-written
workspace facts is forbidden. A Radio-specific run floor may exist only for
Invocation Context or Radio actor instructions; it must not be the source of
queue, now-playing, radio truth, or revision facts.

## Forbidden Patterns

- Main and Radio each maintain their own workspace-state renderer.
- Main and Radio each maintain their own workspace-state compression logic.
- Workspace Context is organized by internal architecture area names such as
  `musicExperience` instead of workspace-visible section names.
- Radio receives only `queueLength` when it needs queue item identity to avoid
  current-queue duplicates.
- Runtime derives current workspace facts or run results by parsing transcript
  messages.
- Tool results in Continuity Context are treated as current state without a
  fresh owning fact/projection read.
- Tool availability, side-effect policy, and actor permissions are mixed into
  Workspace Context.
- Durable taste memory is mixed into Workspace Context as if it were current
  workspace truth.
- `Session Context` is used in new design or code as a mixed bucket for
  workspace facts, invocation payload, transcript continuity, tools, and memory.

## Refactor Target

The active implementation should move toward these shapes:

- a shared Agent Runtime context assembly boundary that accepts structured rail
  inputs;
- a Workspace Context assembler that reads area facts directly, chooses the
  actor's declared workspace-visible sections, applies shared compression rules,
  and emits compact encoded context with shared section names and shapes;
- a Capability Context builder over Stage Interface tool declarations and
  actor-specific tool packs;
- an Invocation Context builder for Main turns and Radio runs;
- Continuity Context supplied by pi agent messages, transcript storage, and
  compaction;
- Knowledge / Memory Context supplied only by Memory, Knowledge, Handbook, or
  retrieval boundaries when those are in scope.

The first Phase B repair should remove Radio's separate workspace-state prompt
logic and make Radio consume the shared Workspace Context assembly mechanism for
the workspace-visible sections selected for a Radio run.

## Acceptance Criteria

- There is exactly one Agent Runtime-owned path for turning workspace current
  state into agent-readable encoded Workspace Context.
- Main and Radio use that shared path.
- Radio receives current queue item identity, not only queue length, through
  Workspace Context.
- Main and Radio do not have separate Workspace Context compression or rendering
  paths.
- Radio Invocation Context separately exposes run id, wake reason, suggested
  append count, and basis revisions.
- The implementation maps rails only onto pi's `systemPrompt`, `messages`, and
  `tools`; it does not invent a parallel provider-context channel.
- Tests prove Radio context cannot regress to a Radio-only hand-written
  workspace-state floor.
- Tests prove queue item handles/labels visible in the Radio Workspace Context
  come from the shared read model.
- Existing pi lifecycle fidelity is preserved: one long-lived agent, transcript
  continuity in messages, run-start refresh before provider context snapshot,
  and no invented pi methods.
