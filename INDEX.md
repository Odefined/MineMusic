# MineMusic Index

This index points to current formal authority documents. Archived evidence
lives under `docs/archive/` or git history. Evidence is not current authority.

## Root Authority

- `README.md`: human entrypoint.
- `ARCHITECTURE.md`: formal global architecture authority.
- `CURRENT_STATE.md`: formal rebuild current state.
- `PROGRESS.md`: formal rebuild milestone index.
- `AGENTS.md`: repository operating rules for agents.
- `CONTEXT.md`: pre-formal vocabulary file; not formal rebuild authority unless
  explicitly refreshed later.

## Agent Operating Docs

- `docs/agents/task-classes.md`: task classification and execution-intensity
  rules for planning, guards, verification, and state sync. It is not
  architecture, vocabulary, or documentation-structure authority.
- `docs/agents/domain.md`: engineering-skill guidance for consuming domain
  docs and ADRs.
- `docs/agents/issue-tracker.md`: GitHub issue tracker conventions.
- `docs/agents/triage-labels.md`: mapping from canonical triage roles to this
  repo's GitHub labels.

## Formal Rebuild

- `docs/formal-project-glossary.md`: formal target vocabulary and
  MVP-to-formal term mapping.
- `docs/formal-rebuild/README.md`: formal rebuild planning index.
- `docs/formal-rebuild/phase-0-source-of-truth-reset.md`: Phase 0 spec and
  plan.
- `docs/formal-rebuild/phase-1-contract-vocabulary-reset.md`: Phase 1 spec and
  plan.
- `docs/formal-rebuild/phase-2-stage-core-runtime-baseline.md`: implemented
  Phase 2 spec for Stage Core runtime lifecycle, module contributions, Stage
  Interface attachment, and thin Server Host ownership.
- `docs/formal-rebuild/phase-3-extension-capability-slot-baseline.md`:
  implemented Phase 3 spec for Extension-owned capability slots, plugin
  manifests, registry semantics, source-provider slot registration, write
  policy, and Stage Core mounting.
- `docs/formal-rebuild/phase-4-music-database-foundation.md`: implemented
  Phase 4 spec for generic `MusicDatabase`, SQLite adapter confinement, root-only
  transactions, and centralized schema initialization.
- `docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`:
  implemented Phase 5 spec for Music Data Platform identity records,
  source-material binding facts, repositories, commands, and the `refKey(ref)`
  storage-key policy.
- `docs/formal-rebuild/phase-6-source-provider-slot.md`: implemented Phase 6
  spec for Source Provider Slot search, NCM plugin, default composition,
  guards, docs, and smoke verification.
- `docs/formal-rebuild/phase-6-source-provider-slot-implementation-plan.md`:
  implemented Phase 6 execution plan.
- `docs/formal-rebuild/phase-7-source-library-import-foundation.md`:
  implemented Phase 7 spec for Platform Library Provider Slot, NCM source
  library reads, Music Data Platform source-library import persistence,
  material ref factory, runtime wiring, guards, docs, and smoke verification.
- `docs/formal-rebuild/phase-7-source-library-import-foundation-implementation-plan.md`:
  implemented Phase 7 execution plan.
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation.md`:
  implemented Phase 8 spec for source-library fact rewrite, owner catalog
  projection schema, rebuild command, SQL view, and read port foundation.
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation-implementation-plan.md`:
  implemented Phase 8 execution plan.
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation.md`:
  implemented Phase 9 spec for owner-material relation source-of-truth,
  scoped relation writes, relation projection, and material-scope blocked catalog
  exclusion.
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation-implementation-plan.md`:
  implemented Phase 9 execution plan for owner relation facts, scoped
  relation commands, owner-relation projection, blocked catalog exclusion,
  guards, and docs.
- `docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation.md`:
  implemented Phase 10 spec for material-centered text documents,
  owner-neutral FTS, explicit rebuild commands, and internal match probes.
