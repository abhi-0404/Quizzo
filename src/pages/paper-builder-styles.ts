/**
 * Shared control classes for the Paper Builder page and its per-subject
 * sections — one source so the two never drift into two slightly different
 * "flat control" looks.
 */
export const selectClass =
  "h-8 w-full rounded-md border border-border bg-card px-2 text-[13px] text-foreground " +
  "focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors " +
  "[color-scheme:light] dark:[color-scheme:dark]";
export const textInputClass =
  "h-8 w-full rounded-md border border-border bg-card px-2 text-[13px] text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:border-gray-400 " +
  "dark:focus:border-gray-600 transition-colors";
export const primaryBtnClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors " +
  "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-black dark:hover:bg-white";
export const secondaryBtnClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 " +
  "text-[12px] font-medium text-foreground hover:bg-secondary transition-colors";
