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
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 flex md:hidden items-center justify-between h-11 border-b border-border backdrop-blur-md bg-background/80 px-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="p-0 w-52 backdrop-blur-md bg-background/90 border-r border-border"
            >
              <div className="flex flex-col h-full">
                <SidebarContent onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-1.5">
            <StackedLogo size={16} />
            <span className="font-bold uppercase tracking-[0.08em] text-[14px] text-foreground">
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
