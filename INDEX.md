# MineMusic Index

This index points agents to the current MVP documentation pack.

Documentation maintenance note: `docs/maintenance/documentation-architecture.md`
records the agreed documentation structure and responsibilities for the upcoming
documentation/code alignment sweep. Architecture drift found during that sweep
is tracked in `docs/maintenance/architecture-inconsistency-log.md`; document
disposition is tracked in `docs/maintenance/documentation-alignment-audit.md`;
execution sequencing is tracked in
`docs/maintenance/documentation-alignment-plan.md`; archived evidence is routed
through `docs/archive/README.md`.

## Start Here

1. `proposal.md`
   - Product and architecture proposal.
   - This is the product source used for the fresh MVP document pack.

2. `README.md`
   - Project entrypoint and MVP goal.

3. `CONTEXT.md`
   - Project vocabulary for Stage Core, Stage Interface, Stage Modules, Core
     Capabilities, Plugin Slots, host clients/transports, and Storage.

4. `ARCHITECTURE.md`
   - Layer model, runtime flow, and module ownership.

5. `docs/mvp/interface-contracts.md`
   - Shared data contracts used by public module ports.

6. `docs/mvp/module-interfaces.md`
   - Public module ports, consumed ports, published events, and forbidden leaks.
   - This is the primary file for parallel module implementation.

7. `docs/mvp/communication-protocols.md`
   - Cross-module port calls, domain events, proposals, provider slots, errors,
     and interface change requests.

8. `docs/mvp/module-boundaries.md`
   - Encapsulation rules for each module.

9. `docs/mvp/workstreams.md`
   - Ownership areas for assigning people or agents after interfaces are frozen.

10. `docs/mvp/agent-collaboration.md`
   - Handoff protocol, interface change process, and coordination rules.

11. `plan/mvp_phase_plan.md`
   - Phase plan for building the MVP from the docs.

12. `plan/subagent_mvp_master_plan.md`
   - Coordinator plan for using subagents to implement the MVP with isolated
     write scopes, review gates, and integration waves.

13. `docs/mvp/verification-report.md`
   - Fixture end-to-end MVP verification report.

14. `docs/mvp/final-review.md`
   - Wave 6 final spec/code-quality review and residual risk report.

15. `docs/architecture-reviews/2026-05-22-stage-interface-review.html`
   - Historical architecture review for consolidating Stage Interface,
     Instruments, Tools, Stage Core, internal capabilities, and host adapters.
     ADR-0001 supersedes its Stage Core naming ambiguity.

16. `docs/adr/0001-stage-core-runtime-composition.md`
   - Accepted naming decision: Stage Core means runtime composition and
     lifecycle; current code uses Stage Modules for Session Context and
     Material Gate.
   - `docs/stage-core/minemusic_stage_core_refactoring_design.md` records the
     Stage Core Runtime Kit refactoring design.
   - `docs/stage-core/minemusic_stage_core_refactoring_execution_plan.md`
     records the phase-by-phase Runtime Kit implementation plan.
   - `docs/stage-core/minemusic_stage_runtime_interface_narrowing_plan.md`
     records the TDD phase plan for narrowing production callers to
     `MineMusicStageRuntime` while keeping explicit harness entrypoints.
   - `docs/stage-core/progress.md` records current Stage Core implementation
     progress, verification, and remaining gaps.
   - `docs/adr/0002-material-store-boundary.md` records the accepted Material
     Store boundary: Canonical Store remains the canonical identity subdomain,
     Source Entity Store owns source entities, Source Library, and Library
     Import/Update, and external library tools keep user-facing names.
   - `docs/material-store/design.md` is the current Material Store design
     authority for durable material state.
   - `docs/material-store/ports.md` records current Material Store provided
     and consumed ports.
   - `docs/material-store/progress.md` records current Material Store
     implementation state, verification, remaining gaps, and open `AI-*`
     inconsistencies.
   - `docs/canonical-store/design.md` is the current Canonical Store design
     authority.
   - `docs/canonical-store/ports.md` records current Canonical Store and
     Canonical Maintenance ports.
   - `docs/canonical-store/provisional-review.md` records the current
     Provisional Review surface.
   - `docs/canonical-store/storage-model.md` records current Canonical Store
     SQLite storage shape.
   - `docs/canonical-store/progress.md` records current Canonical Store
     implementation state.
   - `docs/archive/material-store/README.md` and
     `docs/archive/canonical-store/README.md` index historical store evidence.
   - `docs/material/design.md` is the current Material Flow design authority
     for resolve, query, projection, materialization, policy, selection, and
     recommendation presentation.
   - `docs/material/ports.md` records the current Material Flow provided and
     consumed ports plus architecture guard expectations.
   - `docs/material/projection-materialization.md` records the current split
     between read projection and writer materialization boundaries.
   - `docs/material/progress.md` records current Material Flow implementation
     state and verification evidence.
   - `docs/archive/material/README.md` indexes archived material design,
     review, and PR-plan evidence.
   - `docs/archive/recommendation/README.md` indexes archived recommendation
     posture design and PR-plan evidence.

