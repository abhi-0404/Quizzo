import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render error anywhere below shows a recoverable
 * screen instead of a blank page. Chunk-load failures (a deploy replaced the
 * hashed files under an open tab) are the common production case, so those get
 * a plain reload prompt.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook point for an error-reporting service (Sentry etc.).
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const stale = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      this.state.error.message
    );

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">
            {stale ? "A new version is available" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {stale
              ? "Reload the page to get the latest version."
              : "The page hit an unexpected error. Reloading usually fixes it."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Reload
            </button>
            <a href="/" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
              Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
