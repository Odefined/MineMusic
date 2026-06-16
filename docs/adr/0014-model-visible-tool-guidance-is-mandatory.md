# ADR-0014: Model-Visible Tool Guidance Is Mandatory

## Status

Accepted

## Context

ADR-0009 made `description` and `examples` optional extensible dimensions so the
Tool Framework skeleton could grow without breaking early instances. The Stage
Interface Tool Frame review found that this is too weak for Public Agent
Protocol tools: model-visible guidance is the agent's primary selection and
non-selection signal, not decorative metadata.

If these fields stay optional, future tools can be schema-valid but agent-hostile:
the model may not know when to call them, when to avoid them, or what their
outputs mean.

## Decision

Every Public Agent Protocol / model-visible Stage Interface tool must declare:

```text
description
usage.useWhen
usage.doNotUseWhen
usage.outputSemantics
positive examples
negative examples
```

These fields are mandatory guidance contract fields, not optional extensible
metadata. Non-model-visible internal registry or test helpers may omit them only
if they are not advertised through Stage Interface.

This amends ADR-0009: `description` and `examples` move out of the optional
dimension family for public tools, and `usage` becomes the explicit place for
use-when, do-not-use, and output-semantics guidance.

## Rejected Alternatives

- Keep guidance optional and rely on a Handbook generator to fill defaults:
  rejected; generic defaults would hide poor tool contracts instead of forcing
  tool owners to define precise selection semantics.
- Require guidance only for Music Discovery: rejected; the drift risk applies to
  every future public tool domain.

## Consequences

- `ToolDescriptor` / Tool Declaration implementation must include mandatory
  public guidance fields for model-visible tools.
- Architecture tests must fail public tool declarations that omit
  `description`, `usage`, positive examples, or negative examples.
- Existing public tools such as `stage.runtime.status` need minimal but explicit
  guidance when the Tool Framework contract is implemented.
