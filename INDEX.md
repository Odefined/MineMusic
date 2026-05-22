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

19. `docs/superpowers/specs/2026-05-18-wave7-live-source-provider-design.md`
    - Wave 7 design for validating one live read-only source provider through
      the existing source provider slot.

20. `docs/superpowers/plans/2026-05-18-wave7-live-source-provider.md`
    - Wave 7 implementation plan for the NetEase provider adapter and opt-in
      live smoke.

21. `src/providers/netease/index.ts`
    - Read-only NetEase source provider adapter implementing `SourceProvider`.

22. `docs/superpowers/specs/2026-05-18-wave8-codex-instruments-plugin-design.md`
    - Wave 8 design for exposing MineMusic instruments to Codex through a
      repo-local MCP plugin.

23. `docs/superpowers/plans/2026-05-18-wave8-codex-instruments-plugin.md`
    - Wave 8 implementation plan for Stage materials tooling, MCP registration,
      and plugin packaging.

24. `src/stage_core/index.ts`
    - Stage Core composition root that assembles modules, registers providers,
      initializes the Handbook, and exposes the runtime object.

25. `src/surfaces/mcp/server.ts`
    - Codex-facing MCP server that derives prefixed tools from MineMusic
      instrument descriptors and delegates to `MineMusicStageInterface`.

26. `src/stage_interface/**`
    - Stage Interface instruments, stable tool metadata, host schemas,
      dispatch, and callable facade.

27. `src/handbook/index.ts`
    - Instrument-catalog Handbook renderer and lookup helpers for overview,
      instrument entries, and exact tool entries.

28. `plugins/minemusic/.codex-plugin/plugin.json`
    - Repo-local Codex plugin manifest for the MineMusic MCP surface.

29. `plugins/minemusic/.mcp.json`
    - MCP startup config for the MineMusic plugin.

30. `plugins/minemusic/skills/minemusic/SKILL.md`
    - Codex workflow skill that tells agents when and how to use MineMusic MCP
      tools for music requests.

31. `plugins/minemusic/skills/minemusic/HANDBOOK.md`
    - Generated overview of current agent-visible MineMusic instruments and
      tools.

## Agent Rule

When implementing a module, read only the proposal, shared contracts, module
interface spec, communication protocols, the relevant ownership note, and files
owned by that module unless an interface change is required.
