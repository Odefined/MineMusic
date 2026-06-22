import { randomUUID } from "node:crypto";

import type { Ref } from "../contracts/kernel.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMusicDataPlatformRefSafe } from "./ref_validation.js";
import type { CollectionKind } from "../contracts/music_data_platform.js";

// `collection_kind` admits any single material kind or `mixed` (D3). The
// CollectionKind union is owned by contracts/music_data_platform.ts (shared
// with the Stage Interface); re-exported here for the collection writer.
export type { CollectionKind };

export type CollectionStatus =
  | "active"
  | "removed"
  | "archived";

export type CollectionItemStatus =
  | "active"
  | "removed";

export type CreateCollectionRefInput = {
  collectionKind: CollectionKind;
};

export function createCollectionRef(
  input: CreateCollectionRefInput,
): Ref {
  assertCollectionKind(input.collectionKind);

  const collectionRef = {
    namespace: "collection",
    kind: input.collectionKind,
    // Non-deterministic: a Collection has no stable business natural key to
    // digest (name is mutable, and mixed-kind means there is no single material
    // kind to key on), so the id is a fresh randomUUID following the
    // material_ref pattern (material_ref_factory.ts:35). Contrast with
    // owner_material_relation_ref, which is deterministic on
    // (ownerScope, materialRefKey, relationKind).
    id: `c_${randomUUID().replaceAll("-", "")}`,
  } satisfies Ref;

  assertMusicDataPlatformRefSafe({
    ref: collectionRef,
    fieldName: "collectionRef",
    code: "music_data.collection_ref_invalid",
  });
  return collectionRef;
}

export function assertCollectionRef(ref: Ref): void {
  assertMusicDataPlatformRefSafe({
    ref,
    fieldName: "collectionRef",
    code: "music_data.collection_ref_invalid",
  });

  if (ref.namespace !== "collection") {
    throw invalidCollectionRef(
      "Collection ref namespace must be 'collection'.",
    );
  }

  // collection_ref.kind carries the collection_kind value (D3), consistent with
  // relation_ref.kind = relation_kind.
  assertCollectionKind(ref.kind);

  if (!ref.id.startsWith("c_")) {
    throw invalidCollectionRef(
      "Collection ref id must be ref-safe and start with 'c_'.",
    );
  }
}

export function assertCollectionKind(
  value: string,
): asserts value is CollectionKind {
  if (
    value !== "recording" &&
    value !== "album" &&
    value !== "artist" &&
    value !== "work" &&
    value !== "release" &&
    value !== "mixed"
  ) {
    throw invalidCollection(
      "Collection kind must be recording, album, artist, work, release, or mixed.",
    );
  }
}

export function assertCollectionStatus(
  value: string,
): asserts value is CollectionStatus {
  if (value !== "active" && value !== "removed" && value !== "archived") {
    throw invalidCollection(
      "Collection status must be active, removed, or archived.",
    );
  }
}

export function assertCollectionItemStatus(
  value: string,
): asserts value is CollectionItemStatus {
  if (value !== "active" && value !== "removed") {
    throw invalidCollection(
      "Collection item status must be active or removed.",
    );
  }
}

export function assertCollectionName(name: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw invalidCollection(
      "Collection name must be a non-empty string.",
    );
  }
}

export function invalidCollectionRef(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.collection_ref_invalid",
    message,
  });
}

export function invalidCollection(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.collection_invalid",
    message,
  });
}
