import type { ProjectionInvalidationCommands, ProjectionMaintenanceInvalidationInput, ProjectionMaintenanceInvalidationResult, ProjectionSourceWrite, } from "../../../src/music_data_platform/projection_maintenance_commands.js";
export type RecordingProjectionInvalidationCommands = ProjectionInvalidationCommands & {
    readonly batches: readonly (readonly ProjectionSourceWrite[])[];
    clear(): void;
};
export function createRecordingProjectionInvalidationCommands(): RecordingProjectionInvalidationCommands {
    const batches: ProjectionSourceWrite[][] = [];
    return {
        get batches() {
            return batches;
        },
        clear() {
            batches.length = 0;
        },
        async markProjectionInvalidated(input: ProjectionMaintenanceInvalidationInput): Promise<ProjectionMaintenanceInvalidationResult> {
            batches.push([...input.writes]);
            return {
                writeCount: input.writes.length,
                targetCount: 0,
            };
        },
    };
}
