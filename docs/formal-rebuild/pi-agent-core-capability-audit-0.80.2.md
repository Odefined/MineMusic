# pi-agent-core Capability Audit — `@earendil-works/pi-agent-core@0.80.2`

> Status: Research / verification artifact. Authority: this document is a **first-hand
> evidence record** against the installed package, produced to settle the pi Capability
> Assumptions Ledger in `phase-A-in-process-agent-native-loop-spec.md` and the PB8a
> prerequisite gate in `phase-B-radio-concurrency-spec.md`. It is **input** to the
> engine-choice ADR and the phase-A/B specs, not architecture authority itself.
> Date: 2026-06-26. Auditor method: read installed `.d.ts` + compiled `.js` source only;
> re-ran three minimal runtime checks against the installed package. No
> README/CHANGELOG/blog/training-memory used as a conclusion basis.

## 0. Package confirmation + version

| field | value | evidence |
| --- | --- | --- |
| scoped name | `@earendil-works/pi-agent-core` | `npm view` (resolved exactly, no typo-squat confusion) |
| **exact version audited** | **0.80.2** (latest `dist-tags.latest`) | `node_modules/@earendil-works/pi-agent-core/package.json` `"version": "0.80.2"`; verified by every citing agent |
| license | MIT | `npm view ... license` |
| maintainers | mitsuhiko (Armin Ronacher), badlogic (Mario Zechner), rwachtler | credible, active |
| repo | github.com/earendil-works/pi | `repository.url` |
| published | 2026-06-23 | `npm view @earendil-works/pi-agent-core time --json`, `time.0.80.2` |
| deps | `@earendil-works/pi-ai@^0.80.2`, `ignore`, `typebox@1.1.38`, `yaml` | `package.json` |
| companion pkg | `@earendil-works/pi-ai` — owns Model/Transport/Tool schema + all provider adapters | `node_modules/@earendil-works/pi-ai` |
| maturity signal | 26 versions in ~7 weeks (0.74.0 2026-05-07 → 0.80.2 2026-06-23); `dist-tags.legacy-node20: 0.74.2` ⇒ has already done a Node-version compatibility split | `npm view ... time` / `dist-tags` |

**Maturity read:** very actively iterated, single credible vendor group, MIT, has a vitest
harness. The ~7-week / 26-version cadence plus an existing `legacy-node20` tag means
**breaking changes are frequent** — MineMusic must pin exactly and re-run this audit on
upgrade. This is the main supply-chain risk, not capability gaps.

The package is now pinned in `package.json` / `package-lock.json` by PR-A1a
preparation work. The audit below is the PR-A1a/PR-B verification gate for that
pin.

## 1. Per-assumption adjudication

Legend: ✅ 成立 · ❌ 不成立 · ◑ 部分成立 · ❓ 类型无法确认. Every row is backed by a
first-hand `file:line` citation from `node_modules/@earendil-works/pi-agent-core@0.80.2`
(or the companion `pi-ai`). Paths are relative to that package's `dist/` unless prefixed
`pi-ai/`.

### A. Engine layering & embedding