17. `CURRENT_STATE.md`
   - Current implementation status.

18. `PROGRESS.md`
    - Change log for the MVP documentation baseline.

19. `docs/maintenance/dead-code-compatibility-cleanup-plan.md`
    - Cross-repository plan for separating immediate dead-code cleanup from
      compatibility-layer migration decisions.

20. `docs/maintenance/architecture-inconsistency-log.md`
    - Current open documentation/code/architecture disagreements, including
      `AI-001` and `AI-002` from the Material Store / Canonical Store sweep.

28. `docs/collection-service/design.md`
    - Collection Service source-of-truth design for owner-scoped system/custom
      Collections, materialRef-backed CollectionItems, and blocked material
      filtering.

29. `docs/collection-service/implementation-plan.md`
    - Task-by-task Collection Service implementation plan for contracts,
      storage, service rules, Stage Core wiring, Stage Interface tools,
      Material Resolve blocked filtering, integration coverage, and state sync.

30. `docs/collection-service/progress.md`
    - Collection Service implementation progress, current implementation state,
      verification status, remaining gaps, and next slice.

31. `docs/library-import/design.md`
    - Library Import design for Source Entity Store-owned import orchestration,
      library updates, Source Library state, confirmed-binding Collection
      writes, and import/update event records.

32. `docs/library-import/implementation-plan.md`
    - Library Import implementation plan. It preserves the historical
      first-slice task plan and adds the current follow-up plan for Library
      Update modes, newest-first provider area capabilities, compact
      agent-facing update output, NetEase ordered saved-source reads, and
      `providerAddedAt` provenance cleanup.

33. `docs/library-import/progress.md`
    - Library Import implementation progress, including the Source Entity Store
      ownership boundary, Source Library writes, confirmed-binding Collection
      behavior, verification, remaining gaps, and future slices.

34. `docs/platform-library-provider/design.md`
    - `platform_library` capability slot design for account-scoped platform
      library reads, provider account selection, availability, and provider item
      facts.

35. `docs/stage-interface/design.md`
    - Current Stage Interface boundary design: tool definitions, governed
      dispatch, compact output ownership, MCP adapter relationship, and
      forbidden public leaks.

36. `docs/stage-interface/ports.md`
    - Current Stage Interface provided and consumed ports, read/write
      capabilities, composition points, and guards.

37. `docs/stage-interface/tool-contracts.md`
    - Current public tool surface authority for stable tool names, schema
      policy, compact output policy, MCP parity, public materialId handles, and
      removed public tool names.

38. `docs/stage-interface/progress.md`
    - Current Stage Interface implementation status, evidence checked,
      verification history, and remaining scoped cleanup.

39. `docs/archive/stage-interface/README.md`
    - Archived Stage Interface refactor plans, language-normalization plans,
      completed TODOs, and their superseding current authority documents.

41. `src/collection/index.ts`
    - Collection Service public-port implementation for owner-scoped system and
      custom Collections, materialRef-backed CollectionItems, mutual exclusion,
      and Collection events.

42. `test/collection/collection-service.test.ts`
    - Collection Service behavior tests for system initialization, custom
      collection lifecycle, item membership, blocked filtering, and events.