- `docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation-implementation-plan.md`:
  implemented Phase 10 execution plan.
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation.md`:
  active Phase 11 spec for command-owned dirty projection maintenance,
  explicit rebuild runner boundaries, and source-of-truth invalidation wiring;
  PR11A, PR11B, and PR11C are implemented.
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation-implementation-plan.md`:
  active Phase 11 execution plan split into PR 11A owner catalog projection
  scope repair, PR 11B Projection Maintenance Core, and PR 11C
  source-of-truth invalidation wiring; PR11A, PR11B, and PR11C are
  implemented.
- `docs/formal-rebuild/phase-12-retrieval-query-foundation.md`: Phase 12
  spec for internal Music Intelligence Retrieval over local owner catalog
  and material text projections; PR12A, PR12B, and PR12C are implemented.
- `docs/formal-rebuild/phase-12-retrieval-query-foundation-implementation-plan.md`:
  Phase 12 execution plan split into PR 12A no-text Music Data
  Platform Retrieval Read Port, PR 12B Music Data Platform Text Query
  Integration, and PR 12C Music Intelligence Retrieval Service; PR12A/12B/12C
  are implemented.
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration.md`:
  implemented Phase 13 spec for Server Host background Projection
  Maintenance runner scheduling, batch policy, lifecycle, runtime-module
  ownership, and diagnostics boundaries; PR13A, PR13B, and PR13C are
  implemented.
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration-implementation-plan.md`:
  implemented Phase 13 execution plan split into PR 13A scheduler helper,
  PR 13B runtime module integration, and PR 13C freshness closure
  integration; PR13A/13B/13C are implemented.
- `docs/formal-rebuild/phase-14-source-library-update-reconciliation.md`:
  implemented Phase 14 spec for reconciling source-library current membership
  after complete provider scans.
- `docs/formal-rebuild/phase-14-source-library-update-reconciliation-implementation-plan.md`:
  implemented Phase 14 execution plan for command-owned source-library update
  reconciliation, guards, docs, and verification.
- `docs/formal-rebuild/phase-15-provider-search-pool-retrieval.md`:
  Phase 15 spec for internal provider-search pool retrieval, mixed result
  sets, material candidate cache, SQL ranking, and Source Provider Slot wiring;
  PR15A typed pool migration, PR15B runtime result-set foundation, PR15C mixed
  retrieval workspace, and PR15D provider slot wiring are
  implemented.
- `docs/formal-rebuild/phase-15-provider-search-pool-retrieval-implementation-plan.md`:
  Phase 15 execution plan split into PR 15A typed pools, PR 15B runtime
  result-set foundation, PR 15C fixture mixed query, and PR 15D provider slot
  wiring; PR15A, PR15B, PR15C, and PR15D are implemented.
- `docs/formal-rebuild/phase-16-stage-interface-tool-frame-implementation-plan.md`:
  Phase 16 execution plan for the agent-facing Tool Framework, split into PR 16A
  framework contract layer, PR 16B Public Handle Veil + HandleMintingPort
  registry + execution gate stub + global timeout, PR 16C `list_scopes`, and PR
  16D `lookup`; PR16A, PR16B, PR16C, and PR16D are implemented in the current
  tree.
- `docs/formal-rebuild/stage-interface-tool-frame.md`: Phase 16 design
  authority for the agent-facing Tool Framework skeleton (mandatory core plus
  owned extensible dimensions), with Music Discovery as the first concrete
  instance; pairs with ADR-0009 through ADR-0012, ADR-0014 through ADR-0017,
  ADR-0019, and ADR-0020.
- `docs/formal-rebuild/phase-17-candidate-commit-and-present-implementation-plan.md`:
  Phase 17 execution plan for the first durable-write phase: Candidate Commit
  command (ADR-0011), Material Projection first landing, Effect Boundary
  auto-pass widening (ADR-0021), and the `music.experience.present` consumption
  tool; split into PR 17A/17B/17D/17C; implemented in the current tree.