| id | verdict | evidence (first-hand) | notes |
| --- | --- | --- | --- |
| **A1** | ✅ 成立 (with one important nuance) | Low-level `Agent` class: `agent.d.ts:30-117` (impl `agent.js:86-401`). It "owns the current transcript, emits lifecycle events, executes tools, and exposes queueing APIs for steering and follow-up messages" (`agent.d.ts:24-29`). Separate higher harness `AgentHarness`: `harness/agent-harness.d.ts:4` (impl `harness/agent-harness.js:125`). **Nuance:** the harness does **not** wrap/instantiate `Agent` — it imports the stateless loop directly: `harness/agent-harness.js:2 import { runAgentLoop } from "../agent-loop.js"` and calls it at `:510`. Three layers: `runAgentLoop` (stateless) < `Agent` (in-memory stateful) < `AgentHarness` (session/compaction/skills). | The phase-A mental model "low-level Agent + higher harness" is correct **as a layer list**, but the implicit "harness is built on Agent" is **false** — they are two *independent* stateful layers over one stateless loop (`runAgentLoop`). Choosing `Agent` gives none of the harness; choosing `AgentHarness` does **not** flow through `Agent`'s `processEvents`/`state.messages`/`reset`. For MineMusic (which chose the low-level `Agent`) this is fine and confirms the harness is not a seamless upgrade path. |
| **A2** | ✅ 成立 | `AgentOptions` (`agent.d.ts:5-23`): **every field optional** (`initialState?`, `streamFn?`, `getApiKey?`, `beforeToolCall?`, `afterToolCall?`, `prepareNextTurn?`, `transport?`, `sessionId?`, …). Constructor `constructor(options?: AgentOptions)` (`agent.d.ts:55`, `agent.js:111 constructor(options = {})`). Defaults (`agent.js:112-129`): `streamFn ?? streamSimple`, `systemPrompt ?? ""`, `messages ?? []`. **No** required `session`/`env`/`skills`/`systemPrompt` — contrast `AgentHarnessOptions` (`types.d.ts:585-613`) where `env`/`session`/`model` are mandatory. | Confirmed: `new Agent({ initialState: { systemPrompt, model, tools, messages }, streamFn })` is a fully caller-driven engine with zero harness coupling and **no baked-in prompt** (`agent.js:273 systemPrompt: this._state.systemPrompt`). |
| **A3** | ✅ 成立 (load-bearing) | `Agent` fields (`agent.js:87-110`): `_state, listeners, steeringQueue, followUpQueue, convertToLlm, transformContext, streamFn, getApiKey, onPayload, onResponse, beforeToolCall, afterToolCall, prepareNextTurn, activeRun, sessionId, thinkingBudgets, transport, …` — **no** `session`, `compact`, compaction-settings, branch, or persistence member. `sessionId` is just a provider-cache hint (`agent.d.ts:45-46`, forwarded at `agent.js:283`). `reset()` clears in-memory only (`agent.js:208-216`). Compaction/session/jsonl implementations live **only** under `harness/` (`index.d.ts:1-19` re-exports low-level agent, loop, AgentHarness, compaction, session, prompt-template, skill, and utility helpers). Adversarial skeptic: `rg "compact\|shouldCompact\|persist\|session\|save\|load\|jsonl"` in `agent.js`/`agent-loop.js` = NONE; `agent-loop.js` imports only the pi-ai compatibility stream/schema helpers, not harness persistence. | **Compaction + persistence + endurance are harness-only. The low-level `Agent` is volatile.** See §3 (load-bearing) and the falsification of ledger-row-6 in §4. |

### B. Tool-call bridge

| id | verdict | evidence | notes |
| --- | --- | --- | --- |
| **B1** | ✅ 成立 | `AgentTool.execute` (`types.d.ts:333`): `execute: (toolCallId: string, params: Static<TParameters>, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>`. `AgentTool<TParameters extends TSchema> extends Tool<TParameters>` (`types.d.ts:324`); `AgentToolResult<T> = { content: (TextContent\|ImageContent)[]; details: T; terminate?: boolean }` (`types.d.ts:305-315`). | Matches the assumption exactly. The only thing the assumption missed is the 4th param `onUpdate` (stream partial results) and the `terminate?` early-stop hint on the result. |
| **B2** | ✅ 成立 | `Tool<TParameters extends TSchema = TSchema> { name; description; parameters: TParameters }` (`pi-ai/types.d.ts:253-257`) — the field is **`parameters`** (not `schema`), typed `TSchema`. `TSchema` is TypeBox's **empty marker interface** (`typebox/.../schema.d.mts:1-2 `export interface TSchema {}`) whose options are pure JSON-Schema keywords. Runtime proof it **is** JSON Schema: `providers/openai-completions.js:898 parameters: tool.parameters, // TypeBox already generates JSON Schema` (passed verbatim to OpenAI); `providers/anthropic.js:938-946` reads `.properties`/`.required` straight off it. | **A raw hand-written JSON Schema object structurally satisfies `TSchema` and works at runtime** (TS accepts it because the interface is empty; providers read only standard JSON-Schema keys). ⇒ MineMusic's Stage JSON-Schema maps to `Tool.parameters` with near-zero conversion (field rename only). Resolves phase-A open Q "Stage JSON-Schema → pi-schema conversion mechanics." Optional: rebuild via TypeBox `Type.*` only if a provider is observed to need the `[Symbol.for('TypeBox.Kind')]` decorations — the two audited (openai-completions, anthropic) do not. |
| **B3** | ✅ 成立 (runtime-verified) | AbortController created in `Agent.runWithLifecycle` (`agent.js:310`), stored on `activeRun` (`:315`); `abort()` trips it (`agent.js:196-198`); the same signal is threaded into `tool.execute` (`agent-loop.js:420 … prepared.tool.execute(prepared.toolCall.id, prepared.args, signal, …)`) and into `beforeToolCall`/`afterToolCall` (`agent-loop.js:373`, `:459`). **Fresh runtime re-run:** a fake-stream tool call started at +3ms with `aborted=false`; after `agent.abort()` was scheduled at 137ms, the tool's passed signal observed `aborted=true` and resolved via `"signal-abort"` at +140ms. The loop then made the second fake `streamFn` call and settled normally. | **Cancellation is COOPERATIVE.** pi passes the signal; it does **not** force-cancel an in-flight tool. A tool that ignores the signal keeps running to completion. ⇒ MineMusic's `StageToolContext.abortSignal` wiring and the PB9 cascade **depend on `dispatch`/the tool honoring the signal** — the spec already assumes this ("dispatch honors cancellation"); just record that pi does not enforce it. |
| **B4** | ✅ 成立 | Tools **throw** on failure (`types.d.ts:332` "Throw on failure instead of encoding errors in `content`."). The loop catches at `agent-loop.js:435-442`, converts via `createErrorToolResult` (`:480-485` → `{ content: [{type:"text", text: <err msg>}], details: {} }`), wraps as a `toolResult` message with `isError:true` (`agent-loop.js:495-509`), pushes into context and emits it back to the LLM. Schema-validation failures take the same path via `prepareToolCall` (`agent-loop.js:362-414`). `afterToolCall` may override `isError` (`agent-loop.js:466`). | Confirms the phase-A error-channel design: bridge translates declared `Result.err` → `throw` → pi renders an `isError:true` tool result. Matches MineMusic's error-boundary rule exactly. |

