import type { CanonicalRecord, Ref } from "../contracts/index.js";

export function normalizeCanonicalLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

export function isCurrentCanonicalRecord(record: CanonicalRecord): boolean {
  return record.status === "active" || record.status === "provisional";
}

export function matchesCanonicalRecordLabel(
  record: CanonicalRecord,
  normalizedLabel: string,
): boolean {
  return (
    normalizeCanonicalLabel(record.label) === normalizedLabel ||
    (record.aliases ?? []).some((alias) => normalizeCanonicalLabel(alias) === normalizedLabel)
  );
}

export function matchesCanonicalKind(record: CanonicalRecord, kind: string): boolean {
  return record.kind === kind || record.ref.kind === kind;
}
