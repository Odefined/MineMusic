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
    - Canonical Store durable storage model, implemented SQLite scope, and
      open design questions.

20. `docs/canonical-store/design.md`
    - Canonical Store responsibility, data flow, module boundaries, and
      implementation phases.

21. `docs/canonical-store/interfaces.md`
    - Canonical Store public/admin/repository interface design and module access
      matrix, including implemented methods and design-only methods.

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
    - Future Library Import design for import orchestration, library updates,
      Collection Service writes, Canonical Store external-ref bindings, and
      import/update event records.

28. `docs/library-import/implementation-plan.md`
    - Task-by-task Library Import Service implementation plan for contracts,
      storage, orchestration, Stage Core wiring, Stage Interface import/update
      tools, integration coverage, and state sync.

29. `docs/library-import/progress.md`
    - Library Import implementation progress, current implementation state,
      remaining gaps, and next slice.

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
    - Canonical Store public-port implementation and current identity policy.

34. `src/canonical/normalization.ts`
    - Canonical label, ref, and current-record normalization helpers.

35. `src/canonical/storage.ts`
    - Canonical Store repository-backed lookup and write-error mapping
      mechanics.

36. `src/storage/sqlite/canonical-schema.ts`
    - SQLite schema initialization for Canonical Store durable storage.

37. `src/storage/sqlite/canonical-repository.ts`
    - SQLite-backed Canonical Store repository implementation.

38. `src/storage/sqlite/index.ts`
    - Public SQLite storage exports.

39. `test/storage/sqlite-canonical-store.test.ts`
    - Persistence/reopen tests for the SQLite-backed Canonical Store
      repository.

40. `test/integration/canonical-persistence.test.ts`
    - Stage Core restart-style persistence test for SQLite-backed canonical
      storage.

41. `test/integration/collection-runtime.test.ts`
    - Composed Stage Core integration coverage for Collection through Stage
      Interface tools and Material Resolve blocked filtering.

42. `src/material_resolve/index.ts`
    - Material Resolve service for canonical-first `MusicCandidate` to
      `MusicMaterial` resolution.

43. `src/source/index.ts`
    - Source Grounding service for provider search and playable-link refresh.

44. `docs/source-providers/netease.md`
    - NetEase source provider design, runtime behavior, boundaries, and
      verification notes.

45. `src/providers/netease/index.ts`
    - Read-only NetEase adapter implementing `SourceProvider` and
      `PlatformLibraryProvider` factories.

46. `docs/host-adapters/codex-mcp-plugin.md`
    - Codex MCP plugin surface design, instrument/tool behavior, packaging, and
      verification notes.

47. `src/stage_core/index.ts`
    - Stage Core composition root that assembles modules, registers providers,
      initializes the Handbook, and exposes the runtime object.

48. `src/surfaces/mcp/server.ts`
    - Codex-facing MCP server that derives prefixed tools from MineMusic
      instrument descriptors and delegates to `MineMusicStageInterface`.

49. `src/stage_interface/**`
    - Stage Interface instruments, stable tool metadata, host schemas,
      dispatch, and callable facade.

50. `src/handbook/index.ts`
    - Instrument-catalog Handbook renderer and lookup helpers for overview,
      instrument entries, and exact tool entries.

51. `plugins/minemusic/.codex-plugin/plugin.json`
    - Repo-local Codex plugin manifest for the MineMusic MCP surface.

52. `plugins/minemusic/.mcp.json`
    - MCP startup config for the MineMusic plugin.

53. `plugins/minemusic/skills/minemusic/SKILL.md`
    - Codex workflow skill that tells agents when and how to use MineMusic MCP
      tools for music requests.

54. `plugins/minemusic/skills/minemusic/HANDBOOK.md`
    - Generated overview of current agent-visible MineMusic instruments and
      tools.

55. `docs/platform-library-provider/netease-implementation-plan.md`
    - Task-by-task implementation plan for the NetEase `platform_library`
      provider, including supported areas, adapter boundaries, issue mapping,
      fixture tests, and verification.

56. `docs/platform-library-provider/progress.md`
    - Platform Library Provider implementation progress, including current
      NetEase provider task status and next slice.

57. `test/storage/in-memory-library-import-repository.test.ts`
    - In-memory Library Import repository behavior tests for clone-return batch,
      area snapshot, item provenance, absence, and latest complete baseline
      storage.

58. `src/library_import/index.ts`
    - Library Import Service skeleton for platform-library provider lookup,
      scope-to-area mapping, discovery start rejection, skeleton batch creation,
      and batch status/summary helpers.

59. `test/library_import/library-import-service.test.ts`
    - Library Import Service skeleton tests for provider preview delegation,
      missing provider errors, discovery start rejection, readable batch start,
      and status readback.

## Agent Rule

When implementing a module, read only the proposal, shared contracts, module
interface spec, communication protocols, the relevant ownership note, and files
owned by that module unless an interface change is required.
