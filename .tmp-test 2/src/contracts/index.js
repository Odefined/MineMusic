export function isRefComponentSafe(value) {
    return typeof value === "string" && value.length > 0 && !value.includes(":");
}
export function assertRefSafe(ref) {
    for (const [field, value] of [
        ["namespace", ref.namespace],
        ["kind", ref.kind],
        ["id", ref.id],
    ]) {
        if (!isRefComponentSafe(value)) {
            throw new Error(`Ref.${field} must be non-empty and must not contain ':'.`);
        }
    }
}
export function refKey(ref) {
    assertRefSafe(ref);
    return `${ref.namespace}:${ref.kind}:${ref.id}`;
}
