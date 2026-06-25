import { refKey, type Ref } from "../contracts/kernel.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  createOwnerRelationPoolRef,
  type OwnerRelationEntryKind,
} from "./owner_material_relation_ref.js";
import { assertCollectionRef } from "./collection_ref.js";
import { parseStoredRef } from "./collection_records.js";
import { assertOwnerScope } from "./owner_scope.js";
import { assertSourceLibraryRef } from "./source_library_ref.js";
import { assertLocalSourceRootId } from "./local_source_path.js";

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

export type RebuildCollectionEntriesInput = {
  ownerScope: string;
  collectionRef: Ref;
};

export type ResolveCollectionRefsForMaterialInput = {
  ownerScope: string;
  materialRef: Ref;
};

export type CollectionEntryProjectionSummary = {
  collectionItemCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};

export type RebuildScanRootEntriesForRootInput = {
  ownerScope: string;
  rootId: string;
};

export type RebuildScanRootEntriesForMaterialInput = {
  ownerScope: string;
  materialRef: Ref;
};

export type ScanRootEntryProjectionSummary = {
  scanRootItemCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};

export type OwnerCatalogProjectionCommands = {
  rebuildSourceLibraryEntriesForLibrary(
    input: RebuildSourceLibraryEntriesForLibraryInput,
  ): Promise<SourceLibraryEntryProjectionSummary>;
  rebuildSourceLibraryEntriesForMaterial(
    input: RebuildSourceLibraryEntriesForMaterialInput,
  ): Promise<SourceLibraryEntryProjectionSummary>;
  rebuildOwnerRelationEntries(
    input: RebuildOwnerRelationEntriesInput,
  ): Promise<OwnerRelationEntryProjectionSummary>;
  rebuildCollectionEntries(
    input: RebuildCollectionEntriesInput,
  ): Promise<CollectionEntryProjectionSummary>;
  // Phase 26 (D22, D25): rebuild every active scan_root owner catalog entry for
  // one root (root-scoped) or one material across all roots (material-scoped).
  // Only active scan items joined to a current source-material binding and an
  // active Material project; drifted/unstable/failed items and disappeared
  // memberships are dropped by the obsolete-entry DELETE.
  rebuildScanRootEntriesForRoot(
    input: RebuildScanRootEntriesForRootInput,
  ): Promise<ScanRootEntryProjectionSummary>;
  rebuildScanRootEntriesForMaterial(
    input: RebuildScanRootEntriesForMaterialInput,
  ): Promise<ScanRootEntryProjectionSummary>;
  // Resolves the collection refs whose active membership currently includes a
  // material, so the material-scoped projection dispatch can rebuild each
  // owning collection (plan: the resolution belongs in the producer, keeping
  // materialScopedTargets a pure function of (ownerScope, materialRef)).
  resolveCollectionRefsForMaterial(
    input: ResolveCollectionRefsForMaterialInput,
  ): Promise<readonly Ref[]>;
};

type SourceLibraryScopeRow = {
  owner_scope: string;
};

const scanRootLastFileModifiedAtSql = `
              CASE
                WHEN MAX(i.observed_modified_at_ms) IS NULL THEN NULL
                ELSE to_char(
                  timezone('UTC', to_timestamp(MAX(i.observed_modified_at_ms) / 1000.0)),
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                )
              END
            `;

