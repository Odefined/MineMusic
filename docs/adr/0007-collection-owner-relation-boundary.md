# ADR-0007: Collection And Owner Relation Boundary

## Status

Accepted

## Context

The MVP used collections and material relations in ways that could blur user
organization, factual owner relationship, and read-model projection. Formal v1
needs a clean split so saved/favorite/blocked/wrong-version facts are not
hidden inside collection membership, and `MaterialEntity` stays owner-neutral.

## Decision

`Collection` is a user-named organizing container for material refs, ordering,
grouping, description, and collection-local notes.

Saved, favorite, blocked, wrong-version, not-playable, bad-match, liked,
disliked, and preference-like facts belong to owner-scoped relation fact
families, not system collections.

Formal target vocabulary uses `owner_material_relations` for owner-scoped
relation facts.

Owner catalog entries/views are projections/read models. Commands write fact
tables and maintain projections; they do not treat projections as independent
source-of-truth.

`MaterialEntity` remains owner-neutral. It does not carry `ownerScope`,
collection ids, saved/favorite/blocked state, owner policy, or collection
membership.

## Rejected Alternatives

- Treat saved/favorite/blocked as system collections: rejected because it hides
  factual owner relations behind organizing containers.
- Add owner state to `MaterialEntity`: rejected because material identity must
  stay owner-neutral.
- Promote owner catalog projections to command source-of-truth: rejected
  because projections are read models derived from fact writes.
- Create a separate top-level Owner Context: rejected because owner-scoped
  facts are part of Music Data Platform in formal v1.

## Consequences

- Collection commands and owner relation commands must remain distinct.
- Formal Music Data Platform design must model owner-scoped fact families and
  projections explicitly.
- Memory may summarize or generalize owner facts as relationship/taste memory,
  but it does not replace owner relation facts as source-of-truth.
