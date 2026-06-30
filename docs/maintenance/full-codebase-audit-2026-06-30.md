# Full-Codebase Deep Audit

> Review date: 2026-06-30
> Revision: 2026-06-30 initial pass, branch `codex/phase-b-pr3.6-direction-correction`
> Audited commit: `6ef2a19c` (HEAD at audit time; working tree was clean). The
> working tree has since received in-flight PR4 changes — see W-DRIFT.
> Implementation status: findings only; no code changes in this report
> Scope: production code under `src/**` plus `scripts/**` and `test/**`, across all
> eleven bounded contexts (~90k LOC TypeScript, 284 source files, 62 test files).
> Five pillars reviewed: architecture & boundaries, concurrency & transactions,
> security, performance, testing & maintainability.
> Non-scope: generated `contracts/generated/stage_interface_schemas.ts`,
> `.tmp-test/**`, `node_modules/**`, archived docs under `docs/archive/**`.

This is a `/code-auditor` deep pass over the whole active tree. The lens applied
is the project's own operating rules: `ARCHITECTURE.md` (ownership, import
direction, public-surface), `CLAUDE.md` (write boundaries, agent-facing output,
the Errors-And-Fallbacks rubric), and `docs/maintenance/documentation-architecture.md`.
Findings were produced by eight parallel area/dimension review agents, then every
headline concurrency claim was re-verified by reading the actual source (per the
project's "verify code facts with Read" rule), and two agent claims were
adversarially downgraded as a result (see Watchlist W-ADVERSARIAL).

This does not supersede `defensive-fallback-audit-2026-06-17.md` (narrower:
defensive fallback, redundant catch, redundant guard) or
`documentation-alignment-audit.md` (pre-formal document-disposition ledger).
Those remain authoritative for their scopes.

## Executive Summary

Overall posture is strong: the architecture boundary discipline holds (zero
active import-direction or write-boundary violations), SQL is fully parameterized,
`npm audit` reports zero vulnerabilities, the formal test suite exits green, and
the current PR3.6 direction-correction design is sound. The weaknesses are a
single concurrency root cause that surfaces at several read-modify-write
boundaries, a handful of silently-broken contracts (candidate-handle TTL,
schema atomicity, un-run tests), and a doc/authority mismatch in `CURRENT_STATE.md`.

Health: 7.5 / 10. Critical (runtime-down): 0. Findings: 4 P1, 14 P2, 18 P3.

| Priority | Finding | Main files |
| --- | --- | --- |
| P1 | Plain `BEGIN` = READ COMMITTED + implicit single-instance assumption; residual lost-update surface | `src/storage/postgres/database.ts:215`, `:158-167` |
| P1 | Schema contributions applied non-atomically; partial DDL failure leaves drift | `src/storage/postgres/database.ts:78-91`, `src/storage/postgres/schema.ts:13-17` |
| P1 | Candidate handle bindings minted without `expiresAt`; resolve never revalidates backing cache | `src/stage_interface/handle_minting.ts:104-110`, `:117-131`, `:271-273` |
| P1 | Three assertion test modules never registered in the runner | `test/run-stage-core-tests.ts:4-63` |
| P2 | Identity merge stale read loses materialized `sourceRefs` | `src/music_data_platform/identity_write_model.ts:505-599` |
| P2 | Import candidate concurrent dedup divergence | `src/music_data_platform/source_library_import.ts:273-282` |
| P2 | Queue append capacity TOCTOU under READ COMMITTED (soft-cap only) | `src/music_experience/records.ts:216-269` |
| P2 | `playNow` has no concurrency gating / no basis propagation | `src/music_experience/commands.ts:86-96`, `src/music_experience/records.ts:348-363` |
| P2 | `close()` hard-rejects on backlog instead of offering drain | `src/storage/postgres/database.ts:257-262` |
| P2 | Transaction queue wait not covered by the timeout budget | `src/storage/postgres/database.ts:158-167`, `:174` |
| P2 | Missing winner prior-canonical projection invalidation post-merge | `src/music_data_platform/identity_write_model.ts:161-181` |
| P2 | Handle & lookup-cursor registry rows never cleaned up (unbounded growth) | `src/stage_interface/handle_registry_schema.ts`, `src/stage_interface/lookup_cursor_registry_schema.ts` |
| P2 | `matchedPoolRefs` always hardcoded empty (interface gap) | `src/music_data_platform/metadata_lookup_search_workspace.ts:1047` |
| P2 | Owner-catalog listing pagination unverified | `src/music_data_platform/owner_catalog_projection.ts` |
| P2 | Postgres tests require a live DB at import time (CI red without it) | `test/support/postgres.ts` |
| P2 | pg-boss backend only exercised via a fake client | `test/formal/background-work-backend.test.ts` |
| P2 | Runner "passes" on clean import without verifying assertions ran | `test/run-stage-core-tests.ts:127-129` |
| P2 | Stale allowlist references a nonexistent test file | `test/formal/active-tree.test.ts:374` |

## Audit Method

```bash
# Static baseline
npm test            # typecheck + formal stage-core suite
npm audit --omit=dev

# Cross-cutting pattern scans (rg)
rg -n "eval\(|new Function\(|child_process|execSync\(|execFile\(|\.exec\(|spawnSync\(|\.spawn\(" src
rg -n "process\.env" src
rg -ni "INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM" src
rg -n "query\(\s*\`|\.query\(\s*\`" src                       # interpolated SQL (none found)
rg -n "create[A-Za-z]*Repositories\(|new PostgresMusicDatabase\(|createMusicDatabase\(" src
rg -n "catch\s*\(" src                                        # fallback surface, per dir
rg -n "return \[\];|return \{\};" src/music_data_platform src/agent_runtime src/server
```

Inventory summary: 510 tracked files (284 `.ts`, 216 `.md`); ~90k LOC TS;
62 test files (58 registered in the runner). Largest non-generated hotspots:
`metadata_lookup_search_workspace.ts` (1527), `stage_adapter/catalog.ts` (1415),
`owner_catalog_projection.ts` (1260), `identity_write_model.ts` (1143),
`music_experience/records.ts` (1127), `discovery_lookup.ts` (1012).

Review rule: claims are findings only when verified against source by Read. A
catch/fallback is judged by whether it belongs to its boundary owner, not by
whether "more fallback" exists. Concurrency conclusions are not asserted from a
single read; the transaction core (`database.ts`) was read in full to weigh the
PR3.5 serialization queue against each lost-update surface.

## Findings

### Concurrency & Transactions

#### P1-C1: Plain `BEGIN` = READ COMMITTED is the concurrency root cause

- Files: `src/storage/postgres/database.ts:215`, `:158-167`, `:63-76`, `:257-262`

Audited behavior:

```ts
await client.query("BEGIN");          // database.ts:215 — no isolation level set
const result = await this.transactionScope.run(true, async () => await operation(transactionContext));
await client.query("COMMIT");
```

Transactions begin with a plain `BEGIN`, so Postgres uses its default READ
COMMITTED isolation. `transaction()` is serialized per instance by the
`transactionQueue` chain (`:158-167`): each call captures the prior tail,
awaits it, and only then `BEGIN`s — so same-instance concurrent transactions
cannot overlap.

Why this matters: the queue is the only thing preventing lost updates, and it
is an in-memory, per-`PostgresMusicDatabase`-instance field. Correctness of
every read-modify-write boundary therefore depends on an unstated
single-writer-instance assumption.

Impact:
- Writes that go through the auto-commit `context()` (`:63-76`) instead of
  `transaction()` are NOT serialized — two such read-modify-write sequences can
  interleave at the DB.
- Multiple database instances or processes (e.g. a separate background-worker
  process, horizontal scaling) bypass the queue entirely.
- The protection is implicit and fragile: a future second instance silently
  reintroduces lost updates with no compile-time signal.

Recommendation: make correctness independent of the JS-side queue. At each
domain read-modify-write boundary use `SELECT ... FOR UPDATE`, a re-read-then-write
pattern, or a CAS update — or explicitly assert/guard the single-writer
assumption. See the specific call sites below (P2-C1..P2-C4).

Suggested guard: a concurrency test that runs the same write through two
`MusicDatabase` instances against one Postgres and asserts no lost update;
alternatively an initialized-once singleton guard.

#### P2-C1: Identity merge stale read loses materialized `sourceRefs`

- Files: `src/music_data_platform/identity_write_model.ts:505-599`
- Impact: `mergeMaterialRecord` reads `loser`/`winner` (`:519`,`:527`), computes
  `winnerSourceRefs` (`:548-552`), and overwrites `winner` with the stale array
  (`:579`). Under READ COMMITTED across instances, a concurrent merge or
  `bindSourceToMaterial` to the winner commits a `sourceRefs` change that
  `:579` silently discards. Same-instance is mitigated by P1-C1's queue.
- Recommendation: re-read the winner materialization immediately before the
  final upsert (reuse the `freshTargetRecord` pattern already used at `:396`),
  or take `FOR UPDATE`.
- Suggested guard: a two-instance merge/merge concurrency test asserting union
  of all bound sources survives.

#### P2-C2: Import candidate concurrent dedup divergence

- Files: `src/music_data_platform/source_library_import.ts:273-282`
- Impact: when `existingBinding === undefined`, the workflow mints a new
  `materialRef` and persists it in-transaction. Concurrent import retries each
  read `existingBinding === undefined`, mint distinct refs, and the
  `sourceMaterialBindings` PK catches SQLSTATE 23505 as `constraint_conflict`
  whose retry mints yet another new ref instead of converging — orphan
  material records can accumulate.
- Recommendation: re-read `findMaterialForSource` after the upsert, or use
  `ON CONFLICT ... DO UPDATE ... RETURNING` to converge on the surviving ref.
- Suggested guard: a two-instance import-retry test asserting exactly one
  material emerges for one source.

#### P2-C3: Queue append capacity check TOCTOU

- Files: `src/music_experience/records.ts:216-269`; isolation at
  `src/storage/postgres/database.ts:215`
- Impact: unlike `editQueue` (which holds `SELECT ... FOR UPDATE`), `append`
  never locks the state row; it mints positions, then asserts
  `countBeforeInsert + materialRefs.length > MAX` as the capacity gate. Two
  concurrent appends under READ COMMITTED each see only their own committed
  rows, so both gates can pass and the committed queue can exceed
  `MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH`. No corruption (positions distinct, PK
  safe) — only a soft-cap breach.
- Recommendation: re-`lockStateForUpdate` before counting in `append` (match
  `editQueue`), or fold the capacity assertion into the mint UPDATE as a CAS.
- Suggested guard: a two-instance append-at-cap concurrency test asserting the
  cap holds.

#### P2-C4: `playNow` has no concurrency gating

- Files: `src/music_experience/commands.ts:86-96`, `src/music_experience/records.ts:348-363`,
  `src/music_experience/stage_adapter/queue_playback.ts:642-646`
- Impact: `music.experience.playback.play` is the only queue/radio tool without
  an OCC CAS gate. `playNow` accepts no `basis`, `updatePlayback` increments
  `playback_revision` with no WHERE precondition, and the handler deliberately
  drops `ctx.preconditionBasis`. Two concurrent play/skip intents both succeed
  (last commit wins) and the system can never detect a stale now-playing
  precondition — unlike queue edits and direction changes, which return
  `voided_stale`.
- Recommendation: add an optional `basis` to `playNow` and route it through the
  existing `advanceRevision` CAS; pass `ctx.preconditionBasis` in the handler.
- Suggested guard: an OCC test that plays on a stale `playback_revision` and
  asserts `voided_stale`.

#### P2-C5: `close()` hard-rejects on backlog instead of offering drain

- Files: `src/storage/postgres/database.ts:257-262`
- Impact: `close()` throws `storage.transaction_already_active` whenever
  `transactionActive || pendingTransactions > 0`. Under any queue backlog a
  shutdown/restart `close()` fails rather than draining, leaving the caller no
  graceful path and risking orphaned connections or a stuck shutdown.
- Recommendation: add `close({ drain?: true })` that awaits `transactionQueue`
  emptiness before `pool.end()`, keeping the hard reject as the non-drain
  default.
- Suggested guard: a test that triggers `close({ drain: true })` mid-transaction
  and asserts it resolves after the in-flight transaction commits.

#### P2-C6: Transaction queue wait not covered by the timeout budget

- Files: `src/storage/postgres/database.ts:158-167`, `:174`
- Impact: the timeout timer starts at `:174`, after the `await priorTransaction`
  at `:165`. A queued transaction waits the full duration of all prior
  transactions with no timeout coverage, and `statement_timeout` /
  `connectionTimeoutMillis` do not apply while no client is held — unbounded
  latency under backlog.
- Recommendation: start the budget clock at queue entry (`:158`), or give each
  task a queue-wait deadline that rejects if the total budget is exceeded.
- Suggested guard: a test with two long transactions asserting the second
  rejects within its own budget, not after the first completes.

#### P2-C7: Missing winner prior-canonical projection invalidation post-merge

- Files: `src/music_data_platform/identity_write_model.ts:161-181`
- Impact: invalidation emits `material_record_written` for loser + winner and
  `source_material_binding_written` for moved bindings, but when
  `canonicalRefAfterMaterialMerge` changes the winner's canonical from its
  prior state, the winner's prior-canonical `canonical_record_written` target
  is never emitted — brief canonical-side projections (search_metadata /
  owner-catalog) can show the winner under the wrong canonical until rebuilt.
- Recommendation: also emit `canonical_record_written` for the winner's prior
  canonical when `winnerCanonicalRef !== winner.entity.canonicalRef`.
- Suggested guard: a merge test asserting both the old and new canonical
  targets are invalidated when the winner's canonical changes.

### Storage & Infrastructure

#### P1-S1: Schema contributions applied non-atomically

- Files: `src/storage/postgres/database.ts:78-91` (`initializationContext` on the
  raw pool), `src/storage/postgres/schema.ts:13-17`

Audited behavior:

```ts
// schema.ts:13-17 — each contribution applied as independent auto-commit statements
for (const schema of input.schemas ?? []) {
  await schema.apply(input.context);
}
```

The init path runs DDL through `initializationContext`, which targets the pool
directly with no `BEGIN`/`COMMIT`. Each SQL statement is its own implicit
transaction; a multi-statement contribution (`DROP VIEW` + `CREATE VIEW`,
`DROP INDEX` + `CREATE UNIQUE INDEX`, `ALTER TABLE` drop/add constraint) that
fails midway leaves partially-applied DDL.

Why this matters: a dropped-then-not-recreated view, a dropped unique index, or
a half-applied constraint is permanent, and `CREATE TABLE IF NOT EXISTS` on
re-run silently skips — so a failed `initialize()` does not self-heal on retry.

Recommendation: wrap each `PostgresMusicDatabaseSchemaContribution.apply` in a
single transaction (BEGIN/COMMIT around the contribution's statements).

Suggested guard: a schema-contribution test that injects a failing statement
mid-contribution and asserts the DDL rolled back fully (no orphaned drop).

#### P2-S1: Handle & lookup-cursor registry rows never cleaned up

- Files: `src/stage_interface/handle_registry_schema.ts`,
  `src/stage_interface/lookup_cursor_registry_schema.ts`
- Impact: TTL is enforced only on read; there is no `DELETE`/reaper task.
  Expired cursor rows and handle bindings accumulate indefinitely; the lookup
  cursor registry notes "a new cursor id per page", so pagination alone grows
  it without bound.
- Recommendation: add an owner-scoped periodic cleanup (`DELETE ... WHERE
  expires_at <= ?`) or bound rows per owner scope.
- Suggested guard: a test that mints many expired handles and asserts a cleanup
  pass removes them.

### Stage Interface & Agent-Facing

#### P1-E1: Candidate handle bindings never expire; resolve never revalidates the backing cache

- Files: `src/stage_interface/handle_minting.ts:104-110`, `:117-131`, `:271-273`

Audited behavior:

```ts
// :104-110 — createBinding is called with NO expiresAt for candidate handles
await records.bindings.createBinding({
  publicId,
  ownerScope: mintInput.ownerScope,
  handleKind: "candidate",
  internalAnchorJson,
  issuedAt: clock(),
});

// :271-273
function isExpired(expiresAt: string | undefined, now: string): boolean {
  return expiresAt !== undefined && expiresAt <= now;   // isExpired(undefined) === false
}

// :117-131 — resolve checks only the binding's own (never-set) expiry
async resolve(resolveInput) {
  const binding = await records.bindings.getByOwnerPublicId({ ... });
  if (binding === undefined || isExpired(binding.expiresAt, clock())) {
    return undefined;
  }
  return JSON.parse(binding.internalAnchorJson) as unknown;   // never re-checks candidateCache
}
```

The `candidateCache.getByRefKey` liveness check runs only in `mint` (`:78-82`),
never in `resolve`. A candidate binding carries no `expiresAt`, so `isExpired`
is always `false`, and `resolve` returns the anchor indefinitely — even after
the 30-minute retrieval result-set / material-candidate cache row is purged.

Why this matters: the Public Handle Veil's candidate-TTL contract is silently
broken. An agent (or an operator reusing a handle across sessions) that passes
a stale `[candidate:...]` handle resolves to a `materialCandidateRef` that no
longer exists instead of getting `undefined` ("expired, re-search").

Recommendation: either set the binding `expiresAt` to the retrieval/candidate
cache TTL, or revalidate against `candidateCache` in `resolve` and return
`undefined` when the backing entry is gone.

Suggested guard: a test that mints a candidate handle, expires/purges the
backing cache entry, and asserts `resolve` returns `undefined`.

#### P2-E1: Owner-catalog listing pagination unverified

- Files: `src/music_data_projection.ts` (`src/music_data_platform/owner_catalog_projection.ts`)
- Impact: the owner catalog is a large (1260-line) read model; this audit could
  not confirm every agent-facing catalog listing path carries a mandatory
  `LIMIT`/cursor. An unbounded listing materializes an arbitrary-size catalog
  into memory.
- Recommendation: confirm all `listCatalogItems`-style paths enforce
  `LIMIT`/cursor pagination; flag any unbounded implementation.
- Suggested guard: a test asserting a `LIMIT` is always present on catalog
  listing queries.

#### P2-E2: `matchedPoolRefs` always hardcoded empty (interface gap)

- Files: `src/music_data_platform/metadata_lookup_search_workspace.ts:1047`
- Impact: `searchRowFromSqlRow` returns `matchedPoolRefs: []` hardcoded, while
  the public type declares `matchedPoolRefs: readonly Ref[]`. The page SQL
  filters matched pools (`catalogBaseWhereClauses`) but never attributes them —
  consumers expecting pool attribution silently get nothing.
- Recommendation: aggregate matched pool ref keys via `owner_material_entries`
  JSON, or remove the field from the public type.
- Suggested guard: a lookup test asserting `matchedPoolRefs` is populated when
  pools match (or, if the field is dropped, a type test asserting it is gone).

#### P3-E1: Output-leak guard covers only 2 of 10 stage-adapter tools

- Files: guards in `test/formal/music-discovery-list-scopes.test.ts:253`,
  `test/formal/music-discovery-lookup.test.ts:762`,
  `test/formal/agent-runtime-pi-spine.test.ts:1110`
- Impact: internal-token leak assertions exist only for the two discovery tools.
  `library.catalog.*`, `library.relation.*`, `library.collection.*`,
  `library.import.*`, `music.experience.present`, `music.experience.queue_playback`
  have no automated leak guard. Manual spot-check is currently clean, but a
  future regression would not be caught.
- Recommendation: extend the token-leak guard pattern to the remaining
  stage-adapter handlers.

#### P3-E2: No automated write-boundary guard

- Files: none (the import-graph guard in `test/formal/active-tree.test.ts` covers
  import direction and partial output-leak, but not write capability)
- Impact: current state is clean (plugins write zero rows, stage-adapter routes
  through ports, orchestration goes through owning `commands.ts`), but nothing
  prevents a new `createFooRecords()` or raw `INSERT` from landing in a
  forbidden zone (`server/`, `stage_adapter/`, `extension/plugins/`,
  `agent_runtime` services).
- Recommendation: add a writer-capability guard mirroring the import-graph guard,
  scanning forbidden zones for repository factories and write primitives.

#### P3-E3: Ajv constructed with `strict: false`

- Files: `src/stage_interface/index.ts:163`
- Impact: `new Ajv({ allErrors: true, strict: false })` disables AJV strict mode
  (unknown keywords, type ambiguity). `coerceTypes` is correctly left unset and
  `additionalProperties: false` is enforced on every generated output schema, so
  the output-leak guarantee is sound; but malformed input/output schemas would
  not be flagged by AJV itself.
- Recommendation: consider `strict: "log"` or a schema-acceptance test, relying
  on the existing triple output guard plus `ts-json-schema-generator`.

### Security

The external-I/O surface is well-defended. No credentials are handled in
plugins (the ncmapi bridge holds login), `provider_http.ts` enforces a 10s
`AbortController` timeout and a 5MiB streaming byte cap, path traversal is
blocked by `normalizeLocalSourceRelativePath` + lexical-containment
`resolveUnderRoot`, provider JSON is parsed without prototype-polluting merges,
and md5 is used only as a non-security content fingerprint. Remaining items:

#### P3-S1: ReDoS in `version_extraction.ts`

- Files: `src/extension/plugins/version_extraction.ts:43`
- Impact: the bracket-matching alternation exhibits O(n²) catastrophic
  backtracking on unclosed brackets (measured ~8.7s at 100k chars). It runs over
  untrusted provider titles via `extractVersionInfo` from `ncm.ts:1012-1018` and
  `qq.ts:328,366`. The 5MiB response cap allows a large input; the trusted
  local-bridge architecture limits exposure.
- Recommendation: cap each title to ~1-2KiB before matching, or pre-scan for
  unclosed brackets.
- Suggested guard: a parse-time test with a 100k-`(` input asserting sub-second
  completion.

#### P3-S2: QQ audio URL concatenation without scheme validation

- Files: `src/extension/plugins/qq.ts:731`, `:747`
- Impact: the final audio URL is `${sip}${purl}` from two bridge-controlled
  strings with no scheme check. A malicious bridge could inject `javascript:`,
  `file:`, or a cross-origin `sip`. The result flows into `PlayableLink` /
  `DownloadSource`.
- Recommendation: parse `sip` and the built URL via `new URL()` and assert an
  `http:`/`https:` scheme before returning the link.
- Suggested guard: a unit test asserting non-http(s) `sip`/`purl` are rejected.

#### P3-S3: `qrcDecrypt` uses `inflateSync` without an output cap

- Files: `src/extension/plugins/qq_qrc_decrypt.ts:419`
- Impact: zlib inflate has no `maxOutputLength` bound. Practical amplification is
  limited (ciphertext ≤ 5MiB, 3DES output is comparable), but the boundary is
  unnamed.
- Recommendation: stream-inflate with a byte cap, or bound the plaintext length
  after decrypt.

#### P3-S4: `.env.example` references a dead env var

- Files: `.env.example:5` (`MINEMUSIC_NETEASE_BASE_URL`)
- Impact: documented but never read (zero usages); the provider `baseUrl` comes
  only from runtime-injected `config.plugins?.["minemusic.ncm"]`. An operator
  following the example cannot redirect the bridge. No secret is present.
- Recommendation: delete the line or wire it into `config.ts`.

### Performance

#### P3-P1: Per-item transaction N+1 in the import candidate loop

- Files: `src/music_data_platform/source_library_import.ts:219-298`
- Impact: each candidate opens its own `runSourceOfTruthWrite` transaction plus
  a per-item `requireBatch` re-read — roughly 300 serialized round-trips for a
  100-item page. Correct (per-item atomicity), but worth batching.
- Recommendation: batch where possible; cache the `requireBatch` re-read behind
  an optimistic gate.

#### P3-P2: Per-target upsert loop in projection invalidation

- Files: `src/music_data_platform/projection_maintenance_commands.ts:266-275`
- Impact: `markProjectionInvalidated` emits one `upsertDirtyTarget`
  (INSERT + SELECT) per unique target. Bounded by the materialized scope of one
  write; a micro-optimization.
- Recommendation: batch into a single multi-value upsert, or document why
  per-target is preferred.

#### P3-P3: Provider-resolve rerank is SELECT-then-UPDATE, not one statement

- Files: `src/music_data_platform/metadata_lookup_search_workspace.ts:844-898`
- Impact: `rerankSearchResultRows` (UPDATE) and `pruneUnmatchedSearchResultRows`
  (DELETE) recompute the same Postgres text rank over the same set.
- Recommendation: fold into a single updatable CTE with a shared rank CTE.

#### P3-P4: `agent_harness` rebuilds turn state twice per run

- Files: `src/agent_runtime/agent_harness.ts:229-261`
- Impact: `appendWorkspaceContextDiffToToolResult` re-reads the workspace
  projection (`createTurnState`, `:244`) and again in `prepareNextTurn` (`:86`),
  amplifying reads per tool result. Not a correctness bug (the projection
  returns the latest committed revision).
- Recommendation: share one re-assembled projection across the turn and the
  after-tool-call diff step.

### Testing & Maintainability

#### P1-T1: Three assertion test modules are not registered in the runner

- Files: `test/run-stage-core-tests.ts:4-63`

Audited behavior: the runner executes only the hardcoded `testModules` array
(`:4-63`). `command-basis-tracker.test.ts`, `download-command.test.ts`, and
`library-import-job.test.ts` exist under `test/formal/` and pass `tsc --noEmit`,
but none appear in `testModules`, so `npm test` never executes them. Their
asserted coverage is effectively zero in CI.

Why this matters: `npm test` reports green while three suites silently do not
run — a coverage gap invisible to the pass/fail signal.

Recommendation: add the three modules to `testModules`, or derive the list by
glob/auto-discovery so new test files cannot be silently skipped again.

Suggested guard: a meta-test asserting every `test/formal/*.test.ts` is either
in `testModules` or explicitly allow-listed.

#### P2-T1: Postgres tests require a live DB at import time

- Files: `test/support/postgres.ts` (defaults `127.0.0.1:55432/minemusic_test`)
- Impact: `postgres-*.test.ts` throw at import if no local Postgres /
  `MINEMUSIC_TEST_DATABASE_URL`, turning the whole suite red. Without that
  prerequisite `npm test` fails in CI.
- Recommendation: env-gate with an explicit non-zero skip signal, or document
  the CI prerequisite.

#### P2-T2: pg-boss backend only exercised via a fake client

- Files: `test/formal/background-work-backend.test.ts` (`FakePgBossClient`)
- Impact: no integration test against real pg-boss + Postgres; idempotency-key
  and `runAfter` semantics are not protected against real-queue persistence
  regressions.
- Recommendation: add at least one real-pg-boss integration test.

#### P2-T3: Runner "passes" on clean import without verifying assertions ran

- Files: `test/run-stage-core-tests.ts:127-129`
- Impact: `await import(testModule)` resolving without throwing records
  `ok: true`; a file that imports cleanly but asserts nothing silently passes.
  In practice every file uses top-level `node:assert/strict`, so impact is low,
  but the runner does not enforce it.
- Recommendation: instrument per-module assertion counts or require an explicit
  `assert.ok(testsRan > 0)` registration.

#### P2-T4: Stale allowlist references a nonexistent test file

- Files: `test/formal/active-tree.test.ts:374`
- Impact: the pi-harness allowlist permits `test/formal/radio-endurance.test.ts`,
  which does not exist — a stale guard exemption.
- Recommendation: remove the entry or restore the file.

#### P3-T1: No coverage report

- Impact: no c8/nyc coverage is collected; coverage assessment is only possible
  by grepping file lists.
- Recommendation: add a coverage pass to the test script.

### Defensive-Fallback Rubric

The project's Errors-And-Fallbacks rule was applied per area. Most catches in
`music_data_platform` (28), `server` (12), and `storage` (3) correctly name a
boundary owner (provider, storage, Tool Call Router) and map declared failures
without fabricating empty success. No system-failure-to-empty-success masking
was found. Remaining rubric items:

#### P3-R1: `convertToLlm` silently drops unknown message roles

- Files: `src/agent_runtime/pi_engine.ts:60-78`
- Impact: the `default: return []` branch discards any role other than
  `user`/`assistant`/`toolResult`. Currently safe, but per the rubric a new role
  from pi should fail loudly, not silently vanish from provider context.
- Recommendation: exhaustiveness-check over a strict role union or `assertNever`.

#### P3-R2: In-memory notify channel grows unbounded

- Files: `src/agent_runtime/main_radio_channel.ts:12-20`
- Impact: `createInMemoryMainRadioNotifyChannel` pushes every
  `RadioNotifyRequest` to an unbounded array. For a long-lived radio session
  (the PR3 default) this is an unbounded memory leak; the comment marks it a
  placeholder.
- Recommendation: bound the buffer (ring/drop) or document it as non-production.

#### P3-R3: `stage_tool_bridge` dispatches without checking `signal.aborted`

- Files: `src/agent_runtime/stage_tool_bridge.ts:99-128`
- Impact: `execute` threads `signal` into `ctx.abortSignal` but never checks
  `signal.aborted` itself; Stage dispatch may ignore the signal and complete
  after abort. Pi discards the result, so harmless, but it wastes a round-trip
  that may have performed a write.
- Recommendation: assert `signal.aborted` and fast-fail before dispatch.

#### P3-R4: `prioritizePendingDirectionChange` returns `already_refilling` after submitting a direction refill

- Files: `src/agent_runtime/radio_supervisor.ts:482-502`
- Impact: in the low-watermark path, after the chained direction wake submits a
  refill and sets `refilling = true`, the function returns
  `{ kind: "already_refilling" }`. The system did the right thing (a refill is
  running); only the return value understates it. Cosmetic.
- Recommendation: consider a return that reflects "direction refill submitted".

#### P3-R5: `removeSourceFromPreviousMaterial` swallows a disappearing prior material

- Files: `src/music_data_platform/identity_write_model.ts:607-611`
- Impact: if the prior materialization vanishes between the `:382` check and the
  `:607` re-fetch, the function returns `undefined` and the caller skips prior
  invalidation.
- Recommendation: throw on the missing prior, or still emit the invalidation.

#### P3-R6: Validated input `limit` silently ignored

- Files: `src/music_data_platform/source_library_import.ts:62-63`, `:144`
- Impact: `startInput.limit` is validated (`:407`) but `advanceImportPage`
  hardcodes `const callLimit = defaultLimit` (`:144`).
- Recommendation: persist and use the validated limit, or drop the field.

## Allowed Sites

These were reviewed and cleared (not findings).

### Allowed Boundary Catches

| Site | Classification |
| --- | --- |
| `src/extension/plugins/ncm.ts:437`, `qq.ts:544`, `provider_http.ts:201` | Provider-boundary catch mapping retryable `*_provider_unavailable` / `*_malformed_response`; owner named, no empty-success masking |
| `src/music_intelligence/stage_adapter/discovery_lookup.ts:346-354` | Re-throws unknown/invariant errors; `translateKnownRetrievalError` only maps known codes |
| `src/stage_interface/index.ts:250` | Tool-Call-Router-owned dispatch catch (explicit boundary per CLAUDE.md) |
| `src/storage/postgres/database.ts:222-242` | Storage-boundary transaction rollback/release in `finally`; no client leak |

### Allowed Concurrency Patterns

| Site | Classification |
| --- | --- |
| `src/storage/postgres/database.ts:151` | Nested-transaction rejection via `AsyncLocalStorage` is correct (nesting is a programmer error, not a race) |
| `src/music_data_platform/projection_maintenance_commands.ts:299,343` | In-DB CAS (`dirty_generation`) protects projection-maintenance TOCTOU |
| `src/music_experience/records.ts` (`editQueue`) | `SELECT ... FOR UPDATE` + `advanceRevision` CAS + `StaleCommandPreconditionError` → `voided_stale` correctly serializes edits |
| `src/agent_runtime/radio_supervisor.ts:163,167-175,459` | Monotonic `lastScheduledDirectionRevision` / `pendingDirectionRevision ===` guards + `refilling` gate correctly suppress duplicate direction runs |
| `src/music_data_platform/local_source_scan_advance_commands.ts` | `tryClaim` compare-and-set + atomic counter increment; per-file atomic admission (D27) |

### Allowed Output Shapes

| Site | Classification |
| --- | --- |
| `src/contracts/stage_interface.ts` (`MusicDiscoveryLookupOutput`) | Compact `{items:[{handle,description}], nextCursor?}`; opaque `lc_…` cursor id |
| `src/music_data_platform/stage_adapter/catalog.ts` | Handle minted before return via `MaterialProjection`; veil-wrapped anchor; no raw payload leak |
| `src/contracts/generated/stage_interface_schemas.ts` | `additionalProperties: false` enforced on every object; triple runtime output guard |

## Watchlist, Not Current Findings

### W-DRIFT: Working-tree drift since audit (PR4 Cross-Actor Cascade Core)

- Files: `src/agent_runtime/radio_supervisor.ts`, `src/music_experience/commands.ts`,
  `src/music_experience/stage_adapter/queue_playback.ts`,
  `src/contracts/music_experience.ts`, `src/server/host.ts`,
  `test/formal/music-experience-queue-playback.test.ts`,
  `test/formal/radio-supervisor.test.ts`
- Notes: this audit was performed against commit `6ef2a19c` (clean tree); all
  line numbers above resolve against that commit. The working tree subsequently
  received in-flight **PR4 Cross-Actor Cascade Core** changes: queue/playback/
  radio-direction commands now emit post-commit `ConcernRevisionChange`, and the
  Radio supervisor gained a per-active-refill abort controller with PB9
  priority/basis filtering (`abortStaleActiveRun`, `canAbort`, `actorPriority`,
  `radioRunBasis`). Findings whose line numbers or reasoning touch these files
  — P2-C4 (playNow), P3-R4, W-ADVERSARIAL, W-TERMINAL, and the Allowed
  Concurrency `radio_supervisor` row — should be re-checked against the PR4
  in-flight code before acting. The four P1 findings (READ COMMITTED root
  cause, schema atomicity, candidate-handle TTL, un-run tests) are independent
  of the PR4 diff and stand as written.

### W-ADVERSARIAL: Agent claims adversarially downgraded after re-reading source

- Files: `src/agent_runtime/radio_supervisor.ts`
- Notes: an agent flagged "High: `prioritizePendingDirectionChange` blindly
  re-enqueues during refilling" and "Medium: idempotency-key inclusion of
  `refillGeneration` breaks duplicate suppression". Re-reading the source showed
  both overstated: the `!refilling` condition (`:488`) prevents re-enqueue while
  refilling (absent error), and the monotonic guards (`:163`, `:167-175`) plus
  the `refilling` gate in `enqueuePendingDirectionWake` (`:459`) correctly
  suppress duplicate direction runs; distinct `refillGeneration` values are
  correctly distinct intended jobs. Downgraded to P3-R4 (cosmetic). Recorded so
  the reasoning is auditable.

### W-TERMINAL: Terminal-observation ordering depends on pg-boss semantics

- Files: `src/agent_runtime/radio_supervisor.ts:387-398`, `:152`
- Notes: `handleTerminalState` reads `observedRunResultsByJobId`, which the
  handler sets (`:152`) before the job becomes terminal. If pg-boss resolves
  `awaitTerminal` only after the handler promise resolves, ordering is safe.
  Worth one explicit test pinning that guarantee, but not treated as a finding.

### W-DOCSTALE: `CURRENT_STATE.md` Phase-4 storage section is stale to Postgres

- Files: `CURRENT_STATE.md:293-294`, `:303-304`
- Notes: line 294 claims `BEGIN IMMEDIATE`; live code uses a plain `BEGIN` (READ
  COMMITTED). Lines 303-304 describe `foreign_keys = ON`, `journal_mode = WAL`,
  `synchronous = NORMAL` — SQLite PRAGMAs that do not exist in the Postgres
  adapter. The `BEGIN IMMEDIATE` misstatement is corrected by this audit (see
  the `Known Active Gaps (Audit 2026-06-30)` section added to `CURRENT_STATE.md`);
  the broader SQLite-PRAGMA staleness is flagged here for a separate doc fix and
  is out of scope for this report.

### W-FEATUREGAP: Architecture-listed Music Experience capabilities not yet built

- Files: `src/music_experience/` (absent logic)
- Notes: ARCHITECTURE.md lists recommendation dedupe, presented-recommendation
  history, play/open/skip events, feedback binding, and listening outcomes as
  Music Experience concerns; none exist in code yet. Not a defect — flagged so
  that when built, the queue/direction OCC + FOR UPDATE discipline applies.

## Recommended Fix Order

1. Register the three un-run test modules (P1-T1) and prune the stale allowlist
   (P2-T4) — highest ROI, restores the green-signal contract.
2. Fix the candidate-handle TTL (P1-E1) — foundational primitive, silent
   contract break.
3. Wrap each schema contribution in a transaction (P1-S1) — prevents drift.
4. Land the concurrency root cause at 3-4 domain boundaries (P2-C1..P2-C4):
   `FOR UPDATE` / re-read / CAS at identity merge, import dedup, queue append,
   `playNow`, so correctness no longer depends on the implicit single-instance
   queue (P1-C1).
5. Add `close({ drain })` and cover queue-wait with the timeout budget
   (P2-C5, P2-C6).
6. Add handle/cursor registry cleanup (P2-S1).
7. Backfill guard coverage: write-boundary guard (P3-E2), output-leak guard for
   the remaining 8 tools (P3-E1), ReDoS/URL-scheme hardening (P3-S1, P3-S2).
8. Testing infrastructure: coverage report (P3-T1), real pg-boss integration
   test (P2-T2), runner assertion-count check (P2-T3), CI Postgres prerequisite
   (P2-T1).

## Verification For This Report

Static baseline (run during the audit):

```bash
npm test          # typecheck + formal stage-core suite — EXIT 0
npm audit --omit=dev   # 0 vulnerabilities
```

Claims verified by Read (not grep) for every P1 and every concurrency finding:
`src/storage/postgres/database.ts` (full), `src/stage_interface/handle_minting.ts`
(full), `src/agent_runtime/radio_supervisor.ts` (full),
`test/run-stage-core-tests.ts` (full), `src/storage/postgres/schema.ts`
initialization path.

Pre-existing coverage gaps opened by this report (no new tests added — this is
a findings-only report): the suggested guards above are the follow-up coverage.
No code was changed by this audit; only this report and the corresponding
`CURRENT_STATE.md` / `PROGRESS.md` entries were added. (The working tree carries
unrelated in-flight PR4 changes — see W-DRIFT.)
