import assert from "node:assert/strict";

import {
  refKey,
  type ProviderMaterialCandidate,
  type SourceTrack,
} from "../../src/contracts/index.js";
import {
  createProviderMaterialCandidateRef,
  isMusicDataPlatformError,
  musicDataPlatformRetrievalResultSetSchema,
} from "../../src/music_data_platform/index.js";
import {
  createRetrievalResultSetRecords,
  expiresAtFromResultSetCreatedAt,
  type MaterialCandidateCacheRecord,
  type RetrievalResultRowRecord,
  type RetrievalResultSetRecord,
  type RetrievalResultTextFtsRecord,
} from "../../src/music_data_platform/retrieval_result_set_records.js";
import {
  SqliteMusicDatabase,
  type MusicDatabaseContext,
} from "../../src/storage/index.js";

const alphaSource = sourceTrack("1001", "Alpha Candidate");
const alphaCandidateRef = createProviderMaterialCandidateRef({
  sourceRef: alphaSource.sourceRef,
});
const alphaCandidateRefKey = refKey(alphaCandidateRef);

assert.deepEqual(
  alphaCandidateRef,
  createProviderMaterialCandidateRef({ sourceRef: alphaSource.sourceRef }),
);
assert.equal(alphaCandidateRef.namespace, "material_candidate");
assert.equal(alphaCandidateRef.kind, "provider_candidate");
assert.notEqual(
  alphaCandidateRef.id,
  createProviderMaterialCandidateRef({
    sourceRef: sourceTrack("1002", "Alpha Candidate").sourceRef,
  }).id,
);

assert.equal(
  expiresAtFromResultSetCreatedAt({
    createdAt: "2026-06-15T10:00:00.000Z",
  }),
  "2026-06-15T10:30:00.000Z",
);

{
  const database = initializedDatabase();
  const context = database.context();

  assert.equal(tableExists(context, "retrieval_result_sets"), true);
  assert.equal(tableExists(context, "retrieval_result_rows"), true);
  assert.equal(tableExists(context, "retrieval_result_text_fts"), true);
  assert.equal(tableExists(context, "material_candidate_cache"), true);

  database.close();
}

{
  const database = initializedDatabase();

  database.transaction((db) => {
    const records = createRetrievalResultSetRecords({ db });
    const first = records.materialCandidates.upsert(candidateCacheRecord({
      materialCandidateRefKey: alphaCandidateRefKey,
      source: alphaSource,
      providerScore: 0.8,
      expiresAt: "2026-06-15T10:30:00.000Z",
      createdAt: "2026-06-15T10:00:00.000Z",
    }));

    assert.equal(first.materialCandidateRefKey, alphaCandidateRefKey);
    assert.equal(first.providerScore, 0.8);

    const refreshed = records.materialCandidates.upsert(candidateCacheRecord({
      materialCandidateRefKey: alphaCandidateRefKey,
      source: alphaSource,
      title: "Alpha Candidate Refreshed",
      expiresAt: "2026-06-15T11:00:00.000Z",
      createdAt: "2026-06-15T10:05:00.000Z",
    }));

    assert.equal(refreshed.providerScore, undefined);
    assert.equal(refreshed.expiresAt, "2026-06-15T11:00:00.000Z");
    assert.equal(refreshed.createdAt, "2026-06-15T10:00:00.000Z");
    assert.equal(
      JSON.parse(refreshed.searchableFieldsJson).titleText,
      "Alpha Candidate Refreshed",
    );
  });

  database.close();
}

{
  const database = initializedDatabase();

  database.transaction((db) => {
    const records = createRetrievalResultSetRecords({ db });

    records.resultSets.insert(resultSetRecord({
      resultSetId: "rs_text",
      localResultWindowHasMore: true,
    }));
    records.materialCandidates.upsert(candidateCacheRecord({
      materialCandidateRefKey: alphaCandidateRefKey,
      source: alphaSource,
    }));
    records.resultRows.insertMany([
      materialRow({
        resultSetId: "rs_text",
        materialRefKey: "material:recording:m_alpha",
        stableRefKey: "material:recording:m_alpha",
        titleText: "Alpha Material",
      }),
      candidateRow({
        resultSetId: "rs_text",
        materialCandidateRefKey: alphaCandidateRefKey,
        stableRefKey: alphaCandidateRefKey,
        titleText: "Alpha Candidate",
      }),
    ]);
    records.resultTextFts.insertMany([
      ftsRow({
        resultSetId: "rs_text",
        rowKind: "material",
        stableRefKey: "material:recording:m_alpha",
        titleText: "Alpha Material",
      }),
      ftsRow({
        resultSetId: "rs_text",
        rowKind: "material_candidate",
        stableRefKey: alphaCandidateRefKey,
        titleText: "Alpha Candidate",
      }),
    ]);

    const storedSet = records.resultSets.get({ resultSetId: "rs_text" });
    assert.equal(storedSet?.localResultWindowHasMore, true);
    assert.deepEqual(
      records.resultRows.listForResultSet({ resultSetId: "rs_text" }).map((row) => row.stableRefKey),
      ["material:recording:m_alpha", alphaCandidateRefKey],
    );
    assert.deepEqual(
      db.all<{ stable_ref_key: string }>(
        `
          SELECT stable_ref_key
          FROM retrieval_result_text_fts
          WHERE retrieval_result_text_fts MATCH ?
          ORDER BY stable_ref_key ASC
        `,
        ["alpha"],
      ).map((row) => row.stable_ref_key),
      ["material:recording:m_alpha", alphaCandidateRefKey].sort(),
    );
  });

  database.close();
}

