import { refKey, type Ref } from "../contracts/kernel.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  createOwnerRelationPoolRef,
  type OwnerRelationEntryKind,
} from "./owner_material_relation_ref.js";
import { assertOwnerScope } from "./owner_scope.js";
import { assertSourceLibraryRef } from "./source_library_ref.js";

export type CreateOwnerCatalogProjectionCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
};

export type RebuildSourceLibraryEntriesForLibraryInput = {
  ownerScope: string;
  libraryRef: Ref;
};

export type RebuildSourceLibraryEntriesForMaterialInput = {
  ownerScope: string;
  materialRef: Ref;
};

export type RebuildOwnerRelationEntriesInput = {
  ownerScope: string;
  materialRef: Ref;
};

export type SourceLibraryEntryProjectionSummary = {
  sourceLibraryItemCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};

export type OwnerRelationEntryProjectionSummary = {
  relationFactCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};

export type OwnerCatalogProjectionCommands = {
  rebuildSourceLibraryEntriesForLibrary(
    input: RebuildSourceLibraryEntriesForLibraryInput,
  ): SourceLibraryEntryProjectionSummary;
  rebuildSourceLibraryEntriesForMaterial(
    input: RebuildSourceLibraryEntriesForMaterialInput,
  ): SourceLibraryEntryProjectionSummary;
  rebuildOwnerRelationEntries(
    input: RebuildOwnerRelationEntriesInput,
  ): OwnerRelationEntryProjectionSummary;
};

type SourceLibraryScopeRow = {
  owner_scope: string;
};

