import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import {
  isMusicDatabaseError,
  MusicDatabaseError,
  SqliteMusicDatabase,
  type MusicDatabase,
  type MusicDatabaseContext,
  type MusicDatabaseSchemaContribution,
} from "../../src/storage/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

export type _musicDatabaseContextShape = Expect<
  Equal<keyof MusicDatabaseContext, "run" | "all" | "get">
>;

export type _musicDatabaseShape = Expect<
  Equal<keyof MusicDatabase, "initialize" | "context" | "transaction" | "close">
>;

assertDatabaseError(
  () => SqliteMusicDatabase.open({ filename: "" }),
  "storage.invalid_database_filename",
);
assertDatabaseError(
  () => SqliteMusicDatabase.open({ filename: "   " }),
  "storage.invalid_database_filename",
);

const preInitDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
assertDatabaseError(() => preInitDatabase.context(), "storage.database_not_initialized");
assertDatabaseError(
  () => preInitDatabase.transaction(() => undefined),
  "storage.database_not_initialized",
);
preInitDatabase.close();

const orderedDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
const schemaOrder: string[] = [];
orderedDatabase.initialize({
  schemas: [
    schema("first", schemaOrder, (context) => {
      context.run("CREATE TABLE first_schema (id INTEGER PRIMARY KEY, label TEXT)");
    }),
    schema("second", schemaOrder, (context) => {
      context.run("CREATE TABLE second_schema (id INTEGER PRIMARY KEY, label TEXT)");
    }),
    schema("unique", schemaOrder, (context) => {
      context.run("CREATE TABLE unique_schema (id INTEGER PRIMARY KEY, label TEXT UNIQUE)");
      context.run("INSERT INTO unique_schema (label) VALUES (?)", ["duplicate"]);
    }),
  ],
});

assert.deepEqual(schemaOrder, ["first", "second", "unique"]);
assertDatabaseError(
  () => orderedDatabase.initialize(),
  "storage.database_already_initialized",
);

const pragmaContext = orderedDatabase.context();
assert.equal(pragmaContext.get<{ foreign_keys: number }>("PRAGMA foreign_keys")?.foreign_keys, 1);
assert.equal(pragmaContext.get<{ synchronous: number }>("PRAGMA synchronous")?.synchronous, 1);
assert.equal(typeof pragmaContext.get<{ journal_mode: string }>("PRAGMA journal_mode")?.journal_mode, "string");

pragmaContext.run("INSERT INTO first_schema (label) VALUES (?)", ["alpha"]);
pragmaContext.run("INSERT INTO first_schema (label) VALUES (?)", ["beta"]);
assert.deepEqual(
  pragmaContext.all<{ label: string }>("SELECT label FROM first_schema WHERE label > ? ORDER BY label", ["a"])
    .map((row) => row.label),
  ["alpha", "beta"],
);
assert.equal(
  pragmaContext.get<{ label: string }>("SELECT label FROM first_schema WHERE label = ?", ["alpha"])?.label,
  "alpha",
);
assert.equal(
  pragmaContext.get<{ label: string }>("SELECT label FROM first_schema WHERE label = ?", ["missing"]),
  undefined,
);

orderedDatabase.transaction((context) => {
  context.run("INSERT INTO first_schema (label) VALUES (?)", ["committed"]);
});
assert.equal(
  pragmaContext.get<{ count: number }>("SELECT COUNT(*) AS count FROM first_schema WHERE label = ?", ["committed"])
    ?.count,
  1,
);

const rollbackError = new Error("rollback fixture");
assert.throws(
  () => {
    orderedDatabase.transaction((context) => {
      context.run("INSERT INTO first_schema (label) VALUES (?)", ["rolled-back"]);
      throw rollbackError;
    });
  },
  (error) => error === rollbackError,
);
assert.equal(
  pragmaContext.get<{ count: number }>("SELECT COUNT(*) AS count FROM first_schema WHERE label = ?", ["rolled-back"])
    ?.count,
  0,
);
orderedDatabase.transaction((context) => {
  context.run("INSERT INTO first_schema (label) VALUES (?)", ["after-rollback"]);
});
assert.equal(
  pragmaContext.get<{ count: number }>("SELECT COUNT(*) AS count FROM first_schema WHERE label = ?", ["after-rollback"])
    ?.count,
  1,
);

let autoRollbackError: unknown;
assert.throws(
  () => {
    orderedDatabase.transaction((context) => {
      context.run("INSERT OR ROLLBACK INTO unique_schema (label) VALUES (?)", ["duplicate"]);
    });
  },
  (error) => {
    autoRollbackError = error;
    return error instanceof Error &&
      error.message.includes("UNIQUE constraint failed") &&
      !error.message.includes("cannot rollback");
  },
);
orderedDatabase.transaction((context) => {
  context.run("INSERT INTO unique_schema (label) VALUES (?)", ["after-auto-rollback"]);
});
assert.equal(
  pragmaContext.get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM unique_schema WHERE label = ?",
    ["after-auto-rollback"],
  )?.count,
  1,
);
assert.notEqual(autoRollbackError, undefined);

