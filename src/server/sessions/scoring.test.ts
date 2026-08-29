import { describe, expect, it } from "vitest";
import { speedScore } from "./scoring.js";

const opened = new Date("2026-01-01T00:00:00.000Z");
const closes = new Date("2026-01-01T00:00:20.000Z");

describe("speed scoring", () => {
  it("awards max points immediately and half at the deadline", () => {
    expect(speedScore(1000, opened, closes, opened)).toBe(1000);
    expect(speedScore(1000, opened, closes, closes)).toBe(500);
  });

  it("falls linearly between the endpoints", () => {
    expect(
      speedScore(1000, opened, closes, new Date("2026-01-01T00:00:10.000Z")),
    ).toBe(750);
    expect(speedScore(7, opened, closes, closes)).toBe(4);
  });

  it("clamps timestamps outside the round", () => {
    expect(
      speedScore(1000, opened, closes, new Date("2025-12-31T23:59:00.000Z")),
    ).toBe(1000);
    expect(
      speedScore(1000, opened, closes, new Date("2026-01-01T00:01:00.000Z")),
    ).toBe(500);
  });
});
