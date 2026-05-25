# MineMusic Index

This index points agents to the current MVP documentation pack.

## Start Here

1. `proposal.md`
   - Product and architecture proposal.
   - This is the product source used for the fresh MVP document pack.

2. `README.md`
   - Project entrypoint and MVP goal.

3. `CONTEXT.md`
   - Project vocabulary for Stage Core, Stage Interface, Stage Modules, Core
     Capabilities, Plugin Slots, Host Adapters, and Storage.

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

17. `CURRENT_STATE.md`
   - Current implementation status.

18. `PROGRESS.md`
    - Change log for the MVP documentation baseline.

19. `docs/canonical-store/storage-model.md`
    - Canonical Store durable storage model, implemented SQLite scope including
      provisional relations with optional linked object refs, and open design
      questions.

20. `docs/canonical-store/design.md`
    - Canonical Store responsibility, data flow, module boundaries, and
      implementation phases.

21. `docs/canonical-store/interfaces.md`
    - Canonical Store public/admin/repository interface design and module access
      matrix, including implemented methods, provisional relation methods, and
      design-only methods.

22. `docs/canonical-store/implementation-plan.md`
    - Task-by-task plan for implementing durable Canonical Store storage and
      identity hygiene.

23. `docs/canonical-store/progress.md`
    - Canonical Store implementation progress, current implementation state,
      verification status, remaining gaps, and next slice.

24. `docs/collection-service/design.md`
    - Collection Service source-of-truth design for owner-scoped system/custom
      Collections, canonical-only CollectionItems, and blocked filtering.

25. `docs/collection-service/implementation-plan.md`
    - Task-by-task Collection Service implementation plan for contracts,
      storage, service rules, Stage Core wiring, Stage Interface tools,
      Material Resolve blocked filtering, integration coverage, and state sync.

26. `docs/collection-service/progress.md`
    - Collection Service implementation progress, current implementation state,
      verification status, remaining gaps, and next slice.

27. `docs/library-import/design.md`
    - Library Import design for import orchestration, library updates,
      Collection Service writes, Canonical Store source-ref bindings,
      linked artist/release graph writes through canonical source-ref
      resolution, and import/update event records.

28. `docs/library-import/implementation-plan.md`
    - Task-by-task Library Import Service implementation plan for contracts,
      storage, orchestration, Stage Core wiring, Stage Interface import/update
      tools, integration coverage, and state sync.

29. `docs/library-import/progress.md`
    - Library Import implementation progress, including completed first-slice
      import/update service state, verification, remaining gaps, and future
      slices.

30. `docs/platform-library-provider/design.md`
    - `platform_library` capability slot design for account-scoped platform
      library reads, provider account selection, availability, and provider item
      facts.

31. `src/collection/index.ts`
    - Collection Service public-port implementation for owner-scoped system and
      custom Collections, canonical-only CollectionItems, mutual exclusion, and
      Collection events.

32. `test/collection/collection-service.test.ts`
    - Collection Service behavior tests for system initialization, custom
      collection lifecycle, item membership, blocked filtering, and events.

33. `src/canonical/index.ts`
    - Canonical Store public-port implementation, provisional relation
      recording/listing with optional object refs, and current identity policy.

34. `src/canonical/normalization.ts`
    - Canonical label, ref, and current-record normalization helpers.

35. `src/canonical/storage.ts`
    - Canonical Store repository-backed lookup and write-error mapping
      mechanics, plus relation persistence delegation.

36. `src/storage/sqlite/canonical-schema.ts`
    - SQLite schema initialization for Canonical Store durable storage,
      including provisional relations.

37. `src/storage/sqlite/canonical-repository.ts`
    - SQLite-backed Canonical Store repository implementation for records,
      source refs, aliases, and provisional relations.

38. `src/storage/sqlite/collection-schema.ts`
    - SQLite schema initialization for durable Collection storage.

