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

24. `docs/canonical-store/provisional-review.md`
    - Broader Provisional Review design reference for Canonical Maintenance,
      agent-facing review posture, Gate behavior, active-neighbor review,
      future split/reject/defer/human-review actions, and event separation.

25. `docs/canonical-store/provisional-review-v1.md`
    - Narrow Provisional Review v1 design for Canonical Store-owned maintenance
      of provisional recordings through inspection-backed update and defer.
    - `docs/canonical-store/provisional-review-v2.md` is the draft design for
      compact agent-facing review inspection output, including summary/detail
      views, `hints`, and `knowledgeFacts`.
    - `docs/canonical-store/provisional-hints-implementation-plan.md` is the
      handoff plan for adding source-side provisional recording hints without
      expanding canonical relations.
    - `docs/canonical-store/provisional-review-v1-implementation-plan.md` is
      the task-by-task plan for implementing `canonical.review.list`,
      `canonical.review.inspect`, and `canonical.review.apply`.
    - `docs/canonical-store/provisional-review-v2-implementation-plan.md` is
      the task-by-task plan for replacing v1 review output and update writes
      with compact v2 agent-facing contracts and MusicBrainz-authoritative
      recording identity maintenance.
    - `docs/canonical-store/provisional-review-v2.1-implementation-plan.md` is
      the follow-up plan from real MCP agent review feedback, covering
      MusicBrainz release/track evidence, batch list progress, and v2.1 schema
      discoverability.
    - `docs/canonical-store/provisional-review-v3.md` is the design draft for
      deterministic review qualification, automatic update, and
      qualification-based ordering of neutral `knowledgeFacts`.
    - `docs/canonical-store/provisional-review-v3-implementation-plan.md` is the
      task-by-task plan for implementing v3 automatic update, qualification,
      compact tool output, and independent-agent workflow validation.

26. `docs/collection-service/design.md`
    - Collection Service source-of-truth design for owner-scoped system/custom
      Collections, canonical-only CollectionItems, and blocked filtering.

27. `docs/collection-service/implementation-plan.md`
    - Task-by-task Collection Service implementation plan for contracts,
      storage, service rules, Stage Core wiring, Stage Interface tools,
      Material Resolve blocked filtering, integration coverage, and state sync.

28. `docs/collection-service/progress.md`
    - Collection Service implementation progress, current implementation state,
      verification status, remaining gaps, and next slice.

29. `docs/library-import/design.md`
    - Library Import design for import orchestration, library updates,
      Collection Service writes, Canonical Store source-ref bindings,
      linked artist/release graph writes through canonical source-ref
      resolution, and import/update event records.

30. `docs/library-import/implementation-plan.md`
    - Task-by-task Library Import Service implementation plan for contracts,
      storage, orchestration, Stage Core wiring, Stage Interface import/update
      tools, integration coverage, and state sync.

31. `docs/library-import/progress.md`
    - Library Import implementation progress, including completed first-slice
      import/update service state, verification, remaining gaps, and future
      slices.

32. `docs/platform-library-provider/design.md`
    - `platform_library` capability slot design for account-scoped platform
      library reads, provider account selection, availability, and provider item
      facts.

33. `src/collection/index.ts`
    - Collection Service public-port implementation for owner-scoped system and
      custom Collections, canonical-only CollectionItems, mutual exclusion, and
      Collection events.

34. `test/collection/collection-service.test.ts`
    - Collection Service behavior tests for system initialization, custom
      collection lifecycle, item membership, blocked filtering, and events.

35. `src/canonical/index.ts`
    - Canonical Store public-port implementation, provisional relation
      recording/listing with optional object refs, and current identity policy.

36. `src/canonical/normalization.ts`
    - Canonical label, ref, and current-record normalization helpers.

37. `src/canonical/storage.ts`
    - Canonical Store repository-backed lookup and write-error mapping
      mechanics, plus relation persistence delegation.

38. `src/storage/sqlite/canonical-schema.ts`
    - SQLite schema initialization for Canonical Store durable storage,
      including provisional relations.

39. `src/storage/sqlite/canonical-repository.ts`
    - SQLite-backed Canonical Store repository implementation for records,
      source refs, aliases, and provisional relations.

40. `src/storage/sqlite/collection-schema.ts`
    - SQLite schema initialization for durable Collection storage.