### C. Loop control

| id | verdict | evidence | notes |
| --- | --- | --- | --- |
| **C1** | ✅ 成立 | `prompt(message\|message[]): Promise<void>` and overload `prompt(input: string, images?): Promise<void>` (`agent.d.ts:104-105`); `continue(): Promise<void>` (`:107`); `abort(): void` (`:94`); plus `steer`/`followUp`/`clearSteeringQueue`/`clearFollowUpQueue`/`clearAllQueues`/`hasQueuedMessages` (`:80-90`). `QueueMode = "all" \| "one-at-a-time"` (`types.d.ts:28`). | Steering/follow-up are **queued, drained at turn boundaries** (`agent-loop.js:82`, `:154`, `:157`), NOT mid-tool interrupts. `abort()` is the only true mid-run interrupt. |
| **C2** | ✅ 成立 | `waitForIdle(): Promise<void>` (`agent.d.ts:100`); impl `agent.js:204-206 return this.activeRun?.promise ?? Promise.resolve()`. The promise is created in `runWithLifecycle` (`:311-314`) and resolved **only** in `finishRun` (`:350`), which runs in the `finally` **after** `processEvents` has awaited every listener for `agent_end` (`agent.js:397-399 for (const listener of this.listeners) { await listener(event, signal); }`, no type filter). | Exactly what MineMusic's test harness wants: resolves strictly after `agent_end` + all listeners settle. Error runs synthesize a full event sequence ending in `agent_end` (`handleRunFailure`), so it still settles. |
| **C3** | ✅ 成立 (runtime-verified) | `beforeToolCall?: (context, signal?) => Promise<BeforeToolCallResult \| undefined>` (`types.d.ts:229`); **awaited** before execution in `prepareToolCall` (`agent-loop.js:373 await config.beforeToolCall({…}, signal)`), which both execution paths await first (sequential `:272`, parallel `:308`). `afterToolCall` similarly awaited after execution (`agent-loop.js:450`). **Fresh runtime re-run:** with `beforeToolCall` awaiting an external gate, the hook started at +0ms, released at +213ms, and the tool executed at +213ms, not before. Abort caveat was also reproduced: in a second gated run, `agent.abort()` was called at +90ms while the hook was still awaiting; the hook did not return until its own gate released at +225ms, then pi noticed `aborted=true`, skipped tool execution, and emitted an `Operation aborted` tool result. | **Hooks can pause the loop by awaiting any external promise.** This satisfies the I2 integration-layer need (pause between basis-capture and commit) and is load-bearing for PB9. **CAVEAT (implementation requirement, see §4):** while a hook is awaiting, the loop does **not** automatically honor a fresh `abort()` — the hook "is responsible for honoring it" (`types.d.ts:228`). A blocking hook **must race its awaited promise against the passed signal**, or `abort()` will not unblock the loop until the hook's own promise settles. |
| **C4** | ✅ 成立 (load-bearing, exhaustively proven) | Only classes containing "Agent": `Agent` (`agent.d.ts:30`), `AgentHarness` (`harness/agent-harness.d.ts:4`), `AgentHarnessError` (`harness/types.d.ts:125`). Internal `new Agent(` = **0** executable hits (the only one is a JSDoc `@example` at `proxy.js:28`). `agentLoop`/`runAgentLoop` are flat functions with no nested-agent creation (`agent-loop.d.ts:12,22`). The only `fork` is `SessionRepo.fork` (`harness/types.d.ts:341`) = **transcript-session branching** (`getEntriesToFork`, `repo-utils.js:20`), not agent spawning. Every `spawn` is `node:child_process` shell (`harness/env/nodejs.js:1,77,235`) or the `spawn_error` error code. Adversarial skeptic: zero hits for `subagent\|child.?agent\|parent.?agent\|delegate\|orchestr` across both dist trees. | **No subagent / fork / dispatch / parent-child primitive exists.** Confirms ADR-0032's "reuse pi parent/child channel" premise is wrong (as already known) and that Main↔Radio coordination is entirely MineMusic-built. See §3. |

