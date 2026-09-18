import { useState } from "react";
import { PyqImport } from "@/components/PyqImport";

/**
 * Dev-only harness for the real PyqImport dialog — the exact component
 * /admin/create uses, without the admin-role gate that route sits behind.
 * Routed only when `import.meta.env.DEV`.
 */
export default function DevPyqImportLab() {
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <p className="mb-3 text-[13px] font-semibold">PyqImport dialog — dev harness</p>
      <button
        className="rounded-md border border-border bg-card px-3 py-1.5 text-[12px] hover:bg-secondary"
        onClick={() => setOpen(true)}
      >
        Open importer
      </button>
      {loaded && <p className="mt-3 text-[12px] text-muted-foreground">Loaded into builder: {loaded}</p>}
      <PyqImport
        open={open}
        onOpenChange={setOpen}
        onLoadIntoBuilder={(courses) =>
          setLoaded(courses.map((c) => `${c.courseName} (${c.questions.length} questions)`).join(", "))
        }
      />
    </div>
  );
}
