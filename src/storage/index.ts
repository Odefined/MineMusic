export {
  isMusicDatabaseError,
  MusicDatabaseError,
} from "./database.js";
export type {
  InitializeMusicDatabaseInput,
  MusicDatabase,
  MusicDatabaseContext,
  MusicDatabaseErrorCode,
  MusicDatabaseImmediateResult,
  MusicDatabaseParameter,
  MusicDatabaseSchemaContribution,
} from "./database.js";
export {
  SqliteMusicDatabase,
} from "./sqlite/database.js";
export type {
  OpenSqliteMusicDatabaseInput,
} from "./sqlite/database.js";
export {
  initializeSqliteSchema,
} from "./sqlite/schema.js";
export type {
  InitializeSqliteSchemaInput,
} from "./sqlite/schema.js";
