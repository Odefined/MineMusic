import type { Ref } from "../../contracts/kernel.js";
import type { MusicTargetKind } from "../../contracts/stage_interface.js";
import type { CollectionKind } from "../collection_ref.js";
import type {
  CollectionReadPort,
  CollectionRecord,
} from "../collection_records.js";
import {
  createOwnerRelationPoolRef,
  type OwnerRelationEntryKind,
} from "../owner_material_relation_ref.js";
import type {
  OwnerRelationScopeMaterialKind,
  OwnerMaterialRelationReadPort,
} from "../owner_material_relation_records.js";
import type { SourceLibraryReadPort } from "../source_library_read_model.js";
import type { SourceLibraryRecord } from "../source_library_records.js";
import { collectionScopeId } from "./collection_scope.js";
import {
  opaqueScopeId,
  sourceLibraryKindScopeMetadata,
  sourceLibraryScopeId,
} from "./source_library_scope.js";

export type MusicDataPlatformSourceLibraryScopeAvailabilityRow = {
  id: string;
  ref: Ref;
  providerId: string;
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
};

export type MusicDataPlatformRelationScopeAvailabilityRow = {
  id: string;
  ref: Ref;
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
};

export type MusicDataPlatformCollectionScopeAvailabilityRow = {
  id: string;
  ref: Ref;
  collectionName: string;
  targetKind?: MusicTargetKind;
  detailText?: string;
};

export type MusicDataPlatformScopeAvailabilityRows = {
  sourceLibraries: readonly MusicDataPlatformSourceLibraryScopeAvailabilityRow[];
  relations: readonly MusicDataPlatformRelationScopeAvailabilityRow[];
  collections: readonly MusicDataPlatformCollectionScopeAvailabilityRow[];
};

export type MusicDataPlatformScopeAvailabilityRowProvider = {
  listAvailableMusicScopeRows(input: {
    ownerScope: string;
  }): Promise<MusicDataPlatformScopeAvailabilityRows>;
};

export type CreateMusicDataPlatformScopeAvailabilityRowProviderInput = {
  sourceLibraryRead: Pick<SourceLibraryReadPort, "listSourceLibraries">;
  ownerRelationRead: Pick<OwnerMaterialRelationReadPort, "listOwnerRelationScopeSummaries">;
  collectionRead: Pick<CollectionReadPort, "listCollections">;
};

export function createMusicDataPlatformScopeAvailabilityRowProvider(
  input: CreateMusicDataPlatformScopeAvailabilityRowProviderInput,
): MusicDataPlatformScopeAvailabilityRowProvider {
  return {
    async listAvailableMusicScopeRows(readInput) {
      const [sourceLibraries, relationSummaries, collections] = await Promise.all([
        input.sourceLibraryRead.listSourceLibraries({ ownerScope: readInput.ownerScope }),
        input.ownerRelationRead.listOwnerRelationScopeSummaries({ ownerScope: readInput.ownerScope }),
        input.collectionRead.listCollections({ ownerScope: readInput.ownerScope }),
      ]);

      return {
        sourceLibraries: sourceLibraries.map(sourceLibraryScopeAvailabilityRow),
        relations: relationSummaries.map((summary) => ({
          id: relationScopeId({
            ownerScope: summary.ownerScope,
            relationKind: summary.relationKind,
            materialKind: summary.materialKind,
          }),
          ref: createOwnerRelationPoolRef({
            ownerScope: summary.ownerScope,
            relationKind: summary.relationKind,
          }),
          relationName: relationNameForOwnerRelation(summary.relationKind),
          targetKind: summary.materialKind,
        })),
        collections: collections
          .filter((collection) => isCatalogVisibleCollectionKind(collection.collectionKind))
          .map(collectionScopeAvailabilityRow),
      };
    },
  };
}

function sourceLibraryScopeAvailabilityRow(
  record: SourceLibraryRecord,
): MusicDataPlatformSourceLibraryScopeAvailabilityRow {
  const metadata = sourceLibraryKindScopeMetadata(record.libraryKind);

  return {
    id: sourceLibraryScopeId(record.libraryRef),
    ref: record.libraryRef,
    providerId: record.providerId,
    relationName: metadata.relationName,
    targetKind: metadata.targetKind,
  };
}

function relationNameForOwnerRelation(kind: OwnerRelationEntryKind): string {
  switch (kind) {
    case "saved":
      return "saved";
    case "favorite":
      return "favorite";
  }
}

function relationScopeId(input: {
  ownerScope: string;
  relationKind: OwnerRelationEntryKind;
  materialKind: OwnerRelationScopeMaterialKind;
}): string {
  return opaqueScopeId(
    "relation",
    `${input.ownerScope}:${input.relationKind}:${input.materialKind}`,
  );
}

function collectionScopeAvailabilityRow(
  collection: CollectionRecord,
): MusicDataPlatformCollectionScopeAvailabilityRow {
  const targetKind = catalogTargetKindForCollection(collection.collectionKind);
  return {
    id: collectionScopeId(collection.collectionRefKey),
    ref: collection.collectionRef,
    collectionName: collection.name,
    ...(targetKind === undefined ? {} : { targetKind }),
  };
}

function catalogTargetKindForCollection(kind: CollectionKind): MusicTargetKind | undefined {
  if (kind === "recording" || kind === "album" || kind === "artist") {
    return kind;
  }
  return undefined;
}

function isCatalogVisibleCollectionKind(kind: CollectionKind): boolean {
  return catalogTargetKindForCollection(kind) !== undefined || kind === "mixed";
}
