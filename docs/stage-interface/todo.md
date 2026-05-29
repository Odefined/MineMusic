# Stage Interface Tool Contract TODO

## Documentation

- [x] Record Tool Definition and Tool Group concepts in architecture docs.
- [x] Create the Stage Interface implementation plan.
- [x] Add detailed design under `docs/stage-interface/`.
- [x] Add module-local TODO and progress documents.

## Completed Registry Migration

- [x] Add `src/stage_interface/tool_definitions/types.ts`.
- [x] Add `src/stage_interface/tool_definitions/library.ts`.
- [x] Add `src/stage_interface/tool_definitions/index.ts`.
- [x] Keep `ToolDispatchPort.call({ sessionId, toolName, payload })`
      unchanged.
- [x] Derive Library descriptors from Library Tool Definitions.
- [x] Derive Library host input schemas from Library Tool Definitions.
- [x] Route Library tools through registry lookup before fallback dispatch.
- [x] Keep unmigrated tools on the fallback dispatch path.
- [x] Bind Library output presentation rules to Tool Definitions.
- [x] Add focused tests proving registry dispatch and fallback dispatch.
- [x] Run `npm test`.
- [x] Run `git diff --name-only` and complete the state-sync gate.

## Completed Tool Groups

- [x] Migrate Handbook Tool Group.
- [x] Migrate Stage Tool Group.
- [x] Migrate Music Tool Group.
- [x] Migrate Knowledge Tool Group.
- [x] Migrate Canonical Review Tool Group.
- [x] Migrate Memory Tool Group.
- [x] Remove fallback dispatch only after every stable tool has migrated.

## Contract Refactor

- [ ] Add parity tests for stable tool order, descriptors, schemas, and
      registry entries.
- [ ] Add `stage_interface.invalid_payload`.
- [ ] Validate payloads through each Tool Definition before handler invocation.
- [ ] Keep first-pass validation passthrough, not strict.
- [ ] Derive stable tool names, descriptors, and input schemas from the ordered
      definition list.
- [ ] Make dispatch lookup registry-primary.
- [ ] Reduce unchecked handler payload casts in low-risk tool groups.
- [ ] Update state docs after implementation.