### D. Persistence / Compaction / Endurance (most uncertain → now resolved)

| id | verdict | evidence | notes |
| --- | --- | --- | --- |
| **D1** | ◑ 部分成立 | Persistence is **harness-only**, not a low-level-`Agent` concern. `Agent` has no save/load/repo (`agent.d.ts:30-117`); only `sessionId?` (provider cache key). Persistence lives under `harness/session/`: `JsonlSessionRepo` (`jsonl-repo.d.ts:3-24`) + `JsonlSessionStorage` (disk, append-only JSONL, version-3 header at `jsonl-storage.js:51`, `appendFile` at `:194`); `InMemorySessionRepo` (`memory-repo.d.ts:2-17`, `Map`-backed, not durable). Cross-run reload: `AgentHarness.createTurnState()` calls `session.buildContext()` each turn (`agent-harness.js:268`; `session.js:83-85` walks `getPathToRoot(leafId)` and folds compaction entries `session.js:37-57`). | "Transcript persists and is reloadable across runs" is **true only via the harness**. The bare `Agent` MineMusic chose is volatile — it keeps whatever `state.messages` it is given in-memory and reloads nothing. ⇒ PB2 cross-run "soul" continuity requires MineMusic to either adopt the harness's `SessionRepo` (importable standalone) or build its own persistence over `state.messages`. |
| **D2** | ✅ 成立 (compaction is **manual, never automatic**) | `shouldCompact(contextTokens, contextWindow, settings)` (`compaction.d.ts:52`) has **zero internal callers** (rg across dist: only the definition + barrel re-export). `AgentHarness.compact(customInstructions?)` (`agent-harness.d.ts:60`, impl `agent-harness.js:627`) is an **explicit, idle-gated** method (`if (this.phase !== "idle") throw "compact() requires idle harness"`, `:628-629`). No token-threshold auto-trigger in the loop or harness. `DEFAULT_COMPACTION_SETTINGS = { enabled:true, reserveTokens:16384, keepRecentTokens:20000 }` (`compaction.js:57-61`). | Compaction is **(b) manually callable**, never (a) automatic, at every layer. Any auto-compact must be consumer-built (call `shouldCompact`/`estimateContextTokens` yourself, then compact). |
| **D3** | ✅ 成立 (load-bearing, runtime-verified) | **Path 2 — direct transcript truncation — WORKS, no harness, no LLM.** `AgentState.messages` is a public settable accessor (`types.d.ts:288-290 set messages(messages: AgentMessage[])`; `agent.d.ts:72 get state()`; setter impl `agent.js:42-44 set messages(nextMessages){ messages = nextMessages.slice(); }`). **Fresh runtime re-run:** after the fake-stream tool-call round trip produced the expected transcript roles (`user`, `assistant`, `toolResult`, `assistant`), assigning `agent.state.messages = agent.state.messages.slice(1)` twice truncated the transcript lengths 4→3→2. **Path 1 — compaction API — is LLM-dependent**, not pure: `compact(preparation, model, apiKey, …)` (`compaction.d.ts:94`, arity 7) calls `generateSummary → completeSimple` (`compaction.js:379`, a real LLM completion) and takes `CompactionPreparation` built by `prepareCompaction(SessionTreeEntry[], settings)` (`compaction.d.ts:91`) — **not** a raw `AgentMessage[]`. The pure utilities `shouldCompact` + `estimateContextTokens(messages)` + `generateSummary(messages, model, …)` ARE callable on any `AgentMessage[]`. **Bonus second seam:** `transformContext?: (messages, signal?) => Promise<AgentMessage[]>` (`types.d.ts:162`; applied at `agent-loop.js:175-176`) rewrites the message array before each LLM call — a per-turn automatic truncation hook on the low-level Agent. | The PB8a prerequisite gate **passes**: pi exposes an externally writable/truncatable transcript (Path 2). MineMusic can inject "transcript lossy-compressed" in-harness via direct `agent.state.messages = [summary, …kept]` assignment (simplest), or `transformContext` (more realistic, per-turn), or `generateSummary` + reassign (real LLM summary). **PB8a does NOT fall back to after-B.** See §3. |
| **D4** | ◑ 部分成立 | The **engine** (`Agent`/`agentLoop`) has **zero** endurance: no auto-persist (D1), no auto-reload, no auto-compaction (D2). The **harness** provides auto per-message persistence (`agent-harness.js:443 appendMessage` on `message_end`) + per-turn reload (`:268`), but **no** auto-compaction / auto-restart / context-growth management. | For the low-level `Agent` MineMusic uses: **endurance is entirely MineMusic's to build** (persist `state.messages`, trigger compaction, manage context growth). The harness's auto-persist+reload is available only if MineMusic adopts `AgentHarness` (which it has chosen not to). |

