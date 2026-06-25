import type { ProjectionInvalidationCommands } from "./projection_maintenance_commands.js";
import { assertOwnerScope } from "./owner_scope.js";
import { assertLocalSourceRootId } from "./local_source_path.js";

// Phase 26 scan-membership projection signal (D22, D25). The durable scan item
// record write is owned by the advance command boundary via its repositories;
// this surface is the narrow vehicle by which the advance command records that a
// scan item's active visibility changed, so the owner_catalog_scan_root
// projection rebuilds for the affected root. Routing the invalidation through
// the source-of-truth write composite lets it accumulate into the same
// post-commit dirty-target sink as the identity/source-library/collection
// writes performed in the same transaction, so a single dispatcher flush covers
// the whole transaction.

export type LocalSourceScanWriteCommands = {
  // Record that a scan item for `rootId` underwent an active-visibility change
  // (newly active, or active -> drifted/unstable/failed/disappeared). Emits one
  // scan_item_written projection invalidation dirtying the root-scoped
  // owner_catalog_scan_root target. Callers must gate this on an actual
  // visibility transition (D25); re-observing an already-active unchanged item
  // is not a visibility change and must not call this.
  markScanItemWritten(input: {
    ownerScope: string;
    rootId: string;
  }): Promise<void>;
};

export type CreateLocalSourceScanWriteCommandsInput = {
  projectionInvalidationCommands: ProjectionInvalidationCommands;
};

export function createLocalSourceScanWriteCommands(
  input: CreateLocalSourceScanWriteCommandsInput,
): LocalSourceScanWriteCommands {
  return {
    async markScanItemWritten(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertLocalSourceRootId(commandInput.rootId);
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [
          {
            writeKind: "scan_item_written",
            ownerScope: commandInput.ownerScope,
            rootId: commandInput.rootId,
          },
        ],
      });
    },
  };
}
