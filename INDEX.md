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
   - Shared data contracts and public APIs.
   - Agents must treat this as the boundary between modules.

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

12. `CURRENT_STATE.md`
   - Current implementation status.

13. `PROGRESS.md`
    - Change log for the MVP documentation baseline.

## Agent Rule

When implementing a module, read only the proposal, shared contracts, module
interface spec, communication protocols, the relevant ownership note, and files
owned by that module unless an interface change is required.
