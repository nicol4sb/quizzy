import { describe, expect, it } from "vitest";
import { resolveJoinOrigin } from "./join-origin.js";

describe("join origin", () => {
  it("replaces localhost with a private LAN address and preserves the port", () => {
    expect(
      resolveJoinOrigin("http://localhost:5173", [
        "100.64.0.2",
        "192.168.1.177",
      ]),
    ).toBe("http://192.168.1.177:5173");
  });

  it("keeps an explicit IP address or production domain unchanged", () => {
    expect(
      resolveJoinOrigin("http://192.168.1.9:5173", ["192.168.1.177"]),
    ).toBe("http://192.168.1.9:5173");
    expect(resolveJoinOrigin("https://quizzy.example", ["192.168.1.177"])).toBe(
      "https://quizzy.example",
    );
  });
});
