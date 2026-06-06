# ADR-0006: Formal Identity, Candidate, And Handle Boundaries

## Status

Accepted

## Context

MVP material flows mixed provider candidates, temporary material handles,
durable material identity, public card presentation, and provider/source facts.
This made it hard to tell what the agent saw, what was only ranking evidence,
and what had actually entered MineMusic durable state.

Formal v1 needs a strict split between source facts, material identity,
canonical identity, storage records, provider candidates, query results, and
final presentation output.

## Decision

Formal v1 splits entities from storage records:

- `SourceEntity` / `SourceRecord`;
- `MaterialEntity` / `MaterialRecord`;
- `CanonicalEntity` / `CanonicalRecord`.

`SourceEntity.kind` uses `track | album | artist`.
`MaterialEntity.kind` and `CanonicalEntity.kind` use
`recording | album | artist | work | release`.

`Ref = { namespace, kind, id, label? }` is the canonical reference shape.
`refKey(ref)` is the one public string helper. `namespace`, `kind`, and `id`
must not contain `:`.

Formal v1 deletes public `mat:` / `emat:` handle codecs, Ephemeral Material,
and active `MusicMaterial` / `SourceMaterial` vocabulary.

Provider search produces provider candidates backed by normalized source
facts:

```ts
type ProviderMaterialCandidate = {
  sourceEntity: SourceEntity;
  providerScore?: number;
};
```

Provider candidates may participate in request/session-scoped ranking without
becoming durable material records. Provider adapter output is evidence/source
facts by itself, not durable MineMusic state.

Durable materialization occurs only at explicit commit boundaries such as save,
present commit, feedback, add-to-collection, or another accepted write command.

`PlayableLink` is source-owned and shaped as
`{ url, label?, requiresAccount? }`. It does not carry `sourceRef` or
`expiresAt`. `MaterialEntity` does not own playable links, public display
links, availability, query score, basis/provenance, provider raw payload,
owner scope, collection membership, aliases, notes, or presentation seed
fields.

`MaterialCard` is final Stage Interface presentation output only. Query
hits/results are agent decision evidence and are not final cards.

## Rejected Alternatives

- Preserve Material Resolve as a formal public/domain surface: rejected because
  formal query and presentation responsibilities must be split.
- Preserve Ephemeral Material or `emat` as material identity: rejected because
  provider candidates are not material entities.
- Keep public `mat:` / `emat:` codecs: rejected because public handle policy
  should be based on `Ref` and `refKey(ref)`.
- Put links and availability directly on `MaterialEntity`: rejected because
  links are source-owned and availability is computed/projection state.
- Durable-materialize provider search results by default: rejected because
  search evidence is not a command to create MineMusic identity.

## Consequences

- Formal contract work must delete old MVP material vocabulary instead of
  aliasing it.
- Query paths require explicit writer/materializer boundaries before they can
  create durable state.
- Provider integrations must return normalized source facts/candidates, not
  `MaterialEntity` or final card output.
- The exact public query hit shape and final `MaterialCard` key set remain
  later-phase decisions.
