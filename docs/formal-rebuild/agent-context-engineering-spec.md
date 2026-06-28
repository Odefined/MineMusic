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

Every model run is assembled from seven rails. Implementations may render or
encode these rails differently, but they must keep the rail boundaries intact.

### 1. Actor Identity

Structured actor-facing role and reason for existence. Actor Identity is a
context rail sourced from `ActorDefinition.identity`.

Actor Identity is not a raw prompt paragraph. It is structured identity data
that the Agent Runtime renderer encodes into the Actor Identity rail. The first
shape is:

```ts
type ActorIdentity = {
  role: string;
  job: string;
  persona: string;
};
```

Rules:

- `role` is the actor's product role, not an operational procedure.
- `job` says why this actor exists in MineMusic and what stable work it is here
  to do.
- `persona` says what stable presence, musical posture, and relationship stance
  this actor brings.
- Actor Identity fields are compact declarative facts. They do not contain
  step-by-step behavior, tool policy, run payload, workspace facts, transcript
  state, or Memory.

Actor Identity must name the product role without sounding like a generic
chatbot scaffold. Its implementation guard is structural: the identity rail is
stored as `role` / `job` / `persona`, is rendered separately from operational
instructions and workspace facts, and is sourced from exactly one
`ActorDefinition` per actor. Do not guard identity quality with forbidden-string
or keyword-list checks.

Actor Identity is not operational guidance, current workspace state, tool
availability, run payload, transcript continuity, or durable memory.

Minimal examples:

```ts
const mainIdentity: ActorIdentity = {
  role: "Music partner inside the MineMusic workspace.",
  job: "Help the user turn scattered music, moods, references, and choices into grounded next moves.",
  persona: "Warm, sharp-eared, opinionated when it helps, and light on ceremony.",
};

const radioIdentity: ActorIdentity = {
  role: "Radio presence for the current listening direction.",
  job: "Keep the listening flow alive with choices that feel intentional, fresh, and connected.",
  persona: "Tasteful, quietly playful, sensitive to pacing, and allergic to dead air.",
};
```

### 2. Actor Instruction

Structured operational actor-facing guidance for how the actor works. Actor
Instruction is a context rail sourced from `ActorDefinition.instruction`.

Actor Instruction is not a raw prompt paragraph. It is structured operational
data that the Agent Runtime renderer encodes into the Actor Instruction rail.
The first shape is:

```ts
type ActorInstruction = {
  responsibilities: string;
  operatingRules: string;
  prohibitions: string;
};
```

Rules:

- `responsibilities` says what the actor must keep doing across runs.
- `operatingRules` says how the actor should make stable decisions and actions.
- `prohibitions` says what the actor must not do.
- Field values are strings. The field boundary carries the rail structure;
  normal text may express multiple rules inside a field.
- Actor Instruction fields are operational constraints. They do not contain
  actor persona, current workspace state, tool availability, run payload,
  transcript continuity, durable memory, or per-run basis.
- `operatingRules` and `prohibitions` may name concrete tools when the actor
  needs tool-use guidance. A tool name in Actor Instruction must be the
  model-visible tool name the agent can actually call, such as
  `music_discovery_lookup`, not the internal Stage descriptor name such as
  `music.discovery.lookup`.
- Tool names in Actor Instruction must be backticked exact names. Validation
  extracts only backticked tool-name tokens.
- Every tool name referenced by Actor Instruction must correspond to one of the
  tools selected by `ActorDefinition.toolPack.stageToolNames` after the selected
  Stage tool declarations are mapped to model-visible tool names. A mismatch is
  an invalid `ActorDefinition` and should fail fast.
- Actor Instruction may describe actor-specific tool-use order, preference,
  escalation, and scenario limits. It must not redefine tool schemas, parameter
  shapes, side effects, permissions, or public tool contracts.
- `prohibitions` may use tool names only for scenario limits. A tool that is
  forbidden in every scenario must be removed from
  `ActorDefinition.toolPack.stageToolNames`, not globally banned in
  `prohibitions`.

`ActorDefinition` is the Agent Runtime definition object for one embedded actor.