{
  const database = initializedDatabase();

  database.transaction((db) => {
    const records = createRetrievalResultSetRecords({ db });

    records.resultSets.insert(resultSetRecord({ resultSetId: "rs_invalid" }));

    assert.throws(
      () => records.resultRows.insertMany([
        materialRow({
          resultSetId: "rs_invalid",
          materialRefKey: "material:recording:m_alpha",
          materialCandidateRefKey: alphaCandidateRefKey,
          stableRefKey: "material:recording:m_alpha",
        }),
      ]),
      isRetrievalResultSetError,
    );
  });

  database.close();
}

{
  const database = initializedDatabase();

  database.transaction((db) => {
    const records = createRetrievalResultSetRecords({ db });
    const liveCandidateKey = refKey(createProviderMaterialCandidateRef({
      sourceRef: sourceTrack("2001", "Live Candidate").sourceRef,
    }));
    const expiredCandidateKey = refKey(createProviderMaterialCandidateRef({
      sourceRef: sourceTrack("2002", "Expired Candidate").sourceRef,
    }));
    const unreferencedCandidateKey = refKey(createProviderMaterialCandidateRef({
      sourceRef: sourceTrack("2003", "Unreferenced Candidate").sourceRef,
    }));

    records.resultSets.insert(resultSetRecord({
      resultSetId: "rs_expired",
      expiresAt: "2026-06-15T09:00:00.000Z",
    }));
    records.resultSets.insert(resultSetRecord({
      resultSetId: "rs_live",
      expiresAt: "2026-06-15T11:00:00.000Z",
    }));
    for (const [key, title] of [
      [liveCandidateKey, "Live Candidate"],
      [expiredCandidateKey, "Expired Candidate"],
      [unreferencedCandidateKey, "Unreferenced Candidate"],
    ] as const) {
      records.materialCandidates.upsert(candidateCacheRecord({
        materialCandidateRefKey: key,
        source: sourceTrack(key, title),
        title,
        expiresAt: "2026-06-15T09:30:00.000Z",
      }));
    }
    records.resultRows.insertMany([
      candidateRow({
        resultSetId: "rs_live",
        materialCandidateRefKey: liveCandidateKey,
        stableRefKey: liveCandidateKey,
        titleText: "Live Candidate",
      }),
      candidateRow({
        resultSetId: "rs_expired",
        materialCandidateRefKey: expiredCandidateKey,
        stableRefKey: expiredCandidateKey,
        titleText: "Expired Candidate",
      }),
    ]);
    records.resultTextFts.insertMany([
      ftsRow({
        resultSetId: "rs_live",
        rowKind: "material_candidate",
        stableRefKey: liveCandidateKey,
        titleText: "Live Candidate",
      }),
      ftsRow({
        resultSetId: "rs_expired",
        rowKind: "material_candidate",
        stableRefKey: expiredCandidateKey,
        titleText: "Expired Candidate",
      }),
    ]);

    assert.deepEqual(
      records.cleanupExpiredMaterialCandidates({
        now: "2026-06-15T10:00:00.000Z",
      }),
      { deletedCount: 2 },
    );
    assert.equal(
      records.materialCandidates.getByRefKey({
        materialCandidateRefKey: liveCandidateKey,
      })?.materialCandidateRefKey,
      liveCandidateKey,
    );
    assert.equal(
      records.materialCandidates.getByRefKey({
        materialCandidateRefKey: expiredCandidateKey,
      }),
      undefined,
    );
    assert.equal(
      records.materialCandidates.getByRefKey({
        materialCandidateRefKey: unreferencedCandidateKey,
      }),
      undefined,
    );

    assert.deepEqual(
      records.cleanupExpiredRetrievalResultSets({
        now: "2026-06-15T10:00:00.000Z",
      }),
      {
        resultSetCount: 1,
        resultRowCount: 1,
        textFtsRowCount: 1,
      },
    );
    assert.equal(records.resultSets.get({ resultSetId: "rs_expired" }), undefined);
    assert.notEqual(records.resultSets.get({ resultSetId: "rs_live" }), undefined);
    assert.deepEqual(
      records.resultRows.listForResultSet({ resultSetId: "rs_live" }).map((row) => row.stableRefKey),
      [liveCandidateKey],
    );
  });

  database.close();
}

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformRetrievalResultSetSchema,
    ],
  });
  return database;
}

function tableExists(db: MusicDatabaseContext, tableName: string): boolean {
  return db.get<{ name: string }>(
    `
      SELECT name
      FROM sqlite_master
      WHERE name = ?
    `,
    [tableName],
  ) !== undefined;
}

