import assert from "node:assert/strict";

import {
  refKey,
  type CanonicalEntity,
  type MaterialRecord,
  type Ref,
  type SourceEntity,
} from "../../src/contracts/index.js";
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
    | "identityStatus"
    | "lifecycleStatus"
    | "primarySourceRef"
    | "versionInfo"
  >
>;

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
        ...sourceTrack("source-remap", "Source Remap"),
        providerEntityId: "source-1",
      },
    }),
    "music_data.source_provider_identity_conflict",
  );

  const materialOne = commands.upsertMaterialRecord({
    materialRef: materialRef("material-1"),
    kind: "recording",
    identityStatus: "source_backed",
  });
  assert.equal("recordId" in materialOne, false);
  assert.deepEqual(materialOne.entity.sourceRefs, []);

  assertMusicDataError(
    () => commands.upsertMaterialRecord({
      materialRef: materialRef("material-1"),
      kind: "recording",
      identityStatus: "source_backed",
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
  assert.deepEqual(
    bindResult.materialRecord.entity.sourceRefs.map(refKey),
    [refKey(sourceRef("source-1"))],
  );
  assert.equal(
    refKey(requiredRef(bindResult.materialRecord.entity.primarySourceRef)),
    refKey(sourceRef("source-1")),
  );

  const canonicalRecord = commands.upsertCanonicalRecord({
    entity: canonicalEntity("canonical-1", "Canonical One"),
    status: "provisional",
    factsJson: { reviewed: false },
  });
  assert.equal("recordId" in canonicalRecord, false);
  assert.equal(canonicalRecord.status, "provisional");
  assert.deepEqual(canonicalRecord.factsJson, { reviewed: false });

  assertMusicDataError(
    () => commands.upsertMaterialRecord({
      materialRef: materialRef("material-without-canonical"),
      kind: "recording",
      identityStatus: "canonical_confirmed",
    }),
    "music_data.material_canonical_conflict",
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

  const materialUpdateAfterCanonicalBinding = commands.upsertMaterialRecord({
    materialRef: materialRef("material-1"),
    kind: "recording",
    identityStatus: "source_backed",
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
});

database.transaction((db) => {
  const commands = createIdentityWriteCommands({ db, now: secondNow });
  const repositories = createIdentityRepositories({ db });

  commands.upsertMaterialRecord({
    materialRef: materialRef("material-2"),
    kind: "recording",
    identityStatus: "source_backed",
  });

  const rebindResult = commands.bindSourceToMaterial({
    sourceRef: sourceRef("source-1"),
    materialRef: materialRef("material-2"),
  });

  assert.equal(rebindResult.binding.createdAt, firstNow);
  assert.equal(rebindResult.binding.updatedAt, secondNow);
  assert.equal(refKey(rebindResult.binding.materialRef), refKey(materialRef("material-2")));
  assert.deepEqual(rebindResult.materialRecord.entity.sourceRefs.map(refKey), [
    refKey(sourceRef("source-1")),
  ]);
  assert.equal(rebindResult.previousMaterialRecord?.entity.sourceRefs.length, 0);
  assert.equal(rebindResult.previousMaterialRecord?.entity.primarySourceRef, undefined);

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
  commands.upsertMaterialRecord({
    materialRef: materialRef("loser"),
    kind: "recording",
    identityStatus: "source_backed",
  });
  commands.bindSourceToMaterial({
    sourceRef: sourceRef("source-2"),
    materialRef: materialRef("loser"),
    makePrimary: true,
  });
  commands.bindMaterialToCanonical({
    materialRef: materialRef("loser"),
    canonicalRef: canonicalRef("canonical-1"),
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
    refKey(canonicalRef("canonical-1")),
  );

  assert.equal(mergeResult.winnerRecord.entity.identityStatus, "canonical_confirmed");
  assert.equal(
    refKey(requiredRef(mergeResult.winnerRecord.entity.canonicalRef)),
    refKey(canonicalRef("canonical-1")),
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

  commands.upsertCanonicalRecord({
    entity: canonicalEntity("canonical-2", "Canonical Two"),
    status: "provisional",
  });
  commands.upsertMaterialRecord({
    materialRef: materialRef("conflict-winner"),
    kind: "recording",
    identityStatus: "source_backed",
  });
  commands.upsertMaterialRecord({
    materialRef: materialRef("conflict-loser"),
    kind: "recording",
    identityStatus: "source_backed",
  });
  commands.bindMaterialToCanonical({
    materialRef: materialRef("conflict-winner"),
    canonicalRef: canonicalRef("canonical-1"),
  });
  commands.bindMaterialToCanonical({
    materialRef: materialRef("conflict-loser"),
    canonicalRef: canonicalRef("canonical-2"),
  });
  assertMusicDataError(
    () => commands.bindMaterialToCanonical({
      materialRef: materialRef("conflict-winner"),
      canonicalRef: canonicalRef("canonical-2"),
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
        identityStatus: "source_backed",
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

function canonicalEntity(id: string, label: string): CanonicalEntity {
  return {
    canonicalRef: canonicalRef(id),
    kind: "recording",
    label,
  };
}

function sourceRef(id: string): Ref {
  return {
    namespace: "source_netease",
    kind: "track",
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
    namespace: "canonical",
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
