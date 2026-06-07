import assert from "node:assert/strict";

import {
  refKey,
  type CanonicalEntity,
  type MaterialRecord,
  type Ref,
  type SourceEntity,
} from "../../src/contracts/index.js";
import type { MusicDatabaseContext } from "../../src/storage/index.js";
import {
  createIdentityRepositories,
  createIdentityWriteCommands,
  isMusicDataPlatformError,
  musicDataPlatformIdentitySchema,
  type MusicDataPlatformErrorCode,
  type SourceToMaterialBindingRecord,
  type UpsertMaterialRecordInput,
} from "../../src/music_data_platform/index.js";
import { SqliteMusicDatabase } from "../../src/storage/index.js";

const firstNow = "2026-06-07T00:00:00.000Z";
const secondNow = "2026-06-07T00:01:00.000Z";
const thirdNow = "2026-06-07T00:02:00.000Z";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

export type _sourceMaterialBindingRecordShape = Expect<
  Equal<keyof SourceToMaterialBindingRecord, "sourceRef" | "materialRef" | "createdAt" | "updatedAt">
>;

export type _upsertMaterialRecordInputShape = Expect<
  Equal<
    keyof UpsertMaterialRecordInput,
    | "materialRef"
    | "kind"
    | "primarySourceRef"
    | "versionInfo"
  >
>;

declare const nonTransactionContext: MusicDatabaseContext;
if (false) {
  // @ts-expect-error identity write commands require a transaction context
  createIdentityWriteCommands({ db: nonTransactionContext, now: firstNow });
}

const database = SqliteMusicDatabase.open({ filename: ":memory:" });
database.initialize({ schemas: [musicDataPlatformIdentitySchema] });

