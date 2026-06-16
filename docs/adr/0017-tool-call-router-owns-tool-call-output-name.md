# ADR-0017: Tool Call Router Owns ToolCallOutput.toolName

## Status

Accepted

## Context

The public `ToolCallOutput` shape includes `toolName` and `result`. Earlier
contract text let runtime handlers return `Result<ToolCallOutput>`, which made
`toolName` a duplicate fact: the Tool Call Router already knows which tool was
called, but the handler could accidentally return a different tool name.

This is not just a type neatness issue. A mismatched `toolName` would make
catalog, transport, telemetry, and agent follow-up logic disagree about which
tool produced the result.

## Decision

Registration handlers return only the payload constrained by the tool
descriptor's `outputSchema`.

The Tool Call Router wraps successful handler payloads into the public output:

```text
ToolCallOutput = {
  toolName: descriptor.name,
  result: payload
}
```

Handlers must not supply `toolName`. The current code method may still be named
`StageInterface.dispatch(...)`, but the domain concept is the Tool Call Router.

## Rejected Alternatives

- Let handlers return `ToolCallOutput` and add a runtime equality check:
  rejected; it preserves the duplicate fact and forces every handler to repeat
  data the router already owns.
- Remove `toolName` from public `ToolCallOutput`: rejected for now; host/agent
  consumers may still benefit from a compact echoed tool identity.

## Consequences

- `ToolHandler` implementation should evolve from `Result<ToolCallOutput>` to
  `Result<payload>`.
- The Tool Call Router owns public output wrapping and `toolName` echoing.
- Architecture or contract tests should fail handlers that construct public
  `ToolCallOutput` directly.
