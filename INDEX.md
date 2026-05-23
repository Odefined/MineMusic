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
    - Future Collection Service design for explicit user saves/favorites across
      songs, albums, releases, artists, playlists, and source-only fallback
      items.

25. `docs/library-import/design.md`
    - Future Library Import design for Platform Library Providers, import
      orchestration, Collection Service writes, Canonical Store external-ref
      bindings, and import event records.

26. `src/canonical/index.ts`
    - Canonical Store public-port implementation and current identity policy.

27. `src/canonical/normalization.ts`
    - Canonical label, ref, and current-record normalization helpers.

28. `src/canonical/storage.ts`
    - Canonical Store repository-backed lookup and write-error mapping
      mechanics.

29. `src/storage/sqlite/canonical-schema.ts`
    - SQLite schema initialization for Canonical Store durable storage.

30. `src/storage/sqlite/canonical-repository.ts`
    - SQLite-backed Canonical Store repository implementation.

31. `src/storage/sqlite/index.ts`
    - Public SQLite storage exports.

32. `test/storage/sqlite-canonical-store.test.ts`
    - Persistence/reopen tests for the SQLite-backed Canonical Store
      repository.

33. `test/integration/canonical-persistence.test.ts`
    - Stage Core restart-style persistence test for SQLite-backed canonical
      storage.

34. `docs/source-providers/netease.md`
    - NetEase source provider design, runtime behavior, boundaries, and
      verification notes.

35. `src/providers/netease/index.ts`
    - Read-only NetEase source provider adapter implementing `SourceProvider`.

36. `docs/host-adapters/codex-mcp-plugin.md`
    - Codex MCP plugin surface design, instrument/tool behavior, packaging, and
      verification notes.

37. `src/stage_core/index.ts`
    - Stage Core composition root that assembles modules, registers providers,
      initializes the Handbook, and exposes the runtime object.

38. `src/surfaces/mcp/server.ts`
    - Codex-facing MCP server that derives prefixed tools from MineMusic
      instrument descriptors and delegates to `MineMusicStageInterface`.

39. `src/stage_interface/**`
    - Stage Interface instruments, stable tool metadata, host schemas,
      dispatch, and callable facade.

40. `src/handbook/index.ts`
    - Instrument-catalog Handbook renderer and lookup helpers for overview,
      instrument entries, and exact tool entries.

41. `plugins/minemusic/.codex-plugin/plugin.json`
    - Repo-local Codex plugin manifest for the MineMusic MCP surface.

42. `plugins/minemusic/.mcp.json`
    - MCP startup config for the MineMusic plugin.

43. `plugins/minemusic/skills/minemusic/SKILL.md`
    - Codex workflow skill that tells agents when and how to use MineMusic MCP
      tools for music requests.

44. `plugins/minemusic/skills/minemusic/HANDBOOK.md`
    - Generated overview of current agent-visible MineMusic instruments and
      tools.

## Agent Rule

When implementing a module, read only the proposal, shared contracts, module
interface spec, communication protocols, the relevant ownership note, and files
owned by that module unless an interface change is required.