### E. Model / Provider

| id | verdict | evidence | notes |
| --- | --- | --- | --- |
| **E1** | ✅ 成立 | `StreamFn = (...args: Parameters<typeof streamSimple>) => ReturnType<typeof streamSimple> \| Promise<…>` (`types.d.ts:12`) — literally an overload of `streamSimple`, fully injectable via `AgentOptions.streamFn` (`agent.d.ts:9`). `streamSimple<TApi>(model, context, options?): AssistantMessageEventStream` (`pi-ai/stream.d.ts:4`). Two key-resolution surfaces: (a) `Agent.getApiKey?: (provider) => Promise<string\|undefined>\|string\|undefined` (`agent.d.ts:10`) — a **pluggable per-call resolver**; (b) `getEnvApiKey(provider, env?)` (`pi-ai/env-api-keys.d.ts:16`) — default per-provider env-var resolution invoked inside `stream.js:6-13`. `options.apiKey` takes precedence (`stream.js:7`). | The phase-A assumption "stream function + API-key resolver" holds with both a pluggable resolver (`getApiKey`) and a default env resolver. The streamFn contract forbids throwing on provider/runtime failure — failures must be encoded as stream events with `stopReason:"error"\|"aborted"` (`types.d.ts:6-11`). |
| **E2** | ✅ 成立 | `Model<TApi>` is a plain data descriptor (`pi-ai/types.d.ts:502-526`): `{ id; name; api: TApi; provider; baseUrl; reasoning; cost; contextWindow; maxTokens; headers?; compat? }`. Held directly as `AgentState.model: Model<any>` (`types.d.ts:282`) and `AgentLoopConfig.model` (`:114`); `prepareNextTurn` can hot-swap it mid-run (`AgentLoopTurnUpdate.model?`, `types.d.ts:107`). The provider registry is keyed by **`Api` (wire-protocol family)**, not brand (`stream.js:22/30 resolveApiProvider(model.api)`). | Swapping model/provider = swapping the descriptor. Two providers sharing an `api` (e.g. two OpenAI-compatible gateways) need no re-registration — just a different `Model` with different `baseUrl`/`provider`/key. `registerBuiltInApiProviders()` registers all 9 families at import. |
| **E3** | ✅ 成立 | Built-in **api adapters** (`pi-ai/register-builtins.js:167-177`): `anthropic-messages`, `azure-openai-responses`, `google-generative-ai`, `google-vertex`, `mistral-conversations`, `openai-codex-responses`, **`openai-completions`**, `openai-responses`, `bedrock-converse-stream`. The **generic OpenAI-compatible adapter is `openai-completions`** (`providers/openai-completions.d.ts:15 streamOpenAICompletions`). `Model` carries `baseUrl` (`types.d.ts:507`) and `compat?: OpenAICompletionsCompat` (`:525`) whose `thinkingFormat` enum includes `'deepseek'\|'openrouter'\|'zai'\|'qwen'\|'together'\|…` (`:348`). | **DeepSeek needs NO new adapter.** Model = `{ api:'openai-completions', baseUrl:<deepseek-endpoint>, provider:'deepseek', compat:{ thinkingFormat:'deepseek' } }`, key via `getApiKey`/env. Resolves phase-A open Q "pi-ai ↔ DeepSeek (OpenAI-compatible) stream-function adapter mechanics." A genuinely new OpenAI-compatible host is the same recipe with a custom `baseUrl` + `options.apiKey`. |

