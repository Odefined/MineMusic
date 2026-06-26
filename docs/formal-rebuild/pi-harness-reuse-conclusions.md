# Pi Harness Reuse Conclusions

> Status: Source-read conclusion note
> Scope: Which harness capabilities MineMusic needs for the Agent-Native
> Workbench roadmap, and which `@earendil-works/pi-agent-core@0.80.2` code
> surfaces they may reuse.
> Authority: This note supports ADR-0039 and the Phase A/B/C specs. It is not a
> replacement for `ARCHITECTURE.md`, `CONTEXT.md`, ADRs, or source contracts.

## Source-Read Basis

This conclusion is based on directly reading the unpacked npm package sources
for:

- `@earendil-works/pi-agent-core@0.80.2`
- `@earendil-works/pi-ai@0.80.2`

Key source surfaces read:

- `dist/index.d.ts` and `dist/index.js`: root export set for low-level agent, loop, harness helpers, session, compaction, prompt-template, and skill helpers.
- `dist/agent.js`: low-level stateful `Agent`.
- `dist/agent-loop.js`: tool-call execution, hook, abort, and event loop.
- `dist/types.d.ts`: `AgentTool`, `AgentToolResult`, `transformContext`,
  `beforeToolCall`, `afterToolCall`, and event types.
- `dist/harness/agent-harness.js`: full `AgentHarness`, which imports
  `runAgentLoop` directly and is an alternative stateful layer, not a wrapper
  around low-level `Agent`.
- `dist/harness/session/*`: session tree, repos, and context rebuild helpers.
- `dist/harness/compaction/*`: token estimation, compaction preparation, and
  summarization helpers.
- `dist/harness/prompt-templates.*`: prompt-template loading and invocation.
- `dist/harness/skills.*` and `dist/harness/system-prompt.*`: future skill
  loading/catalog/invocation helpers.
- `@earendil-works/pi-ai/dist/stream.js`,
  `dist/api-registry.js`, `dist/providers/register-builtins.js`,
  `dist/providers/openai-completions.js`, and `dist/types.d.ts`: provider/model
  plumbing and JSON Schema tool parameter handling.

## Core Conclusion

MineMusic should **not** adopt pi's full `AgentHarness` as the MineMusic runtime
harness. The full harness is shaped around an `ExecutionEnv` that combines
filesystem and shell capabilities, owns a session layer, and runs as a separate
stateful layer over `runAgentLoop`.

MineMusic should instead use a **Pi-first, root-export-helper-first** approach:

- use low-level `Agent` as the embedded Main/Radio engine loop;
- use root-exported harness helpers from `@earendil-works/pi-agent-core`
  through Agent Runtime-owned facade/adaptor ports where they fit;
- read pi source while implementing wrapper logic;
- avoid vendoring pi harness directories or maintaining a local fork;
- keep raw pi imports confined to Agent Runtime engine/facade/adaptor modules
  and adapter-focused tests;
- keep product harness policy in MineMusic.

Skill support is a future extension point, not a Phase A/B requirement. Phase A
should not add a skill root, skill catalog, skill selection, or full `SKILL.md`
body injection. When MineMusic later needs skills, it should reuse pi's skill
semantics through an Agent Runtime facade rather than inventing a prompt-module
system.

## Harness Reuse Map

