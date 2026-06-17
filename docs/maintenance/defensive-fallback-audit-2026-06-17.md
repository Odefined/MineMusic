# Defensive Fallback, Redundant Catch, and Redundant Guard Audit

Review date: 2026-06-17
Revision: 2026-06-17 post-review calibration against current `main`.
Implementation status: addressed on branch `codex/fix-defensive-fallbacks`.
Scope: production code under `src/**` plus
`scripts/generate-stage-interface-schemas.mjs`.
Tests and area docs were reviewed only for named coverage/contract checks.
Non-scope: generated `.tmp-test/**` and archived docs.

This report applies the `AGENTS.md` Errors And Fallbacks rule:
defend at explicit boundaries, trust contracts inside the boundary, do not turn
system failures into empty/default domain results, and do not duplicate
validation already guaranteed by TypeScript types, generated JSON Schema,
database constraints, or upstream routers.
For internal typed inputs and operations after the owning boundary contract has
already been satisfied, a broken assumption should fail loudly as an invariant
failure, not be recovered into fallback values or public expected-failure
results.

## Executive Summary

The current codebase is mostly aligned with the boundary-owner rule. The broad
runtime catches in Stage Interface, Stage Core, Extension, SQLite storage,
cursor decoding, and projection maintenance are generally boundary translation
or cleanup code, not arbitrary defensive programming.

The audit found six actionable issues. Post-review calibration keeps most
findings intact, strengthens the lookup finding with runtime reachability
evidence, and narrows two findings where current docs/tests already define part
of the behavior.

| Priority | Finding | Main files |
| --- | --- | --- |
| P1 | `music.discovery.lookup` maps unknown Retrieval throws to public invalid-input/provider-scope failures, and its known Retrieval error-code mapping needs explicit classification. | `src/music_intelligence/stage_adapter/discovery_lookup.ts` |
| P1 | Source Library Import records any per-candidate transaction/system failure as an item failure. | `src/music_data_platform/source_library_import.ts` |
| P2 | Music Discovery handlers re-run generated Tool Call Router schema validation inside handlers. | `src/music_intelligence/stage_adapter/discovery_lookup.ts`, `src/music_intelligence/stage_adapter/discovery_list_scopes.ts` |
| P2 | Source Library Import and Extension split ownership of provider-read structural validation; the boundary decision must be made explicit. | `src/music_data_platform/source_library_import.ts`, `src/extension/platform_library_provider_slot.ts` |
| P2 | NCM source search silently drops non-object rows and rows missing required display facts; stable-id drops are documented product semantics and are not this finding. | `src/extension/plugins/ncm.ts`, `docs/extension/plugins/ncm.md`, `test/formal/ncm-plugin.test.ts` |
| P3 | Plugin manifest validation defensively validates and catches core-owned validation input, masking programmer/composition errors as invalid plugin manifests. | `src/extension/plugin_manifest.ts` |

The original audit was static analysis. The follow-up implementation branch
addresses the findings by moving internal failures back to throws, narrowing
handler validation to semantic checks, and updating the affected formal tests
and area docs.

## Audit Method

Commands used:

```bash
rg -n "\bcatch\b|\.catch\(" src scripts --glob '!**/*.d.ts'
rg -n "return \[\]|return \{\}|= \[\]|\?\? \[\]|\|\| \[\]|catch \{\s*return|ok\(\[\]\)|value: \[\]|default[A-Z]|fallback" src scripts --glob '!**/*.d.ts'
rg -n -U "catch \{\n\s*return" src scripts --glob '!**/*.d.ts'
rg -n "filter\(isRecord\)|filter\(isDefined\)|return undefined;" src --glob '!**/*.d.ts'
rg -n "isRecord\(input\)|typeof input|must be an object|accepts only|requires|must be" src --glob '!**/*.d.ts'
rg -n "additionalProperties|required|enum|type|minimum|maximum" src/contracts/generated/stage_interface_schemas.ts
rg -n "CHECK|NOT NULL|UNIQUE|FOREIGN KEY" src/music_data_platform/*schema.ts src/stage_interface/*schema.ts
rg -n "default:" src --glob '!**/*.d.ts'
rg -n "Retrieval query service is not initialized|createMusicDiscoveryRuntimeModule|tool_handler_failed" src test
rg -n "knownCapabilityIds|droppedProvider|source_library_item_write_failed|retrieval_result_invalid" src test docs
```

Inventory summary:

- 94 production files under `src/**`.
- 1 script under `scripts/**`.
- 43 explicit `catch` or `.catch(...)` occurrences across production/script
  code.
- 9 direct `return []` sites in production code.
- 3 direct `ok([])` / explicit empty-result sites in production code.
- Generated Stage Interface schemas already enforce object shape,
  `additionalProperties: false`, required fields, enum membership, and numeric
  limits for current Music Discovery tool inputs.
- Default Server Host composition registers the Music Discovery runtime module
  when the Music Data Platform module is created, so `music.discovery.lookup`
  is runtime-reachable in the default host graph.
- Existing formal tests covered several old behaviors at audit time:
  provider-id row drops in NCM search, item failure on bad generated material
  refs, and defensive plugin-manifest wrapper validation.

