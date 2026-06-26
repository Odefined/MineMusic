// Shared kernel — genuinely cross-cutting primitives consumed by every formal
// area. This file is a strict leaf: it imports NO other contracts file. The
// contracts DAG guard (test/formal/active-tree.test.ts) and the kernel-leak
// guard enforce that it never gains an area-specific type or value.

export type Result<T> =
  | { ok: true; value: T; warnings?: readonly StageWarning[] }
  | { ok: false; error: StageError };

export type StageError = {
  code: string;
  message: string;
  area: FormalArea;
  retryable: boolean;
  suggestedFix?: string;
  cause?: unknown;
};

export type StageWarning = {
  code: string;
  message: string;
  area: FormalArea;
};

export type FormalArea =
  | "server_host"
  | "stage_interface"
  | "stage_core"
  | "agent_runtime"
  | "extension"
  | "music_data_platform"
  | "music_intelligence"
  | "music_experience"
  | "memory"
  | "effect_boundary";

export type Ref = {
  namespace: string;
  kind: string;
  id: string;
  label?: string;
};

export function isRefComponentSafe(value: unknown): value is string {
  // Every ref component feeds ONE canonical `namespace:kind:id` key, whose
  // round-trip integrity (refKey <-> split(":") into exactly 3 parts) depends
  // on no component carrying leading/trailing whitespace: a padded id round-trips
  // to 3 parts but is a DIFFERENT key than the trimmed value, silently breaking
  // identity-equality dedup. This single shared invariant is owned here so every
  // layer (Extension adapter, Music Data Platform, Music Intelligence) inherits it.
  return typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes(":");
}

export function assertRefSafe(ref: Pick<Ref, "namespace" | "kind" | "id">): void {
  for (const [field, value] of [
    ["namespace", ref.namespace],
    ["kind", ref.kind],
    ["id", ref.id],
  ] as const) {
    if (!isRefComponentSafe(value)) {
      throw new Error(`Ref.${field} must be non-empty, whitespace-trimmed, and must not contain ':'.`);
    }
  }
}

export function refKey(ref: Pick<Ref, "namespace" | "kind" | "id">): string {
  assertRefSafe(ref);
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

// Inverse of refKey: parse a `namespace:kind:id` key back into a Ref. Returns
// undefined when the key is not exactly three safe components, so callers can
// map that to their own failure channel (throw for invariant misuse, Result
// for expected failure). Owned here so the round-trip invariant lives in one
// place instead of being re-split at every read site.
export function parseRefKey(key: string): Ref | undefined {
  const parts = key.split(":");
  if (parts.length !== 3) {
    return undefined;
  }
  const [namespace, kind, id] = parts;
  if (
    !isRefComponentSafe(namespace) ||
    !isRefComponentSafe(kind) ||
    !isRefComponentSafe(id)
  ) {
    return undefined;
  }
  return { namespace, kind, id };
}