### F. Overall characterization

| id | verdict | evidence | notes |
| --- | --- | --- | --- |
| **F1** | ◑ 部分成立 | At the **prompt/skill layer**, pi is general-purpose: the only baked-in system prompt is `"You are a helpful assistant."` (`agent-harness.js:275`, fallback only) plus the internal compaction summarizer prompt (`compaction.js:282`); skills/prompt-templates are **caller-loaded** (`skills.js:18 loadSkills` reads caller `SKILL.md` dirs; `system-prompt.js:3-4` returns `""` when no skills). rg for `coding agent\|file edit\|bash skill\|built-in skill` = ZERO. **But** the **harness infrastructure** is opinionated toward agentic shell/file work: `ExecutionEnv extends FileSystem, Shell` (`types.d.ts:228`), a `bashExecution` custom message role (`messages.d.ts:7-17`), and `CompactionPreparation.fileOps` tracking read/written/edited files (`types.d.ts:556-560`). | For MineMusic — which uses the **low-level `Agent`, not the harness** — none of the coding-shaped infrastructure is in play; `new Agent({})` has an empty prompt and no tools. The "coding-agent" flavor lives entirely in the harness layer MineMusic is skipping. So for MineMusic's purpose pi behaves as a general-purpose agent-loop engine. |
| **F2** | — (signals, not verdict) | v0.80.2 (latest), MIT, ~7 weeks old with 26 releases, `legacy-node20:0.74.2` tag (already did one Node-version compat split), maintained by Armin Ronacher et al., vitest test harness present. | **High churn ⇒ high breaking-change risk.** Pin exactly; re-audit on any bump. This is the dominant supply risk, ahead of any capability gap. |
| **F3** | — (structural) | pi = single in-process agent-loop (`runAgentLoop`) + a stateful `Agent` wrapper + transport-abstracted `StreamFn` + an optional opinionated `AgentHarness` (session/compaction/skills). No graph/handoff abstraction. | For "embed in-process as an engine": pi gives a **complete, overridable** loop with lifecycle/steering/abort/hooks/compaction/session out of the box — more batteries than Vercel AI SDK's lower-level primitives, less prescriptive than OpenAI Agents SDK's handoffs or LangGraph's graph. Structural trade-offs vs those: **(a)** no native multi-agent/subagent primitive (you build coordination); **(b)** the harness duplicates session/compaction MineMusic will partly rebuild anyway (because MineMusic skips the harness for the low-level `Agent`); **(c)** single young vendor vs SDK ecosystems. Net: pi is a good *engine* (the loop), a skippable *harness*, and a non-solution for *coordination*. |

## 2. The three load-bearing answers (MineMusic is most blocked on these)

**C4 — subagent / fork primitive? → NO. ✅ proven.**
There is exactly one agent loop. No subagent/fork/dispatch/parent-child/spawn primitive
exists anywhere in `@earendil-works/pi-agent-core@0.80.2` or `@earendil-works/pi-ai`. The
only agent-named classes are `Agent`, `AgentHarness`, `AgentHarnessError`; the only internal
`new Agent(` is a JSDoc example; the only `fork` is `SessionRepo.fork` (transcript-session
branching); every `spawn` is `node:child_process` shell. ⇒ Main↔Radio coordination
(ADR-0032) is entirely MineMusic-built. **No rework needed — this was already assumed true
and is now verified at 0.80.2.**

