import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  MaterialSearchDocument,
  MaterialSearchEvidence,
  MaterialSearchEvidenceField,
  MaterialSearchIndexHit,
  Ref,
  Result,
  StageError,
} from "../../contracts/index.js";
import type {
  MaterialSearchDocumentProviderPort,
  MaterialSearchIndexPort,
} from "../../ports/index.js";
import { initializeMaterialSearchSchema } from "./material-search-schema.js";

export type SqliteMaterialSearchIndexOptions = {
  path?: string;
  documents: MaterialSearchDocumentProviderPort;
  now?: () => string;
};

type SearchField = {
  field: MaterialSearchEvidenceField;
  column: keyof IndexedDocumentRow;
  documentValue(document: MaterialSearchDocument): string | string[] | undefined;
  snippetColumn: number;
  weight: number;
};

type IndexedDocumentRow = {
  material_key: string;
  material_ref_json: string;
  kind: string;
  canonical_label: string;
  canonical_aliases: string;
  source_title: string;
  source_artist_labels: string;
  source_release_label: string;
  source_artist_aliases: string;
};

type FtsHitRow = IndexedDocumentRow & {
  rank_score: number;
  canonical_label_snippet: string;
  canonical_aliases_snippet: string;
  source_title_snippet: string;
  source_artist_labels_snippet: string;
  source_release_label_snippet: string;
  source_artist_aliases_snippet: string;
};

type DirtyRow = {
  material_key: string;
};

const defaultLimit = 50;
const bootstrappedMetadataKey = "bootstrapped";
const candidatePoolTableName = "temp_material_search_pool";

const searchFields: SearchField[] = [
  {
    field: "canonical_label",
    column: "canonical_label",
    documentValue: (document) => document.canonicalLabel,
    snippetColumn: 0,
    weight: 8,
  },
  {
    field: "canonical_aliases",
    column: "canonical_aliases",
    documentValue: (document) => document.canonicalAliases,
    snippetColumn: 1,
    weight: 5,
  },
  {
    field: "source_title",
    column: "source_title",
    documentValue: (document) => document.sourceTitle,
    snippetColumn: 2,
    weight: 6,
  },
  {
    field: "source_artist_labels",
    column: "source_artist_labels",
    documentValue: (document) => document.sourceArtistLabels,
    snippetColumn: 3,
    weight: 2,
  },
  {
    field: "source_release_label",
    column: "source_release_label",
    documentValue: (document) => document.sourceReleaseLabel,
    snippetColumn: 4,
    weight: 2,
  },
  {
    field: "source_artist_aliases",
    column: "source_artist_aliases",
    documentValue: (document) => document.sourceArtistAliases,
    snippetColumn: 5,
    weight: 1,
  },
];