The audit read every explicit catch site and representative fallback/default
sites, then followed suspicious duplicate validation paths through generated
schemas and provider-read ports. Line references below are current as of this
report.

Internal-contract review rule:

- External inputs are validated at their owning boundary and translated into
  declared public errors only there.
- Internal typed inputs and operations should run under the already-established
  contract. If that contract is broken, the code should throw/assert and let the
  nearest outer boundary that owns exception normalization report the failure.
- A public `Result` failure, empty array, default object, or partial result is
  wrong when it represents internal misuse, impossible state, DB/runtime
  failure, or a violated post-boundary contract.

Post-review calibration:

- `music.discovery.lookup` is not dormant source. `createServerHost(...)`
  creates `createMusicDiscoveryRuntimeModule(...)` in the default host path and
  passes a `retrievalQuery` wrapper into it. The wrapper throws a plain
  `Error("Retrieval query service is not initialized.")` if the underlying MDP
  retrieval service is absent.
- The Tool Call Router already owns input-schema rejection and handler-throw
  normalization. Handler-internal recovery for schema-invalid payloads or plain
  Retrieval throws is therefore the wrong boundary.
- Provider-read structural validation is duplicated in code, but the severity
  depends on `PlatformLibraryReadPort` ownership. If only Extension supplies a
  post-validation port, MDP should treat structural violations as invariants. If
  MDP intentionally accepts untrusted implementations, MDP must own the
  structural boundary and Extension should not be described as the sole owner.
- NCM search already documents and tests dropping raw rows without usable stable
  provider ids. This report no longer treats that specific behavior as a
  finding; the remaining concern is unreported dropping of non-object rows or
  rows missing other required display/source facts.

## Findings

### P1: Lookup Stage Adapter Hides Unknown Retrieval Failures

Files:

- `src/music_intelligence/stage_adapter/discovery_lookup.ts:353`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:360`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:1043`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:1064`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:1068`
- `src/server/host.ts:45`
- `src/server/host.ts:59`
- `src/server/host.ts:63`
- `src/music_intelligence/stage_adapter/index.ts:41`
- `src/music_intelligence/stage_adapter/index.ts:62`
- `src/stage_interface/index.ts:123`
- `src/stage_interface/index.ts:163`

Audited pre-fix behavior:

```ts
try {
  result = await input.retrievalQuery.query(...);
} catch (error) {
  return mapRetrievalError(error, input.providerScopeLabels);
}
```

`mapRetrievalError(...)` handles known `MusicIntelligenceError` codes, which is
valid only after each code has been classified into the lookup tool's public
error vocabulary. The immediate problem is the fallback path:

- unknown throw + provider scopes becomes `providerScopeFailed([])`;
- unknown throw without provider scopes becomes `invalidInput(...)`.

This path is runtime-reachable. Default `createServerHost(...)` creates the
Music Data Platform runtime module, then creates `createMusicDiscoveryRuntimeModule(...)`
with a `retrievalQuery` wrapper, and mounts the discovery module in the default
runtime module list. If the underlying MDP retrieval service is absent, the
wrapper throws a plain `Error("Retrieval query service is not initialized.")`.
That error should cross to the Tool Call Router handler boundary and become
`stage_interface.tool_handler_failed`, not a lookup-domain `invalid_input` or
provider-scope failure.

Why this violates the rule:

- `RetrievalQueryService.query(...)` is a plain
  `Promise<RetrievalQueryResult>` contract, not `Result<T>`.
- Known Retrieval errors are expected area-owned failures and may be translated
  to public tool errors.
- Unknown throws are programmer errors, storage failures escaping a read model,
  or unadapted boundary failures. They should not become user input errors or
  provider-scope failures.
- The Tool Call Router already owns handler throw normalization as
  `stage_interface.tool_handler_failed`.

Known Retrieval error-code classification still needs to be made explicit:

| Retrieval error code | Current mapping | Boundary classification needed |
| --- | --- | --- |
| `music_intelligence.retrieval_cursor_invalid` | `invalid_cursor` | Public cursor failure; likely correct. |
| `music_intelligence.retrieval_result_set_expired`, `music_intelligence.material_candidate_expired` | `result_window_expired` | Public cursor/result-window failure; likely correct. |
| `music_intelligence.provider_search_failed`, `music_intelligence.provider_search_pool_invalid`, `music_intelligence.provider_search_result_invalid`, `music_intelligence.provider_search_unavailable` | `provider_scope_failed` | Expected provider-scope failure only if the code came from the provider-search boundary; keep provider result-contract failures out of user-input vocabulary. |
| `music_intelligence.retrieval_query_invalid` | `invalid_input` | Conditional. If caused by public lookup input or cursor contents, public invalid input may be right; if caused by handler-constructed impossible query shape, it is an invariant and should throw through the router. |
| `music_intelligence.retrieval_result_invalid` | `invalid_input` | Likely wrong as public invalid input. Current Retrieval code uses this for missing rank/matched-text evidence in returned rows, which is read-model/result invariant failure, not user input. |
| `music_intelligence.cursor_invalid`, `music_intelligence.cursor_mismatch` | `invalid_input` | Needs classification. Public lookup cursor problems should be `invalid_cursor`; internal cursor/query mismatch should fail loudly unless caused by an opaque public cursor. |