41. `src/storage/sqlite/collection-repository.ts`
    - SQLite-backed `CollectionRepository` implementation for direct durable
      repository injection.

42. `src/storage/sqlite/index.ts`
    - Public SQLite storage exports.

43. `test/storage/sqlite-canonical-store.test.ts`
    - Persistence/reopen tests for the SQLite-backed Canonical Store
      repository, including provisional relation persistence.

44. `test/storage/sqlite-collection-repository.test.ts`
    - Persistence/reopen tests for the SQLite-backed Collection repository.

45. `test/integration/canonical-persistence.test.ts`
    - Stage Core restart-style persistence test for SQLite-backed canonical
      storage through `canonicalDatabasePath`.

46. `test/integration/collection-runtime.test.ts`
    - Composed Stage Core integration coverage for Collection through Stage
      Interface tools, Material Resolve blocked filtering, and durable
      Collection database path reuse.

47. `src/material_resolve/index.ts`
    - Material Resolve service for canonical-first `MusicCandidate` to
      `MusicMaterial` resolution.

48. `src/source/index.ts`
    - Source Grounding service for provider search and playable-link refresh.

49. `docs/source-providers/netease.md`
    - NetEase source and platform-library provider design, runtime behavior,
      boundaries, and verification notes.

50. `docs/knowledge-slot/design.md`
    - Knowledge Slot design draft for provider-attributed structured graph and
      text knowledge, including the MusicBrainz and document-knowledge-base
      boundary, general expansion names, and coarse relationship focus.

51. `docs/knowledge-slot/musicbrainz-provider.md`
    - MusicBrainz Knowledge Provider design draft covering supported query
      modes, deterministic search/lookup/browse API planning, first structured
      knowledge scope, expansion mapping, text-query expansion follow-up,
      relation focus, provider activation, and provider boundaries.

52. `docs/knowledge-slot/implementation-plan.md`
    - Task-by-task implementation plan for the target Knowledge Slot contract,
      generic provider HTTP cache, Stage Interface knowledge tool, and first
      MusicBrainz provider, including runtime provider-factory activation and
      the text-query relation expansion follow-up task.

53. `docs/knowledge-slot/progress.md`
    - Knowledge Slot implementation progress, including implemented shared
      contracts, Provider HTTP Cache work, and MusicBrainz provider status.

54. `src/providers/netease/index.ts`, `src/providers/musicbrainz/index.ts`
    - Read-only NetEase adapter implementing `SourceProvider` and
      `PlatformLibraryProvider` factories plus agent-facing provider descriptors
      for Handbook generation, including recording hints with artist/release
      source refs when available. The MusicBrainz adapter implements the
      read-only Knowledge provider factory for structured music facts, lookup,
      browse expansions, and successful-response Provider HTTP Cache usage.

55. `docs/host-adapters/codex-skill.md`
    - Codex skill design, global MCP client boundary, focused instrument/tool
      behavior, default MusicBrainz Knowledge registration, and verification
      notes. It records that Codex connects to the MineMusic MCP server URL,
      while provider/database/cache/session runtime configuration belongs to
      server startup.

56. `docs/host-adapters/service-adapter-refactor-plan.md`
    - Corrected refactor plan for moving runtime ownership out of Codex into a
      long-lived MineMusic server that exposes MCP directly.

57. `docs/operations/minemusic-server-launchd.md`
    - Local operation guide recording that MineMusic server is kept alive by
      the user `launchd` agent `com.minemusic.server`, while Codex/OpenClaw
      connect as MCP clients to `http://127.0.0.1:37373/mcp`.

58. `src/server/runtime.ts`
    - MineMusic server runtime boundary that creates the default server-held
      Stage Core, registers bundled provider factories, applies
      provider/database/cache/session runtime configuration, and exposes the
      server-held Stage Interface.

59. `src/server/index.ts`
    - MineMusic server entrypoint that waits for the server runtime and exposes
      MCP over local streamable HTTP.

60. `src/stage_core/index.ts`
    - Stage Core composition root that assembles modules, registers providers,
      initializes the Handbook, exposes the runtime object, composes Collection
      and Library Import with optional repository/provider injection, and
      supports optional SQLite database path configuration for Canonical Store,
      Collection, Library Import, Provider HTTP Cache, and explicit Knowledge
      provider registration.

