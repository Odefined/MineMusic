import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { MaterialEntityKind, ProviderMaterialCandidate, SourceEntity, SourceTrack } from "../../src/contracts/music_data_platform.js";
import {
  DEFAULT_OWNER_SCOPE,
  createMaterialTextProjectionCommands,
  createMusicDataPlatformRetrievalWorkspace,
  createOwnerCatalogProjectionCommands,
  createProviderMaterialCandidateRef,
  createSourceLibraryRef,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformRetrievalResultSetSchema,
  musicDataPlatformSourceLibrarySchema,
  type MusicDataPlatformMixedRetrievalRow,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createOwnerMaterialRelationCommands } from "../../src/music_data_platform/owner_material_relation_commands.js";
import { createRetrievalResultSetRecords } from "../../src/music_data_platform/retrieval_result_set_records.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import { SqliteMusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

const mixedDatabase = initializedDatabase();
const mixedWorkspace = createMusicDataPlatformRetrievalWorkspace({
  database: mixedDatabase,
});
const mixedLibraryRef = sourceLibraryRef("mixed");
const mixedKnownSource = sourceTrack("known", "alpha beta known");
const mixedKnownMaterialRef = materialRef("recording", "m_known");
const mixedCandidateSource = sourceTrack("candidate", "alpha beta candidate");
const mixedCandidateRefKey = refKey(createProviderMaterialCandidateRef({
  sourceRef: mixedCandidateSource.sourceRef,
}));

mixedDatabase.transaction((db) => {
  const identity = createIdentityTestCommands(db, "2026-06-15T09:00:00.000Z");
  const libraries = createSourceLibraryRepositories({ db });

  upsertLibrary(libraries, mixedLibraryRef, "mixed");

  for (let index = 0; index < 11; index += 1) {
    const source = sourceTrack(`local_${index}`, `alpha local ${index}`);
    const nextMaterialRef = materialRef("recording", `m_local_${index}`);
    bindSourceToMaterial(identity, source, nextMaterialRef);
    upsertLibraryItem(
      libraries,
      mixedLibraryRef,
      source.sourceRef,
      `2026-06-15T09:${String(index).padStart(2, "0")}:00.000Z`,
    );
    createMaterialTextProjectionCommands({
      db,
      now: "2026-06-15T09:20:00.000Z",
    }).rebuildMaterialTextDocument({
      materialRef: nextMaterialRef,
    });
  }

  bindSourceToMaterial(identity, mixedKnownSource, mixedKnownMaterialRef);
  createMaterialTextProjectionCommands({
    db,
    now: "2026-06-15T09:21:00.000Z",
  }).rebuildMaterialTextDocument({
    materialRef: mixedKnownMaterialRef,
  });
  createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-15T09:22:00.000Z",
  }).rebuildSourceLibraryEntriesForLibrary({
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: mixedLibraryRef,
  });
});

const mixedPageOne = mixedWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "alpha beta",
  durablePoolFilter: {
    anyOf: [mixedLibraryRef],
  },
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 1,
  queryFingerprint: "fp_mixed_alpha_beta",
  providerCandidates: [
    providerCandidate(mixedKnownSource),
    providerCandidate(mixedKnownSource),
    providerCandidate(mixedCandidateSource, 0.9),
    providerCandidate(mixedCandidateSource, 0.1),
  ],
  now: "2026-06-15T10:00:00.000Z",
});
assert.equal(mixedPageOne.status, "ok");
assert.equal(mixedPageOne.rows.length, 1);
assert.equal(mixedPageOne.rows[0]?.kind, "material");
assert.equal(
  mixedPageOne.rows[0]?.kind === "material"
    ? refKey(mixedPageOne.rows[0].materialRef)
    : undefined,
  refKey(mixedKnownMaterialRef),
);
assert.notEqual(mixedPageOne.nextCursorPosition, undefined);

if (mixedPageOne.status !== "ok" || mixedPageOne.nextCursorPosition === undefined) {
  throw new Error("Expected first mixed page to be OK with a cursor.");
}

const storedMixedSet = createRetrievalResultSetRecords({
  db: mixedDatabase.context(),
}).resultSets.get({
  resultSetId: mixedPageOne.resultSetId,
});
assert.equal(storedMixedSet?.localResultWindowLimit, 10);
assert.equal(storedMixedSet?.localRowsInResultSet, 10);
assert.equal(storedMixedSet?.localResultWindowHasMore, true);
assert.equal(storedMixedSet?.queryFingerprint, "fp_mixed_alpha_beta");