assertDatabaseError(
  () => {
    orderedDatabase.transaction(() => {
      orderedDatabase.transaction(() => undefined);
    });
  },
  "storage.transaction_already_active",
);
assertDatabaseError(
  () => {
    orderedDatabase.transaction(() => {
      orderedDatabase.close();
    });
  },
  "storage.transaction_already_active",
);

orderedDatabase.close();
orderedDatabase.close();
assertDatabaseError(() => orderedDatabase.context(), "storage.database_closed");
assertDatabaseError(
  () => orderedDatabase.transaction(() => undefined),
  "storage.database_closed",
);
assertDatabaseError(() => orderedDatabase.initialize(), "storage.database_closed");

const failingDatabase = SqliteMusicDatabase.open({ filename: ":memory:" });
assertDatabaseError(
  () => {
    failingDatabase.initialize({
      schemas: [
        {
          id: "failing",
          apply() {
            throw new Error("schema fixture failed");
          },
        },
      ],
    });
  },
  "storage.database_initialization_failed",
);
assertDatabaseError(() => failingDatabase.context(), "storage.database_initialization_failed");
assertDatabaseError(
  () => failingDatabase.transaction(() => undefined),
  "storage.database_initialization_failed",
);
assertDatabaseError(() => failingDatabase.initialize(), "storage.database_initialization_failed");
failingDatabase.close();
failingDatabase.close();

const lockFixtureDir = mkdtempSync(join(tmpdir(), "minemusic-storage-lock-"));
const lockFixtureFilename = join(lockFixtureDir, "music.db");
const lockingDatabase = SqliteMusicDatabase.open({ filename: lockFixtureFilename });
const blockedDatabase = SqliteMusicDatabase.open({ filename: lockFixtureFilename });
lockingDatabase.initialize({
  schemas: [
    {
      id: "lock-fixture",
      apply(context) {
        context.run("CREATE TABLE lock_fixture (id INTEGER PRIMARY KEY, label TEXT)");
      },
    },
  ],
});
blockedDatabase.initialize();

let beginFailure: unknown;
lockingDatabase.transaction(() => {
  try {
    blockedDatabase.transaction(() => undefined);
  } catch (error) {
    beginFailure = error;
  }
});

assert.notEqual(beginFailure, undefined);
blockedDatabase.transaction((context) => {
  context.run("INSERT INTO lock_fixture (label) VALUES (?)", ["after-begin-failure"]);
});
assert.equal(
  blockedDatabase.context().get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM lock_fixture WHERE label = ?",
    ["after-begin-failure"],
  )?.count,
  1,
);
blockedDatabase.close();
lockingDatabase.close();

await assertRawSqliteBoundary();

function schema(
  id: string,
  order: string[],
  apply: (context: MusicDatabaseContext) => void,
): MusicDatabaseSchemaContribution {
  return {
    id,
    apply(context) {
      order.push(id);
      apply(context);
    },
  };
}

function assertDatabaseError(operation: () => unknown, code: MusicDatabaseError["code"]): void {
  assert.throws(
    operation,
    (error) => isMusicDatabaseError(error) && error.code === code,
  );
}

async function assertRawSqliteBoundary(): Promise<void> {
  const repositoryRoot = process.cwd();
  const allowedFiles = new Set([
    "src/storage/sqlite/database.ts",
    "test/formal/music-database.test.ts",
  ]);
  const failures: string[] = [];

  for (const root of ["src", "test"]) {
    for (const file of await sourceFilesUnder(join(repositoryRoot, root))) {
      const relativeFile = relative(repositoryRoot, file);
      const text = await readFile(file, "utf8");

      for (const token of ["node:sqlite", "DatabaseSync", "StatementSync"]) {
        if (!text.includes(token)) {
          continue;
        }

        if (!allowedFiles.has(relativeFile)) {
          failures.push(`${relativeFile} mentions raw SQLite token '${token}'`);
        }
      }
    }
  }

  assert.deepEqual(failures, []);
}

async function sourceFilesUnder(root: string): Promise<string[]> {
  const entry = await stat(root);

  if (entry.isFile()) {
    return root.endsWith(".ts") ? [root] : [];
  }

  const files: string[] = [];
  const children = await readdir(root, { withFileTypes: true });

  for (const child of children) {
    const childPath = join(root, child.name);

    if (child.isDirectory()) {
      files.push(...await sourceFilesUnder(childPath));
      continue;
    }

    if (child.isFile() && child.name.endsWith(".ts")) {
      files.push(childPath);
    }
  }

  return files;
}
