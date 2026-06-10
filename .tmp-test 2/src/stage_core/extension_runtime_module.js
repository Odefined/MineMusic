import { createExtensionRuntime, } from "../extension/index.js";
export function createExtensionRuntimeModule(input = {}) {
    const runtime = input.runtime ?? createExtensionRuntime({
        plugins: input.plugins ?? [],
    });
    return {
        descriptor: {
            id: "extension",
            ownerArea: "extension",
            label: "Extension",
        },
        async initialize() {
            const initialized = await runtime.initialize();
            if (!initialized.ok) {
                return initialized;
            }
            return {
                ok: true,
                value: {},
            };
        },
        stop() {
            return runtime.stop();
        },
    };
}