const mixedRows = createRetrievalResultSetRecords({
  db: mixedDatabase.context(),
}).resultRows.listForResultSet({
  resultSetId: mixedPageOne.resultSetId,
});
assert.equal(mixedRows.length, 12);
assert.equal(
  mixedRows.filter((row) => row.materialRefKey === refKey(mixedKnownMaterialRef)).length,
  1,
);
assert.equal(
  mixedRows.filter((row) => row.materialCandidateRefKey === mixedCandidateRefKey).length,
  1,
);
assert.deepEqual(
  mixedRows.slice(0, 2).map((row) => row.rowKind),
  ["material", "material_candidate"],
);

const mixedPageTwo = mixedWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "alpha beta",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 1,
  queryFingerprint: "fp_mixed_alpha_beta",
  cursor: {
    resultSetId: mixedPageOne.resultSetId,
    position: mixedPageOne.nextCursorPosition,
  },
  now: "2026-06-15T10:01:00.000Z",
});
assert.equal(mixedPageTwo.status, "ok");
assert.equal(mixedPageTwo.rows[0]?.kind, "material_candidate");
assert.equal(
  mixedPageTwo.rows[0]?.kind === "material_candidate"
    ? refKey(mixedPageTwo.rows[0].materialCandidateRef)
    : undefined,
  mixedCandidateRefKey,
);

// Pagination must not overlap and must follow the stored rank order. mixedRows is
// the full stored result set ordered by listForResultSet (rank ORDER BY); page one
// and page two must map onto its first two rows with no shared identity.
if (mixedPageOne.rows[0] === undefined || mixedPageTwo.rows[0] === undefined) {
  throw new Error("Expected both mixed pages to carry a row.");
}
const pageOneKey = mixedRowKey(mixedPageOne.rows[0]);
const pageTwoKey = mixedRowKey(mixedPageTwo.rows[0]);
assert.notEqual(pageOneKey, pageTwoKey);
assert.equal(pageOneKey, mixedRows[0]?.materialRefKey);
assert.equal(pageTwoKey, mixedRows[1]?.materialCandidateRefKey);

// Replaying the result-set cursor under a different fingerprint must be rejected
// before any page rows are read. `now` is well inside the default 30-minute TTL so
// this exercises the fingerprint branch rather than the expiry branch.
assert.deepEqual(
  mixedWorkspace.searchMixedResultSet({
    ownerScope: DEFAULT_OWNER_SCOPE,
    text: "alpha beta",
    includeLocalCatalog: false,
    order: "text_relevance",
    limit: 1,
    queryFingerprint: "fp_mixed_alpha_beta_MISMATCH",
    cursor: {
      resultSetId: mixedPageOne.resultSetId,
      position: mixedPageOne.nextCursorPosition,
    },
    now: "2026-06-15T10:00:30.000Z",
  }),
  { status: "query_fingerprint_mismatch" },
);

const providerOnlyPage = mixedWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "alpha",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 10,
  queryFingerprint: "fp_provider_only",
  providerCandidates: [providerCandidate(mixedCandidateSource)],
  now: "2026-06-15T10:02:00.000Z",
});
assert.equal(providerOnlyPage.status, "ok");
assert.deepEqual(
  providerOnlyPage.status === "ok"
    ? providerOnlyPage.rows.map((row) => row.kind)
    : [],
  ["material_candidate"],
);

const missingTextDatabase = initializedDatabase();
const missingTextWorkspace = createMusicDataPlatformRetrievalWorkspace({
  database: missingTextDatabase,
});
const missingTextSource = sourceTrack("known_missing_text", "missing text alpha known");
const missingTextMaterialRef = materialRef("recording", "m_missing_text");
const missingTextCandidateRefKey = refKey(createProviderMaterialCandidateRef({
  sourceRef: missingTextSource.sourceRef,
}));

missingTextDatabase.transaction((db) => {
  const identity = createIdentityTestCommands(db, "2026-06-15T10:03:00.000Z");

  bindSourceToMaterial(identity, missingTextSource, missingTextMaterialRef);
});

