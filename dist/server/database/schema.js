import { readFile } from "node:fs/promises";
const schemaUrl = new URL("../../../database/schema.sql", import.meta.url);
export async function applyDatabaseSchema(database) {
    const sql = await readFile(schemaUrl, "utf8");
    const client = await database.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('quizzy:database-schema'))");
        await client.query(sql);
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=schema.js.map