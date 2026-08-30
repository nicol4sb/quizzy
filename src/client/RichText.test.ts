import { describe, expect, it } from "vitest";
import { hasRichFormatting, richTextTokens } from "./RichText";

describe("rich quiz text", () => {
  it("parses code and math while preserving ordinary text", () => {
    expect(
      richTextTokens(
        "Run `SELECT 1`, then solve \\(x+1\\).\n```sql\nSELECT * FROM players;\n```\n$$x^2$$",
      ),
    ).toEqual([
      { type: "text", content: "Run " },
      { type: "inline-code", content: "SELECT 1" },
      { type: "text", content: ", then solve " },
      { type: "inline-math", content: "x+1" },
      { type: "text", content: ".\n" },
      {
        type: "code-block",
        language: "sql",
        content: "SELECT * FROM players;",
      },
      { type: "text", content: "\n" },
      { type: "display-math", content: "x^2" },
    ]);
  });

  it("leaves incomplete formatting as plain text", () => {
    expect(richTextTokens("Price is $5 and `unfinished")).toEqual([
      { type: "text", content: "Price is $5 and `unfinished" },
    ]);
    expect(hasRichFormatting("Ordinary title-like text")).toBe(false);
  });

  it("supports a fenced code snippet entered on one line", () => {
    expect(richTextTokens("```javascript const total = 2 + 2;```")).toEqual([
      {
        type: "code-block",
        language: "javascript",
        content: "const total = 2 + 2;",
      },
    ]);
  });
});