43. `src/material/index.ts`
    - Material bounded context public barrel for store, resolve, projection,
      materialization, query, policy, selection, and presentation exports.

44. `src/material/query/index.ts`
    - Material Query/Related service for domain material retrieval, Source
      Library and Collection-compatible retrieval, selector delegation, context
      brief, and pool listing. It receives a narrow `MaterialQueryStorePort`,
      imports domain projection helpers from `src/material/projection`, and
      delegates Source Library item materialization to
      `src/material/materialization`. Stage Interface owns compact output
      projection.
    - `src/material/projection/index.ts` owns materialId/current
      MaterialRecord to domain `MusicMaterial` projection helpers.
    - `src/material/materialization/index.ts` owns SourceMaterial and
      Source Library item materialization through explicit registry writer
      capabilities.
    - `src/material/kinds.ts` owns small pure material-kind mappings shared by
      query, resolve, and materialization.
    - `src/material/policy/index.ts` owns reusable per-material policy
      evaluation and non-filtering material sorting.
    - `src/material/selection/index.ts` owns optional materialId selection with
      evaluator + sorter + diversity + limit.
    - `src/material/presentation/index.ts` owns the final
      recommendation presentation gate, typed `recommendation.presented`
      events, and domain feedback-binding event facts.

45. `src/material/store/material_registry/index.ts`
    - In-memory Material Registry implementation for opaque `materialRef`
      records, source/canonical lookup, canonical promotion, and redirects.

46. `src/material/store/canonical/index.ts`
    - Canonical Store public-port implementation, provisional relation
      recording/listing with optional object refs, and current identity policy.

47. `src/material/store/canonical/normalization.ts`
    - Canonical label, ref, and current-record normalization helpers.

48. `src/material/store/canonical/storage.ts`
    - Canonical Store repository-backed lookup and write-error mapping
      mechanics, plus relation persistence delegation.

49. `src/storage/sqlite/canonical-schema.ts`
    - SQLite schema initialization for Canonical Store durable storage,
      including provisional relations.

50. `src/storage/sqlite/canonical-repository.ts`
    - SQLite-backed Canonical Store repository implementation for records,
      source refs, aliases, and provisional relations.

51. `src/storage/sqlite/source-entity-schema.ts`
    - SQLite schema initialization for Source Entity Store durable storage:
      source entities, Source Library items, and Confirmed Canonical Bindings.

52. `src/storage/sqlite/source-entity-repository.ts`
    - SQLite-backed Source Entity Store repository implementation.

53. `src/storage/sqlite/material-schema.ts`
    - SQLite schema initialization for Material Registry durable storage:
      records, source indexes, canonical indexes, and redirects.

54. `src/storage/sqlite/material-repository.ts`
    - SQLite-backed Material Registry repository implementation.

55. `src/storage/sqlite/collection-schema.ts`
    - SQLite schema initialization for durable Collection storage.

56. `src/storage/sqlite/collection-repository.ts`
    - SQLite-backed `CollectionRepository` implementation for direct durable
      repository injection.

57. `src/storage/sqlite/index.ts`
    - Public SQLite storage exports.

58. `test/storage/sqlite-canonical-store.test.ts`
    - Persistence/reopen tests for the SQLite-backed Canonical Store
      repository, including provisional relation persistence.

59. `test/storage/sqlite-source-entity-store.test.ts`
    - Persistence/reopen tests for Source Entity Store source entities, Source
      Library items, and Confirmed Canonical Bindings.

60. `test/storage/sqlite-material-registry.test.ts`
    - Persistence/reopen tests for the SQLite-backed Material Registry.

61. `test/storage/sqlite-collection-repository.test.ts`
    - Persistence/reopen tests for the SQLite-backed Collection repository.

62. `test/integration/canonical-persistence.test.ts`
    - Stage Core restart-style persistence test for SQLite-backed canonical
      storage through `materialStoreDatabasePath`.

63. `test/integration/collection-runtime.test.ts`
    - Composed Stage Core integration coverage for Collection through Stage
      Interface tools, Material Resolve blocked filtering, and durable
      Collection database path reuse.

