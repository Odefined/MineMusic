import { refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";

type MaterialLifecycleRow = {
  ref_key: string;
  kind: MaterialEntityKind;
  lifecycle_status: string;
};

// Shared material lifecycle guard for owner-scoped write commands. Both
// collection_commands and owner_material_relation_commands admit an item only
// when its material_records row exists and is lifecycle-active. Returns the
// kind so the collection kind-mismatch check need not re-read. Throws
// music_data.material_not_found / music_data.material_not_writable on failure
// (expected failures at the command boundary).
export async function requireActiveMaterialRecord(
  db: MusicDatabaseTransactionContext,
  materialRef: Ref,
): Promise<{ kind: MaterialEntityKind }> {
  const row = await db.get<MaterialLifecycleRow>(
    `
      SELECT ref_key, kind, lifecycle_status
      FROM material_records
      WHERE ref_key = ?
    `,
    [refKey(materialRef)],
  );

  if (row === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.material_not_found",
      message: "Target material record was not found.",
    });
  }

  if (row.lifecycle_status !== "active") {
    throw new MusicDataPlatformError({
      code: "music_data.material_not_writable",
      message: "Target material record must be active.",
    });
  }

  return { kind: row.kind };
}
