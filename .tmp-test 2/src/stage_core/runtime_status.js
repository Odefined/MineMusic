export function createRuntimeStatusModule({ readSnapshot, }) {
    return {
        descriptor: {
            id: "runtime-status",
            ownerArea: "stage_core",
            label: "Runtime Status",
        },
        async initialize() {
            return {
                ok: true,
                value: {
                    instruments: [
                        {
                            id: "stage.runtime",
                            label: "Runtime",
                            ownerArea: "stage_core",
                        },
                    ],
                    tools: [
                        {
                            name: "stage.runtime.status",
                            instrumentId: "stage.runtime",
                            label: "Runtime Status",
                            ownerArea: "stage_core",
                            outputPolicy: "compact_public",
                        },
                    ],
                    handlers: {
                        "stage.runtime.status": async (input) => ({
                            ok: true,
                            value: {
                                toolName: input.toolName,
                                result: toRuntimeStatusToolOutput(readSnapshot()),
                            },
                        }),
                    },
                },
            };
        },
    };
}
export function toRuntimeStatusToolOutput(snapshot) {
    return {
        status: snapshot.status,
        modules: snapshot.modules.map(({ id, ownerArea, status }) => ({
            id,
            ownerArea,
            status,
        })),
        interface: {
            instrumentCount: snapshot.interfaceContract.instruments.length,
            toolCount: snapshot.interfaceContract.tools.length,
        },
        ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
        ...(snapshot.cleanupErrors === undefined || snapshot.cleanupErrors.length === 0
            ? {}
            : { cleanupErrorCount: snapshot.cleanupErrors.length }),
    };
}