Shape:

```ts
type ActorDefinition = {
  name: "main" | "radio";
  identity: ActorIdentity;
  instruction: ActorInstruction;
  declaredWorkspaceSections: readonly WorkspaceContextSectionName[];
  toolPack: {
    stageToolNames: readonly StageToolName[];
  };
};
```

One actor has one `ActorDefinition`. Main and Radio must not keep actor identity,
instruction text, workspace-section declarations, and tool-pack selection in
separate server-module strings or per-run glue.

`name` identifies the actor for runtime selection and diagnostics. It is not
part of Actor Identity and is not rendered into the LLM context by default.

`identity` and `instruction` are separate:

- `identity` is structured declarative `role` / `job` / `persona` data;
- `instruction` is structured operational `responsibilities` /
  `operatingRules` / `prohibitions` data.

`identity.role`, `identity.job`, and `identity.persona` render into the Actor
Identity rail. `ActorDefinition.name` does not. `instruction` renders into the
Actor Instruction rail. `toolPack.stageToolNames` selects the Stage Interface
tools that become pi-carried Capability Context, and
`declaredWorkspaceSections` lists only section names that drive Workspace
Context selection through the shared assembler.

`toolPack.stageToolNames` stores internal Stage tool names because it selects
Stage declarations. Actor Instruction text, once rendered into LLM context, uses
model-visible tool names because those are the names the agent can call. The
model-visible names are derived from the selected Stage declarations at
render/validation time.

`declaredWorkspaceSections` must not contain section shape, compression policy,
encoding policy, field selection, or per-actor formatting. Those belong to the
shared Workspace Context assembler and section contracts.

### Phase B Actor Definitions

The Phase B Main and Radio `ActorDefinition` objects. `toolPack.stageToolNames`
holds internal Stage descriptor names (dotted); instruction text references the
matching model-visible names (underscore form), consistent with the validation
rule above.

```ts
const radioDefinition: ActorDefinition = {
  name: "radio",
  identity: {
    role: "Radio presence for the current listening direction.",
    job: "Keep the listening flow alive — choices that feel intentional, fresh, and connected, never on autopilot.",
    persona:
      "Late-night DJ energy: reads the room, quietly playful, hates dead air, and would rather play something slightly unexpected than the obvious pick.",
  },
  instruction: {
    responsibilities:
      "Keep the current direction stocked with fitting tracks so the flow doesn't run dry. Match the direction and the listener's taste; lean fresh over obvious.",
    operatingRules:
      "Work from current state: `radio` gives the direction and posture, `listening` gives what's queued and playing. " +
      "In the direction, the `motif` is the main theme and the active variations are layered on it — keep the motif primary; variations shade it, they don't compete with it or override it. " +
      "Interpret the direction aesthetically, then find candidates with `music_discovery_lookup`, or browse the listener's library with `library_catalog_browse` and `library_catalog_sample` when the direction points there. " +
      "Add roughly the run's `suggestedAppendCount`, then stop. " +
      "Let `userTasteHint` guide toward the listener's taste, and append with `music_experience_queue_append`.",
    prohibitions:
      "Don't repeat what's already queued or playing. " +
      "Don't search the direction literally — a motif like 'night' doesn't mean songs with 'night' in the title; think about what actually carries a night feeling or fits night listening, then look that up. " +
      "Don't treat `userTasteHint` as something the listener explicitly said. " +
      "Your scope is picking and adding — direction and playback aren't yours to change.",
  },
  declaredWorkspaceSections: ["listening", "radio"],
  toolPack: {
    stageToolNames: [
      "music.discovery.list_scopes", "music.discovery.lookup",
      "library.catalog.list_scopes", "library.catalog.browse",
      "library.catalog.sample", "library.catalog.summary",
      "music.experience.queue.append",
    ],
  },
};

const mainDefinition: ActorDefinition = {
  name: "main",
  identity: {
    role: "Music partner inside the MineMusic workspace.",
    job: "Help the user turn scattered music, moods, references, and half-formed choices into grounded next moves.",
    persona:
      "Warm, sharp-eared, genuinely opinionated when it helps — the friend who actually knows the records, not the one who namedrops. Allergic to ceremony.",
  },
  instruction: {
    responsibilities:
      "Help the listener shape their music — find and explain things, build the queue and collections, start radio or playback. Be a real partner, not a search box.",
    operatingRules:
      "Turn what the listener describes — a mood, a reference, a half-formed idea — into the actual music behind it before reaching for a tool: think about what really carries that feeling, then look it up, rather than matching their words literally. " +
      "Ground your suggestions: find real candidates with `music_discovery_lookup` or `library_catalog_browse`, and show a settled pick with `music_experience_present`. " +
      "Check `listening` for what's playing and queued before suggesting next steps. " +
      "When the radio direction comes up, its `motif` is the main theme and active variations are secondary shading on it. " +
      "Let `userTasteHint` align you with the listener's taste as a hint, not a rule. " +
      "Use the collection and relation tools for library housekeeping, and the import tools to bring in outside music. " +
      "Prefer a few well-chosen moves over long tool chains; ask only when intent is genuinely unclear.",
    prohibitions:
      "Don't present or queue anything you haven't actually found via a tool. " +
      "Don't search the listener's words literally — 'something for a rainy night' or 'sad songs' doesn't mean titles containing those words; think about what actually carries that feeling, then look it up. " +
      "Don't treat `userTasteHint` as something the listener explicitly said. " +
      "For a large import or deleting a collection, confirm intent first.",
  },
  declaredWorkspaceSections: ["listening", "radio"],
  toolPack: {
    stageToolNames: [
      "music.discovery.list_scopes", "music.discovery.lookup",
      "library.catalog.list_scopes", "library.catalog.browse",
      "library.catalog.sample", "library.catalog.summary",
      "library.collection.get", "library.collection.create", "library.collection.add",
      "library.collection.move", "library.collection.rename", "library.collection.remove",
      "library.collection.delete", "library.relation.get",
      "library.import.list_sources", "library.import.start", "library.import.status",
      "music.experience.present", "music.experience.queue.append", "music.experience.playback.play",
      "stage.runtime.status",
    ],
  },
};
```

