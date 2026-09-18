import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { UserCircle } from "lucide-react";

export function NavAuthArea() {
  const { user } = useAuth();

  if (user) {
    return (
      <Link
        to="/profile"
        title="Profile"
        className="h-8 w-8 flex items-center justify-center text-foreground/70 hover:text-foreground transition-colors"
      >
        <UserCircle className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <Link to="/auth">
      <button
        className="text-[13px] h-8 px-3 border border-foreground/40 text-foreground hover:bg-foreground hover:text-background transition-colors"
      >
        Sign In
      </button>
    </Link>
  );
}