**D3 — programmatic compaction OR external transcript truncation? → YES (truncation; and
more). ✅ runtime-verified.**
`AgentState.messages` is a public, settable accessor (`types.d.ts:288-290`; setter
`agent.js:42-44`). A caller can read/rewrite/truncate the transcript directly — verified by
fresh runtime re-run (`agent.state.messages = agent.state.messages.slice(1)` truncated len 4→3→2, no
harness, no LLM). Additionally: `transformContext` is a per-turn hook that can rewrite
messages before each LLM call (`types.d.ts:162`), and `shouldCompact` /
`estimateContextTokens` / `generateSummary` are pure utilities usable on any `AgentMessage[]`
(`generateSummary` needs a Model for the summary text). ⇒ **The PB8a prerequisite gate
passes: MineMusic can inject compaction/transcript-erosion in-harness without the full
`AgentHarness`. PB8a does NOT fall back to after-B.** (Note: the full `compact()` API needs
an LLM + `SessionTreeEntry[]` shape, so for a *deterministic, LLM-free* test the direct-
assignment / `transformContext` path is the right one.)

**A3 — compaction/persistence in low-level Agent or harness-only? → HARNESS-ONLY. ✅ proven.**
The low-level `Agent` has **no** compaction, **no** persistence, **no** endurance. It holds
`state.messages` in memory; `reset()` clears them (`agent.js:208-216`); `sessionId` is a
provider-cache hint, not a store. All compaction/session/jsonl code lives under `harness/`
(`index.d.ts:1-19` re-exports those harness helper surfaces); `AgentHarness` owns `compact()` (idle-gated,
`agent-harness.js:627`) and per-message persistence + per-turn reload. ⇒ Since MineMusic
uses the low-level `Agent`, it inherits **none** of pi's endurance — persistence, compaction
triggering, and context-growth management are all MineMusic's to build (over `state.messages`
and/or the standalone-importable `SessionRepo`).

## 3. Falsified / reframed assumptions (these go back to the planning layer)

These are statements MineMusic's planning currently treats as settled that the audit
contradicts or must refine. Each names the owning doc and the required action.

1. **Ledger row 6 — "Transcript persists and is reloadable across runs (compaction is
   native)" — the parenthetical "(compaction is native)" is FALSE for the low-level Agent,
   and persistence is too.**
   Owner: `phase-A-in-process-agent-native-loop-spec.md` "pi Capability Assumptions Ledger"
   (row at line ~352); consumer PB2 (`phase-B-radio-concurrency-spec.md`).
   Action: rewrite the row to: *low-level `Agent` is volatile (no persistence, no
   compaction); persistence/compaction are harness-only and MineMusic must build endurance
   itself over `state.messages` (or adopt the standalone `SessionRepo`).* This is the single
   most important correction — PB2's "transcript persists (compacted) and is reloaded" is
   **not** a pi-provided behavior at MineMusic's chosen layer.

2. **PB8a's posture can be upgraded from "prerequisite-gated, may fall back to after-B" to
   "gate passes."**
   Owner: `phase-B-radio-concurrency-spec.md` PB8a (line ~285).
   Action: record that the externally-truncatable-transcript path is verified at 0.80.2
   (direct `state.messages` assignment, LLM-free; plus `transformContext` for per-turn).
   PB8a's injected-compaction endurance test proceeds in Phase B.

3. **C3 hook-pause carries an implementation duty the spec doesn't yet state: the hook must
   race its awaited promise against the abort signal.**
   Owner: `phase-A` ledger row 5 (beforeToolCall can await); `phase-B` PB9 cascade + the I2
   integration layer (line ~379).
   Action: add a note that pi does **not** auto-honor `abort()` while a hook is awaiting
   (`types.d.ts:228` "the hook is responsible for honoring it"). Any gate/pause hook MineMusic
   writes (basis-capture→commit pause, or anything PB9 relies on) must
   `Promise.race([gate, abort(signal)])` or `abort()` will not interrupt a paused loop until
   the hook's own promise settles. This is a concrete implementation requirement for PB9's
   "abort stops the loop" wiring.

4. **B3 cancellation is cooperative — pi passes the signal, it does not enforce it.**
   Owner: `phase-A` ledger row 3; PB9.
   Action: the spec already assumes "dispatch honors cancellation"; record explicitly that a
   tool/`dispatch` that ignores `signal` keeps running. The PB9 "abort touches only pi run
   lifecycle" claim holds *only if* tools honor the signal (otherwise an in-flight tool
   outlives the abort). Low risk for MineMusic (dispatch will honor it), but state it.