database.transaction((db) => {
  const commands = createIdentityWriteCommands({ db, now: firstNow });

  const sourceOne = commands.upsertSourceRecord({
    entity: sourceTrack("source-1", "Source One"),
  });
  assert.equal("recordId" in sourceOne, false);
  assert.equal(sourceOne.createdAt, firstNow);
  assert.equal(sourceOne.updatedAt, firstNow);

  assertMusicDataError(
    () => commands.upsertSourceRecord({
      entity: {
        ...sourceTrack("source-kind-mismatch", "Source Kind Mismatch"),
        sourceRef: {
          namespace: "source_netease",
          kind: "album",
          id: "source-kind-mismatch",
        },
      },
    }),
    "music_data.record_ref_key_mismatch",
  );

  assertMusicDataError(
    () => commands.upsertSourceRecord({
      entity: {
        ...sourceTrack("source-provider-mismatch", "Source Provider Mismatch"),
        providerId: "spotify",
      },
    }),
    "music_data.record_ref_key_mismatch",
  );

  assertMusicDataError(
    () => commands.upsertSourceRecord({
      entity: {
        ...sourceTrack("source-provider-unsafe", "Source Provider Unsafe"),
        providerId: "netease:unsafe",
        sourceRef: {
          namespace: "source_netease:unsafe",
          kind: "track",
          id: "source-provider-unsafe",
        },
      },
    }),
    "music_data.record_ref_key_mismatch",
  );

  assertMusicDataError(
    () => commands.upsertSourceRecord({
      entity: {
        ...sourceTrack("source-remap", "Source Remap"),
        providerEntityId: "source-1",
      },
    }),
    "music_data.source_provider_identity_conflict",
  );

  const materialOne = commands.upsertMaterialRecord({
    materialRef: materialRef("material-1"),
    kind: "recording",
  });
  assert.equal("recordId" in materialOne, false);
  assert.equal(materialOne.entity.identityStatus, "unresolved_identity");
  assert.deepEqual(materialOne.entity.sourceRefs, []);

  assertMusicDataError(
    () => commands.upsertMaterialRecord({
      materialRef: {
        namespace: "material",
        kind: "album",
        id: "material-kind-mismatch",
      },
      kind: "recording",
    }),
    "music_data.record_ref_key_mismatch",
  );

  assertMusicDataError(
    () => commands.upsertMaterialRecord({
      materialRef: materialRef("material-1"),
      kind: "recording",
      primarySourceRef: sourceRef("source-1"),
    }),
    "music_data.material_primary_source_not_bound",
  );

  const bindResult = commands.bindSourceToMaterial({
    sourceRef: sourceRef("source-1"),
    materialRef: materialRef("material-1"),
    makePrimary: true,
  });

  assert.equal(refKey(bindResult.binding.sourceRef), refKey(sourceRef("source-1")));
  assert.equal(refKey(bindResult.binding.materialRef), refKey(materialRef("material-1")));
  assert.equal(bindResult.binding.createdAt, firstNow);
  assert.equal(bindResult.binding.updatedAt, firstNow);
  assert.equal(bindResult.materialRecord.entity.identityStatus, "source_backed");
  assert.deepEqual(
    bindResult.materialRecord.entity.sourceRefs.map(refKey),
    [refKey(sourceRef("source-1"))],
  );
  assert.equal(
    refKey(requiredRef(bindResult.materialRecord.entity.primarySourceRef)),
    refKey(sourceRef("source-1")),
  );

  commands.upsertCanonicalRecord({
    entity: canonicalEntity("canonical-provisional", "Canonical Provisional"),
    status: "provisional",
  });
  assertMusicDataError(
    () => commands.bindMaterialToCanonical({
      materialRef: materialRef("material-1"),
      canonicalRef: canonicalRef("canonical-provisional"),
    }),
    "music_data.canonical_not_bindable",
  );

  const canonicalRecord = commands.upsertCanonicalRecord({
    entity: canonicalEntity("canonical-1", "Canonical One"),
    status: "active",
    factsJson: { reviewed: true },
  });
  assert.equal("recordId" in canonicalRecord, false);
  assert.equal(canonicalRecord.status, "active");
  assert.deepEqual(canonicalRecord.factsJson, { reviewed: true });

  assertMusicDataError(
    () => commands.upsertCanonicalRecord({
      entity: {
        ...canonicalEntity("bad-canonical-namespace", "Bad Canonical Namespace"),
        canonicalRef: {
          namespace: "canonical",
          kind: "recording",
          id: "bad-canonical-namespace",
        },
      },
      status: "active",
    }),
    "music_data.record_ref_key_mismatch",
  );

  assertMusicDataError(
    () => commands.bindMaterialToCanonical({
      materialRef: materialRef("missing-material"),
      canonicalRef: canonicalRef("canonical-1"),
    }),
    "music_data.material_not_found",
  );
  assertMusicDataError(
    () => commands.bindMaterialToCanonical({
      materialRef: materialRef("material-1"),
      canonicalRef: canonicalRef("missing-canonical"),
    }),
    "music_data.canonical_not_found",
  );

  const canonicalBinding = commands.bindMaterialToCanonical({
    materialRef: materialRef("material-1"),
    canonicalRef: canonicalRef("canonical-1"),
  });
  assert.equal(canonicalBinding.entity.identityStatus, "canonical_confirmed");
  assert.equal(
    refKey(requiredRef(canonicalBinding.entity.canonicalRef)),
    refKey(canonicalRef("canonical-1")),
  );

  assertMusicDataError(
    () => commands.upsertCanonicalRecord({
      entity: canonicalEntity("canonical-1", "Canonical One"),
      status: "archived",
    }),
    "music_data.material_canonical_conflict",
  );

  const materialUpdateAfterCanonicalBinding = commands.upsertMaterialRecord({
    materialRef: materialRef("material-1"),
    kind: "recording",
    versionInfo: {
      tags: ["live"],
    },
  });
  assert.equal(
    refKey(requiredRef(materialUpdateAfterCanonicalBinding.entity.canonicalRef)),
    refKey(canonicalRef("canonical-1")),
  );
  assert.equal(materialUpdateAfterCanonicalBinding.entity.identityStatus, "canonical_confirmed");
  assert.deepEqual(materialUpdateAfterCanonicalBinding.entity.versionInfo?.tags, ["live"]);

  assertMusicDataError(
    () => commands.upsertMaterialRecord({
      materialRef: materialRef("material-1"),
      kind: "album",
    }),
    "music_data.record_ref_key_mismatch",
  );

  commands.upsertMaterialRecord({
    materialRef: materialRef("duplicate-canonical-material"),
    kind: "recording",
  });
  assertMusicDataError(
    () => commands.bindMaterialToCanonical({
      materialRef: materialRef("duplicate-canonical-material"),
      canonicalRef: canonicalRef("canonical-1"),
    }),
    "music_data.material_canonical_conflict",
  );

  commands.upsertSourceRecord({
    entity: sourceAlbum("source-album-1", "Source Album One"),
  });
  assertMusicDataError(
    () => commands.bindSourceToMaterial({
      sourceRef: sourceRefWithKind("album", "source-album-1"),
      materialRef: materialRef("material-1"),
    }),
    "music_data.record_kind_mismatch",
  );
});

