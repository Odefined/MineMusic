# Wave 7 Live Source Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only NetEase source provider adapter and opt-in live smoke validation without changing fixture-first runtime behavior.

**Architecture:** The provider implements the existing `SourceProvider` contract and stays behind the Plugin Registry source slot. Normal tests use fixture payloads and injected request functions; live validation is a separate command gated by explicit environment variables. NetEase links are provider web song URLs, not playback execution.

**Tech Stack:** TypeScript ES modules, existing `Result<T>` contracts, Node global `fetch` for the default live requester, compiled runtime tests through `tsconfig.test.json`.

---

## File Structure

- Create `src/providers/netease/index.ts` for the NetEase provider adapter.
- Create `test/providers/netease-source-provider.test.ts` for deterministic adapter and Source Resolution integration tests.
- Create `test/live/netease-source-smoke.ts` for opt-in live validation.
- Modify `test/run-runtime-tests.ts` to include the provider test.
- Modify `package.json` to add the opt-in smoke command.
- Modify `docs/mvp/verification-report.md`, `CURRENT_STATE.md`, `PROGRESS.md`, and `INDEX.md` after implementation.

## Task 1: NetEase Provider Contract And Unit Test

**Files:**
- Create: `test/providers/netease-source-provider.test.ts`
- Create: `src/providers/netease/index.ts`
- Modify: `test/run-runtime-tests.ts`

- [ ] **Step 1: Write the failing provider mapping test**

Add a test that imports `createNetEaseSourceProvider`, injects a fake requester, calls `search({ query: { text: "coding", limit: 1 } })`, and expects:

```typescript
assert(materials[0]?.sourceRefs?.[0]?.namespace === "source:netease", "should keep provider source ref");
assert(materials[0]?.playableLinks?.[0]?.url === "https://music.163.com/#/song?id=123", "should expose NetEase web song link");
assert(materials[0]?.playableLinks?.[0]?.requiresAccount === true, "paid/VIP material should mark account requirement");
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm run build:test
```

Expected: TypeScript fails because `src/providers/netease/index.ts` does not exist.

- [ ] **Step 3: Implement minimal provider mapping**

Create `createNetEaseSourceProvider(...)` with:

```typescript
export const defaultNetEaseBaseUrl = "http://127.0.0.1:1300";
export function createNetEaseSourceProvider(options: NetEaseSourceProviderOptions = {}): SourceProvider;
```

The provider maps `result.songs[]` from `/search` into `MusicMaterial`, source refs, evidence, and NetEase web playable links.

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
npm test
```

Expected: all runtime tests pass.

## Task 2: Source Resolution Integration And Refresh Behavior

**Files:**
- Modify: `test/providers/netease-source-provider.test.ts`
- Modify: `src/providers/netease/index.ts`

- [ ] **Step 1: Write failing integration tests**

Add tests that:

- register the NetEase provider through `PluginRegistryPort`.
- seed a canonical record with external key `{ namespace: "source:netease", kind: "track", id: "123" }`.
- call `SourceResolutionPort.ground(...)`.
- assert the result becomes `confirmed_playable`.
- call `getPlayableLinks(...)` on material with only a NetEase source ref and assert the web song URL is reconstructed.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm test
```

Expected: tests fail until refresh behavior and exact canonical source-ref shape are implemented.

- [ ] **Step 3: Implement refresh behavior**

Use existing material links when present. Otherwise reconstruct links from `source:netease` track refs. Return an empty list for blocked material or material without a NetEase track ref.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
npm test
```

Expected: all runtime tests pass.

## Task 3: Opt-In Live Smoke Command

**Files:**
- Create: `test/live/netease-source-smoke.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the smoke script**

The script must:

- skip unless `MINEMUSIC_LIVE_NETEASE=1`.
- default to `http://127.0.0.1:1300`.
- allow override with `MINEMUSIC_NETEASE_BASE_URL`.
- use the provider adapter rather than duplicating HTTP logic.
- exit nonzero when explicitly enabled and the provider cannot return any material.

- [ ] **Step 2: Add the package script**

Add:

```json
"smoke:netease": "npm run build:test && node .tmp-test/test/live/netease-source-smoke.js"
```

- [ ] **Step 3: Verify skipped smoke**

Run:

```bash
npm run smoke:netease
```

Expected: command exits 0 and prints a skip message.

## Task 4: Documentation And State Sync

**Files:**
- Modify: `docs/mvp/verification-report.md`
- Modify: `CURRENT_STATE.md`
- Modify: `PROGRESS.md`
- Modify: `INDEX.md`

- [ ] **Step 1: Update docs**

Record that Wave 7 has deterministic provider tests and an opt-in live smoke command. Do not claim live NetEase success unless the live command is explicitly run with the service available.

- [ ] **Step 2: Run verification**

Run:

```bash
npm test
npm run typecheck
npm run smoke:netease
git diff --check
git diff --name-only
```

Expected: deterministic tests and skipped smoke pass; `git diff --name-only` lists only intended files.

- [ ] **Step 3: Commit**

Commit the Wave 7 implementation after verification:

```bash
git add package.json src/providers/netease/index.ts test/providers/netease-source-provider.test.ts test/live/netease-source-smoke.ts test/run-runtime-tests.ts docs/mvp/verification-report.md CURRENT_STATE.md PROGRESS.md INDEX.md
git commit -m "Add NetEase live source provider adapter"
```

## Self-Review

- Spec coverage: covers provider adapter, plugin-slot integration, opt-in live smoke, and docs/state sync.
- Placeholder scan: no deferred unspecified behavior remains.
- Type consistency: names match existing `SourceProvider`, `PluginRegistryPort`, `SourceResolutionPort`, and `MusicMaterial` contracts.
- Scope check: no playback execution, host-surface work, durable storage, or provider writeback.