- `MineMusic_Formal_Project_Architecture_Audit_v3.md`: audit evidence and
  decision trace only.

## Current Area Docs

- `docs/extension/README.md`: Extension area documentation entrypoint.
- `docs/extension/design.md`: Extension Plugin System and Capability Slot
  design authority.
- `docs/extension/ports.md`: Extension provided/consumed ports, forbidden
  dependencies, composition, and guards.
- `docs/extension/progress.md`: Extension implementation state, verification
  evidence, remaining gaps, and next candidate slices.
- `docs/extension/plugins/ncm.md`: NCM plugin-specific config, source search
  mapping, platform library mapping, source refs, errors, and smoke usage.
- `docs/storage/README.md`: Storage area documentation entrypoint.
- `docs/storage/design.md`: generic MusicDatabase and SQLite adapter design
  authority for the implemented Phase 4 boundary.
- `docs/storage/ports.md`: Storage provided/consumed ports, forbidden
  dependencies, composition, and guard plan.
- `docs/storage/progress.md`: Storage implementation state, verification
  evidence, remaining gaps, and next candidate slices.
- `docs/music-data-platform/README.md`: Music Data Platform area
  documentation entrypoint.
- `docs/music-data-platform/design.md`: Music Data Platform identity,
  source-library, owner relation, owner catalog, material text projection,
  retrieval read-port, mixed retrieval workspace, and Library Import
  stage-adapter design authority.
- `docs/music-data-platform/ports.md`: Music Data Platform identity,
  source-library, owner relation, owner catalog, material text projection,
  retrieval read-port, mixed retrieval workspace, Library Import stage-adapter
  ports, forbidden dependencies, composition, and guards.
- `docs/music-data-platform/progress.md`: Music Data Platform implementation
  state, verification evidence, and remaining gaps.
- `docs/music-intelligence/README.md`: Music Intelligence area documentation
  entrypoint.
- `docs/music-intelligence/design.md`: Music Intelligence Retrieval query
  service design authority.
- `docs/music-intelligence/ports.md`: Music Intelligence provided/consumed
  ports, forbidden dependencies, composition, and guards.
- `docs/music-intelligence/progress.md`: Music Intelligence implementation
  state, verification evidence, and remaining gaps.

## Formal ADRs

- `docs/adr/0004-same-repo-formal-rebuild.md`: same-repo formal rebuild and
  no default MVP compatibility layers.
- `docs/adr/0005-formal-top-level-architecture-areas.md`: formal top-level
  architecture areas.
- `docs/adr/0006-formal-identity-candidate-and-handle-boundaries.md`: formal
  entity/record, candidate, materialization, and handle boundary direction.
- `docs/adr/0007-collection-owner-relation-boundary.md`: Collection and owner
  relation source-of-truth split.
- `docs/adr/0008-command-owned-write-boundaries.md`: command-owned write
  boundaries for all MineMusic state mutation.
- `docs/adr/0009-tool-framework-mandatory-core-owned-dimensions.md`:
  agent-facing Tool Framework as a mandatory core plus owned extensible
  dimensions.
- `docs/adr/0010-multi-axis-side-effect-declaration.md`: three-axis tool
  side-effect declaration with deferred Effect Boundary enforcement.
- `docs/adr/0011-candidate-commit-boundary.md`: Candidate Commit as the Music
  Data Platform-owned candidate-to-durable materialization boundary.
- `docs/adr/0012-music-discovery-retrieval-seam.md`: Music Discovery as a Public
  Agent Protocol seam over Music Intelligence Retrieval.
- `docs/adr/0013-contracts-per-area-split.md`: contracts barrel split into
  per-area contract files behind a shared leaf kernel, with a transitional
  re-export shim and machine-checked DAG/kernel-export/barrel guards.
- `docs/adr/0014-model-visible-tool-guidance-is-mandatory.md`: Public Agent
  Protocol / model-visible tools must declare description, usage semantics, and
  positive/negative examples as mandatory guidance.