export function createSqliteMaterialSearchIndex({
  path = ":memory:",
  documents,
  now = () => new Date().toISOString(),
}: SqliteMaterialSearchIndexOptions): MaterialSearchIndexPort {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const database = new DatabaseSync(path);
  initializeMaterialSearchSchema(database);

  return {
    async markDirty({ materialRef }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO material_search_dirty (
              material_key,
              material_ref_json,
              dirty_at
            )
            VALUES (?, ?, ?)
            ON CONFLICT(material_key) DO UPDATE SET
              material_ref_json = excluded.material_ref_json,
              dirty_at = excluded.dirty_at
          `)
          .run(materialKey(materialRef), toJson(materialRef), now());

        return undefined;
      });
    },

    async refreshDirty({ materialRefs }) {
      const candidateRefs = uniqueRefs(materialRefs);
      const dirtyRefs = await readResult(() => {
        prepareCandidatePool(database, candidateRefs.map(materialKey));
        return dirtyRefsForCandidatePool(database, candidateRefs);
      });

      if (!dirtyRefs.ok) {
        return dirtyRefs;
      }

      for (const materialRef of dirtyRefs.value) {
        const document = await documents.buildSearchDocument({ materialRef });

        if (!document.ok) {
          return document;
        }

        const written = await readResult(() => {
          if (document.value === null) {
            deleteDocument(database, materialRef);
          } else {
            if (materialKey(document.value.materialRef) !== materialKey(materialRef)) {
              deleteDocument(database, materialRef);
            }

            upsertDocument(database, document.value);
          }

          clearDirty(database, materialRef);
          return undefined;
        });

        if (!written.ok) {
          return written;
        }
      }

      return ok(undefined);
    },

    async rebuildAll() {
      const allDocuments = await documents.buildAllSearchDocuments();

      if (!allDocuments.ok) {
        return allDocuments;
      }

      return readResult(() => {
        database.exec("DELETE FROM material_search_fts");
        database.exec("DELETE FROM material_search_dirty");

        for (const document of allDocuments.value) {
          upsertDocument(database, document);
        }

        setMetadata(database, bootstrappedMetadataKey, "true");
        return undefined;
      });
    },

    async search(input) {
      const normalizedText = normalizeSearchText(input.text);
      const candidateRefs = uniqueRefs(input.candidateMaterialRefs);

      if (candidateRefs.length === 0 || normalizedText.length === 0) {
        return ok({ hits: [] });
      }

      const bootstrapped = await ensureBootstrapped(database, documents);

      if (!bootstrapped.ok) {
        return bootstrapped;
      }

      const preparedPool = await readResult(() => {
        prepareCandidatePool(database, candidateRefs.map(materialKey));
        return undefined;
      });

      if (!preparedPool.ok) {
        return preparedPool;
      }

      const ensuredCandidates = await ensureCandidateDocuments(database, documents, candidateRefs);

      if (!ensuredCandidates.ok) {
        return ensuredCandidates;
      }

      const limit = normalizeLimit(input.limit);
      const ftsHits = await readResult(() => searchFts(database, normalizedText, limit));

      if (!ftsHits.ok) {
        return ftsHits;
      }

      const substringHits = await readResult(() => searchSubstring(database, normalizedText));

      if (!substringHits.ok) {
        return substringHits;
      }

      return ok({
        hits: mergeHits([...ftsHits.value, ...substringHits.value]).slice(0, limit),
      });
    },
  };
}

async function ensureBootstrapped(
  database: DatabaseSync,
  documents: MaterialSearchDocumentProviderPort,
): Promise<Result<void>> {
  const needsBootstrap = await readResult(() =>
    getMetadata(database, bootstrappedMetadataKey) !== "true" || indexedDocumentCount(database) === 0
  );

  if (!needsBootstrap.ok) {
    return needsBootstrap;
  }

  if (!needsBootstrap.value) {
    return ok(undefined);
  }

  const allDocuments = await documents.buildAllSearchDocuments();

  if (!allDocuments.ok) {
    return allDocuments;
  }

  return readResult(() => {
    database.exec("DELETE FROM material_search_fts");

    for (const document of allDocuments.value) {
      upsertDocument(database, document);
    }

    setMetadata(database, bootstrappedMetadataKey, "true");
    return undefined;
  });
}

async function ensureCandidateDocuments(
  database: DatabaseSync,
  documents: MaterialSearchDocumentProviderPort,
  candidateRefs: Ref[],
): Promise<Result<void>> {
  const missingRefs = await readResult(() => missingCandidateRefsForPool(database, candidateRefs));

  if (!missingRefs.ok) {
    return missingRefs;
  }

  for (const materialRef of missingRefs.value) {
    const document = await documents.buildSearchDocument({ materialRef });

    if (!document.ok) {
      return document;
    }

    const written = await readResult(() => {
      writeDocumentForCandidate(database, materialRef, document.value);
      return undefined;
    });

    if (!written.ok) {
      return written;
    }
  }

  return ok(undefined);
}

function searchFts(
  database: DatabaseSync,
  normalizedText: string,
  limit: number,
): MaterialSearchIndexHit[] {
  const ftsQuery = ftsQueryForText(normalizedText);

  if (ftsQuery.length === 0) {
    return [];
  }

  const rows = database
    .prepare(`
      SELECT
        material_search_fts.material_key AS material_key,
        material_search_fts.material_ref_json AS material_ref_json,
        material_search_fts.kind AS kind,
        material_search_fts.canonical_label AS canonical_label,
        material_search_fts.canonical_aliases AS canonical_aliases,
        material_search_fts.source_title AS source_title,
        material_search_fts.source_artist_labels AS source_artist_labels,
        material_search_fts.source_release_label AS source_release_label,
        material_search_fts.source_artist_aliases AS source_artist_aliases,
        -bm25(material_search_fts, 8.0, 5.0, 6.0, 2.0, 2.0, 1.0, 0.0, 0.0, 0.0) AS rank_score,
        snippet(material_search_fts, 0, '[[', ']]', '...', 8) AS canonical_label_snippet,
        snippet(material_search_fts, 1, '[[', ']]', '...', 8) AS canonical_aliases_snippet,
        snippet(material_search_fts, 2, '[[', ']]', '...', 8) AS source_title_snippet,
        snippet(material_search_fts, 3, '[[', ']]', '...', 8) AS source_artist_labels_snippet,
        snippet(material_search_fts, 4, '[[', ']]', '...', 8) AS source_release_label_snippet,
        snippet(material_search_fts, 5, '[[', ']]', '...', 8) AS source_artist_aliases_snippet
      FROM material_search_fts
      JOIN ${candidatePoolTableName} AS pool
        ON pool.material_key = material_search_fts.material_key
      WHERE material_search_fts MATCH ?
      ORDER BY rank_score DESC, material_search_fts.material_key ASC
      LIMIT ?
    `)
    .all(ftsQuery, limit) as FtsHitRow[];

  return rows.map((row) => {
    const evidence = ftsEvidenceForRow(row, normalizedText);
    return {
      materialRef: fromJson<Ref>(row.material_ref_json),
      score: evidenceScore(evidence) + Math.max(0, row.rank_score),
      evidence,
    };
  });
}

function searchSubstring(
  database: DatabaseSync,
  normalizedText: string,
): MaterialSearchIndexHit[] {
  const rows = database
    .prepare(`
      SELECT
        material_search_fts.material_key AS material_key,
        material_search_fts.material_ref_json AS material_ref_json,
        material_search_fts.kind AS kind,
        material_search_fts.canonical_label AS canonical_label,
        material_search_fts.canonical_aliases AS canonical_aliases,
        material_search_fts.source_title AS source_title,
        material_search_fts.source_artist_labels AS source_artist_labels,
        material_search_fts.source_release_label AS source_release_label,
        material_search_fts.source_artist_aliases AS source_artist_aliases
      FROM material_search_fts
      JOIN ${candidatePoolTableName} AS pool
        ON pool.material_key = material_search_fts.material_key
      ORDER BY material_search_fts.material_key ASC
    `)
    .all() as IndexedDocumentRow[];

  return rows.flatMap((row): MaterialSearchIndexHit[] => {
    const evidence = substringEvidenceForRow(row, normalizedText);

    if (evidence.length === 0) {
      return [];
    }

    return [{
      materialRef: fromJson<Ref>(row.material_ref_json),
      score: evidenceScore(evidence),
      evidence,
    }];
  });
}

function upsertDocument(database: DatabaseSync, document: MaterialSearchDocument): void {
  const key = materialKey(document.materialRef);
  deleteDocument(database, document.materialRef);

  database
    .prepare(`
      INSERT INTO material_search_fts (
        canonical_label,
        canonical_aliases,
        source_title,
        source_artist_labels,
        source_release_label,
        source_artist_aliases,
        material_key,
        material_ref_json,
        kind
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      joinDocumentValue(document.canonicalLabel),
      joinDocumentValue(document.canonicalAliases),
      joinDocumentValue(document.sourceTitle),
      joinDocumentValue(document.sourceArtistLabels),
      joinDocumentValue(document.sourceReleaseLabel),
      joinDocumentValue(document.sourceArtistAliases),
      key,
      toJson(document.materialRef),
      document.kind,
    );
}

function deleteDocument(database: DatabaseSync, materialRef: Ref): void {
  database
    .prepare(`
      DELETE FROM material_search_fts
      WHERE material_key = ?
    `)
    .run(materialKey(materialRef));
}

function writeDocumentForCandidate(
  database: DatabaseSync,
  candidateRef: Ref,
  document: MaterialSearchDocument | null,
): void {
  if (document === null) {
    deleteDocument(database, candidateRef);
    return;
  }

  if (materialKey(document.materialRef) !== materialKey(candidateRef)) {
    deleteDocument(database, candidateRef);
  }

  upsertDocument(database, document);
}

function prepareCandidatePool(database: DatabaseSync, candidateKeys: string[]): void {
  database.exec(`
    CREATE TEMP TABLE IF NOT EXISTS ${candidatePoolTableName} (
      material_key TEXT PRIMARY KEY
    )
  `);
  database.exec(`DELETE FROM ${candidatePoolTableName}`);

  const insert = database.prepare(`
    INSERT OR IGNORE INTO ${candidatePoolTableName} (material_key)
    VALUES (?)
  `);

  for (const key of candidateKeys) {
    insert.run(key);
  }
}

function missingCandidateRefsForPool(database: DatabaseSync, candidateRefs: Ref[]): Ref[] {
  const candidateByKey = new Map(candidateRefs.map((ref) => [materialKey(ref), ref]));
  const rows = database
    .prepare(`
      SELECT pool.material_key AS material_key
      FROM ${candidatePoolTableName} AS pool
      LEFT JOIN material_search_fts
        ON material_search_fts.material_key = pool.material_key
      WHERE material_search_fts.material_key IS NULL
      ORDER BY pool.material_key ASC
    `)
    .all() as Array<{ material_key: string }>;

  return rows.flatMap((row) => {
    const ref = candidateByKey.get(row.material_key);
    return ref === undefined ? [] : [ref];
  });
}

function dirtyRefsForCandidatePool(database: DatabaseSync, candidateRefs: Ref[]): Ref[] {
  const candidateByKey = new Map(candidateRefs.map((ref) => [materialKey(ref), ref]));

  if (candidateRefs.length === 0) {
    return [];
  }

  const rows = database
    .prepare(`
      SELECT material_search_dirty.material_key AS material_key
      FROM material_search_dirty
      JOIN ${candidatePoolTableName} AS pool
        ON pool.material_key = material_search_dirty.material_key
      ORDER BY material_search_dirty.material_key ASC
    `)
    .all() as DirtyRow[];

  return rows.flatMap((row) => {
    const ref = candidateByKey.get(row.material_key);
    return ref === undefined ? [] : [ref];
  });
}

function clearDirty(database: DatabaseSync, materialRef: Ref): void {
  database
    .prepare(`
      DELETE FROM material_search_dirty
      WHERE material_key = ?
    `)
    .run(materialKey(materialRef));
}

function getMetadata(database: DatabaseSync, key: string): string | null {
  const row = database
    .prepare(`
      SELECT value
      FROM material_search_metadata
      WHERE key = ?
    `)
    .get(key) as { value: string } | undefined;

  return row?.value ?? null;
}

function setMetadata(database: DatabaseSync, key: string, value: string): void {
  database
    .prepare(`
      INSERT INTO material_search_metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value
    `)
    .run(key, value);
}

function indexedDocumentCount(database: DatabaseSync): number {
  const row = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM material_search_fts
    `)
    .get() as { count: number } | undefined;

  return row?.count ?? 0;
}

function ftsEvidenceForRow(row: FtsHitRow, normalizedText: string): MaterialSearchEvidence[] {
  const tokens = normalizedText.split(/\s+/).filter((token) => token.length > 0);

  return searchFields.flatMap((field): MaterialSearchEvidence[] => {
    const value = normalizeSearchText(String(row[field.column] ?? ""));
    const hasToken = tokens.some((token) => value.includes(token));

    if (!hasToken) {
      return [];
    }

    const snippet = snippetForField(row, field);

    return [{
      field: field.field,
      matchKind: "fts",
      ...(snippet === undefined ? {} : { snippet }),
    }];
  });
}

function substringEvidenceForRow(row: IndexedDocumentRow, normalizedText: string): MaterialSearchEvidence[] {
  return searchFields.flatMap((field): MaterialSearchEvidence[] => {
    const value = normalizeSearchText(String(row[field.column] ?? ""));

    return value.includes(normalizedText)
      ? [{ field: field.field, matchKind: "substring" }]
      : [];
  });
}

function snippetForField(row: FtsHitRow, field: SearchField): string | undefined {
  const snippet = row[`${field.field}_snippet` as keyof FtsHitRow];

  return typeof snippet === "string" && snippet.includes("[[")
    ? snippet
    : undefined;
}

function evidenceScore(evidence: MaterialSearchEvidence[]): number {
  return evidence.reduce((score, item) => {
    const field = searchFields.find((candidate) => candidate.field === item.field);
    return score + (field?.weight ?? 1);
  }, 0);
}

function mergeHits(hits: MaterialSearchIndexHit[]): MaterialSearchIndexHit[] {
  const merged = new Map<string, MaterialSearchIndexHit>();

  for (const hit of hits) {
    const key = materialKey(hit.materialRef);
    const existing = merged.get(key);

    if (existing === undefined) {
      merged.set(key, {
        materialRef: hit.materialRef,
        score: hit.score,
        evidence: dedupeEvidence(hit.evidence),
      });
      continue;
    }

    existing.score = Math.max(existing.score, hit.score);
    existing.evidence = dedupeEvidence([...existing.evidence, ...hit.evidence]);
  }

  return [...merged.values()].sort((left, right) =>
    right.score - left.score || materialKey(left.materialRef).localeCompare(materialKey(right.materialRef))
  );
}

function dedupeEvidence(evidence: MaterialSearchEvidence[]): MaterialSearchEvidence[] {
  const seen = new Set<string>();
  const unique: MaterialSearchEvidence[] = [];

  for (const item of evidence) {
    const key = `${item.field}:${item.matchKind}:${item.snippet ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function ftsQueryForText(text: string): string {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replaceAll("\"", "\"\"")}"`)
    .join(" OR ");
}

function joinDocumentValue(value: string | string[] | undefined): string {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of values.map((candidate) => candidate.trim()).filter((candidate) => candidate.length > 0)) {
    const key = normalizeSearchText(entry);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(entry);
  }

  return normalized.join("\n");
}

function normalizeSearchText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLimit(limit: number | undefined): number {
  return limit === undefined || !Number.isFinite(limit) || limit <= 0
    ? defaultLimit
    : Math.max(1, Math.floor(limit));
}

function uniqueRefs(refs: Ref[]): Ref[] {
  const seen = new Set<string>();
  const unique: Ref[] = [];

  for (const ref of refs) {
    const key = materialKey(ref);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(ref);
  }

  return unique;
}

function materialKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}

async function readResult<T>(operation: () => T): Promise<Result<T>> {
  try {
    return ok(operation());
  } catch (cause) {
    return fail({
      code: "storage.unavailable",
      message: cause instanceof Error ? cause.message : "SQLite Material Search operation failed.",
      module: "storage",
      retryable: false,
      cause,
    });
  }
}
