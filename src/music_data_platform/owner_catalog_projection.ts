import { refKey, type Ref } from "../contracts/kernel.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  createOwnerRelationPoolRef,
  type OwnerRelationEntryKind,
} from "./owner_material_relation_ref.js";
import { assertCollectionRef } from "./collection_ref.js";
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
            )::text AS provenance_json,
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
            )::text AS provenance_json,
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
            )::text AS provenance_json,
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
            )::text AS provenance_json,
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
      const rows = await input.db.all<{ collection_ref_json: string }>(
        `
          SELECT DISTINCT c.collection_ref_json
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
      return rows.map((row) => {
        const parsed = JSON.parse(row.collection_ref_json) as Ref;
        assertCollectionRef(parsed);
        return parsed;
      });
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