| MineMusic harness | Pi code surface to reuse | MineMusic-owned policy |
| --- | --- | --- |
| Main turn harness | `Agent.prompt`, `Agent.continue`, `Agent.abort`, `Agent.waitForIdle`, lifecycle listeners, `state.messages`, `steer`, `followUp` from `dist/agent.js`. | Turn assembly, Session Context injection, user-visible response policy, actor lifecycle ownership. |
| Tool bridge harness | `AgentTool.execute(toolCallId, params, signal, onUpdate)`, JSON Schema-shaped `Tool.parameters`, `beforeToolCall`, `afterToolCall`, `tool_execution_update` from `dist/types.d.ts` and `dist/agent-loop.js`. | Stage Interface dispatch, Effect gate translation, Public Handle Veil, declared-error normalization, compact public output. |
| Session/transcript harness | Public `state.messages` read/write on low-level `Agent`; `Session`, `SessionRepo`, `buildSessionContext`, and repo utilities from `dist/harness/session/*` as reference or wrapped helper substrate. | Postgres-backed transcript persistence, session identity, Main/Radio continuity policy, Radio truth floor. |
| Compaction harness | `estimateContextTokens`, `shouldCompact`, `generateSummary`, `prepareCompaction`, `compact`, and compaction message helpers from `dist/harness/compaction/*`. | When to compact, what context must never be lost, how summaries are written back, Radio endurance tests and policy. |
| Prompt assembly harness | `loadPromptTemplates`, `loadSourcedPromptTemplates`, `formatPromptTemplateInvocation`, and argument substitution from `dist/harness/prompt-templates.*`. | MineMusic Session Context shape, product prompt policy, per-actor prompt structure. |
| Work visibility harness | Agent lifecycle and tool events from `dist/agent.js` / `dist/agent-loop.js`, especially message events, tool start/end, and tool updates. | Workbench work trace, badges, card statuses, user-facing summaries, and hiding raw technical tool logs by default. |
| Provider/model harness | `streamFn`, per-call `getApiKey`, `Model` descriptor, provider registry, built-in providers, and `openai-completions` compatibility from `@earendil-works/pi-ai`. | Model/provider choice, runtime key ownership, config source, fallback/error posture. |
| Radio turn harness | Same low-level `Agent` turn, abort, transcript, and event primitives as Main. | Radio supervisor: low-watermark pacing, single-flight, bounded wake runs, retry/endurance, and Main-Radio coordination. |
| Concurrency/cancel harness | `AbortSignal` propagation into tools and hooks; awaited `beforeToolCall` / `afterToolCall` gates. | Agent Work Basis, per-concern OCC, user > Main > Radio abort cascade, hook `Promise.race` against abort. |
| Proposal/resume harness | Pi can supply paused hook mechanics and continued turns. | Proposal Unit parking, Confirm card projection, approval/rejection, basis re-check, and resume semantics. |
| Future skill harness | `loadSkills`, `loadSourcedSkills`, `formatSkillsForSystemPrompt`, `formatSkillInvocation` from `dist/harness/skills.*` and `dist/harness/system-prompt.*`. | Future Agent Runtime skill source policy, selection policy, product/runtime skill ownership. Not Phase A/B scope. |

## Phase Implications

### Phase A

Phase A needs the smallest in-process Main Agent loop:

- low-level `Agent` engine adapter;
- Stage tool bridge;
- Session Context prompt assembly;
- minimal transcript handling;
- provider/model wiring;
- source-level familiarity with pi root-exported harness helpers, but no skill
  runtime.

Phase A may wrap prompt-template/session/compaction helper surfaces only if the
slice needs them. It must not add skill runtime code.

### Phase B

Phase B needs the Radio harness:

- another low-level `Agent` loop for Radio;
- supervisor-owned pacing and single-flight;
- transcript persistence and compaction policy;
- abort cascade and stale-work coordination.

Pi helps with the agent loop, transcript shape, tool execution, hooks, abort
signals, and compaction/session helper primitives. Pi does not provide the
Radio supervisor, Main-Radio channel, OCC basis, or endurance floor.

### Phase C

Phase C needs Web/human boundary harness:

- Proposal Unit park/resume;
- Workbench Action Adapter;
- work/card projections;
- AG-UI serialization.

Pi can support continued agent turns and hook pauses, but the human-facing
proposal/card/action surface is Workbench Interface and Agent Runtime policy,
not Pi policy.

## Guardrails

- Do not import `AgentHarness` as MineMusic's runtime owner.
- Do not create a broad `PiHarnessUtilityPort`.
- Do not spread raw `@earendil-works/pi-agent-core` harness-helper imports
  outside Agent Runtime engine/facade/adaptor code and adapter-focused tests.
- Do not vendor pi harness directories by default.
- Do not build a clean-room equivalent when a public pi helper already fits
  behind a narrow MineMusic facade.
- Do not add Phase A skill runtime behavior. Keep skill support as a future
  facade extension point.
