import katex from "katex";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-typescript";
import "katex/dist/katex.min.css";

type RichToken =
  | { type: "text"; content: string }
  | { type: "inline-code"; content: string }
  | { type: "code-block"; content: string; language: string }
  | { type: "inline-math"; content: string }
  | { type: "display-math"; content: string };

const richPattern =
  /```([a-z0-9_-]*)(?:\r?\n|[ \t]+)([\s\S]*?)```|`([^`\n]+)`|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)/gi;

export function richTextTokens(source: string): RichToken[] {
  const tokens: RichToken[] = [];
  let cursor = 0;
  for (const match of source.matchAll(richPattern)) {
    if (match.index > cursor)
      tokens.push({ type: "text", content: source.slice(cursor, match.index) });
    if (match[2] !== undefined)
      tokens.push({
        type: "code-block",
        language: match[1]?.toLowerCase() ?? "",
        content: match[2].replace(/\n$/, ""),
      });
    else if (match[3] !== undefined)
      tokens.push({ type: "inline-code", content: match[3] });
    else if (match[4] !== undefined)
      tokens.push({ type: "display-math", content: match[4] });
    else if (match[5] !== undefined)
      tokens.push({ type: "inline-math", content: match[5] });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length)
    tokens.push({ type: "text", content: source.slice(cursor) });
  return tokens;
}

export function hasRichFormatting(source: string): boolean {
  return richTextTokens(source).some((token) => token.type !== "text");
}

function highlightedCode(code: string, language: string): string | undefined {
  const grammar = Prism.languages[language];
  return grammar ? Prism.highlight(code, grammar, language) : undefined;
}

function renderedMath(math: string, displayMode: boolean): string {
  return katex.renderToString(math, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: "warn",
  });
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="rich-text">
      {richTextTokens(text).map((token, index) => {
        const key = `${token.type}-${index}`;
        if (token.type === "text")
          return (
            <span className="rich-plain" key={key}>
              {token.content}
            </span>
          );
        if (token.type === "inline-code")
          return (
            <code className="rich-inline-code" key={key}>
              {token.content}
            </code>
          );
        if (token.type === "code-block") {
          const highlighted = highlightedCode(token.content, token.language);
          return (
            <pre className="rich-code-block" key={key}>
              {highlighted ? (
                <code
                  className={`language-${token.language}`}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              ) : (
                <code>{token.content}</code>
              )}
            </pre>
          );
        }
        return (
          <span
            className={
              token.type === "display-math"
                ? "rich-math rich-math-display"
                : "rich-math"
            }
            dangerouslySetInnerHTML={{
              __html: renderedMath(
                token.content,
                token.type === "display-math",
              ),
            }}
            key={key}
          />
        );
      })}
    </div>
  );
}
