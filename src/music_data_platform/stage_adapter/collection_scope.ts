import { createHash } from "node:crypto";

// Opaque, stable scope id for a Collection, derived from its collectionRefKey.
// Shared by the catalog scope-availability port (list_scopes) and the
// collection edit handler (post-edit state veiling), so the id an agent reads
// from library.catalog.list_scopes is the same id the edit tools echo back.
//
// Hashed (not the raw ref key) so it is opaque to the agent. collectionRefKey
// is unique per Collection (randomUUID-derived, D2), so it alone is a stable
// anchor — including for catalog-invisible (work/release) or soft-removed
// Collections, which is why the edit handler computes the id here rather than
// looking it up in the (active-only, catalog-visible-only) availability port.
export function collectionScopeId(collectionRefKey: string): string {
  return `collection_${createHash("sha256").update(collectionRefKey).digest("base64url").slice(0, 22)}`;
}
