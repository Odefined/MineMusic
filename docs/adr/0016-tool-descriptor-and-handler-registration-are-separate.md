# ADR-0016: Tool Descriptor and Handler Registration Are Separate

## Status

Accepted

## Context

ADR-0009 listed `handler` inside the Tool Declaration mandatory core. The Stage
Interface Tool Frame review found that this couples the public agent-facing
descriptor to runtime implementation dependencies. Handbook generation, catalog
diffing, schema validation, transport mapping, and prompt/eval fixtures need a
serializable public descriptor; they should not import Retrieval, provider, or
runtime handler dependencies.

The current code already points in the cleaner direction: runtime module
contributions keep `tools` and `handlers` separate and pair them by tool name
during Stage Core merge / Stage Interface creation.

## Decision

Tool Declaration is the public serializable descriptor. It does not carry the
runtime handler.

Runtime registration pairs the descriptor with the handler:

```text
StageToolRegistration = {
  descriptor: ToolDeclaration,
  handler: ToolHandler
}
```

Stage Interface, Handbook, catalog, schema, transport, and eval workflows read
descriptors. The Tool Call Router and runtime merge workflows pair descriptors
with handlers and enforce handler import discipline.

ADR-0017 further narrows the handler side of this registration: handlers return
payloads, while the Tool Call Router wraps `ToolCallOutput.toolName` from the
descriptor name.

## Rejected Alternatives

- Keep `handler` in the public Tool Declaration: rejected; it contaminates
  descriptor-only workflows with runtime dependencies.
- Remove handler registration from the tool framework entirely: rejected; the
  framework still needs a runtime pairing point for the Tool Call Router.

## Consequences

- ADR-0009 is amended: `handler` is no longer part of the Tool Declaration
  mandatory core.
- Tool implementation uses a registration shape that pairs descriptor and
  handler.
- Architecture guards for import discipline apply to registration handlers, not
  public descriptors.
- Descriptor-only workflows can run without loading handler dependencies.
- ADR-0017 keeps public `ToolCallOutput.toolName` owned by the Tool Call Router,
  not by registration handlers.
