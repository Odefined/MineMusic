# ADR-0020: Declared Error Vocabulary and Fail-Whole Recovery

## Status

Accepted

## Context

The Stage Interface Tool Frame defined the runtime `StageError` shape but left
the public error vocabulary implicit: only two codes (`result_window_expired`,
`candidate_expired`) were named, every other failure was an ad-hoc handler
emission, and nothing declared which codes a tool may produce or how the agent
should recover from each. ADR-0014 made selection guidance (`description`,
`usage`, `examples`) mandatory so the agent's selection contract is explicit;
the recovery contract had no equivalent, so the agent could not recover
mechanically and internal domain codes (for example `MusicIntelligenceError` /
`MusicDataPlatformError` codes) could leak through the Public Agent Protocol.

Separately, for a multi-scope or `all` lookup where library scopes succeed but a
provider scope fails, the frame said failures "must not be silently downgraded
to partial results," leaving two readings: pure fail-whole, or
degraded-but-warned success on the `warnings` channel.

## Decision

1. **Declared error vocabulary.** Every model-visible tool declares its public
   `errors` set as part of the mandatory core, parallel to `inputSchema`:

   ```text
   { code, retryable, suggestedFixTemplate }
   ```

   The contributing handler maps internal domain failures to these DECLARED
   public codes and must never emit an internal code through the Public Agent
   Protocol. An architecture test fails any handler that returns a
   `StageError.code` not present in its tool's declared `errors` set — the
   error-side counterpart of the Public Handle Veil. Declared codes feed the
   Handbook and eval fixtures the way `examples` feed selection guidance.

2. **Fail-whole for multi-scope / `all` lookup.** A provider-scope failure fails
   the WHOLE query with a recoverable error; results are never degraded to
   partial or library-only, and the `warnings` channel never carries a
   degraded-success. Because the call fails whole, that recoverable error's
   `message` / `suggestedFix` MUST name the failed scope(s) so the agent can
   retry with the surviving narrower scope set. `warnings` carries only
   non-fatal metadata such as catalog-side staleness.

## Rejected Alternatives

- **Degraded-but-warned success** (return surviving-scope results plus a warning
  naming the failed provider scope): rejected; the internal Retrieval layer
  already fails whole (Phase 15D), so this would force the public handler to
  re-issue a narrowed query or run per-scope queries up front, and a partial
  result-set complicates cursor/result-set identity.
- **Runtime-only errors, no declaration** (status quo): rejected; the recovery
  contract is implicit, cannot be Handbook-generated or eval-covered, and
  internal codes can leak.
- **One coarse code plus free-text `suggestedFix` only**: not adopted as the
  whole answer; the frame keeps a modest set of codes (one per recovery class)
  WITH `suggestedFix` carrying specifics, so both the host and the model can
  react.
- **Auto-rerun on expiry**: rejected; rerunning is a provider call plus a runtime
  write, so expiry and scope failure guide the agent to a fresh first-page lookup
  instead.

## Consequences

- The Tool Declaration mandatory core gains a declared `errors` dimension; the
  validation pipeline gains an architecture test that handlers emit only declared
  codes.
- Handlers own the internal-to-public error mapping; Stage Interface owns the
  `StageError` shape and the public error mapping contract.
- In v1 a single connected-provider outage can fail an `all` lookup and discard
  the library hits the agent earned; this is accepted because the named-scope
  recoverable error lets the agent retry immediately with `library` plus
  surviving scopes, and the result-set model stays clean.
- Extends ADR-0014's "guidance is mandatory" principle from selection to
  recovery, and composes with ADR-0019 (the error-side veil).
