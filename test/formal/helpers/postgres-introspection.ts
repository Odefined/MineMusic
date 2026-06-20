import type { MusicDatabase, MusicDatabaseContext } from "../../../src/storage/index.js";

type DatabaseLike = MusicDatabase | MusicDatabaseContext;

export async function relationKind(database: DatabaseLike, relationName: string): Promise<"table" | "view" | undefined> {
    const row = await contextOf(database).get<{ relkind: string }>(`
      SELECT c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = ?
    `, [relationName]);

    if (row === undefined) {
        return undefined;
    }

    if (row.relkind === "r" || row.relkind === "p") {
        return "table";
    }

    if (row.relkind === "v" || row.relkind === "m") {
        return "view";
    }

    return undefined;
}

export async function tableColumns(database: DatabaseLike, tableName: string): Promise<readonly string[]> {
    return (await contextOf(database).all<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ?
      ORDER BY ordinal_position
    `, [tableName])).map((row) => row.column_name);
}

export async function primaryKeyColumns(database: DatabaseLike, tableName: string): Promise<readonly string[]> {
    return (await contextOf(database).all<{ column_name: string }>(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema
       AND kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = current_schema()
        AND tc.table_name = ?
      ORDER BY kcu.ordinal_position
    `, [tableName])).map((row) => row.column_name);
}

export async function foreignKeyColumns(database: DatabaseLike, tableName: string): Promise<readonly {
    table: string;
    from: string;
    to: string;
}[]> {
    return (await contextOf(database).all<{
        foreign_table_name: string;
        column_name: string;
        foreign_column_name: string;
    }>(`
      SELECT
        ccu.table_name AS foreign_table_name,
        kcu.column_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema
       AND kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_schema = tc.constraint_schema
       AND ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = current_schema()
        AND tc.table_name = ?
      ORDER BY kcu.ordinal_position
    `, [tableName])).map((row) => ({
        table: row.foreign_table_name,
        from: row.column_name,
        to: row.foreign_column_name,
    }));
}

export async function uniqueIndexCovers(database: DatabaseLike, tableName: string, columnNames: readonly string[]): Promise<boolean> {
    const expectedColumns = `(${columnNames.join(", ")})`;
    return (await contextOf(database).all<{ indexdef: string }>(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = ?
    `, [tableName])).some((index) =>
        index.indexdef.startsWith("CREATE UNIQUE INDEX ") &&
        index.indexdef.includes(expectedColumns),
    );
}

export async function indexCovers(database: DatabaseLike, indexName: string, columnNames: readonly string[]): Promise<boolean> {
    const expectedColumns = `(${columnNames.join(", ")})`;
    const row = await contextOf(database).get<{ indexdef: string }>(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = ?
    `, [indexName]);
    return row?.indexdef.includes(expectedColumns) ?? false;
}

export async function indexExists(database: DatabaseLike, indexName: string): Promise<boolean> {
    return await contextOf(database).get<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = ?
    `, [indexName]) !== undefined;
}

function contextOf(database: DatabaseLike): MusicDatabaseContext {
    return "context" in database ? database.context() : database;
}