- `docs/adr/0015-side-effect-and-invocation-policy-are-separate.md`: static
  tool side-effect truth remains separate from Effect Boundary-owned invocation
  policy, default call posture, and data-egress posture.
- `docs/adr/0016-tool-descriptor-and-handler-registration-are-separate.md`:
  public tool descriptors are separate from runtime handler registration.
- `docs/adr/0017-tool-call-router-owns-tool-call-output-name.md`: Tool Call
  Router owns `ToolCallOutput.toolName`; handlers return payloads only.
- `docs/adr/0019-veil-ownership-split-and-handle-scheme.md`: Public Handle Veil
  split into Stage Interface–owned `HandleMintingPort` plus per-tool label
  synthesis; library handle registry scheme.
- `docs/adr/0020-declared-error-vocabulary-and-fail-whole-recovery.md`: declared
  per-tool public error vocabulary and fail-whole multi-scope recovery.
- `docs/adr/0021-effect-boundary-auto-pass-for-presentation-admission.md`:
  Effect Boundary auto-pass widened for presentation-driven Candidate Commit
  admission writes (the Phase 17 `music.experience.present` durable write).
- `docs/adr/0022-effect-boundary-auto-pass-for-library-intake.md`: Effect
  Boundary auto-pass widened for owner-scoped, user-requested Library Import
  intake writes.

## Pre-Formal ADR Evidence

These ADRs record earlier MVP decisions. They are useful evidence, but the
formal target is controlled by the formal ADRs above.

- `docs/adr/0001-stage-core-runtime-composition.md`
- `docs/adr/0002-material-store-boundary.md`
- `docs/adr/0003-materialref-backed-collections.md`

## Maintenance Evidence

- `docs/maintenance/documentation-architecture.md`: documentation structure
  rules from the pre-formal documentation sweep.
- `docs/maintenance/documentation-alignment-audit.md`: pre-formal
  document-disposition ledger.
- `docs/maintenance/architecture-inconsistency-log.md`: pre-formal
  architecture inconsistency ledger.
- `docs/maintenance/documentation-alignment-plan.md`: pre-formal documentation
  alignment phase plan.
- `docs/maintenance/clean-up-report.md`: pre-formal cleanup report.
- `docs/maintenance/dead-code-compatibility-cleanup-plan.md`: pre-formal
  cleanup plan.

## Removed Active Area Docs

Pre-formal area docs were removed from active `docs/` during Phase 1. Their
old content remains available only through `docs/archive/` or git history.
Future area docs should be rebuilt directly from the formal architecture and
contracts when their owning phase starts.

## Source Entrypoints

The active source tree is the formal rebuild skeleton, not the old MVP runtime.

- `src/contracts/kernel.ts`: shared leaf contract kernel (cross-cutting `Ref`,
  `Result`, `StageError`/`StageWarning`, `FormalArea`, and ref helpers); a strict
  leaf that imports no other contract file (ADR-0013).
- `src/contracts/music_data_platform.ts`: source/material/canonical, provider,
  platform-library, source-library import, and material-text tokenization
  contracts; imports only the kernel.
- `src/contracts/storage.ts`: source/material/canonical record contracts; imports
  the kernel and music_data_platform.
- `src/contracts/stage_interface.ts`: instrument/tool and Stage Interface
  contracts, including the Phase 16A Tool Declaration mandatory core,
  `StageToolRegistration`, cross-cutting Stage Tool context ports, declared
  error vocabulary, and public Music Scope / Music Item Handle DTOs; imports
  only the kernel.
- `src/contracts/generated/stage_interface_schemas.ts`: generated JSON Schema
  artifacts derived from TypeScript source for Stage Interface tool inputs and
  outputs; refreshed by `npm run generate:stage-interface-schemas`.
- `src/contracts/public_music_description.ts`: pure public music description
  and fallback-label helpers for Stage Interface stage adapters, including
  Music Discovery item and scope descriptions.
