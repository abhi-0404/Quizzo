import { useMemo } from "react";
import katex from "katex";

/**
 * Renders a plain string that may contain LaTeX math.
 *
 *   $...$    inline math
 *   $$...$$  display math
 *   \(...\)  inline math
 *   \[...\]  display math
 *
 * Everything outside those delimiters is rendered as ordinary React text (never
 * as HTML), so authored content cannot inject markup. Only the KaTeX output is
 * set as HTML, and KaTeX runs with `trust: false` so commands like \href and
 * \includegraphics are refused. A malformed expression falls back to its raw
 * source instead of throwing.
 */

export type MathToken =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean }
  | { kind: "image"; alt: string; assetId: string };

type Token = MathToken;

/**
 * Split on math delimiters and figure references, keeping the surrounding
 * prose intact. `![alt](asset-<id>)` is the same figure-reference syntax
 * `UniversalRenderer` resolves for read-only display — recognising it here
 * too is what lets [[MathField]] show the actual figure while editing,
 * instead of the raw markdown sitting there as literal text.
 */
export function tokenizeMath(input: string): Token[] {
  return tokenize(input);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  // Order matters: $$ before $, so display math wins.
  const pattern =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|!\[([^\]]*)\]\(asset-([A-Za-z0-9]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(input)) !== null) {
    if (m.index > last) tokens.push({ kind: "text", value: input.slice(last, m.index) });
    if (m[5] !== undefined) {
      tokens.push({ kind: "image", alt: m[5], assetId: m[6] });
    } else {
      const display = m[1] !== undefined || m[2] !== undefined;
      const expr = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
      tokens.push({ kind: "math", value: expr, display });
    }
    last = m.index + m[0].length;
  }
  if (last < input.length) tokens.push({ kind: "text", value: input.slice(last) });
  return tokens;
}

export function MathText({ children, className = "" }: { children: string; className?: string }) {
  const tokens = useMemo(() => tokenize(children ?? ""), [children]);

  return (
    <span className={className}>
      {tokens.map((t, i) => {
        if (t.kind === "text") {
          // Plain React text — preserves newlines via the caller's whitespace class.
          return <span key={i}>{t.value}</span>;
        }
        if (t.kind === "image") {
          // This component has no asset list to resolve a figure against —
          // callers that need figures rendered use UniversalRenderer instead.
          return null;
        }
        let html: string;
        try {
          html = katex.renderToString(t.value, {
            displayMode: t.display,
            throwOnError: false,
            trust: false,
            output: "html",
          });
        } catch {
          // Unparseable — show the original source rather than losing content.
          return <span key={i}>{t.display ? `$$${t.value}$$` : `$${t.value}$`}</span>;
        }
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}

/** True when the string contains anything worth rendering as math. */
export function hasMath(s: string): boolean {
  return /\$[^$\n]+\$|\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(s);
}