const missingTextPage = missingTextWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "missing text alpha",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 10,
  queryFingerprint: "fp_missing_text",
  providerCandidates: [providerCandidate(missingTextSource)],
  now: "2026-06-15T10:04:00.000Z",
});
assert.equal(missingTextPage.status, "ok");
assert.deepEqual(
  missingTextPage.status === "ok"
    ? missingTextPage.rows.map((row) => row.kind)
    : [],
  [],
);
assert.equal(
  createRetrievalResultSetRecords({
    db: missingTextDatabase.context(),
  }).materialCandidates.getByRefKey({
    materialCandidateRefKey: missingTextCandidateRefKey,
  }),
  undefined,
);

const blockedDatabase = initializedDatabase();
const blockedWorkspace = createMusicDataPlatformRetrievalWorkspace({
  database: blockedDatabase,
});
const blockedSource = sourceTrack("blocked", "blocked alpha known");
const blockedMaterialRef = materialRef("recording", "m_blocked");
const unblockedCandidateSource = sourceTrack("unblocked_candidate", "blocked alpha candidate");

blockedDatabase.transaction((db) => {
  const identity = createIdentityTestCommands(db, "2026-06-15T11:00:00.000Z");

  bindSourceToMaterial(identity, blockedSource, blockedMaterialRef);
  createMaterialTextProjectionCommands({
    db,
    now: "2026-06-15T11:01:00.000Z",
  }).rebuildMaterialTextDocument({
    materialRef: blockedMaterialRef,
  });
  createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-15T11:02:00.000Z",
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockedMaterialRef,
    relationKind: "blocked",
    origin: "user_explicit",
  });
});

const blockedPage = blockedWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "blocked alpha",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 10,
  queryFingerprint: "fp_blocked",
  providerCandidates: [
    providerCandidate(blockedSource),
    providerCandidate(unblockedCandidateSource),
  ],
  now: "2026-06-15T11:03:00.000Z",
});
assert.equal(blockedPage.status, "ok");
assert.deepEqual(
  blockedPage.status === "ok"
    ? blockedPage.rows.map((row) => row.kind)
    : [],
  ["material_candidate"],
);

const expiryDatabase = initializedDatabase();
const expiryWorkspace = createMusicDataPlatformRetrievalWorkspace({
  database: expiryDatabase,
});
const expiryCandidateSource = sourceTrack("expiry_candidate", "expiry alpha candidate");
const expiryCandidateSourceTwo = sourceTrack("expiry_candidate_two", "expiry alpha candidate two");
const expiryPage = expiryWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "expiry alpha",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 1,
  queryFingerprint: "fp_expiry",
  providerCandidates: [
    providerCandidate(expiryCandidateSource),
    providerCandidate(expiryCandidateSourceTwo),
  ],
  now: "2026-06-15T12:00:00.000Z",
  ttlMs: 60000,
});
assert.equal(expiryPage.status, "ok");
if (expiryPage.status !== "ok" || expiryPage.nextCursorPosition === undefined) {
  throw new Error("Expected expiry page to be OK with a cursor.");
}
assert.deepEqual(
  expiryWorkspace.searchMixedResultSet({
    ownerScope: DEFAULT_OWNER_SCOPE,
    text: "expiry alpha",
    includeLocalCatalog: false,
    order: "text_relevance",
    limit: 1,
    queryFingerprint: "fp_expiry",
    cursor: {
      resultSetId: expiryPage.resultSetId,
      position: expiryPage.nextCursorPosition,
    },
    now: "2026-06-15T12:02:00.000Z",
  }),
  { status: "result_set_expired" },
);

// TTL boundary: equality (now === expiresAt) must count as expired. expiryPage was
// created at 12:00:00 with ttlMs 60000, so expiresAt is exactly 12:01:00.
assert.deepEqual(
  expiryWorkspace.searchMixedResultSet({
    ownerScope: DEFAULT_OWNER_SCOPE,
    text: "expiry alpha",
    includeLocalCatalog: false,
    order: "text_relevance",
    limit: 1,
    queryFingerprint: "fp_expiry",
    cursor: {
      resultSetId: expiryPage.resultSetId,
      position: expiryPage.nextCursorPosition,
    },
    now: "2026-06-15T12:01:00.000Z",
  }),
  { status: "result_set_expired" },
);

