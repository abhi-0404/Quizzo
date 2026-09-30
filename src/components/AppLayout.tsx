// src/components/AppLayout.tsx
import { useState } from "react";
import { AppSidebar, SidebarContent } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { StackedLogo } from "./StackedLogo";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 flex md:hidden items-center justify-between h-11 border-b border-zinc-200 dark:border-white/[0.06] backdrop-blur-md bg-white/70 dark:bg-black/40 px-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06]"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="p-0 w-52 backdrop-blur-md bg-white/80 border-r border-zinc-200 dark:bg-black/60 dark:border-white/[0.06]"
            >
              <div className="flex flex-col h-full">
                <SidebarContent onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-1.5">
            <StackedLogo size={16} />
            <span className="font-bold uppercase tracking-[0.08em] text-[14px] text-zinc-900 dark:text-zinc-100">
              QUIZZO
            </span>
          </div>

          <div className="w-7" />
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
