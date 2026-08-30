import { describe, expect, it, vi } from "vitest";
import { applyDatabaseSchema } from "./schema.js";

describe("database schema bootstrap", () => {
  it("serializes and transactionally applies the canonical schema", async () => {
    const query = vi.fn().mockResolvedValue({});
    const release = vi.fn();
    const database = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never;

    await applyDatabaseSchema(database);

    expect(query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(query.mock.calls[1]?.[0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[2]?.[0]).toContain(
      "CREATE TABLE IF NOT EXISTS creators",
    );
    expect(query.mock.calls[3]?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the connection when schema application fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("schema failed"))
      .mockResolvedValueOnce({});
    const release = vi.fn();
    const database = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never;

    await expect(applyDatabaseSchema(database)).rejects.toThrow(
      "schema failed",
    );
    expect(query.mock.calls[3]?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