const candidateExpiryDatabase = initializedDatabase();
const candidateExpiryWorkspace = createMusicDataPlatformRetrievalWorkspace({
  database: candidateExpiryDatabase,
});
const candidateExpirySource = sourceTrack("candidate_expiry", "candidate expiry alpha");
const candidateExpirySourceTwo = sourceTrack("candidate_expiry_two", "candidate expiry beta");
const candidateExpiryPage = candidateExpiryWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "candidate expiry",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 1,
  queryFingerprint: "fp_candidate_expiry",
  providerCandidates: [
    providerCandidate(candidateExpirySource),
    providerCandidate(candidateExpirySourceTwo),
  ],
  now: "2026-06-15T13:00:00.000Z",
  ttlMs: 600000,
});
assert.equal(candidateExpiryPage.status, "ok");
if (candidateExpiryPage.status !== "ok" || candidateExpiryPage.nextCursorPosition === undefined) {
  throw new Error("Expected candidate-expiry page to be OK with a cursor.");
}
candidateExpiryDatabase.context().run(
  `
    UPDATE material_candidate_cache
    SET expires_at = ?
  `,
  ["2026-06-15T13:01:00.000Z"],
);
assert.deepEqual(
  candidateExpiryWorkspace.searchMixedResultSet({
    ownerScope: DEFAULT_OWNER_SCOPE,
    text: "candidate expiry",
    includeLocalCatalog: false,
    order: "text_relevance",
    limit: 1,
    queryFingerprint: "fp_candidate_expiry",
    cursor: {
      resultSetId: candidateExpiryPage.resultSetId,
      position: candidateExpiryPage.nextCursorPosition,
    },
    now: "2026-06-15T13:02:00.000Z",
  }),
  { status: "material_candidate_expired" },
);

// Multi-candidate merge through the real workspace: two unresolved candidates whose
// text matches the query with different token counts. The primary rank key is
// matched_token_count DESC, so the two-token match must lead the one-token match and
// the pages must not overlap. This exercises the real descriptors map + mixedPageSql
// ORDER BY with multi-candidate input (the MI fan-out test uses a stub workspace).
const mergeDatabase = initializedDatabase();
const mergeWorkspace = createMusicDataPlatformRetrievalWorkspace({
  database: mergeDatabase,
});
const mergeStrongSource = sourceTrack("merge_strong", "alpha beta");
const mergeWeakSource = sourceTrack("merge_weak", "alpha gamma");
const mergeStrongRefKey = refKey(createProviderMaterialCandidateRef({
  sourceRef: mergeStrongSource.sourceRef,
}));
const mergeWeakRefKey = refKey(createProviderMaterialCandidateRef({
  sourceRef: mergeWeakSource.sourceRef,
}));

const mergePageOne = mergeWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "alpha beta",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 1,
  queryFingerprint: "fp_merge",
  providerCandidates: [
    providerCandidate(mergeStrongSource),
    providerCandidate(mergeWeakSource),
  ],
  now: "2026-06-15T14:00:00.000Z",
});
assert.equal(mergePageOne.status, "ok");
if (mergePageOne.status !== "ok" || mergePageOne.nextCursorPosition === undefined) {
  throw new Error("Expected merge page one to be OK with a cursor.");
}
if (mergePageOne.rows[0] === undefined) {
  throw new Error("Expected merge page one to carry a row.");
}
assert.equal(mergePageOne.rows[0].kind, "material_candidate");
assert.equal(mixedRowKey(mergePageOne.rows[0]), mergeStrongRefKey);

const mergePageTwo = mergeWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "alpha beta",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 1,
  queryFingerprint: "fp_merge",
  cursor: {
    resultSetId: mergePageOne.resultSetId,
    position: mergePageOne.nextCursorPosition,
  },
  now: "2026-06-15T14:00:30.000Z",
});
assert.equal(mergePageTwo.status, "ok");
if (mergePageTwo.status !== "ok" || mergePageTwo.rows[0] === undefined) {
  throw new Error("Expected merge page two to be OK with a row.");
}
assert.equal(mergePageTwo.rows[0].kind, "material_candidate");
assert.equal(mixedRowKey(mergePageTwo.rows[0]), mergeWeakRefKey);
assert.notEqual(
  mixedRowKey(mergePageOne.rows[0]),
  mixedRowKey(mergePageTwo.rows[0]),
);