39. `src/storage/sqlite/collection-repository.ts`
    - SQLite-backed `CollectionRepository` implementation for direct durable
      repository injection.

40. `src/storage/sqlite/index.ts`
    - Public SQLite storage exports.

41. `test/storage/sqlite-canonical-store.test.ts`
    - Persistence/reopen tests for the SQLite-backed Canonical Store
      repository, including provisional relation persistence.

42. `test/storage/sqlite-collection-repository.test.ts`
    - Persistence/reopen tests for the SQLite-backed Collection repository.

43. `test/integration/canonical-persistence.test.ts`
    - Stage Core restart-style persistence test for SQLite-backed canonical
      storage through `canonicalDatabasePath`.

44. `test/integration/collection-runtime.test.ts`
    - Composed Stage Core integration coverage for Collection through Stage
      Interface tools, Material Resolve blocked filtering, and durable
      Collection database path reuse.

45. `src/material_resolve/index.ts`
    - Material Resolve service for canonical-first `MusicCandidate` to
      `MusicMaterial` resolution.

46. `src/source/index.ts`
    - Source Grounding service for provider search and playable-link refresh.

47. `docs/source-providers/netease.md`
    - NetEase source and platform-library provider design, runtime behavior,
      boundaries, and verification notes.

48. `docs/knowledge-slot/design.md`
    - Knowledge Slot design draft for provider-attributed structured graph and
      text knowledge, including the MusicBrainz and document-knowledge-base
      boundary.

49. `docs/knowledge-slot/musicbrainz-provider.md`
    - MusicBrainz Knowledge Provider design draft covering supported query
      modes, deterministic search/lookup/browse API planning, first structured
      knowledge scope, expansion mapping, provider activation, and provider
      boundaries.

50. `docs/knowledge-slot/implementation-plan.md`
    - Task-by-task implementation plan for the target Knowledge Slot contract,
      generic provider HTTP cache, Stage Interface knowledge tool, and first
      MusicBrainz provider, including the future plugin `config.json`
      activation path.

51. `docs/knowledge-slot/progress.md`
    - Knowledge Slot implementation progress, including implemented shared
      contracts, Provider HTTP Cache work, and MusicBrainz provider status.

52. `src/providers/netease/index.ts`, `src/providers/musicbrainz/index.ts`
    - Read-only NetEase adapter implementing `SourceProvider` and
      `PlatformLibraryProvider` factories plus agent-facing provider descriptors
      for Handbook generation, including recording hints with artist/release
      source refs when available. The MusicBrainz adapter implements the
      read-only Knowledge provider factory for structured music facts, lookup,
      browse expansions, and successful-response Provider HTTP Cache usage.

53. `docs/host-adapters/codex-mcp-plugin.md`
    - Codex MCP plugin surface design, focused instrument/tool behavior,
      packaging, and verification notes, including the optional
      `MINEMUSIC_CANONICAL_DB_PATH`,
      `MINEMUSIC_COLLECTION_DB_PATH`, and `MINEMUSIC_LIBRARY_IMPORT_DB_PATH`
      durable storage settings.

54. `src/stage_core/index.ts`
    - Stage Core composition root that assembles modules, registers providers,
      initializes the Handbook, exposes the runtime object, composes Collection
      and Library Import with optional repository/provider injection, and
      supports optional SQLite database path configuration for Canonical Store,
      Collection, and Library Import.

55. `src/surfaces/mcp/server.ts`
    - Codex-facing MCP server that derives prefixed tools from MineMusic
      instrument descriptors, including Library Import tools, and delegates to
      `MineMusicStageInterface`; the default runtime registers NetEase for both
      `source` and `platform_library` slots and can use durable Canonical Store,
      Collection, and Library Import storage via environment variables.

56. `src/stage_interface/**`
    - Stage Interface instruments, stable tool metadata, host schemas,
      dispatch, and callable facade, including focused stage/music/library/memory
      instrument descriptors, provider descriptor attachment, Collection tools,
      and Library Import tools.