Main declares every current workspace section and carries the full Stage tool
surface — Main has no production wiring yet, so this defines its first allowed
surface. Radio carries the Radio-owned tool subset (`RADIO_STAGE_TOOL_NAMES`).

### 3. Capability Context

The current actor's callable capability set and call environment.

Capability Context is pi-carried, not MineMusic prompt-assembled. MineMusic does
not build a second capability-context blob.
`ActorDefinition.toolPack.stageToolNames` declares the actor's allowed callable
surface; Stage Interface owns the selected tool contracts; Agent Runtime
materializes those selected declarations into pi `tools` and constrains bridge
dispatch for the actor.

Includes:

- available tool names;
- tool schemas, descriptions, usage guidance, side-effect declarations, and
  invocation policy;
- actor-scoped tool packs;
- dispatch context such as actor identity, stage session id, and injected
  command basis.

Capability Context is not the place for queue contents, radio direction, user
music taste, or transcript history.

### 4. Workspace Context

The agent-readable current-state projection of the shared workspace. Agent
Runtime owns one Workspace Context assembler for embedded agents. The assembler
receives `{ actor, ownerScope }`, reads current facts from multiple owning
sources, selects the actor-declared workspace-visible sections, applies shared
compression rules, and emits the encoded Workspace Context.

The assembler's sources are complementary; they do not conflict and neither
displaces the other:

- area-owned projections, for the domain facts a section needs (Music Experience
  owns queue, now-playing, and radio truth);
- Workbench Interface, for the workspace interaction-state facts Workbench owns.

Each area exposes one section-agnostic projection port. The area does not know
about workspace sections; the assembler owns the section vocabulary and maps each
area's facts into the sections that need them.