function sourceTrack(id: string, title: string): SourceTrack {
  return {
    kind: "track",
    sourceRef: {
      namespace: "source_netease",
      kind: "track",
      id: `ncm_${id.replaceAll(":", "_")}`,
    },
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
    artistLabels: ["MineMusic Test Artist"],
  };
}

function resultSetRecord(
  overrides: Partial<RetrievalResultSetRecord>,
): RetrievalResultSetRecord {
  return {
    resultSetId: overrides.resultSetId ?? "rs_default",
    queryFingerprint: overrides.queryFingerprint ?? "fp_default",
    localResultWindowLimit: overrides.localResultWindowLimit ?? 30,
    localRowsInResultSet: overrides.localRowsInResultSet ?? 2,
    localResultWindowHasMore: overrides.localResultWindowHasMore ?? false,
    expiresAt: overrides.expiresAt ?? "2026-06-15T10:30:00.000Z",
    createdAt: overrides.createdAt ?? "2026-06-15T10:00:00.000Z",
  };
}

function materialRow(
  input: Partial<RetrievalResultRowRecord> & {
    resultSetId: string;
    materialRefKey: string;
    stableRefKey: string;
  },
): RetrievalResultRowRecord {
  return rowBase({
    ...input,
    rowKind: "material",
    rowKindSort: 0,
  });
}

function candidateRow(
  input: Partial<RetrievalResultRowRecord> & {
    resultSetId: string;
    materialCandidateRefKey: string;
    stableRefKey: string;
  },
): RetrievalResultRowRecord {
  return rowBase({
    ...input,
    rowKind: "material_candidate",
    rowKindSort: 1,
  });
}

function rowBase(
  input: Partial<RetrievalResultRowRecord> & {
    resultSetId: string;
    rowKind: RetrievalResultRowRecord["rowKind"];
    stableRefKey: string;
    rowKindSort: number;
  },
): RetrievalResultRowRecord {
  return {
    resultSetId: input.resultSetId,
    rowKind: input.rowKind,
    stableRefKey: input.stableRefKey,
    ...(input.materialRefKey === undefined ? {} : { materialRefKey: input.materialRefKey }),
    ...(input.materialCandidateRefKey === undefined
      ? {}
      : { materialCandidateRefKey: input.materialCandidateRefKey }),
    rowKindSort: input.rowKindSort,
    matchedTokenCount: input.matchedTokenCount ?? 1,
    bestFieldPriority: input.bestFieldPriority ?? 0,
    rankSortValue: input.rankSortValue ?? 0,
    titleText: input.titleText ?? "",
    artistText: input.artistText ?? "",
    albumText: input.albumText ?? "",
    versionText: input.versionText ?? "",
    aliasText: input.aliasText ?? "",
  };
}

function ftsRow(
  input: Partial<RetrievalResultTextFtsRecord> & {
    resultSetId: string;
    rowKind: RetrievalResultTextFtsRecord["rowKind"];
    stableRefKey: string;
  },
): RetrievalResultTextFtsRecord {
  return {
    resultSetId: input.resultSetId,
    rowKind: input.rowKind,
    stableRefKey: input.stableRefKey,
    titleText: input.titleText ?? "",
    artistText: input.artistText ?? "",
    albumText: input.albumText ?? "",
    versionText: input.versionText ?? "",
    aliasText: input.aliasText ?? "",
  };
}

function candidateCacheRecord(input: {
  materialCandidateRefKey: string;
  source: SourceTrack;
  title?: string;
  providerScore?: number;
  expiresAt?: string;
  createdAt?: string;
}): MaterialCandidateCacheRecord {
  const providerCandidate = {
    sourceEntity: {
      ...input.source,
      title: input.title ?? input.source.title,
      label: input.title ?? input.source.label,
    },
    ...(input.providerScore === undefined ? {} : { providerScore: input.providerScore }),
  } satisfies ProviderMaterialCandidate;

  return {
    materialCandidateRefKey: input.materialCandidateRefKey,
    providerId: input.source.providerId,
    sourceRefKey: refKey(input.source.sourceRef),
    providerEntityId: input.source.providerEntityId,
    sourceKind: input.source.kind,
    materialCandidateKind: "provider_candidate",
    validatedProviderCandidateJson: JSON.stringify(providerCandidate),
    searchableFieldsJson: JSON.stringify({
      titleText: input.title ?? input.source.title,
      artistText: input.source.artistLabels?.join(" ") ?? "",
      albumText: "",
      versionText: "",
      aliasText: "",
    }),
    ...(input.providerScore === undefined ? {} : { providerScore: input.providerScore }),
    expiresAt: input.expiresAt ?? "2026-06-15T10:30:00.000Z",
    createdAt: input.createdAt ?? "2026-06-15T10:00:00.000Z",
  };
}

function isRetrievalResultSetError(error: unknown): boolean {
  return isMusicDataPlatformError(error) &&
    error.code === "music_data.retrieval_result_set_invalid";
}
