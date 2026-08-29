import { describe, expect, it } from "vitest";
import { createJoinCode } from "./join-code.js";

describe("join codes", () => {
  it("creates readable six-character codes", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(createJoinCode()).toMatch(
        /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/,
      );
    }
  });
});
