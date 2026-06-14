import assert from "node:assert/strict";

import { isMusicDataPlatformError } from "../../src/music_data_platform/index.js";
import { assertMaterialRef } from "../../src/music_data_platform/material_ref.js";
import {
  assertOwnerMaterialRelationRef,
  assertOwnerRelationPoolRef,
} from "../../src/music_data_platform/owner_material_relation_ref.js";
import { assertOwnerScope } from "../../src/music_data_platform/owner_scope.js";
import {
  assertMusicDataPlatformPublicRefKey,
  assertMusicDataPlatformRefSafe,
  musicDataPlatformRefKey,
} from "../../src/music_data_platform/ref_validation.js";
import { assertSourceLibraryRef } from "../../src/music_data_platform/source_library_ref.js";

assert.doesNotThrow(() => assertMusicDataPlatformRefSafe({
  ref: {
    namespace: "material",
    kind: "recording",
    id: "m_valid",
  },
  fieldName: "materialRef",
  code: "music_data.retrieval_read_invalid",
}));

assert.throws(
  () => assertMusicDataPlatformRefSafe({
    ref: {
      namespace: "",
      kind: "recording",
      id: "m_invalid",
    },
    fieldName: "materialRef",
    code: "music_data.retrieval_read_invalid",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);

assert.throws(
  () => musicDataPlatformRefKey({
    ref: {
      namespace: "material",
      kind: "recording",
      id: "m:invalid",
    },
    fieldName: "materialRef",
    code: "music_data.retrieval_read_invalid",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);

assert.doesNotThrow(() => assertMusicDataPlatformPublicRefKey({
  refKey: "material:recording:m_valid",
  fieldName: "cursorPosition.materialRefKey",
  code: "music_data.retrieval_read_invalid",
}));

assert.throws(
  () => assertMusicDataPlatformPublicRefKey({
    refKey: "material:recording:m:invalid",
    fieldName: "cursorPosition.materialRefKey",
    code: "music_data.retrieval_read_invalid",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_read_invalid",
);

assert.throws(
  () => assertOwnerScope("local:bad"),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_invalid",
);

assert.throws(
  () => assertMaterialRef({
    namespace: "material",
    kind: "recording",
    id: "m:bad",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.material_ref_invalid",
);

assert.throws(
  () => assertSourceLibraryRef({
    namespace: "source_library",
    kind: "saved_source_track",
    id: "l:bad",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.source_library_ref_invalid",
);

assert.throws(
  () => assertOwnerRelationPoolRef({
    namespace: "owner_material_relation_pool",
    kind: "saved",
    id: "rp:bad",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_relation_pool_ref_invalid",
);

assert.throws(
  () => assertOwnerMaterialRelationRef({
    namespace: "owner_material_relation",
    kind: "saved",
    id: "r:bad",
  }),
  (error: unknown) =>
    isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_ref_invalid",
);