export function createOwnerCatalogProjectionCommands(
  input: CreateOwnerCatalogProjectionCommandsInput,
): OwnerCatalogProjectionCommands {
  return {
    rebuildSourceLibraryEntriesForLibrary(commandInput) {
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
              'lastProviderAddedAt', MAX(i.provider_added_at)
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
    rebuildSourceLibraryEntriesForMaterial(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertMaterialRef(commandInput.materialRef);

      const materialRefKey = refKey(commandInput.materialRef);
      const sourceLibraryItemCount = countCurrentSourceLibraryItemsForMaterial(
        input.db,
        commandInput.ownerScope,
        materialRefKey,
      );
      const obsoleteEntryDeleteCount = countObsoleteSourceLibraryEntriesForMaterial(
        input.db,
        commandInput.ownerScope,
        materialRefKey,
      );

      input.db.run(
        `
          DELETE FROM owner_material_entries
          WHERE owner_scope = ?
            AND entry_kind = 'source_library'
            AND material_ref_key = ?
        `,
        [commandInput.ownerScope, materialRefKey],
      );

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
              'lastProviderAddedAt', MAX(i.provider_added_at)
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
          WHERE l.owner_scope = ?
            AND b.material_ref_key = ?
            AND m.lifecycle_status = 'active'
          GROUP BY l.owner_scope, l.library_ref_key, b.material_ref_key
          ON CONFLICT(owner_scope, entry_kind, entry_ref_key, material_ref_key) DO UPDATE SET
            visibility_role = excluded.visibility_role,
            active = excluded.active,
            provenance_json = excluded.provenance_json,
            updated_at = excluded.updated_at
        `,
        [
          input.now,
          input.now,
          commandInput.ownerScope,
          materialRefKey,
        ],
      );

      return {
        sourceLibraryItemCount,
        projectedEntryCount: countProjectedEntriesForMaterial(
          input.db,
          commandInput.ownerScope,
          "source_library",
          materialRefKey,
        ),
        obsoleteEntryDeleteCount,
      };
    },
    rebuildOwnerRelationEntries(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertMaterialRef(commandInput.materialRef);
      const materialRefKey = refKey(commandInput.materialRef);
      const selectedRelationKinds = ["saved", "favorite"] satisfies readonly OwnerRelationEntryKind[];
      const selectedPoolRefKeys = selectedRelationKinds.map((relationKind) =>
        refKey(createOwnerRelationPoolRef({
          ownerScope: commandInput.ownerScope,
          relationKind,
        }))
      );
      const relationKindPlaceholders = selectedRelationKinds.map(() => "?").join(", ");
      const relationFactCount = countOwnerRelationFacts(
        input.db,
        commandInput.ownerScope,
        selectedRelationKinds,
        materialRefKey,
      );
      const obsoleteEntryDeleteCount = countObsoleteOwnerRelationEntries(
        input.db,
        commandInput.ownerScope,
        selectedPoolRefKeys,
        selectedRelationKinds,
        materialRefKey,
      );

      input.db.run(
        `
          DELETE FROM owner_material_entries
          WHERE entry_kind = 'owner_relation'
            AND owner_scope = ?
            AND material_ref_key = ?
        `,
        [
          commandInput.ownerScope,
          materialRefKey,
        ],
      );

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
              r.owner_scope || '|' || 'owner_relation' || '|' ||
              refKeyPool.owner_relation_pool_ref_key || '|' || r.material_ref_key
            )) AS entry_key,
            r.owner_scope,
            'owner_relation' AS entry_kind,
            refKeyPool.owner_relation_pool_ref_key AS entry_ref_key,
            r.material_ref_key,
            'positive' AS visibility_role,
            1 AS active,
            json_object(
              'kind', 'owner_relation',
              'relationKind', r.relation_kind,
              'ownerRelationPoolRefKey', refKeyPool.owner_relation_pool_ref_key,
              'relationFactCount', COUNT(*),
              'lastRelationUpdatedAt', MAX(r.updated_at)
            ) AS provenance_json,
            ? AS created_at,
            ? AS updated_at
          FROM owner_material_relations r
          JOIN material_records m
            ON m.ref_key = r.material_ref_key
          JOIN (
            SELECT ? AS relation_kind, ? AS owner_relation_pool_ref_key
            UNION ALL
            SELECT ?, ?
          ) AS refKeyPool
            ON refKeyPool.relation_kind = r.relation_kind
          WHERE r.owner_scope = ?
            AND r.status = 'active'
            AND r.relation_kind IN (${relationKindPlaceholders})
            AND r.material_ref_key = ?
            AND m.lifecycle_status = 'active'
          GROUP BY
            r.owner_scope,
            refKeyPool.owner_relation_pool_ref_key,
            r.material_ref_key,
            r.relation_kind
          ON CONFLICT(owner_scope, entry_kind, entry_ref_key, material_ref_key) DO UPDATE SET
            visibility_role = excluded.visibility_role,
            active = excluded.active,
            provenance_json = excluded.provenance_json,
            updated_at = excluded.updated_at
        `,
        [
          input.now,
          input.now,
          "saved",
          refKey(createOwnerRelationPoolRef({
            ownerScope: commandInput.ownerScope,
            relationKind: "saved",
          })),
          "favorite",
          refKey(createOwnerRelationPoolRef({
            ownerScope: commandInput.ownerScope,
            relationKind: "favorite",
          })),
          commandInput.ownerScope,
          ...selectedRelationKinds,
          materialRefKey,
        ],
      );

      return {
        relationFactCount,
        projectedEntryCount: countProjectedOwnerRelationEntries(
          input.db,
          commandInput.ownerScope,
          selectedPoolRefKeys,
          materialRefKey,
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

function countCurrentSourceLibraryItemsForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  materialRefKey: string,
): number {
  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM source_library_items i
      JOIN source_libraries l
        ON l.library_ref_key = i.library_ref_key
      JOIN source_material_bindings b
        ON b.source_ref_key = i.source_ref_key
      WHERE l.owner_scope = ?
        AND b.material_ref_key = ?
    `,
    [ownerScope, materialRefKey],
  )?.count ?? 0;
}

function countObsoleteSourceLibraryEntriesForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  materialRefKey: string,
): number {
  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'source_library'
        AND material_ref_key = ?
        AND NOT EXISTS (
          SELECT 1
          FROM source_library_items i
          JOIN source_libraries l
            ON l.library_ref_key = i.library_ref_key
          JOIN source_material_bindings b
            ON b.source_ref_key = i.source_ref_key
          JOIN material_records m
            ON m.ref_key = b.material_ref_key
          WHERE l.owner_scope = owner_material_entries.owner_scope
            AND l.library_ref_key = owner_material_entries.entry_ref_key
            AND b.material_ref_key = owner_material_entries.material_ref_key
            AND m.lifecycle_status = 'active'
        )
    `,
    [ownerScope, materialRefKey],
  )?.count ?? 0;
}

function countProjectedEntriesForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  entryKind: "source_library" | "owner_relation",
  materialRefKey: string,
): number {
  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = ?
        AND material_ref_key = ?
        AND active = 1
        AND visibility_role = 'positive'
    `,
    [ownerScope, entryKind, materialRefKey],
  )?.count ?? 0;
}

function countOwnerRelationFacts(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  relationKinds: readonly OwnerRelationEntryKind[],
  materialRefKey: string,
): number {
  const placeholders = relationKinds.map(() => "?").join(", ");

  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_relations
      WHERE owner_scope = ?
        AND status = 'active'
        AND relation_kind IN (${placeholders})
        AND material_ref_key = ?
    `,
    [
      ownerScope,
      ...relationKinds,
      materialRefKey,
    ],
  )?.count ?? 0;
}

function countObsoleteOwnerRelationEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  selectedPoolRefKeys: readonly string[],
  selectedRelationKinds: readonly OwnerRelationEntryKind[],
  materialRefKey: string,
): number {
  const poolRefKeyPlaceholders = selectedPoolRefKeys.map(() => "?").join(", ");
  const relationKindPlaceholders = selectedRelationKinds.map(() => "?").join(", ");

  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE entry_kind = 'owner_relation'
        AND owner_scope = ?
        AND entry_ref_key IN (${poolRefKeyPlaceholders})
        AND material_ref_key = ?
        AND NOT EXISTS (
          SELECT 1
          FROM owner_material_relations r
          JOIN material_records m
            ON m.ref_key = r.material_ref_key
          WHERE r.owner_scope = owner_material_entries.owner_scope
            AND r.material_ref_key = owner_material_entries.material_ref_key
            AND r.status = 'active'
            AND r.relation_kind IN (${relationKindPlaceholders})
            AND owner_material_entries.entry_ref_key = CASE r.relation_kind
              WHEN 'saved' THEN ?
              WHEN 'favorite' THEN ?
            END
            AND m.lifecycle_status = 'active'
        )
    `,
    [
      ownerScope,
      ...selectedPoolRefKeys,
      materialRefKey,
      ...selectedRelationKinds,
      refKey(createOwnerRelationPoolRef({
        ownerScope,
        relationKind: "saved",
      })),
      refKey(createOwnerRelationPoolRef({
        ownerScope,
        relationKind: "favorite",
      })),
    ],
  )?.count ?? 0;
}

function countProjectedOwnerRelationEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  selectedPoolRefKeys: readonly string[],
  materialRefKey: string,
): number {
  const placeholders = selectedPoolRefKeys.map(() => "?").join(", ");

  return db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'owner_relation'
        AND entry_ref_key IN (${placeholders})
        AND active = 1
        AND visibility_role = 'positive'
        AND material_ref_key = ?
    `,
    [
      ownerScope,
      ...selectedPoolRefKeys,
      materialRefKey,
    ],
  )?.count ?? 0;
}