57. `src/handbook/index.ts`
    - Instrument-catalog Handbook renderer and lookup helpers for overview,
      instrument entries, provider capability sections, and exact tool entries.

58. `plugins/minemusic/.codex-plugin/plugin.json`
    - Repo-local Codex plugin manifest for the MineMusic MCP surface.

59. `plugins/minemusic/.mcp.json`
    - MCP startup config for the MineMusic plugin.

60. `plugins/minemusic/skills/minemusic/SKILL.md`
    - Codex workflow skill that tells agents when and how to use MineMusic MCP
      tools for music requests.

61. `plugins/minemusic/skills/minemusic/HANDBOOK.md`
    - Generated overview of current agent-visible MineMusic instruments and
      tools, including Library Import tool entries.

62. `docs/platform-library-provider/netease-implementation-plan.md`
    - Task-by-task implementation plan for the NetEase `platform_library`
      provider, including supported areas, adapter boundaries, issue mapping,
      fixture tests, and verification.

63. `docs/platform-library-provider/progress.md`
    - Platform Library Provider implementation progress, including current
      NetEase provider task status and next slice.

64. `src/storage/sqlite/library-import-schema.ts`
    - SQLite schema initialization for durable Library Import batches, reports,
      area snapshots, item provenance, and absence records.

65. `src/storage/sqlite/library-import-repository.ts`
    - SQLite-backed `LibraryImportRepository` implementation for direct durable
      repository injection.

66. `test/storage/in-memory-library-import-repository.test.ts`
    - In-memory Library Import repository behavior tests for clone-return batch,
      report, area snapshot, item provenance, absence, and provider-account-stable
      latest complete baseline storage.

67. `test/storage/sqlite-library-import-repository.test.ts`
    - SQLite Library Import repository persistence tests for batch/report,
      snapshot baseline, item provenance, and absence records across reopen.

68. `src/library_import/index.ts`
    - Library Import Service skeleton for platform-library provider lookup,
      scope-to-area mapping, discovery start rejection, side-effect-free import
      preview estimates, initial import start, import events, provenance,
      complete snapshots, update diffing, Platform Library Absence records,
      started-batch failure handling, and repository-backed batch status/summary
      helpers.

69. `test/library_import/library-import-service.test.ts`
    - Library Import Service skeleton tests for provider preview delegation,
      missing provider errors, discovery start rejection, readable batch start,
      status readback, side-effect-free preview estimates, and discovery preview
      behavior, plus initial import start writes and partial-read snapshot
      guards, summary recovery, update diffing, provider-account-stable baseline
      separation, and absence recording.

70. `test/integration/library-import-runtime.test.ts`
    - Composed Stage Core integration coverage for first-slice Library Import:
      discovery preview, preview estimates, import writes, idempotency, update
      diffing, partial-read absence guards, durable Library Import database path
      reuse, and Stage Interface / MCP exposure.

71. `src/storage/sqlite/provider-http-cache-schema.ts`
    - SQLite schema initialization for the generic Provider HTTP Cache.

72. `src/storage/sqlite/provider-http-cache-repository.ts`
    - SQLite-backed `ProviderHttpCacheRepository` implementation for persistent
      provider HTTP response caching and least-recently-used cleanup.

73. `test/storage/in-memory-provider-http-cache-repository.test.ts`
    - In-memory Provider HTTP Cache behavior tests for cache read/write,
      `lastUsedAt` update, clone returns, and maintenance operations.

74. `test/storage/sqlite-provider-http-cache-repository.test.ts`
    - SQLite Provider HTTP Cache persistence tests across repository reopen.

## Agent Rule

When implementing a module, read only the proposal, shared contracts, module
interface spec, communication protocols, the relevant ownership note, and files
owned by that module unless an interface change is required.
