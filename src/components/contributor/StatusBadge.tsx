import { cn } from "@/lib/utils";

type Status = "pending" | "accepted" | "rejected" | "approved";

const LABEL: Record<Status, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  approved: "Approved",
};

const LOOK: Record<Status, string> = {
  pending: "border-border bg-secondary text-muted-foreground",
  accepted: "border-success/40 bg-success/10 text-success",
  approved: "border-success/40 bg-success/10 text-success",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** One badge for every review / solution state in the portal. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  // Rows come straight from the database as plain strings; anything unexpected
  // is shown as pending rather than crashing the page.
  const key: Status = status in LABEL ? (status as Status) : "pending";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        LOOK[key],
        className
      )}
    >
      {LABEL[key]}
    </span>
  );
}
