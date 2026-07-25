import { LayoutDashboard, FilePlus2, Library, CalendarDays, BarChart3, Settings, LogOut, Pin, PinOff } from "lucide-react";
import { StackedLogo } from "./StackedLogo";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export const navItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/admin/overview" },
  { icon: FilePlus2, label: "Create Content", path: "/admin/create" },
  { icon: Library, label: "Question Bank", path: "/admin/bank" },
  { icon: CalendarDays, label: "Schedule", path: "/admin/schedule" },
  { icon: BarChart3, label: "Performance", path: "/admin/performance" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

interface SidebarContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  /** Present only on the desktop rail — the mobile sheet has no pin control. */
  isPinned?: boolean;
  onTogglePin?: () => void;
}

export function SidebarContent({ collapsed = false, onNavigate, isPinned, onTogglePin }: SidebarContentProps) {
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <>
      {/* Workspace header */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-sidebar-border">
        <StackedLogo size={16} color="currentColor" />
        {!collapsed && (
          <span className="font-bold uppercase tracking-[0.08em] text-[14px] text-sidebar-accent-foreground">
            QUIZZO
          </span>
        )}
        {!collapsed && onTogglePin && (
          <button
            onClick={onTogglePin}
            title={isPinned ? "Unpin sidebar" : "Pin sidebar open"}
            aria-label={isPinned ? "Unpin sidebar" : "Pin sidebar open"}
            aria-pressed={isPinned}
            className="ml-auto h-6 w-6 shrink-0 inline-flex items-center justify-center rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1.5 px-1.5 space-y-px">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                // border-l is always reserved so the active accent never shifts layout
                "flex items-center gap-2 rounded border-l-2 px-2 py-1.5 text-[13px] transition-colors",
                isActive
                  ? "border-emerald-500 bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <div className="flex items-center gap-2 px-1">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-[9px] leading-none">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="text-[12px] text-sidebar-foreground truncate flex-1">
              {profile?.full_name || "User"}
            </span>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-sidebar-foreground hover:bg-sidebar-accent h-6 w-6"
            >
              <LogOut className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export function AppSidebar() {
  // Pinned → always expanded and takes space in the layout.
  // Unpinned → collapsed rail; hovering expands it *over* the content instead
  // of pushing it, so the main column never reflows on hover.
  const [isPinned, setIsPinned] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const expanded = isPinned || isHovered;

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        // Only the *reserved* width changes with pinning — hover never affects it.
        "hidden md:block relative shrink-0 h-screen sticky top-0 transition-[width] duration-200 ease-out",
        isPinned ? "w-52" : "w-14"
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-50 flex flex-col overflow-hidden",
          "bg-sidebar border-r border-sidebar-border transition-[width] duration-200 ease-out",
          expanded ? "w-52" : "w-14"
        )}
      >
        <SidebarContent
          collapsed={!expanded}
          isPinned={isPinned}
          onTogglePin={() => setIsPinned((v) => !v)}
        />
      </div>
    </aside>
  );
}