const providerDisplayDatabase = initializedDatabase();
const providerDisplayWorkspace = createMusicDataPlatformRetrievalWorkspace({
  database: providerDisplayDatabase,
});
const providerDisplayPage = providerDisplayWorkspace.searchMixedResultSet({
  ownerScope: DEFAULT_OWNER_SCOPE,
  text: "mili",
  includeLocalCatalog: false,
  order: "text_relevance",
  limit: 1,
  queryFingerprint: "fp_provider_display",
  providerCandidates: [
    providerCandidate({
      ...sourceTrack("provider_display", "SAIKAI"),
      label: "SAIKAI - Mili",
      artistLabels: ["Mili"],
      albumLabel: "SAIKAI",
    }),
  ],
  now: "2026-06-15T14:30:00.000Z",
});
assert.equal(providerDisplayPage.status, "ok");
if (providerDisplayPage.status !== "ok" || providerDisplayPage.rows[0] === undefined) {
  throw new Error("Expected provider display page to be OK with a row.");
}
assert.equal(providerDisplayPage.rows[0].kind, "material_candidate");
assert.equal(providerDisplayPage.rows[0].titleText, "saikai");
assert.equal(providerDisplayPage.rows[0].artistText, "mili");
assert.equal(providerDisplayPage.rows[0].albumText, "saikai");

mixedDatabase.close();
missingTextDatabase.close();
blockedDatabase.close();
expiryDatabase.close();
candidateExpiryDatabase.close();
mergeDatabase.close();
providerDisplayDatabase.close();

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSourceLibrarySchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerCatalogViewSchema,
      musicDataPlatformMaterialTextProjectionSchema,
      musicDataPlatformProjectionMaintenanceSchema,
      musicDataPlatformRetrievalResultSetSchema,
    ],
  });
  return database;
}

function createIdentityTestCommands(
  db: Parameters<typeof createIdentityWriteCommands>[0]["db"],
  now: string,
) {
  return createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

function bindSourceToMaterial(
  identity: ReturnType<typeof createIdentityTestCommands>,
  source: SourceEntity,
  nextMaterialRef: Ref,
): void {
  identity.upsertSourceRecord({ entity: source });
  identity.upsertMaterialRecord({
    materialRef: nextMaterialRef,
    kind: nextMaterialRef.kind as MaterialEntityKind,
  });
  identity.bindSourceToMaterial({
    sourceRef: source.sourceRef,
    materialRef: nextMaterialRef,
    makePrimary: true,
  });
}

function upsertLibrary(
  libraries: ReturnType<typeof createSourceLibraryRepositories>,
  libraryRef: Ref,
  providerAccountId: string,
): void {
  libraries.libraries.upsert({
    libraryRef,
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId,
    libraryKind: "saved_source_track",
    createdAt: "2026-06-15T09:00:00.000Z",
    updatedAt: "2026-06-15T09:00:00.000Z",
  });
}

function upsertLibraryItem(
  libraries: ReturnType<typeof createSourceLibraryRepositories>,
  libraryRef: Ref,
  sourceRef: Ref,
  addedAt: string,
): void {
  libraries.items.upsert({
    libraryRef,
    sourceRefKey: refKey(sourceRef),
    addedAt,
    providerAddedAt: addedAt,
    firstImportedAt: addedAt,
  });
}

function providerCandidate(
  sourceEntity: SourceEntity,
  providerScore?: number,
): ProviderMaterialCandidate {
  return {
    sourceEntity,
    ...(providerScore === undefined ? {} : { providerScore }),
  };
}

function sourceTrack(id: string, title: string): SourceTrack {
  return {
    kind: "track",
    sourceRef: {
      namespace: "source_netease",
      kind: "track",
      id,
    },
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
    artistLabels: ["MineMusic Test Artist"],
  };
}

function sourceLibraryRef(providerAccountId: string): Ref {
  return createSourceLibraryRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    providerId: "netease",
    providerAccountId,
    libraryKind: "saved_source_track",
  });
}

function materialRef(kind: MaterialEntityKind, id: string): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
}

function mixedRowKey(row: MusicDataPlatformMixedRetrievalRow): string {
  return row.kind === "material"
    ? refKey(row.materialRef)
    : refKey(row.materialCandidateRef);
}