export function createOwnerCatalogProjectionCommands(
  input: CreateOwnerCatalogProjectionCommandsInput,
): OwnerCatalogProjectionCommands {
  return {
    async rebuildSourceLibraryEntriesForLibrary(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertSourceLibraryRef(commandInput.libraryRef);

      const libraryRefKey = refKey(commandInput.libraryRef);
      const libraryScope = await input.db.get<SourceLibraryScopeRow>(
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

      const sourceLibraryItemCount = await countSourceLibraryItems(input.db, libraryRefKey);
      const missingBindingCount = await countItemsWithoutBinding(input.db, libraryRefKey);

      if (missingBindingCount > 0) {
        throw new MusicDataPlatformError({
          code: "music_data.source_library_binding_missing",
          message: "Source library projection found items without a current source-material binding.",
        });
      }

      await input.db.run(
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
            'ome_' || md5(l.owner_scope || '|' || 'source_library' || '|' || l.library_ref_key || '|' || b.material_ref_key) AS entry_key,
            l.owner_scope,
            'source_library' AS entry_kind,
            l.library_ref_key AS entry_ref_key,
            b.material_ref_key,
            'positive' AS visibility_role,
            1 AS active,
            jsonb_build_object(
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

      const obsoleteEntryDeleteCount = await countObsoleteSourceLibraryEntries(
        input.db,
        commandInput.ownerScope,
        libraryRefKey,
      );

      await input.db.run(
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
        projectedEntryCount: await countProjectedEntries(
          input.db,
          commandInput.ownerScope,
          libraryRefKey,
        ),
        obsoleteEntryDeleteCount,
      };
    },
    async rebuildSourceLibraryEntriesForMaterial(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertMaterialRef(commandInput.materialRef);

      const materialRefKey = refKey(commandInput.materialRef);
      const sourceLibraryItemCount = await countCurrentSourceLibraryItemsForMaterial(
        input.db,
        commandInput.ownerScope,
        materialRefKey,
      );
      const obsoleteEntryDeleteCount = await countObsoleteSourceLibraryEntriesForMaterial(
        input.db,
        commandInput.ownerScope,
        materialRefKey,
      );

      await input.db.run(
        `
          DELETE FROM owner_material_entries
          WHERE owner_scope = ?
            AND entry_kind = 'source_library'
            AND material_ref_key = ?
        `,
        [commandInput.ownerScope, materialRefKey],
      );

      await input.db.run(
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
            'ome_' || md5(l.owner_scope || '|' || 'source_library' || '|' || l.library_ref_key || '|' || b.material_ref_key) AS entry_key,
            l.owner_scope,
            'source_library' AS entry_kind,
            l.library_ref_key AS entry_ref_key,
            b.material_ref_key,
            'positive' AS visibility_role,
            1 AS active,
            jsonb_build_object(
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
        projectedEntryCount: await countProjectedEntriesForMaterial(
          input.db,
          commandInput.ownerScope,
          "source_library",
          materialRefKey,
        ),
        obsoleteEntryDeleteCount,
      };
    },
    async rebuildOwnerRelationEntries(commandInput) {
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
      const relationFactCount = await countOwnerRelationFacts(
        input.db,
        commandInput.ownerScope,
        selectedRelationKinds,
        materialRefKey,
      );
      const obsoleteEntryDeleteCount = await countObsoleteOwnerRelationEntries(
        input.db,
        commandInput.ownerScope,
        selectedPoolRefKeys,
        selectedRelationKinds,
        materialRefKey,
      );

      await input.db.run(
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

      await input.db.run(
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
            'ome_' || md5(
              r.owner_scope || '|' || 'owner_relation' || '|' ||
              refKeyPool.owner_relation_pool_ref_key || '|' || r.material_ref_key
            ) AS entry_key,
            r.owner_scope,
            'owner_relation' AS entry_kind,
            refKeyPool.owner_relation_pool_ref_key AS entry_ref_key,
            r.material_ref_key,
            'positive' AS visibility_role,
            1 AS active,
            jsonb_build_object(
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
        projectedEntryCount: await countProjectedOwnerRelationEntries(
          input.db,
          commandInput.ownerScope,
          selectedPoolRefKeys,
          materialRefKey,
        ),
        obsoleteEntryDeleteCount,
      };
    },
    async rebuildCollectionEntries(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertCollectionRef(commandInput.collectionRef);
      const collectionRefKey = refKey(commandInput.collectionRef);

      const collectionScope = await input.db.get<{ owner_scope: string }>(
        `
          SELECT owner_scope
          FROM collections
          WHERE collection_ref_key = ?
        `,
        [collectionRefKey],
      );
      if (collectionScope === undefined) {
        throw new MusicDataPlatformError({
          code: "music_data.collection_not_found",
          message: "Cannot rebuild owner catalog entries for a missing collection.",
        });
      }
      if (collectionScope.owner_scope !== commandInput.ownerScope) {
        throw new MusicDataPlatformError({
          code: "music_data.collection_owner_scope_mismatch",
          message: "Collection owner scope did not match the rebuild request.",
        });
      }

      const collectionItemCount = await countActiveCollectionItems(input.db, collectionRefKey);

      // INSERT...SELECT: one owner_material_entries row per active member whose
      // material is lifecycle-active. Removed collections / removed members /
      // inactive materials are filtered out, so a rebuild after any of those
      // naturally drops the entry via the obsolete DELETE below.
      await input.db.run(
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
            'ome_' || md5(
              c.owner_scope || '|' || 'collection' || '|' ||
              c.collection_ref_key || '|' || i.material_ref_key
            ) AS entry_key,
            c.owner_scope,
            'collection' AS entry_kind,
            c.collection_ref_key AS entry_ref_key,
            i.material_ref_key,
            'positive' AS visibility_role,
            1 AS active,
            jsonb_build_object(
              'kind', 'collection',
              'collectionRefKey', c.collection_ref_key,
              'collectionName', c.name,
              'collectionKind', c.collection_kind,
              'lastCollectionUpdatedAt', MAX(i.updated_at)
            ) AS provenance_json,
            ? AS created_at,
            ? AS updated_at
          FROM collection_items i
          JOIN collections c
            ON c.collection_ref_key = i.collection_ref_key
          JOIN material_records m
            ON m.ref_key = i.material_ref_key
          WHERE c.collection_ref_key = ?
            AND c.owner_scope = ?
            AND c.status = 'active'
            AND i.status = 'active'
            AND m.lifecycle_status = 'active'
          GROUP BY c.owner_scope, c.collection_ref_key, i.material_ref_key, c.name, c.collection_kind
          ON CONFLICT(owner_scope, entry_kind, entry_ref_key, material_ref_key) DO UPDATE SET
            visibility_role = excluded.visibility_role,
            active = excluded.active,
            provenance_json = excluded.provenance_json,
            updated_at = excluded.updated_at
        `,
        [input.now, input.now, collectionRefKey, commandInput.ownerScope],
      );

      const obsoleteEntryDeleteCount = await countObsoleteCollectionEntries(
        input.db,
        commandInput.ownerScope,
        collectionRefKey,
      );

      await input.db.run(
        `
          DELETE FROM owner_material_entries
          WHERE owner_scope = ?
            AND entry_kind = 'collection'
            AND entry_ref_key = ?
            AND NOT EXISTS (
              SELECT 1
              FROM collection_items i
              JOIN collections c
                ON c.collection_ref_key = i.collection_ref_key
              JOIN material_records m
                ON m.ref_key = i.material_ref_key
              WHERE i.collection_ref_key = ?
                AND c.status = 'active'
                AND i.status = 'active'
                AND m.lifecycle_status = 'active'
                AND i.material_ref_key = owner_material_entries.material_ref_key
            )
        `,
        [commandInput.ownerScope, collectionRefKey, collectionRefKey],
      );

      return {
        collectionItemCount,
        projectedEntryCount: await countProjectedCollectionEntries(
          input.db,
          commandInput.ownerScope,
          collectionRefKey,
        ),
        obsoleteEntryDeleteCount,
      };
    },
    async resolveCollectionRefsForMaterial(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertMaterialRef(commandInput.materialRef);
      const rows = await input.db.all<{
        collection_ref_key: string;
        collection_ref_json: string;
      }>(
        `
          SELECT DISTINCT c.collection_ref_key, c.collection_ref_json
          FROM collections c
          JOIN collection_items i
            ON i.collection_ref_key = c.collection_ref_key
          WHERE c.owner_scope = ?
            AND c.status = 'active'
            AND i.status = 'active'
            AND i.material_ref_key = ?
        `,
        [commandInput.ownerScope, refKey(commandInput.materialRef)],
      );
      // parseStoredRef round-trips the stored JSON AND asserts the parsed ref
      // key matches the stored key — a malformed row throws and is recorded as
      // a failed rebuild target, matching collection_records' own read contract.
      return rows.map((row) => parseStoredRef(row.collection_ref_json, row.collection_ref_key));
    },
    async rebuildScanRootEntriesForRoot(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertLocalSourceRootId(commandInput.rootId);

      const scanRootItemCount = await countActiveScanRootItemsForRoot(
        input.db,
        commandInput.ownerScope,
        commandInput.rootId,
      );
      const obsoleteEntryDeleteCount = await countObsoleteScanRootEntriesForRoot(
        input.db,
        commandInput.ownerScope,
        commandInput.rootId,
      );

      // INSERT...SELECT: one owner_material_entries row per active scan item
      // (state='active') under the root, joined through its current binding to
      // an active Material. drifted/unstable/failed items and items whose
      // Material is inactive are filtered out, so a rebuild after any of those
      // naturally drops the entry via the obsolete DELETE below.
      await insertActiveScanRootEntries(input.db, {
        now: input.now,
        whereSql: SCAN_ROOT_BY_ROOT_WHERE_SQL,
        whereParams: [commandInput.rootId, commandInput.ownerScope],
      });

      await input.db.run(
        `
          DELETE FROM owner_material_entries
          WHERE owner_scope = ?
            AND entry_kind = 'scan_root'
            AND entry_ref_key = ?
            AND NOT EXISTS (
              SELECT 1
              FROM local_source_scan_items i
              JOIN source_material_bindings b
                ON b.source_ref_key = i.source_ref_key
              JOIN material_records m
                ON m.ref_key = b.material_ref_key
              WHERE i.root_id = ?
                AND i.state = 'active'
                AND m.lifecycle_status = 'active'
                AND b.material_ref_key = owner_material_entries.material_ref_key
            )
        `,
        [commandInput.ownerScope, commandInput.rootId, commandInput.rootId],
      );

      return {
        scanRootItemCount,
        projectedEntryCount: await countProjectedScanRootEntriesForRoot(
          input.db,
          commandInput.ownerScope,
          commandInput.rootId,
        ),
        obsoleteEntryDeleteCount,
      };
    },
    async rebuildScanRootEntriesForMaterial(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertMaterialRef(commandInput.materialRef);
      const materialRefKey = refKey(commandInput.materialRef);
      const scanRootItemCount = await countActiveScanRootItemsForMaterial(
        input.db,
        commandInput.ownerScope,
        materialRefKey,
      );
      const obsoleteEntryDeleteCount = await countObsoleteScanRootEntriesForMaterial(
        input.db,
        commandInput.ownerScope,
        materialRefKey,
      );

      // Material-scoped rebuild: drop every scan_root entry for this material
      // (across all roots) then re-insert for roots where the material is
      // currently active. A Material going inactive, or its binding moving away,
      // is reflected by the INSERT producing no row for that root.
      await input.db.run(
        `
          DELETE FROM owner_material_entries
          WHERE owner_scope = ?
            AND entry_kind = 'scan_root'
            AND material_ref_key = ?
        `,
        [commandInput.ownerScope, materialRefKey],
      );

      await insertActiveScanRootEntries(input.db, {
        now: input.now,
        whereSql: SCAN_ROOT_BY_MATERIAL_WHERE_SQL,
        whereParams: [commandInput.ownerScope, materialRefKey],
      });

      return {
        scanRootItemCount,
        projectedEntryCount: await countProjectedScanRootEntriesForMaterial(
          input.db,
          commandInput.ownerScope,
          materialRefKey,
        ),
        obsoleteEntryDeleteCount,
      };
    },
  };
}

async function countSourceLibraryItems(
  db: MusicDatabaseTransactionContext,
  libraryRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM source_library_items
      WHERE library_ref_key = ?
    `,
    [libraryRefKey],
  ))?.count ?? 0);
}

async function countItemsWithoutBinding(
  db: MusicDatabaseTransactionContext,
  libraryRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM source_library_items i
      LEFT JOIN source_material_bindings b
        ON b.source_ref_key = i.source_ref_key
      WHERE i.library_ref_key = ?
        AND b.source_ref_key IS NULL
    `,
    [libraryRefKey],
  ))?.count ?? 0);
}

async function countObsoleteSourceLibraryEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  libraryRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
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
  ))?.count ?? 0);
}

async function countProjectedEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  libraryRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
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
  ))?.count ?? 0);
}

async function countCurrentSourceLibraryItemsForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  materialRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
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
  ))?.count ?? 0);
}

async function countObsoleteSourceLibraryEntriesForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  materialRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
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
  ))?.count ?? 0);
}

async function countProjectedEntriesForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  entryKind: "source_library" | "owner_relation",
  materialRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
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
  ))?.count ?? 0);
}

async function countOwnerRelationFacts(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  relationKinds: readonly OwnerRelationEntryKind[],
  materialRefKey: string,
): Promise<number> {
  const placeholders = relationKinds.map(() => "?").join(", ");

  return Number((await db.get<{ count: number | string }>(
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
  ))?.count ?? 0);
}

async function countObsoleteOwnerRelationEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  selectedPoolRefKeys: readonly string[],
  selectedRelationKinds: readonly OwnerRelationEntryKind[],
  materialRefKey: string,
): Promise<number> {
  const poolRefKeyPlaceholders = selectedPoolRefKeys.map(() => "?").join(", ");
  const relationKindPlaceholders = selectedRelationKinds.map(() => "?").join(", ");

  return Number((await db.get<{ count: number | string }>(
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
  ))?.count ?? 0);
}

async function countProjectedOwnerRelationEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  selectedPoolRefKeys: readonly string[],
  materialRefKey: string,
): Promise<number> {
  const placeholders = selectedPoolRefKeys.map(() => "?").join(", ");

  return Number((await db.get<{ count: number | string }>(
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
  ))?.count ?? 0);
}

async function countActiveCollectionItems(
  db: MusicDatabaseTransactionContext,
  collectionRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM collection_items i
      JOIN material_records m
        ON m.ref_key = i.material_ref_key
      WHERE i.collection_ref_key = ?
        AND i.status = 'active'
        AND m.lifecycle_status = 'active'
    `,
    [collectionRefKey],
  ))?.count ?? 0);
}

async function countObsoleteCollectionEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  collectionRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'collection'
        AND entry_ref_key = ?
        AND NOT EXISTS (
          SELECT 1
          FROM collection_items i
          JOIN collections c
            ON c.collection_ref_key = i.collection_ref_key
          JOIN material_records m
            ON m.ref_key = i.material_ref_key
          WHERE i.collection_ref_key = ?
            AND c.status = 'active'
            AND i.status = 'active'
            AND m.lifecycle_status = 'active'
            AND i.material_ref_key = owner_material_entries.material_ref_key
        )
    `,
    [ownerScope, collectionRefKey, collectionRefKey],
  ))?.count ?? 0);
}

async function countProjectedCollectionEntries(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  collectionRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'collection'
        AND entry_ref_key = ?
        AND active = 1
        AND visibility_role = 'positive'
    `,
    [ownerScope, collectionRefKey],
  ))?.count ?? 0);
}