5. **(Reframe, not falsification) A1: the harness is not "Agent + more" — it is a parallel
   implementation.**
   Owner: `phase-A` A1 Deep Dive "Embedding choice."
   Action: keep the decision (use low-level `Agent`) — it is correct. Just correct the mental
   model: `AgentHarness` imports `runAgentLoop` directly (`agent-harness.js:2`) and does not
   flow through `Agent`. So there is no "start with Agent, upgrade to harness" continuum; they
   are alternatives. Matters only if anyone later proposes adopting the harness.

## 4. Cannot-be-answered-from-types (runtime-experiment) list

The fresh runtime checks (tool-call signal propagation + transcript truncation; hook pause;
abort while hook is paused) **all ran end-to-end** and confirmed D3 / B3 / C3. Remaining
items not fully resolvable from types:

- **`streamProxy` as a `StreamFn` strips the `partial: AssistantMessage` field**
  (`ProxyAssistantMessageEvent`, `proxy.d.ts:12-57`) that the full `AssistantMessageEvent`
  carries. If MineMusic ever routes the LLM call through its own server via `streamProxy`
  (server holds the key), confirm at runtime that the agent loop tolerates the
  bandwidth-optimized event set. **Not needed for phase A** (direct `streamFn` to DeepSeek);
  relevant only if a server-keyed proxy is adopted later.
- **Concurrent appends to `JsonlSessionStorage`** assume a single-writer-per-session
  contract; concurrent-append behavior under a custom FS adapter is not type-determinable.
  **N/A for MineMusic** (persistence is Postgres-backed, JSONL is not used).
- **Tool `executionMode:"parallel"` ordering nuance** (already type-documented):
  `tool_execution_end` fires in completion order, tool-result *messages* in assistant source
  order (`agent-loop.js:332-338`). Only matters if MineMusic's UI keys off event ordering.

Nothing on the critical path (A1–F3) remains type-unconfirmed.

## 5. Net read for the engine-choice ADR

- pi is a sound **in-process agent-loop engine** for MineMusic's Main/Radio actors:
  injectable prompt/tools/stream/key, real per-call `AbortSignal`, awaitable
  `before/afterToolCall` hooks, `prompt/continue/abort/waitForIdle` — all verified.
- The **low-level `Agent`** is the right embedding surface (as phase-A already chose); it
  carries **zero** coding-agent/harness opinion.
- pi gives MineMusic **no** persistence, **no** compaction, **no** multi-agent coordination —
  all three are MineMusic-built (consistent with the Consensus/ADR-0032 split). The audit
  *adds* that compaction/persistence are harness-only even within pi, so MineMusic builds them
  over `state.messages` + its own Postgres (which it already prefers per A3 Deep Dive).
- The PB8a endurance-test gate **passes**; the one ledger row that overstated pi
  ("compaction is native") is the only planning correction that changes a decision.
- Dominant risk is **version churn** (26 releases in ~7 weeks, existing Node-version split
  tag), not capability. Pin exactly; re-audit on bump.

---

### Audit provenance (first-hand sources read)

`node_modules/@earendil-works/pi-agent-core@0.80.2/dist/`: `index.d.ts`,
`agent.d.ts`/`.js`, `agent-loop.d.ts`/`.js`, `types.d.ts`, `proxy.d.ts`/`.js`, `node.d.ts`,
`harness/agent-harness.d.ts`/`.js`, `harness/types.d.ts`, `harness/system-prompt.*`,
`harness/skills.*`, `harness/prompt-templates.*`, `harness/messages.*`,
`harness/compaction/compaction.d.ts`/`.js`, `harness/compaction/branch-summarization.*`,
`harness/compaction/utils.*`, `harness/session/{session,jsonl-repo,jsonl-storage,memory-repo,
memory-storage,repo-utils}.*`, `harness/env/nodejs.*`.
`node_modules/@earendil-works/pi-ai/dist/`: `index.d.ts`, `stream.d.ts`,
`types.d.ts`, `env-api-keys.*`, `register-builtins.*`, `api-registry.*`,
`providers/openai-completions.*`, `providers/anthropic.*`.
Runtime: one fresh `node --input-type=module` audit script executed against the
installed 0.80.2 with three checks: a tool-call/signal/transcript-assignment
round trip (`signal-abort` observed at +140ms; transcript lengths 4→3→2), a
hook-pause run (gate release and tool execution both at +213ms), and an
abort-while-hook-paused run (`abort()` at +90ms; hook returned at +225ms; pi
emitted `Operation aborted` and did not execute the tool). All checks used a
local fake `streamFn`, no real LLM key.