The caller does not pass an ad hoc section list. Section selection comes from
`ActorDefinition.declaredWorkspaceSections`, which contains section names only.
Main and Radio may receive different selected sections, but both use the same
assembler, section vocabulary, compression rules, and encoding rules.

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
blob, then let each agent re-render that blob independently. What retires is
Workbench re-bundling another area's domain facts into a single blob and serving
that blob as the agent seam, plus each agent re-rendering it. Workbench remains a
Workspace Context source for the interaction-state facts it owns; it is not
removed from the agent path.

### 5. Invocation Context

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

### 6. Continuity Context

Conversation and execution continuity.

Continuity Context is pi-carried, not MineMusic prompt-assembled. Pi `messages`
hold transcript continuity, prior tool-result messages, compaction summaries,
and restored session messages. MineMusic may persist, restore, cap, or compact
that transcript through Agent Runtime-owned storage/facades, but it must not
reconstruct current workspace truth or a separate continuity prompt from it.

Includes:

- transcript messages;
- compaction summaries;
- branch/session summaries;
- prior tool-result messages retained in transcript.

Continuity Context records what happened before. It is not current workspace
truth. If a tool result changed durable or runtime state, the next current fact
must enter Workspace Context through owning facts/projections, not by scraping
transcript messages.

### 7. Knowledge / Memory Context

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
- `userTasteHint` is just an input inside Knowledge / Memory Context for Phase B,
  not a new rail, actor definition field, or separately named provider concept.
- The hint may reuse the same underlying catalog-summary read capability that
  powers `library.catalog.summary`, but Agent Runtime must not call the public
  Stage tool as if it were a model and must not fork the summary schema.
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
4. Stage Interface owns callable tool declarations and tool-call routing. Agent
   Runtime selects the actor-specific Stage tool names from
   `ActorDefinition.toolPack.stageToolNames` for pi-carried Capability Context.
5. Pi owns the provider-facing loop mechanics: `systemPrompt`, `messages`,
   `tools`, lifecycle events, tool execution, and compaction hooks. MineMusic
   owns the content placed into those rails.
6. Each `ActorDefinition` declares which workspace-visible sections its actor
   needs. The shared assembly mechanism chooses those sections from `{ actor,
   ownerScope }`, applies shared compression rules, and emits the encoded
   Workspace Context. Separate actor-owned selection, compression, or
   hand-written re-expression of the same workspace state is not allowed.
7. A rail may be empty for an actor or run. Empty rails are explicit absence,
   not a fallback for failed reads.

## Pi Provider Context Mapping

MineMusic must map the seven context rails onto pi's real provider context shape.
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
| Actor Identity | `systemPrompt` | Stable structured actor identity is rendered from `ActorDefinition.identity` and refreshed by Agent Runtime. |
| Actor Instruction | `systemPrompt` | Stable actor instructions are rendered from `ActorDefinition.instruction` and refreshed by Agent Runtime. |
| Capability Context | `tools` | Pi carries callable capability context as provider tools. MineMusic only selects the actor's allowed Stage Interface declarations from `ActorDefinition.toolPack.stageToolNames`, materializes them into pi tools, and constrains dispatch; it does not assemble a separate capability prompt blob. |
| Workspace Context | `systemPrompt` as compact encoded context | Shared Workspace Context assembly emits the encoded Workspace Context and Agent Runtime places it into the prompt state before the pi context snapshot. |
| Invocation Context | new `messages` passed to `agent.prompt(...)` | A user turn or Radio run payload is the run's prompt/envelope. It is not mixed into Workspace Context. |
| Continuity Context | `messages` | Pi carries continuity in messages. MineMusic may persist/restore/cap/compact the transcript, but does not assemble a separate continuity prompt blob. |
| Knowledge / Memory Context | `systemPrompt` or explicit retrieved messages, depending on retrieval owner | When loaded before the model call, retrieved memory/knowledge is encoded as its own structured rail, not merged into Workspace Context. |

This mapping is load-bearing. Agent Runtime may refresh `state.systemPrompt`
before a run-start snapshot, may set `state.tools`, and may call
`agent.prompt(...)` with the Invocation Context. It must not invent a parallel
provider-context carrier, a separate Capability Context blob, or a separate
Continuity Context blob, and it must not treat transcript messages as current
workspace truth.