// Shared WHERE fragments for the two scan_root rebuild scopes: by root (under
// one root_id) and by material (across every root, for one material). Literal
// SQL constants, not user input, so interpolating them into the rebuild SQL is
// safe (same pattern as scanRootLastFileModifiedAtSql above).
const SCAN_ROOT_BY_ROOT_WHERE_SQL = "r.root_id = ? AND r.owner_scope = ?";
const SCAN_ROOT_BY_MATERIAL_WHERE_SQL = "r.owner_scope = ? AND b.material_ref_key = ?";

// Shared INSERT...SELECT that materializes one owner_material_entries row per
// active scan item bound to an active Material. The two rebuild scopes differ
// only in their WHERE filter; the column list, select body, joins, grouping,
// and ON CONFLICT update are identical and live here once.
async function insertActiveScanRootEntries(
  db: MusicDatabaseTransactionContext,
  args: { now: string; whereSql: string; whereParams: readonly string[] },
): Promise<void> {
  await db.run(
    `
      INSERT INTO owner_material_entries (
        entry_key, owner_scope, entry_kind, entry_ref_key, material_ref_key,
        visibility_role, active, provenance_json, created_at, updated_at
      )
      SELECT
        'ome_' || md5(
          r.owner_scope || '|' || 'scan_root' || '|' ||
          r.root_id || '|' || b.material_ref_key
        ) AS entry_key,
        r.owner_scope,
        'scan_root' AS entry_kind,
        r.root_id AS entry_ref_key,
        b.material_ref_key,
        'positive' AS visibility_role,
        1 AS active,
        jsonb_build_object(
          'kind', 'scan_root',
          'rootId', r.root_id,
          'label', r.label,
          'scanItemCount', COUNT(*),
          'firstSeenAt', MIN(i.first_seen_at),
          'lastObservedAt', MAX(i.last_observed_at),
          'lastFileModifiedAt', ${scanRootLastFileModifiedAtSql}
        ) AS provenance_json,
        ? AS created_at,
        ? AS updated_at
      FROM local_source_scan_items i
      JOIN local_source_scan_roots r
        ON r.root_id = i.root_id
      JOIN source_material_bindings b
        ON b.source_ref_key = i.source_ref_key
      JOIN material_records m
        ON m.ref_key = b.material_ref_key
      WHERE ${args.whereSql}
        AND i.state = 'active'
        AND m.lifecycle_status = 'active'
      GROUP BY r.owner_scope, r.root_id, r.label, b.material_ref_key
      ON CONFLICT(owner_scope, entry_kind, entry_ref_key, material_ref_key) DO UPDATE SET
        visibility_role = excluded.visibility_role,
        active = excluded.active,
        provenance_json = excluded.provenance_json,
        updated_at = excluded.updated_at
    `,
    [args.now, args.now, ...args.whereParams],
  );
}

