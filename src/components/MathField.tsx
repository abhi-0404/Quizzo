import { useCallback, useEffect, useRef } from "react";
import katex from "katex";
import { tokenizeMath } from "@/components/MathText";

/**
 * WYSIWYG field for text that may contain LaTeX math.
 *
 * How it works
 * ------------
 * KaTeX is a one-way renderer (LaTeX → HTML), so rendered math cannot be
 * "typed into" and read back. Real editors solve this with *atomic* math nodes,
 * and so do we:
 *
 *   • prose   → ordinary editable text inside a contentEditable
 *   • `$…$`   → an atom: `contenteditable="false"`, rendered by KaTeX, carrying
 *               its own source on `data-src`
 *
 * Typing anywhere in the prose works natively. Clicking an atom swaps it back to
 * its raw `$…$` text so it can be edited as text; it re-renders on blur. The DOM
 * is serialised back to a single raw string on every input, so the caller's
 * state is always the source of truth.
 *
 * The element is deliberately *not* re-rendered from props while the user types
 * (that would reset the caret); it re-syncs only when `value` changes from
 * outside — e.g. an edit made over in the LaTeX View.
 */

interface MathFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Allow newlines (Enter). Single-line fields swallow Enter. */
  multiline?: boolean;
  className?: string;
  ariaLabel?: string;
  id?: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Build the editable DOM: escaped prose plus non-editable rendered atoms. */
function toHtml(value: string): string {
  if (!value) return "";
  return tokenizeMath(value)
    .map((t) => {
      if (t.kind === "text") {
        return escapeHtml(t.value).replace(/\n/g, "<br>");
      }
      let inner: string;
      try {
        inner = katex.renderToString(t.value, {
          displayMode: false,
          throwOnError: false,
          trust: false,
          output: "html",
        });
      } catch {
        inner = escapeHtml(`$${t.value}$`);
      }
      const src = escapeHtml(t.value).replace(/"/g, "&quot;");
      const delim = t.display ? "$$" : "$";
      return `<span class="math-atom" contenteditable="false" data-src="${src}" data-delim="${delim}" title="Click to edit LaTeX">${inner}</span>`;
    })
    .join("");
}

/** Serialise the edited DOM back into one raw string. */
function fromDom(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.dataset.src !== undefined) {
      const d = el.dataset.delim || "$";
      out += `${d}${el.dataset.src}${d}`;
      return;
    }
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    // contentEditable wraps new lines in DIV/P — treat them as line breaks.
    if ((el.tagName === "DIV" || el.tagName === "P") && out && !out.endsWith("\n")) {
      out += "\n";
    }
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out;
}

export function MathField({
  value, onChange, placeholder, multiline = false, className = "", ariaLabel, id,
}: MathFieldProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  /** Last value this component put into, or read out of, the DOM. */
  const synced = useRef<string | null>(null);

  const render = useCallback(() => {
    if (!ref.current) return;
    ref.current.innerHTML = toHtml(value);
    synced.current = value;
  }, [value]);

  // Re-render only for changes that did not originate from typing here.
  useEffect(() => {
    if (synced.current !== value) render();
  }, [value, render]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    const next = fromDom(ref.current);
    synced.current = next; // keep the effect from clobbering the caret
    onChange(next);
  }, [onChange]);

  /** Clicking rendered math reveals its source inline for editing. */
  const handleMouseDown = (e: React.MouseEvent) => {
    const atom = (e.target as HTMLElement)?.closest?.(".math-atom") as HTMLElement | null;
    if (!atom || !ref.current) return;
    e.preventDefault();
    const delim = atom.dataset.delim || "$";
    const text = document.createTextNode(`${delim}${atom.dataset.src ?? ""}${delim}`);
    atom.replaceWith(text);

    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(text, text.length);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    ref.current.focus();
    emit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) e.preventDefault();
  };

  // Keep pasted content plain — no foreign markup in the field.
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  // Re-render on blur so any revealed source renders back into math.
  const handleBlur = () => {
    synced.current = null;
    render();
  };

  return (
    <div
      id={id}
      ref={ref}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder ?? ""}
      onInput={emit}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onBlur={handleBlur}
      className={`math-field w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors ${className}`}
    />
  );
}
