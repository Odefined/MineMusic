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
  return typeof value === "string" && value.length > 0 && !value.includes(":");
}

export function assertRefSafe(ref: Pick<Ref, "namespace" | "kind" | "id">): void {
  for (const [field, value] of [
    ["namespace", ref.namespace],
    ["kind", ref.kind],
    ["id", ref.id],
  ] as const) {
    if (!isRefComponentSafe(value)) {
      throw new Error(`Ref.${field} must be non-empty and must not contain ':'.`);
    }
  }
}

export function refKey(ref: Pick<Ref, "namespace" | "kind" | "id">): string {
  assertRefSafe(ref);
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}
