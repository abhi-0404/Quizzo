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
  | { kind: "math"; value: string; display: boolean };

type Token = MathToken;

/** Split on math delimiters, keeping the surrounding prose intact. */
export function tokenizeMath(input: string): Token[] {
  return tokenize(input);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  // Order matters: $$ before $, so display math wins.
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(input)) !== null) {
    if (m.index > last) tokens.push({ kind: "text", value: input.slice(last, m.index) });
    const display = m[1] !== undefined || m[2] !== undefined;
    const expr = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    tokens.push({ kind: "math", value: expr, display });
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
