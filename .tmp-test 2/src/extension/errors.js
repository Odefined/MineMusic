export function extensionError(code, message, cause, retryable = false) {
    return {
        code,
        message,
        area: "extension",
        retryable,
        ...(cause === undefined ? {} : { cause }),
    };
}
export function failExtension(code, message, cause, retryable = false) {
    return {
        ok: false,
        error: extensionError(code, message, cause, retryable),
    };
}
export function ok(value) {
    return { ok: true, value };
}