## Main And Radio Application

Main Agent and Radio Agent use the same Workspace Context section vocabulary.
They may receive different selected sections for a run, but there is no
Main-specific or Radio-specific Workspace Context shape.

Radio's queue dedupe context belongs to Workspace Context. Radio's
`runId`, wake reason, suggested append count, and basis revisions belong to
Invocation Context. Radio's transcript belongs to Continuity Context.
Actor-selected tools come from `ActorDefinition.toolPack.stageToolNames`;
injected command basis belongs to Capability Context.

The old pattern of a Radio-only `Radio Run Floor` carrying hand-written
workspace facts is forbidden. Radio-specific run text may exist only as
Invocation Context or `ActorDefinition.instruction`; it must not be the source
of queue, now-playing, radio truth, or revision facts.

## Forbidden Patterns

- Main and Radio each maintain their own workspace-state renderer.
- Main and Radio each maintain their own workspace-state compression logic.
- Actor identity, instruction text, declared workspace sections, or tool packs
  are scattered across server modules and run glue instead of one
  `ActorDefinition` per actor.
- Actor identity is stored as a raw prompt string instead of structured
  `ActorIdentity`.
- Actor identity quality is guarded by forbidden-string or keyword-list checks
  instead of structural ownership, field-shape, and rail-boundary checks.
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

- a shared Agent Runtime context placement/rendering boundary for MineMusic-owned
  prompt rails and Workspace Context;
- an `ActorDefinition` module shared by Main and Radio, with one object per
  actor containing `{ identity, instruction, declaredWorkspaceSections,
  toolPack: { stageToolNames } }`;
- a Workspace Context assembler that reads from area-owned projections and
  Workbench, chooses the actor's declared workspace-visible section names, applies
  shared compression rules, and emits compact encoded context with shared section
  names and shapes;
- pi `tools` populated from Stage Interface declarations selected by
  `ActorDefinition.toolPack.stageToolNames`, with actor-constrained bridge
  dispatch and no separate MineMusic Capability Context builder;
- an Invocation Context builder for Main turns and Radio runs;
- Continuity Context left in pi `messages`, with MineMusic-owned
  persist/restore/cap/compact facades only where needed;
- Knowledge / Memory Context supplied only by Memory, Knowledge, Handbook, or
  retrieval boundaries when those are in scope.

The Phase B repair is inserted after the landed PR3 Radio runtime substrate and
before PR4 as PR3.1 / PR3.2 / PR3.3:

1. PR3.1 builds the shared Agent Context core: `ActorDefinition`, the Workspace
   Context assembler, the Workspace Context encoder, and the first
   section-agnostic Music Experience projection port.
2. PR3.2 moves Radio onto the shared assembler, deletes the Radio-only Run Floor
   renderer, gives Radio queue item identity through `listening`, and changes the
   Radio refill invocation to JSON.
3. PR3.3 moves Main onto the same assembler, retires the old Workbench
   read-model seam as an agent composition path, and deletes the old
   `session_context.ts` pass-through once both actors have migrated.

The existing landed PR3 is not renamed or restructured. PR4 / PR5 / PR6 keep
their numbering.

## Open Questions

The following are not yet grilled and must not be filled as settled:

- **Interaction-state section placement.** Which workspace-visible section (if
  any) carries Workbench interaction-state facts in Phase B, or whether that is
  a future section beyond `listening` and `radio`.
- **Area projection port contract.** Decided: one section-agnostic port per
  area. Not yet grilled: the exact return shape of each area's port (Music
  Experience first).

## Acceptance Criteria

- There is exactly one Agent Runtime-owned path for turning workspace current
  state into agent-readable encoded Workspace Context.
- Main and Radio identity, instructions, workspace-section declarations, and
  tool-pack selection come from shared `ActorDefinition` objects, not server
  module inline prompt strings.
- Actor identity and instruction are separate; identity is structured
  `role` / `job` / `persona` data and instruction is operational guidance.
- Actor identity is structurally separated from instruction and workspace
  facts; guards check source, field shape, and rail boundaries rather than
  forbidden substrings.
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