- `src/contracts/stage_core.ts`: runtime lifecycle and snapshot contracts;
  imports the kernel and stage_interface.
- `src/contracts/`: no `index.ts` barrel (deleted in Phase 2); importers read the
  per-area files above directly (ADR-0013). Phase 1 entity/source vocabulary and
  Phase 2 runtime snapshot vocabulary live in the area files listed above.
- `src/stage_interface/index.ts`: Stage Interface Tool Call Router, descriptor
  validation, generated-schema input/output validation, output veil guard,
  gate preflight call, global timeout wrapping, declared-error normalization,
  and router-owned `ToolCallOutput.toolName` wrapping.
- `src/stage_interface/context.ts`: canonical `StageToolContext` factory wiring
  the conservative execution gate, audit port, provider availability default,
  and handle-minting port dependency.
- `src/stage_interface/handle_registry_schema.ts`: Stage Interface-owned
  owner-bound public handle registry schema over Storage.
- `src/stage_interface/handle_registry_records.ts`: Stage Interface handle
  registry repository for public id / owner / internal-anchor bindings.
- `src/stage_interface/handle_minting.ts`: `HandleMintingPort`
  implementation for durable `library` handles plus candidate-cache delegation.
- `src/stage_interface/veil_guard.ts`: output-schema and sample-output internal
  anchor leak guards for the Public Agent Protocol veil.
- `src/effect_boundary/index.ts` and
  `src/effect_boundary/stage_tool_execution_gate.ts`: Effect Boundary
  conservative `StageToolExecutionGate` stub and in-memory audit port.
- `src/extension/capability_slot.ts`: capability slot definition with typed
  registration validation (`validateRegistration`) and write policy.
- `src/extension/capability_registry.ts`: registration-only capability registry
  (register/list/get + cardinality/write-policy/key validation).
- `src/extension/capability_dispatch.ts`: generic capability dispatch skeleton
  (find → capability-check → invoke → validate) shared by provider slots.
- `src/extension/type_guards.ts`: shared extension type guards
  (`isRecord`/`isResultLike`/`isStageErrorLike`/`isSourceEntityKind`).
- `src/extension/source_provider_slot.ts`: source-provider slot, search dispatch,
  and registration/output validation.
- `src/extension/platform_library_provider_slot.ts`: platform-library-provider
  slot, read dispatch, and registration/output validation.
- `src/extension/plugins/ncm.ts`: NCM source-provider and
  platform-library-provider plugin.
- `src/extension/plugins/index.ts`: Extension plugin exports.
- `src/stage_core/index.ts`: Stage Core public exports.
- `src/stage_core/runtime.ts`: Stage Runtime lifecycle baseline and Stage Core
  default tool timeout configuration.
- `src/stage_core/runtime_module.ts`: Stage Core runtime module contribution
  boundary using `StageToolRegistration` entries.
- `src/stage_core/runtime_status.ts`: internal `stage.runtime.status` module
  migrated to the Phase 16A static descriptor + payload handler shape.
- `src/server/host.ts`: thin Server Host lifecycle owner, Stage Interface
  dispatch entrypoint, and internal source library import seam accessor.
- `src/server/config.ts`: Server Host default runtime composition config.
- `src/server/music_data_platform_runtime_module.ts`: Server Host composition
  module for Storage, Music Data Platform schemas, the Stage Interface handle
  registry schema, internal Library Import service wiring, Retrieval query
  wiring, and Music Scope availability adapter.
- `src/server/library_import_runtime_module.ts`: Server Host shim for the
  MDP-owned Library Import Stage Adapter RuntimeModule, adapting Extension
  platform-library-provider descriptor metadata, source-library import service,
  and source-library status reads into narrow Library Import ports.
- `src/server/retrieval_provider_search_adapter.ts`: Server Host adapter from
  Extension Runtime source-provider search to the Music Intelligence Retrieval
  provider-search port.