database.transaction((db) => {
  const commands = createIdentityWriteCommands({ db, now: secondNow });
  const repositories = createIdentityRepositories({ db });

  commands.upsertMaterialRecord({
    materialRef: materialRef("material-2"),
    kind: "recording",
  });

  const rebindResult = commands.bindSourceToMaterial({
    sourceRef: sourceRef("source-1"),
    materialRef: materialRef("material-2"),
  });

  assert.equal(rebindResult.binding.createdAt, firstNow);
  assert.equal(rebindResult.binding.updatedAt, secondNow);
  assert.equal(refKey(rebindResult.binding.materialRef), refKey(materialRef("material-2")));
  assert.equal(rebindResult.materialRecord.entity.identityStatus, "source_backed");
  assert.deepEqual(rebindResult.materialRecord.entity.sourceRefs.map(refKey), [
    refKey(sourceRef("source-1")),
  ]);
  assert.equal(rebindResult.previousMaterialRecord?.entity.sourceRefs.length, 0);
  assert.equal(rebindResult.previousMaterialRecord?.entity.primarySourceRef, undefined);
  assert.equal(rebindResult.previousMaterialRecord?.entity.identityStatus, "canonical_confirmed");

  assert.equal(
    refKey(requiredBinding(
      repositories.sourceMaterialBindings.findMaterialForSource({
        sourceRef: sourceRef("source-1"),
      }),
    ).materialRef),
    refKey(materialRef("material-2")),
  );
});

