import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("verifies the right password but not a wrong password", async () => {
    const hash = await hashPassword("a sufficiently long password");
    expect(hash).not.toContain("a sufficiently long password");
    await expect(
      verifyPassword("a sufficiently long password", hash),
    ).resolves.toBe(true);
    await expect(verifyPassword("the wrong password", hash)).resolves.toBe(
      false,
    );
  });
});
