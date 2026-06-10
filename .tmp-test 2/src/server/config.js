import { createExtensionRuntime, } from "../extension/index.js";
import { createNcmPlugin } from "../extension/plugins/index.js";
export function mineMusicDatabaseFilename(config = {}) {
    return config.database?.filename ?? ":memory:";
}
export function createMineMusicExtensionRuntime(config = {}) {
    return createExtensionRuntime({
        plugins: [
            createNcmPlugin(config.plugins?.["minemusic.ncm"]),
        ],
    });
}