database.transaction((db) => {
  const commands = createIdentityWriteCommands({ db, now: thirdNow });
  const repositories = createIdentityRepositories({ db });

  commands.upsertSourceRecord({
    entity: sourceTrack("source-2", "Source Two"),
  });
  commands.upsertCanonicalRecord({
    entity: canonicalEntity("canonical-3", "Canonical Three"),
    status: "active",
  });
  commands.upsertMaterialRecord({
    materialRef: materialRef("loser"),
    kind: "recording",
  });
  commands.bindSourceToMaterial({
    sourceRef: sourceRef("source-2"),
    materialRef: materialRef("loser"),
    makePrimary: true,
  });
  commands.bindMaterialToCanonical({
    materialRef: materialRef("loser"),
    canonicalRef: canonicalRef("canonical-3"),
  });

  const mergeResult = commands.mergeMaterialRecord({
    loserMaterialRef: materialRef("loser"),
    winnerMaterialRef: materialRef("material-2"),
  });

  assert.equal(mergeResult.loserRecord.entity.lifecycleStatus, "merged");
  assert.equal(
    refKey(requiredRef(mergeResult.loserRecord.mergedIntoMaterialRef)),
    refKey(materialRef("material-2")),
  );
  assert.deepEqual(mergeResult.loserRecord.entity.sourceRefs.map(refKey), [
    refKey(sourceRef("source-2")),
  ]);
  assert.equal(
    refKey(requiredRef(mergeResult.loserRecord.entity.primarySourceRef)),
    refKey(sourceRef("source-2")),
  );
  assert.equal(
    refKey(requiredRef(mergeResult.loserRecord.entity.canonicalRef)),
    refKey(canonicalRef("canonical-3")),
  );

  assert.equal(mergeResult.winnerRecord.entity.identityStatus, "canonical_confirmed");
  assert.equal(
    refKey(requiredRef(mergeResult.winnerRecord.entity.canonicalRef)),
    refKey(canonicalRef("canonical-3")),
  );
  assert.equal(mergeResult.winnerRecord.entity.primarySourceRef, undefined);
  assert.deepEqual(
    mergeResult.winnerRecord.entity.sourceRefs.map(refKey).sort(),
    [refKey(sourceRef("source-1")), refKey(sourceRef("source-2"))].sort(),
  );
  assert.deepEqual(
    mergeResult.movedBindings.map((binding) => [
      refKey(binding.sourceRef),
      refKey(binding.materialRef),
    ]),
    [[refKey(sourceRef("source-2")), refKey(materialRef("material-2"))]],
  );
  assert.equal(
    refKey(requiredBinding(
      repositories.sourceMaterialBindings.findMaterialForSource({
        sourceRef: sourceRef("source-2"),
      }),
    ).materialRef),
    refKey(materialRef("material-2")),
  );

  assertMusicDataError(
    () => commands.upsertMaterialRecord({
      materialRef: materialRef("loser"),
      kind: "recording",
    }),
    "music_data.material_not_writable",
  );
  assertMusicDataError(
    () => commands.bindSourceToMaterial({
      sourceRef: sourceRef("source-1"),
      materialRef: materialRef("loser"),
    }),
    "music_data.material_not_writable",
  );
  assertMusicDataError(
    () => commands.bindMaterialToCanonical({
      materialRef: materialRef("loser"),
      canonicalRef: canonicalRef("canonical-3"),
    }),
    "music_data.material_not_writable",
  );
  assertMusicDataError(
    () => commands.mergeMaterialRecord({
      loserMaterialRef: materialRef("material-1"),
      winnerMaterialRef: materialRef("loser"),
    }),
    "music_data.material_not_writable",
  );

  commands.upsertCanonicalRecord({
    entity: canonicalEntity("canonical-4", "Canonical Four"),
    status: "active",
  });
  commands.upsertCanonicalRecord({
    entity: canonicalEntity("canonical-5", "Canonical Five"),
    status: "active",
  });
  commands.upsertMaterialRecord({
    materialRef: materialRef("conflict-winner"),
    kind: "recording",
  });
  commands.upsertMaterialRecord({
    materialRef: materialRef("conflict-loser"),
    kind: "recording",
  });
  commands.bindMaterialToCanonical({
    materialRef: materialRef("conflict-winner"),
    canonicalRef: canonicalRef("canonical-4"),
  });
  commands.bindMaterialToCanonical({
    materialRef: materialRef("conflict-loser"),
    canonicalRef: canonicalRef("canonical-5"),
  });
  assertMusicDataError(
    () => commands.bindMaterialToCanonical({
      materialRef: materialRef("conflict-winner"),
      canonicalRef: canonicalRef("canonical-5"),
    }),
    "music_data.material_canonical_conflict",
  );
  assertMusicDataError(
    () => commands.mergeMaterialRecord({
      loserMaterialRef: materialRef("conflict-loser"),
      winnerMaterialRef: materialRef("conflict-winner"),
    }),
    "music_data.material_merge_canonical_conflict",
  );

  commands.upsertMaterialRecord({
    materialRef: {
      namespace: "material",
      kind: "album",
      id: "album-material",
    },
    kind: "album",
  });
  assertMusicDataError(
    () => commands.mergeMaterialRecord({
      loserMaterialRef: materialRef("conflict-winner"),
      winnerMaterialRef: {
        namespace: "material",
        kind: "album",
        id: "album-material",
      },
    }),
    "music_data.record_kind_mismatch",
  );
});

const rollbackDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
rollbackDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
assert.throws(
  () => {
    rollbackDatabase.transaction((db) => {
      const commands = createIdentityWriteCommands({ db, now: firstNow });

      commands.upsertSourceRecord({
        entity: sourceTrack("rollback-source", "Rollback Source"),
      });
      commands.upsertMaterialRecord({
        materialRef: materialRef("rollback-material"),
        kind: "recording",
      });
      commands.bindSourceToMaterial({
        sourceRef: sourceRef("rollback-source"),
        materialRef: materialRef("rollback-material"),
      });

      throw new Error("rollback identity write");
    });
  },
  /rollback identity write/,
);
assert.equal(
  rollbackDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM source_records",
  )?.count,
  0,
);
assert.equal(
  rollbackDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM source_material_bindings",
  )?.count,
  0,
);
rollbackDatabase.close();

const foreignKeyDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
foreignKeyDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
assert.throws(() => {
  foreignKeyDatabase.transaction((db) => {
    createIdentityRepositories({ db }).materialRecords.upsert({
      entity: {
        materialRef: materialRef("dangling-canonical-material"),
        kind: "recording",
        lifecycleStatus: "active",
        identityStatus: "canonical_confirmed",
        canonicalRef: canonicalRef("missing-canonical"),
        sourceRefs: [],
      },
      createdAt: firstNow,
      updatedAt: firstNow,
    });
  });
});
foreignKeyDatabase.close();

const uniqueCanonicalDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
uniqueCanonicalDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
assert.throws(() => {
  uniqueCanonicalDatabase.transaction((db) => {
    const repositories = createIdentityRepositories({ db });
    repositories.canonicalRecords.upsert({
      entity: canonicalEntity("unique-canonical", "Unique Canonical"),
      status: "active",
      createdAt: firstNow,
      updatedAt: firstNow,
    });
    repositories.materialRecords.upsert({
      entity: {
        materialRef: materialRef("unique-canonical-material-1"),
        kind: "recording",
        lifecycleStatus: "active",
        identityStatus: "canonical_confirmed",
        canonicalRef: canonicalRef("unique-canonical"),
        sourceRefs: [],
      },
      createdAt: firstNow,
      updatedAt: firstNow,
    });
    repositories.materialRecords.upsert({
      entity: {
        materialRef: materialRef("unique-canonical-material-2"),
        kind: "recording",
        lifecycleStatus: "active",
        identityStatus: "canonical_confirmed",
        canonicalRef: canonicalRef("unique-canonical"),
        sourceRefs: [],
      },
      createdAt: firstNow,
      updatedAt: firstNow,
    });
  });
});
uniqueCanonicalDatabase.close();

const mergedCanonicalDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
mergedCanonicalDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
mergedCanonicalDatabase.transaction((db) => {
  const commands = createIdentityWriteCommands({ db, now: firstNow });
  const repositories = createIdentityRepositories({ db });
  commands.upsertCanonicalRecord({
    entity: canonicalEntity("merged-canonical-winner", "Merged Canonical Winner"),
    status: "active",
  });
  repositories.canonicalRecords.upsert({
    entity: canonicalEntity("merged-canonical-loser", "Merged Canonical Loser"),
    status: "merged",
    mergedIntoCanonicalRef: canonicalRef("merged-canonical-winner"),
    createdAt: firstNow,
    updatedAt: firstNow,
  });
  assertMusicDataError(
    () => commands.upsertCanonicalRecord({
      entity: canonicalEntity("merged-canonical-loser", "Merged Canonical Loser"),
      status: "active",
    }),
    "music_data.canonical_not_bindable",
  );
});
mergedCanonicalDatabase.close();

database.close();

function sourceTrack(id: string, label: string): SourceEntity {
  return {
    sourceRef: sourceRef(id),
    providerId: "netease",
    providerEntityId: id,
    kind: "track",
    label,
    title: label,
  };
}

function sourceAlbum(id: string, label: string): SourceEntity {
  return {
    sourceRef: sourceRefWithKind("album", id),
    providerId: "netease",
    providerEntityId: id,
    kind: "album",
    label,
    title: label,
  };
}

function canonicalEntity(id: string, label: string): CanonicalEntity {
  return {
    canonicalRef: canonicalRef(id),
    kind: "recording",
    label,
  };
}

function sourceRef(id: string): Ref {
  return sourceRefWithKind("track", id);
}

function sourceRefWithKind(kind: string, id: string): Ref {
  return {
    namespace: "source_netease",
    kind,
    id,
  };
}

function materialRef(id: string): Ref {
  return {
    namespace: "material",
    kind: "recording",
    id,
  };
}

function canonicalRef(id: string): Ref {
  return {
    namespace: "canonical_minemusic",
    kind: "recording",
    id,
  };
}

function requiredRef(ref: Ref | undefined): Ref {
  if (ref === undefined) {
    throw new Error("Expected ref to be present");
  }

  return ref;
}

function requiredBinding(
  binding: SourceToMaterialBindingRecord | undefined,
): SourceToMaterialBindingRecord {
  if (binding === undefined) {
    throw new Error("Expected binding to be present");
  }

  return binding;
}

function assertMusicDataError(
  operation: () => unknown,
  code: MusicDataPlatformErrorCode,
): void {
  assert.throws(
    operation,
    (error) => isMusicDataPlatformError(error) && error.code === code,
  );
}
