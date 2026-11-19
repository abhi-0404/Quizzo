import { AlertTriangle, Loader2 } from "lucide-react";

/** Shared loading / error / empty states for the admin data pages. */
export function AdminLoading() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-6 flex items-start gap-2 rounded-md border border-destructive/30 bg-card p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="text-[13px]">
        <p className="font-medium">Could not load this page</p>
        <p className="mt-0.5 text-muted-foreground">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-2 text-[12px] underline underline-offset-2">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-[12px] text-muted-foreground">
      {children}
    </div>
  );
}
