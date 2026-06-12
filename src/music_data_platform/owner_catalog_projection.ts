import { refKey, type Ref } from "../contracts/index.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertOwnerScope } from "./owner_scope.js";
import { assertSourceLibraryRef } from "./source_library_ref.js";

export type CreateOwnerCatalogProjectionCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
};

export type RebuildSourceLibraryEntriesInput = {
  ownerScope: string;
  libraryRef: Ref;
};

export type OwnerCatalogProjectionSummary = {
  sourceLibraryItemCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};

export type OwnerCatalogProjectionCommands = {
  rebuildSourceLibraryEntries(
    input: RebuildSourceLibraryEntriesInput,
  ): OwnerCatalogProjectionSummary;
};

type SourceLibraryScopeRow = {
  owner_scope: string;
};

export function createOwnerCatalogProjectionCommands(
  input: CreateOwnerCatalogProjectionCommandsInput,
): OwnerCatalogProjectionCommands {
  return {
    rebuildSourceLibraryEntries(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertSourceLibraryRef(commandInput.libraryRef);

      const libraryRefKey = refKey(commandInput.libraryRef);
      const libraryScope = input.db.get<SourceLibraryScopeRow>(
        `
          SELECT owner_scope
          FROM source_libraries
          WHERE library_ref_key = ?
        `,
        [libraryRefKey],
      );

      if (libraryScope === undefined) {
        throw new MusicDataPlatformError({
          code: "music_data.source_library_not_found",
          message: "Cannot rebuild owner catalog entries for a missing source library.",
        });
      }

      if (libraryScope.owner_scope !== commandInput.ownerScope) {
        throw new MusicDataPlatformError({
          code: "music_data.source_library_owner_scope_mismatch",
          message: "Source library owner scope did not match the rebuild request.",
        });
      }

      const sourceLibraryItemCount = countSourceLibraryItems(input.db, libraryRefKey);
      const missingBindingCount = countItemsWithoutBinding(input.db, libraryRefKey);

      if (missingBindingCount > 0) {
        throw new MusicDataPlatformError({
          code: "music_data.source_library_binding_missing",
          message: "Source library projection found items without a current source-material binding.",
        });
      }

      input.db.run(
        `
          INSERT INTO owner_material_entries (
            entry_key,
            owner_scope,
            entry_kind,
            entry_ref_key,
            material_ref_key,
            visibility_role,
            active,
            provenance_json,
            created_at,
            updated_at
          )
          SELECT
            'ome_' || lower(hex(
              l.owner_scope || '|' || 'source_library' || '|' || l.library_ref_key || '|' || b.material_ref_key
            )) AS entry_key,
            l.owner_scope,
            'source_library' AS entry_kind,
            l.library_ref_key AS entry_ref_key,
            b.material_ref_key,
            'positive' AS visibility_role,
            1 AS active,
            json_object(
              'kind', 'source_library',
              'libraryRefKey', l.library_ref_key,
              'sourceItemCount', COUNT(*),
              'firstAddedAt', MIN(i.added_at),
              'lastAddedAt', MAX(i.added_at),
              'firstProviderAddedAt', MIN(i.provider_added_at),
              'lastProviderAddedAt', MAX(i.provider_added_at),
              'lastSeenAt', MAX(i.last_seen_at)
            ) AS provenance_json,
            ? AS created_at,
            ? AS updated_at
          FROM source_library_items i
          JOIN source_libraries l
            ON l.library_ref_key = i.library_ref_key
          JOIN source_material_bindings b
            ON b.source_ref_key = i.source_ref_key
          JOIN material_records m
            ON m.ref_key = b.material_ref_key
          WHERE i.library_ref_key = ?
            AND m.lifecycle_status = 'active'
          GROUP BY l.owner_scope, l.library_ref_key, b.material_ref_key
          ON CONFLICT(owner_scope, entry_kind, entry_ref_key, material_ref_key) DO UPDATE SET
            visibility_role = excluded.visibility_role,
            active = excluded.active,
            provenance_json = excluded.provenance_json,
            updated_at = excluded.updated_at
        `,
        [input.now, input.now, libraryRefKey],
      );

      const obsoleteEntryDeleteCount = countObsoleteSourceLibraryEntries(
        input.db,
        commandInput.ownerScope,
        libraryRefKey,
      );

      input.db.run(
        `
          DELETE FROM owner_material_entries
          WHERE owner_scope = ?
            AND entry_kind = 'source_library'
            AND entry_ref_key = ?
            AND NOT EXISTS (
              SELECT 1
              FROM source_library_items i
              JOIN source_material_bindings b
                ON b.source_ref_key = i.source_ref_key
              JOIN material_records m
                ON m.ref_key = b.material_ref_key
              WHERE i.library_ref_key = ?
                AND m.lifecycle_status = 'active'
                AND b.material_ref_key = owner_material_entries.material_ref_key
            )
        `,
        [commandInput.ownerScope, libraryRefKey, libraryRefKey],
      );

      return {
        sourceLibraryItemCount,
        projectedEntryCount: countProjectedEntries(
          input.db,
          commandInput.ownerScope,
          libraryRefKey,
        ),
        obsoleteEntryDeleteCount,
      };
    },
  };
}

function countSourceLibraryItems(
  db: MusicDatabaseTransactionContext,
  libraryRefKey: string,
): number {
  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM source_library_items
      WHERE library_ref_key = ?
    `,
    [libraryRefKey],
  )?.count ?? 0;
}

function countItemsWithoutBinding(
  db: MusicDatabaseTransactionContext,
  libraryRefKey: string,
): number {
  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM source_library_items i
      LEFT JOIN source_material_bindings b
        ON b.source_ref_key = i.source_ref_key
      WHERE i.library_ref_key = ?
        AND b.source_ref_key IS NULL
    `,
    [libraryRefKey],
  )?.count ?? 0;
}

function countObsoleteSourceLibraryEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  libraryRefKey: string,
): number {
  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'source_library'
        AND entry_ref_key = ?
        AND NOT EXISTS (
          SELECT 1
          FROM source_library_items i
          JOIN source_material_bindings b
            ON b.source_ref_key = i.source_ref_key
          JOIN material_records m
            ON m.ref_key = b.material_ref_key
          WHERE i.library_ref_key = ?
            AND m.lifecycle_status = 'active'
            AND b.material_ref_key = owner_material_entries.material_ref_key
        )
    `,
    [ownerScope, libraryRefKey, libraryRefKey],
  )?.count ?? 0;
}

function countProjectedEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  libraryRefKey: string,
): number {
  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'source_library'
        AND entry_ref_key = ?
        AND active = 1
        AND visibility_role = 'positive'
    `,
    [ownerScope, libraryRefKey],
  )?.count ?? 0;
}