64. `src/material/resolve/index.ts`
    - Material Resolve service for canonical-first `MusicCandidate` to
      `MusicMaterial` resolution through `MaterialStorePort`, including
      Confirmed Canonical Binding lookup and explicit Source Library scoped
      reads.

65. `test/material_resolve/material-resolve.test.ts`
    - Material Resolve tests for canonical-first lookup, source-ref confirmed
      binding lookup, blocked filtering, and explicit Source Library scoped
      resolution.

66. `src/source/index.ts`
    - Source Grounding service for provider search and playable-link refresh.

67. `docs/source-providers/netease.md`
    - NetEase source and platform-library provider design, runtime behavior,
      boundaries, and verification notes.

68. `docs/knowledge-slot/design.md`
    - Knowledge Slot design draft for provider-attributed structured graph and
      text knowledge, including the MusicBrainz and document-knowledge-base
      boundary, general expansion names, and coarse relationship focus.

69. `docs/knowledge-slot/musicbrainz-provider.md`
    - MusicBrainz Knowledge Provider design draft covering supported query
      modes, deterministic search/lookup/browse API planning, first structured
      knowledge scope, expansion mapping, text-query expansion follow-up,
      relation focus, provider activation, and provider boundaries.

70. `docs/knowledge-slot/implementation-plan.md`
    - Task-by-task implementation plan for the target Knowledge Slot contract,
      generic provider HTTP cache, Stage Interface knowledge tool, and first
      MusicBrainz provider, including runtime provider-factory activation and
      the text-query relation expansion follow-up task.

71. `docs/knowledge-slot/progress.md`
    - Knowledge Slot implementation progress, including implemented shared
      contracts, Provider HTTP Cache work, and MusicBrainz provider status.

72. `src/providers/netease/index.ts`, `src/providers/musicbrainz/index.ts`
    - Read-only NetEase adapter implementing `SourceProvider` and
      `PlatformLibraryProvider` factories plus agent-facing provider descriptors
      for Handbook generation, including recording hints with artist/release
      source refs when available. The MusicBrainz adapter implements the
      read-only Knowledge provider factory for structured music facts, lookup,
      browse expansions, and successful-response Provider HTTP Cache usage.

73. `docs/host-adapters/codex-skill.md`
    - Codex skill design, global MCP client boundary, focused instrument/tool
      behavior, default MusicBrainz Knowledge registration, and verification
      notes. It records that Codex connects to the MineMusic MCP server URL,
      while provider/database/cache/session runtime configuration belongs to
      server startup.

74. `docs/host-adapters/service-adapter-refactor-plan.md`
    - Corrected refactor plan for moving runtime ownership out of Codex into a
      long-lived MineMusic server that exposes MCP directly.

75. `docs/operations/minemusic-server-launchd.md`
    - Local operation guide recording that MineMusic server is kept alive by
      the user `launchd` agent `com.minemusic.server`, while Codex/OpenClaw
      connect as MCP clients to `http://127.0.0.1:37373/mcp`.

76. `src/server/runtime.ts`
    - MineMusic server runtime boundary that creates the default server-held
      Stage Runtime backed by Stage Core composition, registers bundled provider
      factories, applies provider/database/cache/session runtime configuration,
      and exposes the server-held Stage Interface.

77. `src/server/index.ts`
    - MineMusic server entrypoint that waits for the server runtime and exposes
      MCP over local streamable HTTP.

78. `src/stage_core/index.ts`
    - Stage Core public compatibility facade for existing factory entrypoints
      plus narrow `MineMusicStageRuntime` factories. Runtime Kit internals now
      live in `src/stage_core/runtime_kit.ts`, `src/stage_core/repositories.ts`,
      `src/stage_core/seed.ts`, and `src/stage_core/compose.ts`; fixture
      source-provider behavior lives in `src/fixtures/source_provider.ts`.

79. `src/surfaces/mcp/server.ts`
    - MCP surface that derives prefixed tools from MineMusic
      instrument descriptors, including Library Import tools, and delegates to
      `MineMusicStageInterface`; embedded stdio startup is retained only as
      `mcp:minemusic:dev`.