Impact:

- A database/system failure can be reported as a bad user query.
- A Retrieval bug during provider-scoped lookup can be reported as a provider
  scope problem.
- The caller gets the wrong retry guidance and the code loses the distinction
  between expected domain failure and broken invariant/system failure.

Recommendation:

Only translate known `MusicIntelligenceError` codes in the stage adapter.
Rethrow unknown errors and let the Tool Call Router produce the router-owned
handler failure. Also replace the broad known-code switch with a classification
table that states whether each Retrieval code is public cursor/input,
provider-scope, or internal invariant. If a new public error is needed, add it
explicitly to the tool declaration and guard it with a test.

Suggested guard:

- A focused `music.discovery.lookup` test where `retrievalQuery.query(...)`
  throws a plain `Error`; assert dispatch returns
  `stage_interface.tool_handler_failed`, not `music.discovery.lookup` invalid
  input or provider-scope failure.
- A neighboring test where `retrievalQuery.query(...)` throws a known
  `MusicIntelligenceError` and remains translated to the declared public error.
- Focused tests for `retrieval_result_invalid`, `cursor_mismatch`, and a
  handler-constructed impossible query path so they do not regress into public
  `invalid_input`.

### P1: Source Library Import Converts Any Candidate Write Failure Into Item Failure

Files:

- `src/music_data_platform/source_library_import.ts:296`
- `src/music_data_platform/source_library_import.ts:300`
- `src/music_data_platform/source_library_import.ts:350`
- `src/music_data_platform/source_library_import.ts:355`
- `src/music_data_platform/source_library_import.ts:360`
- `src/music_data_platform/source_library_import.ts:743`
- `src/music_data_platform/source_library_import.ts:746`
- `test/formal/music-data-platform-source-library.test.ts:1432`
- `test/formal/music-data-platform-source-library.test.ts:1461`

Audited pre-fix behavior:

`processCandidate(...)` wraps the whole per-candidate write transaction in a
broad catch:

```ts
try {
  return input.database.transaction((db) => {
    ...
    identityCommands.upsertSourceRecord(...);
    identityCommands.upsertMaterialRecord(...);
    identityCommands.bindSourceToMaterial(...);
    sourceLibraryCommands.recordImportItem(...);
    ...
  });
} catch (error) {
  return recordFailedCandidate(batch.batchId, candidate, error);
}
```

`recordFailedCandidate(...)` then writes an item failure outcome. If
`refKey(candidate.sourceEntity.sourceRef)` fails while building the failure
record, `optionalSourceRefKey(...)` catches that and returns `undefined`.

Existing formal coverage locked this behavior in for one system-like
write failure: the test named around `failedItemImport` makes the material ref
factory return `"bad:material"`, then asserts the batch completes with one
imported item and one failed item. That test is useful evidence of current
behavior, but its expected outcome needed to change once the failure was classified as
an internal material-ref factory/command invariant rather than an item-scoped
provider candidate failure.

Why this violates the rule:

- The catch owner is not narrow enough. It catches candidate validation,
  command invariant failures, SQLite/storage failures, transaction failures,
  and programmer errors together.
- A system or persistence failure can be written as a candidate-level import
  outcome and the import loop can continue toward completion.
- `optionalSourceRefKey(...)` hides malformed source refs by omitting the
  source ref key from the failure record. That may be acceptable only for an
  explicitly item-scoped malformed candidate path, not for arbitrary failures.

Impact:

- Import status can say "some item failed" when the correct state is "the import
  batch/system failed."
- A persistent DB/schema issue could be repeatedly recorded as individual item
  failures.
- The compact item error may expose internal exception messages as durable item
  outcome text through `compactItemError(...)`.

Recommendation:

Split the failure channels:

1. Validate provider candidate facts before the write transaction, and record
   item failures only for explicitly expected, item-scoped provider/candidate
   problems.
2. Let database, transaction, command-invariant, and programmer errors escape
   the candidate loop. Mark the batch failed at the workflow boundary if needed.
3. If per-candidate recovery remains, introduce a named item-scoped error type
   or discriminated result that proves the error is safe to store as
   `recordImportItemFailure(...)`.

Suggested guard:

- A test where `input.database.transaction(...)` throws a plain storage/system
  error during `processCandidate(...)`; assert the batch does not record a
  candidate item failure as if the provider item were bad.
- A separate test for a deliberately malformed provider candidate, if the
  intended product behavior is to record only that item as failed.
- Update the existing bad generated-material-ref expectation so internal
  material-ref factory failures do not remain documented as ordinary item
  failures.

### P2: Music Discovery Handlers Re-Run Generated Schema Validation

Files:

- `src/stage_interface/index.ts:123`
- `src/contracts/generated/stage_interface_schemas.ts:303`
- `src/contracts/generated/stage_interface_schemas.ts:308`
- `src/contracts/generated/stage_interface_schemas.ts:340`
- `src/contracts/generated/stage_interface_schemas.ts:357`
- `src/contracts/generated/stage_interface_schemas.ts:587`
- `src/contracts/generated/stage_interface_schemas.ts:594`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:236`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:746`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:749`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:753`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:773`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:779`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:783`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:787`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:821`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:689`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:690`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:705`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:717`
- `src/music_intelligence/stage_adapter/discovery_lookup.ts:728`
- `src/music_intelligence/stage_adapter/discovery_list_scopes.ts:193`
- `src/music_intelligence/stage_adapter/discovery_list_scopes.ts:194`
- `src/music_intelligence/stage_adapter/discovery_list_scopes.ts:198`
- `src/music_intelligence/stage_adapter/discovery_list_scopes.ts:211`

Audited pre-fix behavior:

The Tool Call Router validates every call payload against the tool's generated
input schema before invoking the handler. The current generated schemas already
cover:

- first-page vs cursor-page lookup shape through `anyOf`;
- object type;
- required `lookupText` or `cursor`;
- `additionalProperties: false`;
- `targetKind` and scope-kind enums;
- `scopes` array shape and discriminated scope objects;
- `limit` as integer from 1 through 100;
- `list_scopes.kind` enum and no extra properties.

The handlers then parse the same structural contract again:

```ts
if (!isRecord(payload)) ...
if ("cursor" in payload) { reject keys; check cursor string; }
for (const key of Object.keys(payload)) { reject extra keys; }
if (typeof payload.lookupText !== "string") ...
if (payload.targetKind !== undefined && !isMusicTargetKind(...)) ...
if (payload.scopes !== undefined && !Array.isArray(...)) ...
if (!Number.isInteger(limit) || limit < 1 || limit > LOOKUP_MAX_LIMIT) ...
```

`normalizeLookupScope(...)` also repeats the generated `MusicScope |
ListedMusicScope` discriminated-union checks and then falls back to a public
`invalid_input` for the supposedly unsupported default branch.

Why this violates the rule:

- Stage Interface owns input schema validation at the Tool Call Router.
- These are structural checks already guaranteed by generated JSON Schema.
- The handler should keep semantic checks that JSON Schema does not own, such
  as trimmed non-empty `lookupText`, non-empty `scopes`, scope combination
  rules, current availability, target-kind compatibility, cursor decryption,
  cursor expiry, and provider-call budget.
- Duplicating the generated schema creates two public input vocabularies that
  can drift. For example, the schema may change but the hand parser can keep an
  old key/enum/limit rule.

Impact:

- Future schema changes must update both generated contracts and handler
  parsers.
- Public invalid-input messages can disagree with router validation errors.
- Impossible-state fallback branches hide the fact that handler code should be
  operating on already schema-valid input. Those states should crash as
  invariant failures, not be reclassified as public `invalid_input`.

Recommendation:

Replace the structural parsers with a thin cast/narrowing helper immediately
after router validation, and keep only semantic validation in the handler.
Possible shape:

```ts
const input = payload as MusicDiscoveryLookupInput;
```

If the project wants runtime narrowing despite router validation, make it a
single shared Stage Interface helper that asserts the router's post-schema
contract and throws on violation; do not return tool-level `invalid_input` for
states the schema already rejects.

Suggested guard:

- Keep router-level tests proving malformed shape, extra keys, enum mismatch,
  and invalid limit are rejected by schema validation.
- Add handler-level tests only for semantic errors: blank `lookupText`, empty
  scopes, incompatible scope combinations, unknown scopes, unsupported target,
  expired/invalid encrypted cursor.

### P2: Source Library Import And Extension Split Provider-Read Validation Ownership

Files:

- `src/extension/platform_library_provider_slot.ts:262`
- `src/extension/platform_library_provider_slot.ts:266`
- `src/extension/platform_library_provider_slot.ts:302`
- `src/extension/platform_library_provider_slot.ts:314`
- `src/extension/platform_library_provider_slot.ts:323`
- `src/extension/platform_library_provider_slot.ts:347`
- `src/extension/platform_library_provider_slot.ts:352`
- `src/extension/platform_library_provider_slot.ts:389`
- `src/extension/platform_library_provider_slot.ts:403`
- `src/extension/platform_library_provider_slot.ts:466`
- `src/extension/platform_library_provider_slot.ts:478`
- `src/music_data_platform/source_library_import.ts:601`
- `src/music_data_platform/source_library_import.ts:605`
- `src/music_data_platform/source_library_import.ts:617`
- `src/music_data_platform/source_library_import.ts:621`
- `src/music_data_platform/source_library_import.ts:628`
- `src/music_data_platform/source_library_import.ts:642`
- `src/music_data_platform/source_library_import.ts:648`
- `src/music_data_platform/source_library_import.ts:663`
- `src/music_data_platform/source_library_import.ts:677`
- `src/music_data_platform/source_library_import.ts:691`
- `src/music_data_platform/source_library_import.ts:695`
- `src/music_data_platform/source_library_import.ts:710`
- `docs/extension/ports.md:20`
- `docs/extension/ports.md:42`
- `docs/extension/ports.md:44`
- `docs/music-data-platform/ports.md:222`

Audited pre-fix behavior:

Extension's platform-library provider slot validates provider output integrity
before returning a successful `PlatformLibraryReadResult`: result object shape,
provider id, requested kind, account id safety, candidates array, limit,
`nextCursor`, `totalCountHint`, candidate object shape, source entity shape,
source ref shape/safety, provider entity id safety, and source kind.

Source Library Import consumes that provider-read port and then repeats much of
the same structural validation:

- page must be an object;
- `page.candidates` must be an array;
- `nextCursor` must be a non-empty string when present;
- `totalCountHint` must be a non-negative integer;
- every candidate must be an object;
- every candidate must have an object source entity;
- source entity provider id / provider entity id / source ref shape must be
  safe;
- source ref id must be safe.

MDP also checks page provider id, account id, library kind, source provider id,
source kind, and source ref namespace/kind against the current batch. Those
batch-membership checks are valid MDP-owned semantic validation and should stay.

Why this is a conditional finding:

- The Extension port documentation says provider reads return validated
  candidates.
- The Music Data Platform port documentation says Source Library Import should
  validate provider page identity before item transactions; it does not require
  re-validating raw provider payload shape after Extension already adapted it.
- The repeated shape checks make Source Library Import behave like it is still
  directly facing raw provider/plugin output.
- However, this is only a violation if `PlatformLibraryReadPort` is defined as
  a trusted post-Extension port. If MDP intentionally accepts arbitrary
  untrusted `PlatformLibraryReadPort` implementations, then MDP owns a provider
  read boundary too and the Extension docs should not claim sole validated-output
  ownership.

Impact:

- Two adjacent layers own the same provider-output structural rules.
- Error codes can drift: malformed provider output may surface as
  `extension.invalid_platform_library_provider_read_output` in one path and
  `music_data.source_library_provider_page_invalid` in another.
- Future provider output contract changes require coordinated edits in both
  Extension and Music Data Platform even when the MDP import semantics did not
  change.

Recommendation:

Make one boundary decision and encode it in docs/tests:

Option A: Extension owns provider-output structural validation. In that case,
keep only MDP's batch-scoped semantic checks:

- page provider id belongs to the batch;
- resolved account id matches the batch;
- page/candidate library kind matches the batch;
- source provider id, source kind, and source ref namespace/kind match the
  batch.

Remove the duplicate structural provider-output checks from Source Library
Import, or convert impossible post-Extension contract violations into thrown
invariant errors rather than public provider-page-invalid `Result` failures.

Option B: MDP owns an untrusted provider-read boundary. In that case, document
`PlatformLibraryReadPort` as untrusted input to Source Library Import, keep the
structural checks there, and adjust Extension docs/tests so validated-output
ownership is not split ambiguously across both layers.

Suggested guard:

- Extension provider-slot tests should own malformed provider output cases.
- Source Library Import tests should own batch mismatch cases.
- Add one test for the selected decision: either a broken post-Extension port
  violation throws as an invariant, or an intentionally untrusted MDP read port
  returns `music_data.source_library_provider_page_invalid` by design.

### P2: NCM Source Search Silently Drops Some Provider Rows Without Explicit Semantics

Files:

- `docs/extension/plugins/ncm.md:163`
- `test/formal/ncm-plugin.test.ts:787`
- `test/formal/ncm-plugin.test.ts:801`
- `src/extension/plugins/ncm.ts:875`
- `src/extension/plugins/ncm.ts:887`
- `src/extension/plugins/ncm.ts:890`
- `src/extension/plugins/ncm.ts:894`
- `src/extension/plugins/ncm.ts:942`
- `src/extension/plugins/ncm.ts:946`
- `src/extension/plugins/ncm.ts:982`
- `src/extension/plugins/ncm.ts:986`
- Contrast with strict library mapping at
  `src/extension/plugins/ncm.ts:650` and
  `src/extension/plugins/ncm.ts:683`.

Audited pre-fix behavior:

`mapPayloadArray(...)` accepts a provider array, filters non-object items, maps
each object, and drops mapper failures:

```ts
return ok(value.filter(isRecord).map((item) => mapper(item as T)).filter(isDefined));
```

The mappers return `undefined` when required source facts are absent:

- track without usable id/title;
- album without usable id/title;
- artist without usable id/name.

This finding is narrower than the first audit draft. Current NCM documentation
explicitly says "Search raw items without usable stable provider ids are
dropped", and the formal test asserted that search rows with missing
or zero track ids return `[]`. That provider-id drop is current product
semantics and is not treated as a violation here.

Why this violates the rule:

- This is an external provider adapter boundary, so it is the right place to
  validate and translate malformed provider payloads.
- However, the current helper also silently drops non-object rows and rows that
  have usable ids but are missing other required display/source facts such as
  title/name. Those drops are not spelled out with the same clarity as stable-id
  drops.
- The same file handles platform-library payloads more strictly: saved track,
  album, and followed artist conversion fails on missing usable source facts.

Impact:

- Provider schema drift or bad payload rows may be invisible to callers.
- Search recall can degrade with no public error, warning, or audit signal.
- If every returned item is non-object or missing required non-id facts, the
  result can still look like "no matches."

Recommendation:

Make search mapping semantics explicit:

- fail with `extension.ncm_malformed_response` when the result array contains a
  non-object item; and
- either fail when a result item has a usable provider id but lacks required
  title/name source facts, or document/test that those rows are intentionally
  dropped like missing stable ids; and
- if partial tolerance is the intended provider-search product decision, return
  a structured warning/drop count through an explicit adapter-owned result path
  rather than silently returning fewer candidates.

Suggested guard:

- Keep the existing stable-id-drop test if that remains product semantics.
- Add separate NCM search tests for a non-object row and a usable-id row missing
  title/name; assert the selected strict failure or documented tolerant behavior.

### P3: Plugin Manifest Validator Defensively Validates Core-Owned Inputs

Files:

- `src/extension/plugin_manifest.ts:13`
- `src/extension/plugin_manifest.ts:18`
- `src/extension/plugin_manifest.ts:19`
- `src/extension/plugin_manifest.ts:28`
- `src/extension/plugin_manifest.ts:119`
- `src/extension/plugin_manifest.ts:123`
- `src/extension/plugin_manifest.ts:127`

Audited pre-fix behavior:

`ValidatePluginManifestInput` is typed internal/core-owned input:

```ts
export type ValidatePluginManifestInput = {
  manifest: MineMusicPluginManifest;
  knownCapabilityIds: ReadonlySet<string>;
};
```

The validator still checks whether the wrapper input is an object, accepts any
record with a `has` function as `knownCapabilityIds`, and catches failures from
calling `has(...)`:

```ts
if (!isRecord(input)) {
  return failExtension(...);
}