- `src/server/index.ts`: minimal Server Host entrypoint and snapshot command.
- `src/index.ts`: formal skeleton package exports.
- `src/storage/database.ts`: generic `MusicDatabase` boundary.
- `src/storage/sqlite/database.ts`: concrete `SqliteMusicDatabase` adapter.
- `src/storage/sqlite/schema.ts`: SQLite pragma and schema contribution
  initialization.
- `src/storage/index.ts`: Storage public exports.
- `src/music_data_platform/errors.ts`: Music Data Platform invariant error
  type.
- `src/music_data_platform/identity_schema.ts`: Phase 5 identity schema
  contribution.
- `src/music_data_platform/identity_records.ts`: low-level identity
  repositories and source-to-material binding records.
- `src/music_data_platform/identity_read_model.ts`: narrow identity read port.
- `src/music_data_platform/identity_write_model.ts`: narrow identity write
  command factory.
- `src/music_data_platform/material_ref.ts`: internal material ref validator
  shared by Music Data Platform write/projection boundaries.
- `src/music_data_platform/owner_scope.ts`: default owner-scope constant and
  owner-scope validation.
- `src/music_data_platform/source_library_ref.ts`: source-library ref helpers.
- `src/music_data_platform/source_library_schema.ts`: source-library fact and
  import-batch schema contribution.
- `src/music_data_platform/source_library_records.ts`: low-level
  source-library, source-library item, import batch, and item outcome
  repositories.
- `src/music_data_platform/source_library_commands.ts`: source-library import
  batch, library scope, item, and item-outcome write commands.
- `src/music_data_platform/source_library_read_model.ts`: narrow
  source-library import-batch and owner-scope source-library list read port.
- `src/music_data_platform/material_ref_factory.ts`: opaque material ref
  factory.
- `src/music_data_platform/ref_digest.ts`: internal deterministic ref digest
  helper shared by source-library and owner-relation refs.
- `src/music_data_platform/owner_material_relation_ref.ts`: owner material
  relation ref and owner relation pool ref helpers.
- `src/music_data_platform/owner_material_relation_schema.ts`: owner material
  relation fact schema contribution.
- `src/music_data_platform/owner_material_relation_records.ts`: internal owner
  material relation read port and owner relation scope summaries.
- `src/music_data_platform/owner_material_relation_commands.ts`: owner
  material relation write commands.
- `src/music_data_platform/owner_catalog_schema.ts`: owner catalog entries
  schema contribution and owner catalog SQL view contribution.
- `src/music_data_platform/owner_catalog_records.ts`: internal owner catalog
  read port.
- `src/music_data_platform/owner_catalog_projection.ts`: owner catalog rebuild
  commands for source-library and owner-relation projection scopes.
- `src/music_data_platform/material_text_projection_schema.ts`: material text
  projection schema contribution.
- `src/music_data_platform/material_text_normalization.ts`: internal material
  text normalization and strict FTS query construction helpers.
- `src/music_data_platform/material_text_projection_records.ts`: internal
  material text read port.
- `src/music_data_platform/material_text_projection_commands.ts`: internal
  material text rebuild commands.
- `src/music_data_platform/ref_validation.ts`: internal Music Data Platform
  ref/refKey validation helper that converts malformed external ref inputs
  into `MusicDataPlatformError`.
- `src/music_data_platform/retrieval_read_model.ts`: internal retrieval read
  port over owner catalog, pool algebra, text evidence/ranking, keyset
  pagination, and coarse freshness.
- `src/music_data_platform/retrieval_mixed_workspace.ts`: internal mixed
  local/provider result-set workspace and material-candidate cache boundary.
- `src/music_intelligence/core/retrieval/query_service.ts`: internal Retrieval
  query service over Music Data Platform retrieval ports and provider-search
  port wiring.
- `src/music_intelligence/core/retrieval/query_normalization.ts`:
  Retrieval-owned input normalization and cursor fingerprint input construction.