80. `src/stage_interface/**`
    - Stage Interface instruments, stable tool metadata, host schemas,
      dispatch, and callable facade. Tool Definition files under
      `src/stage_interface/tool_definitions/**` now own per-Tool-Group
      descriptors, host input schemas, availability rules, dispatch handlers,
      dependency contexts, compact presentation rules, and runtime payload
      validation. Stable tool names, agent descriptors, and input schemas are
      derived from the ordered definition list.

81. `src/handbook/index.ts`
    - Instrument-catalog Handbook renderer and lookup helpers for overview,
      instrument entries, provider capability sections, and exact tool entries.

82. `skills/minemusic/SKILL.md`
    - Codex workflow skill that tells agents when and how to use MineMusic MCP
      tools for music requests. MineMusic is no longer packaged as a repo-local
      Codex plugin.

83. `skills/minemusic/HANDBOOK.md`
    - Skill-local snapshot of current agent-visible MineMusic instruments and
      tools, including Library Import tool entries. Live Handbook lookup is
      served by the MineMusic server through MCP.

84. `docs/platform-library-provider/netease-implementation-plan.md`
    - Task-by-task implementation plan for the NetEase `platform_library`
      provider, including supported areas, adapter boundaries, issue mapping,
      fixture tests, and verification.

85. `docs/platform-library-provider/progress.md`
    - Platform Library Provider implementation progress, including current
      NetEase provider task status and next slice.

86. `src/storage/sqlite/library-import-schema.ts`
    - SQLite schema initialization for durable Library Import batches, reports,
      area snapshots, item provenance, and absence records.

87. `src/storage/sqlite/library-import-repository.ts`
    - SQLite-backed `LibraryImportRepository` implementation for direct durable
      repository injection.

88. `test/storage/in-memory-library-import-repository.test.ts`
    - In-memory Library Import repository behavior tests for clone-return batch,
      report, area snapshot, item provenance, absence, and provider-account-stable
      latest complete baseline storage.

89. `test/storage/sqlite-library-import-repository.test.ts`
    - SQLite Library Import repository persistence tests for batch/report,
      snapshot baseline, item provenance, and absence records across reopen.

90. `src/material/store/source_entity/library-import.ts`
    - Library Import/Update implementation owned by Source Entity Store:
      platform-library provider lookup, Source Entity and Source Library
      upserts, confirmed-binding Collection writes, update diffing, Platform
      Library Absence records, started-batch failure handling, and
      repository-backed batch status/summary helpers.

91. `test/library_import/library-import-service.test.ts`
    - Library Import Service skeleton tests for provider preview delegation,
      missing provider errors, discovery start rejection, readable batch start,
      status readback, side-effect-free preview estimates, and discovery preview
      behavior, plus initial import start writes and partial-read snapshot
      guards, summary recovery, update diffing, provider-account-stable baseline
      separation, and absence recording.

92. `test/integration/library-import-runtime.test.ts`
    - Composed Stage Core integration coverage for first-slice Library Import:
      discovery preview, preview estimates, import writes, idempotency, update
      diffing, partial-read absence guards, durable Library Import database path
      reuse, and Stage Interface / MCP exposure.

93. `src/storage/sqlite/provider-http-cache-schema.ts`
    - SQLite schema initialization for the generic Provider HTTP Cache.

94. `src/storage/sqlite/provider-http-cache-repository.ts`
    - SQLite-backed `ProviderHttpCacheRepository` implementation for persistent
      provider HTTP response caching and least-recently-used cleanup.

95. `test/storage/in-memory-provider-http-cache-repository.test.ts`
    - In-memory Provider HTTP Cache behavior tests for cache read/write,
      `lastUsedAt` update, clone returns, and maintenance operations.

96. `test/storage/sqlite-provider-http-cache-repository.test.ts`
    - SQLite Provider HTTP Cache persistence tests across repository reopen.

97. `.env.example`
    - Repo-local template for MineMusic server env, including server endpoint,
      provider base URL, SQLite storage paths, and optional multi-path Handbook
      snapshot output.

## Agent Rule

When implementing a module, read only the proposal, shared contracts, module
interface spec, communication protocols, the relevant ownership note, and files
owned by that module unless an interface change is required.