function isCapabilityIdSet(value: unknown): value is ReadonlySet<string> {
  return isRecord(value) && typeof value.has === "function";
}

function hasKnownCapabilityId(...): Result<boolean> {
  try {
    return ok(knownCapabilityIds.has(capabilityId));
  } catch (cause) {
    return failExtension(...);
  }
}
```

Why this violates the rule:

- The plugin manifest itself is untrusted plugin payload and should be
  validated here.
- The wrapper object and `knownCapabilityIds` are core-owned composition input,
  not untrusted plugin manifest payload.
- If core passes a non-object wrapper, a fake set, or a broken object whose
  `has(...)` throws, that is a programmer or composition error.
- Returning `extension.invalid_plugin_manifest` makes it look like the plugin
  manifest was invalid.

Impact:

- A core wiring bug can be misreported as a plugin manifest problem.
- The wrapper guard and catch duplicate TypeScript's contract and encourage
  defensive checking of internal dependencies.
- This is exactly the internal-input case: once the core-owned wrapper contract
  is satisfied, a broken `knownCapabilityIds` dependency should fail loudly
  instead of being translated into plugin payload failure.

Recommendation:

Keep validation for `manifest`. Trust the typed wrapper input and
`knownCapabilityIds`, or validate them once at the composition boundary as
programmer errors. Then call `.has(...)` directly without converting failures
to `extension.invalid_plugin_manifest`.

Suggested guard:

- A small unit test that a malformed `knownCapabilityIds` input throws or fails
  at the composition boundary, not as a plugin manifest validation error.

## Allowed Boundary Catch Sites

These catch sites match an explicit boundary owner and are not findings.

| Site | Classification |
| --- | --- |
| `scripts/generate-stage-interface-schemas.mjs:132` | Script check-mode filesystem boundary; handles missing generated file and rethrows unknown read errors. |
| `src/stage_interface/index.ts:134` | Tool Call Router / Effect Boundary preflight seam; execution-gate throw becomes router-owned public failure. |
| `src/stage_interface/index.ts:163` | Tool Call Router handler boundary; thrown handler errors are normalized once at router boundary. |
| `src/stage_interface/index.ts:234` | Stage Interface schema compilation boundary; invalid schema becomes setup-time throw. |
| `src/stage_interface/index.ts:417` | Timeout race hygiene; consumes late handler rejection after timeout while the race still reports early rejection. |
| `src/stage_interface/handle_registry_records.ts:176` | Stage Interface handle-record invariant check for stored JSON. |
| `src/stage_core/runtime.ts:101` | Runtime lifecycle boundary for module initialize. |
| `src/stage_core/runtime.ts:133` | Runtime lifecycle boundary for Stage Interface creation. |
| `src/stage_core/runtime.ts:242` | Runtime lifecycle boundary for module stop. |
| `src/server/music_data_platform_runtime_module.ts:84` | Server Host runtime-module initialize boundary with cleanup. |
| `src/server/music_data_platform_runtime_module.ts:161` | Server Host runtime-module stop boundary. |
| `src/server/projection_maintenance_scheduler.ts:148` | Background scheduler tick boundary records compact tick failure. |
| `src/extension/capability_dispatch.ts:57` | Extension capability invocation boundary for plugin/provider methods. |
| `src/extension/plugin_runtime.ts:342` | Extension plugin activation boundary. |
| `src/extension/source_provider_slot.ts:352` | Source Provider adapter output validation boundary; unsafe provider source refs become invalid provider output. |
| `src/extension/platform_library_provider_slot.ts:466` | Platform Library Provider adapter output validation boundary; unsafe provider source refs become invalid provider output. |
| `src/extension/plugins/ncm.ts:400` | NCM provider HTTP/network boundary. |
| `src/extension/plugins/ncm.ts:420` | NCM provider JSON decode boundary. |
| `src/extension/plugins/ncm.ts:464` | NCM provider HTTP/network boundary. |
| `src/extension/plugins/ncm.ts:484` | NCM provider JSON decode / provider issue boundary. |
| `src/extension/plugins/ncm.ts:836` | NCM config URL parse boundary. |
| `src/storage/sqlite/database.ts:78` | SQLite database initialization boundary. |
| `src/storage/sqlite/database.ts:128` | SQLite transaction boundary, rollback on callback failure. |
| `src/storage/sqlite/database.ts:142` | Rollback best-effort cleanup; preserves the original transaction error. |
| `src/music_intelligence/core/retrieval/cursor.ts:55` | Retrieval cursor public string decode boundary. |
| `src/music_intelligence/core/retrieval/cursor.ts:62` | Retrieval cursor JSON decode boundary. |
| `src/music_intelligence/core/retrieval/query_normalization.ts:613` | Retrieval query normalization boundary; invalid public pool refs become typed Retrieval input errors. |
| `src/music_intelligence/core/retrieval/query_service.ts:453` | Retrieval provider-search port boundary; provider-search throw becomes `MusicIntelligenceError`. |
| `src/music_intelligence/core/retrieval/query_service.ts:855` | Provider-search candidate validation boundary; unsafe provider refs become invalid provider-search result. |
| `src/music_intelligence/stage_adapter/discovery_lookup.ts:920` | Public lookup cursor AEAD/JSON decode boundary; invalid cursor becomes declared public cursor error. |
| `src/music_data_platform/retrieval_read_model.ts:1272` | Music Data Platform read-model stored JSON invariant boundary. |
| `src/music_data_platform/retrieval_result_set_records.ts:733` | Music Data Platform result-set record JSON invariant boundary. |
| `src/music_data_platform/retrieval_mixed_workspace.ts:1489` | Music Data Platform mixed workspace stored JSON invariant boundary. |
| `src/music_data_platform/projection_maintenance_commands.ts:319` | Projection-maintenance target payload JSON boundary. |
| `src/music_data_platform/projection_maintenance_commands.ts:616` | Projection-maintenance stored material JSON invariant boundary. |
| `src/music_data_platform/projection_maintenance_runner.ts:53` | Projection Maintenance per-target rebuild boundary, records compact failure for that target. |
| `src/music_data_platform/source_library_import.ts:812` | Expected Music Data Platform command error to service `Result<T>` conversion; unknown errors are rethrown. |

## Allowed Redundant-Looking Guard Sites

These checks look defensive in isolation, but they sit at an explicit boundary
or enforce an invariant not guaranteed by the immediate caller.

| Site | Classification |
| --- | --- |
| `src/extension/source_provider_slot.ts:137` | Extension runtime input boundary. `ExtensionRuntime.searchSourceProvider(...)` is a runtime seam and may be called by composition/tests/adapters, so it validates search input before invoking plugin code. |
| `src/extension/source_provider_slot.ts:262` | Source Provider output boundary. It validates untrusted provider/plugin output before returning validated candidates. |
| `src/extension/platform_library_provider_slot.ts:125` | Extension runtime input boundary for platform-library reads. |
| `src/extension/platform_library_provider_slot.ts:262` | Platform Library Provider output boundary. It validates untrusted provider/plugin output before returning a validated provider-read result. |
| `src/music_intelligence/core/retrieval/query_normalization.ts:49` | Retrieval query normalization boundary. It accepts internal typed query input but still owns semantic normalization, legacy-field rejection, pool algebra, text tokenization, cursor/session-id shape, and provider-search compatibility. |
| `src/music_intelligence/core/retrieval/query_service.ts:384` | Internal invariant assertion after query normalization. The throws are programmer-error signals, not public fallback values. |
| `src/music_intelligence/core/retrieval/cursor.ts:53` | Cursor decode boundary. Encoded cursors are public/opaque input and must be decoded defensively. |
| `src/music_intelligence/stage_adapter/discovery_lookup.ts:920` | Lookup cursor AEAD/JSON boundary. Encrypted public cursors are untrusted input even after schema validation proves they are strings. |
| `src/music_data_platform/projection_maintenance_commands.ts:312` | Projection-maintenance JSON payload boundary. The payload is persisted JSON and must be parsed/validated at read time. |
| `src/music_data_platform/retrieval_result_set_records.ts:554` | Record repository invariant checks before persistence. These overlap with DB constraints but provide owner-specific errors and record-shape assertions at the repository boundary. Do not expand this pattern into ordinary services. |
| `src/stage_interface/handle_registry_records.ts:151` | Stage Interface handle registry record invariant checks before persistence. |

## Watchlist, Not Current Findings

### Source Provider Lookup Capability Mismatch

Files:

- `src/contracts/music_data_platform.ts:166`
- `src/contracts/music_data_platform.ts:173`

The older Source Provider `"lookup"` capability mismatch is not a current
finding in this audit. Current `SourceProviderCapability` is `"search" |
"playable_links"`, and `SourceProvider` exposes `search?` and
`getPlayableLinks?`; there is no current `"lookup"` literal to reconcile.

### Storage Async Callback Rejection Absorption

Files:

- `src/storage/sqlite/database.ts:128`
- `src/storage/sqlite/database.ts:290`
- `src/storage/sqlite/schema.ts:16`
- `src/storage/sqlite/schema.ts:36`

The storage layer rejects async transaction/schema callbacks by throwing a
synchronous error, then attaches a no-op rejection handler to the unsupported
promise to avoid an unhandled rejection.

This is acceptable because the boundary already fails the operation and the
no-op catch does not fabricate success. It should remain tightly scoped to this
"async callback not supported" path. Do not copy this pattern elsewhere.

### Public Fallback Labels

Files:

- `src/contracts/public_music_description.ts:26`
- `src/contracts/public_music_description.ts:117`
- `docs/formal-rebuild/stage-interface-tool-frame.md:311`
- `docs/formal-project-glossary.md:116`

Kind-aware fallback labels such as "Untitled library item" are intentional
public presentation semantics when display facts are absent. They are not used
as identity, cursor state, permission input, or error recovery. This is allowed
by the Stage Interface handle-description contract.

### Empty Arrays Reviewed As Domain Empty

Reviewed direct empty-result sites:

- `src/music_data_platform/retrieval_read_model.ts:479`
- `src/music_data_platform/material_text_normalization.ts:96`
- `src/music_data_platform/retrieval_mixed_workspace.ts:1238`
- `src/music_intelligence/core/retrieval/query_normalization.ts:289`
- `src/music_intelligence/core/retrieval/query_normalization.ts:310`
- `src/music_intelligence/core/retrieval/query_service.ts:395`
- `src/music_intelligence/core/retrieval/query_service.ts:417`
- `src/music_intelligence/core/retrieval/query_service.ts:421`
- `src/extension/plugins/ncm.ts:119`
- `src/extension/plugins/ncm.ts:1213`
- `src/music_data_platform/source_library_import.ts:162`
- `src/music_data_platform/source_library_import.ts:205`

These are currently domain-empty semantics:

- absent optional pool/token inputs;
- no target kinds requested;
- completed import or max-new-items-reached with no new item processing;
- no explicit version phrase;
- local/provider pool mapping where the current pool kind intentionally maps to
  no durable refs.

Do not use these as precedent for catching system failures and returning empty
arrays.

## Recommended Fix Order

1. Fix `music.discovery.lookup` unknown Retrieval error mapping so plain throws
   reach the Tool Call Router as `stage_interface.tool_handler_failed`.
2. Classify every known `mapRetrievalError(...)` code, especially
   `retrieval_result_invalid`, `cursor_mismatch`, and
   handler-constructed `retrieval_query_invalid` paths.
3. Split Source Library Import per-candidate item failure from system/write
   failure.
4. Remove duplicated Music Discovery handler schema parsing while preserving
   handler-owned semantic validation.
5. Decide provider-read structural validation ownership: Extension post-validation
   port, or MDP untrusted read boundary. Then narrow or document checks
   accordingly.
6. Make NCM source-search row-drop semantics explicit for non-object rows and
   usable-id rows missing title/name facts, while preserving documented stable-id
   drop behavior if still intended.
7. Remove or relocate the defensive core-owned input guards and
   `knownCapabilityIds.has(...)` catch in plugin manifest validation.

## Verification For This Report

The initial report was static analysis. The follow-up implementation was checked
with typecheck, test build, and the targeted formal tests listed below.

Pre-fix coverage checked:

- `test/formal/music-discovery-lookup.test.ts` covered a host-injected bad clock
  throwing through the Tool Call Router as `stage_interface.tool_handler_failed`
  and known provider-search failure mapping to `provider_scope_failed`. It did
  not cover `retrievalQuery.query(...)` throwing a plain `Error`.
- `test/formal/music-data-platform-source-library.test.ts` expected a
  bad generated material ref to record one item failure and complete the batch.
  That test needed to change when the failure was reclassified as an internal
  material-ref factory/command invariant.
- `test/formal/ncm-plugin.test.ts` asserted NCM search drops rows
  without usable stable provider ids. It covers malformed missing result arrays
  as `extension.ncm_malformed_response`, but it did not separately classify
  non-object rows or usable-id rows missing title/name facts.
- `test/formal/extension-capability-slot.test.ts` asserted malformed
  `knownCapabilityIds` wrapper inputs return
  `extension.invalid_plugin_manifest`; that locked in the defensive behavior
  this report recommended changing.

Follow-up implementation coverage:

- `test/formal/music-discovery-lookup.test.ts` now covers plain Retrieval
  throws, `retrieval_result_invalid`, `provider_search_pool_invalid`, and cursor
  mismatch classification.
- `test/formal/music-data-platform-source-library.test.ts` now expects bad
  generated material refs and malformed post-Extension provider-read structure
  to throw while marking the batch failed.
- `test/formal/ncm-plugin.test.ts` keeps the documented stable-id drop behavior
  and adds non-object row / usable-id-missing-title malformed-response coverage.
- `test/formal/extension-capability-slot.test.ts` now expects malformed
  core-owned manifest-validator wrapper inputs to throw.

Verification commands used for the follow-up implementation:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/formal/stage-interface-tool-frame.test.js
node .tmp-test/test/formal/music-discovery-lookup.test.js
node .tmp-test/test/formal/music-discovery-list-scopes.test.js
node .tmp-test/test/formal/extension-capability-slot.test.js
node .tmp-test/test/formal/music-data-platform-source-library.test.js
node .tmp-test/test/formal/ncm-plugin.test.js
```