- `src/music_intelligence/core/retrieval/cursor.ts`: Retrieval-owned opaque cursor
  encoding/decoding.
- `src/music_intelligence/core/retrieval/contracts.ts`: Retrieval query input,
  result, hit, pool filter, and service contracts.
- `src/music_intelligence/stage_adapter/discovery_list_scopes.ts`: Phase 16C
  `music.discovery.list_scopes` descriptor/handler factory.
- `src/music_intelligence/stage_adapter/discovery_lookup.ts`: Phase 16D
  `music.discovery.lookup` descriptor/handler factory, scope normalization,
  public handle/description mapping, declared error mapping, and AEAD cursor
  wrapping over internal Retrieval cursors.
- `src/music_intelligence/stage_adapter/scope_availability.ts`: narrow
  Music Scope availability port and in-memory test adapter for Stage Adapter
  handlers.
- `src/music_intelligence/stage_adapter/index.ts`: Stage Adapter boundary and
  `music.discovery` RuntimeModule contribution; this subtree may import Stage
  Interface contracts.
- `src/music_intelligence/errors.ts`: Music Intelligence area errors.
- `src/music_data_platform/projection_maintenance_schema.ts`: projection
  maintenance target schema contribution.
- `src/music_data_platform/projection_maintenance_records.ts`: internal
  projection maintenance read port.
- `src/music_data_platform/projection_maintenance_commands.ts`: internal
  projection maintenance dirty/clean/failed commands.
- `src/music_data_platform/projection_maintenance_runner.ts`: internal
  projection maintenance rebuild runner.
- `src/music_data_platform/source_library_import.ts`: internal Library Import
  application service that calls source-library and identity commands.
- `src/music_data_platform/stage_adapter/list_sources.ts`: MDP Library Import
  Stage Adapter descriptor/handler for read-only `library.import.list_sources`
  source metadata listing.
- `src/music_data_platform/stage_adapter/import_control.ts`: MDP Library Import
  Stage Adapter descriptors/handlers for `library.import.start`,
  `.continue`, and `.status` compact public import summaries.
- `src/music_data_platform/stage_adapter/source_library_scope.ts`: public
  source-library scope id/description helper shared by import summaries and
  scope availability.
- `src/music_data_platform/stage_adapter/index.ts`: MDP Library Import
  Stage Adapter boundary and `library-import` RuntimeModule contribution for
  the `library.import` instrument and all four import tools.
- `src/music_data_platform/index.ts`: Music Data Platform public exports.

The previous MVP runtime source and tests were removed from active tree and are
available only through git history.

## Archive

- `docs/archive/README.md`: archive policy and area index.
- `docs/archive/root/README.md`: archived root proposal, plans, and
  pre-formal root snapshots.
- `docs/archive/root/formal-rebuild-2026-06-06/`: archived pre-formal root
  `ARCHITECTURE.md`, `CURRENT_STATE.md`, and `PROGRESS.md`.
- `docs/archive/mvp/README.md`: archived original MVP baseline.
- `docs/archive/architecture-reviews/README.md`: archived architecture review
  evidence.
- `docs/archive/stage-core/README.md`: archived Stage Core refactor evidence.
- `docs/archive/stage-interface/README.md`: archived Stage Interface evidence.
- `docs/archive/material/README.md`: archived Material Flow evidence.
- `docs/archive/recommendation/README.md`: archived Recommendation posture
  evidence.
- `docs/archive/material-store/README.md`: archived Material Store evidence.
- `docs/archive/canonical-store/README.md`: archived Canonical Store evidence.
- `docs/archive/collection-service/README.md`: archived Collection Service
  evidence.
- `docs/archive/library-import/README.md`: archived Library Import evidence.
- `docs/archive/platform-library-provider/README.md`: archived Platform Library
  Provider evidence.
- `docs/archive/knowledge-slot/README.md`: archived Knowledge Slot evidence.
- `docs/archive/host-adapters/README.md`: archived host-adapter evidence.
