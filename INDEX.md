# MineMusic Index

This index points agents to the current MVP documentation pack.

## Start Here

1. `proposal.md`
   - Product and architecture proposal.
   - This is the sole source used for the fresh MVP document pack.

2. `README.md`
   - Project entrypoint and MVP goal.

3. `ARCHITECTURE.md`
   - Layer model, runtime flow, and module ownership.

4. `docs/mvp/interface-contracts.md`
   - Shared data contracts used by public module ports.

5. `docs/mvp/module-interfaces.md`
   - Public module ports, consumed ports, published events, and forbidden leaks.
   - This is the primary file for parallel module implementation.

6. `docs/mvp/communication-protocols.md`
   - Cross-module port calls, domain events, proposals, provider slots, errors,
     and interface change requests.

7. `docs/mvp/module-boundaries.md`
   - Encapsulation rules for each module.

8. `docs/mvp/workstreams.md`
   - Ownership areas for assigning people or agents after interfaces are frozen.

9. `docs/mvp/agent-collaboration.md`
   - Handoff protocol, interface change process, and coordination rules.

10. `plan/mvp_phase_plan.md`
   - Phase plan for building the MVP from the docs.

11. `plan/subagent_mvp_master_plan.md`
   - Coordinator plan for using subagents to implement the MVP with isolated
     write scopes, review gates, and integration waves.

12. `docs/mvp/verification-report.md`
   - Fixture end-to-end MVP verification report.

13. `docs/mvp/final-review.md`
   - Wave 6 final spec/code-quality review and residual risk report.

14. `CURRENT_STATE.md`
   - Current implementation status.

15. `PROGRESS.md`
    - Change log for the MVP documentation baseline.

16. `docs/superpowers/specs/2026-05-18-wave7-live-source-provider-design.md`
    - Wave 7 design for validating one live read-only source provider through
      the existing source provider slot.

17. `docs/superpowers/plans/2026-05-18-wave7-live-source-provider.md`
    - Wave 7 implementation plan for the NetEase provider adapter and opt-in
      live smoke.

18. `src/providers/netease/index.ts`
    - Read-only NetEase source provider adapter implementing `SourceProvider`.

19. `docs/superpowers/specs/2026-05-18-wave8-codex-instruments-plugin-design.md`
    - Wave 8 design for exposing MineMusic instruments to Codex through a
      repo-local MCP plugin.

20. `docs/superpowers/plans/2026-05-18-wave8-codex-instruments-plugin.md`
    - Wave 8 implementation plan for Stage materials tooling, MCP registration,
      and plugin packaging.

21. `src/surfaces/mcp/server.ts`
    - Codex-facing MCP server that derives prefixed tools from MineMusic
      instrument descriptors and delegates to `MineMusicToolApi`.

22. `src/handbook/index.ts`
    - Instrument-catalog Handbook renderer and lookup helpers for overview,
      instrument entries, and exact tool entries.

23. `plugins/minemusic/.codex-plugin/plugin.json`
    - Repo-local Codex plugin manifest for the MineMusic MCP surface.

24. `plugins/minemusic/.mcp.json`
    - MCP startup config for the MineMusic plugin.

25. `plugins/minemusic/skills/minemusic/SKILL.md`
    - Codex workflow skill that tells agents when and how to use MineMusic MCP
      tools for music requests.

26. `plugins/minemusic/skills/minemusic/HANDBOOK.md`
    - Generated overview of current agent-visible MineMusic instruments and
      tools.

## Agent Rule

When implementing a module, read only the proposal, shared contracts, module
interface spec, communication protocols, the relevant ownership note, and files
owned by that module unless an interface change is required.