async function countActiveScanRootItemsForRoot(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  rootId: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM local_source_scan_items i
      JOIN local_source_scan_roots r
        ON r.root_id = i.root_id
      JOIN source_material_bindings b
        ON b.source_ref_key = i.source_ref_key
      JOIN material_records m
        ON m.ref_key = b.material_ref_key
      WHERE r.root_id = ?
        AND r.owner_scope = ?
        AND i.state = 'active'
        AND m.lifecycle_status = 'active'
    `,
    [rootId, ownerScope],
  ))?.count ?? 0);
}

async function countObsoleteScanRootEntriesForRoot(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  rootId: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'scan_root'
        AND entry_ref_key = ?
        AND NOT EXISTS (
          SELECT 1
          FROM local_source_scan_items i
          JOIN source_material_bindings b
            ON b.source_ref_key = i.source_ref_key
          JOIN material_records m
            ON m.ref_key = b.material_ref_key
          WHERE i.root_id = ?
            AND i.state = 'active'
            AND m.lifecycle_status = 'active'
            AND b.material_ref_key = owner_material_entries.material_ref_key
        )
    `,
    [ownerScope, rootId, rootId],
  ))?.count ?? 0);
}

async function countProjectedScanRootEntriesForRoot(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  rootId: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'scan_root'
        AND entry_ref_key = ?
        AND active = 1
        AND visibility_role = 'positive'
    `,
    [ownerScope, rootId],
  ))?.count ?? 0);
}

async function countActiveScanRootItemsForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  materialRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM local_source_scan_items i
      JOIN local_source_scan_roots r
        ON r.root_id = i.root_id
      JOIN source_material_bindings b
        ON b.source_ref_key = i.source_ref_key
      JOIN material_records m
        ON m.ref_key = b.material_ref_key
      WHERE r.owner_scope = ?
        AND b.material_ref_key = ?
        AND i.state = 'active'
        AND m.lifecycle_status = 'active'
    `,
    [ownerScope, materialRefKey],
  ))?.count ?? 0);
}

async function countObsoleteScanRootEntriesForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  materialRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'scan_root'
        AND material_ref_key = ?
        AND NOT EXISTS (
          SELECT 1
          FROM local_source_scan_items i
          JOIN source_material_bindings b
            ON b.source_ref_key = i.source_ref_key
          JOIN material_records m
            ON m.ref_key = b.material_ref_key
          WHERE i.root_id = owner_material_entries.entry_ref_key
            AND i.state = 'active'
            AND m.lifecycle_status = 'active'
            AND b.material_ref_key = owner_material_entries.material_ref_key
        )
    `,
    [ownerScope, materialRefKey],
  ))?.count ?? 0);
}

async function countProjectedScanRootEntriesForMaterial(
  db: MusicDatabaseTransactionContext,
  ownerScope: string,
  materialRefKey: string,
): Promise<number> {
  return Number((await db.get<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM owner_material_entries
      WHERE owner_scope = ?
        AND entry_kind = 'scan_root'
        AND material_ref_key = ?
        AND active = 1
        AND visibility_role = 'positive'
    `,
    [ownerScope, materialRefKey],
  ))?.count ?? 0);
}