61. `src/surfaces/mcp/server.ts`
    - MCP surface that derives prefixed tools from MineMusic
      instrument descriptors, including Library Import tools, and delegates to
      `MineMusicStageInterface`; embedded stdio startup is retained only as
      `mcp:minemusic:dev`.

62. `src/stage_interface/**`
    - Stage Interface instruments, stable tool metadata, host schemas,
      dispatch, and callable facade, including focused
      stage/knowledge/music/library/memory instrument descriptors, provider
      descriptor attachment, Collection tools, and Library Import tools.

63. `src/handbook/index.ts`
    - Instrument-catalog Handbook renderer and lookup helpers for overview,
      instrument entries, provider capability sections, and exact tool entries.

64. `skills/minemusic/SKILL.md`
    - Codex workflow skill that tells agents when and how to use MineMusic MCP
      tools for music requests. MineMusic is no longer packaged as a repo-local
      Codex plugin.

65. `skills/minemusic/HANDBOOK.md`
    - Skill-local snapshot of current agent-visible MineMusic instruments and
      tools, including Library Import tool entries. Live Handbook lookup is
      served by the MineMusic server through MCP.

66. `docs/platform-library-provider/netease-implementation-plan.md`
    - Task-by-task implementation plan for the NetEase `platform_library`
      provider, including supported areas, adapter boundaries, issue mapping,
      fixture tests, and verification.

67. `docs/platform-library-provider/progress.md`
    - Platform Library Provider implementation progress, including current
      NetEase provider task status and next slice.

68. `src/storage/sqlite/library-import-schema.ts`
    - SQLite schema initialization for durable Library Import batches, reports,
      area snapshots, item provenance, and absence records.

69. `src/storage/sqlite/library-import-repository.ts`
    - SQLite-backed `LibraryImportRepository` implementation for direct durable
      repository injection.

70. `test/storage/in-memory-library-import-repository.test.ts`
    - In-memory Library Import repository behavior tests for clone-return batch,
      report, area snapshot, item provenance, absence, and provider-account-stable
      latest complete baseline storage.

71. `test/storage/sqlite-library-import-repository.test.ts`
    - SQLite Library Import repository persistence tests for batch/report,
      snapshot baseline, item provenance, and absence records across reopen.

72. `src/library_import/index.ts`
    - Library Import Service skeleton for platform-library provider lookup,
      scope-to-area mapping, discovery start rejection, side-effect-free import
      preview estimates, initial import start, import events, provenance,
      complete snapshots, update diffing, Platform Library Absence records,
      started-batch failure handling, and repository-backed batch status/summary
      helpers.

73. `test/library_import/library-import-service.test.ts`
    - Library Import Service skeleton tests for provider preview delegation,
      missing provider errors, discovery start rejection, readable batch start,
      status readback, side-effect-free preview estimates, and discovery preview
      behavior, plus initial import start writes and partial-read snapshot
      guards, summary recovery, update diffing, provider-account-stable baseline
      separation, and absence recording.

74. `test/integration/library-import-runtime.test.ts`
    - Composed Stage Core integration coverage for first-slice Library Import:
      discovery preview, preview estimates, import writes, idempotency, update
      diffing, partial-read absence guards, durable Library Import database path
      reuse, and Stage Interface / MCP exposure.

75. `src/storage/sqlite/provider-http-cache-schema.ts`
    - SQLite schema initialization for the generic Provider HTTP Cache.

76. `src/storage/sqlite/provider-http-cache-repository.ts`
    - SQLite-backed `ProviderHttpCacheRepository` implementation for persistent
      provider HTTP response caching and least-recently-used cleanup.

77. `test/storage/in-memory-provider-http-cache-repository.test.ts`
    - In-memory Provider HTTP Cache behavior tests for cache read/write,
      `lastUsedAt` update, clone returns, and maintenance operations.

78. `test/storage/sqlite-provider-http-cache-repository.test.ts`
    - SQLite Provider HTTP Cache persistence tests across repository reopen.

79. `.env.example`
    - Repo-local template for MineMusic server env, including server endpoint,
      provider base URL, SQLite storage paths, and optional multi-path Handbook
      snapshot output.

## Agent Rule

When implementing a module, read only the proposal, shared contracts, module
interface spec, communication protocols, the relevant ownership note, and files
owned by that module unless an interface change is required.
