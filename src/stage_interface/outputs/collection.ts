import type {
  Collection,
  CollectionItem,
} from "../../contracts/index.js";
import { materialRefToMaterialId } from "../../material/projection/index.js";

export type CompactCollectionItemOutput = {
  itemId: string;
  collectionId: string;
  materialId: string;
};

export type CompactCollectionListItemOutput = CompactCollectionItemOutput & {
  label: string;
};

export type CompactCollectionOutput = {
  collectionId: string;
  label: string;
};

export type CompactCollectionListOutput = {
  collections: CompactCollectionOutput[];
  items: CompactCollectionListItemOutput[];
};

export function compactCollectionItemOutput(item: CollectionItem): CompactCollectionItemOutput {
  return {
    itemId: item.id,
    collectionId: item.collectionId,
    materialId: materialRefToMaterialId(item.materialRef),
  };
}

export function compactCollectionListItemOutput(item: CollectionItem): CompactCollectionListItemOutput {
  return {
    ...compactCollectionItemOutput(item),
    label: item.label,
  };
}

export function compactCollectionOutput(collection: Collection): CompactCollectionOutput {
  return {
    collectionId: collection.id,
    label: collection.label,
  };
}

export function compactCollectionListOutput({
  collections,
  items,
}: {
  collections: Collection[];
  items: CollectionItem[];
}): CompactCollectionListOutput {
  return {
    collections: collections.map(compactCollectionOutput),
    items: items.map(compactCollectionListItemOutput),
  };
}
