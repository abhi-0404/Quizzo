import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Landing from "./Landing";

const Index = () => {
  const { user, loading, isAdmin, roleLoading } = useAuth();

  // Wait for both session and role to resolve before deciding where to send the user.
  if (loading || (user && roleLoading)) return null;

  if (user && isAdmin) return <Navigate to="/admin/overview" replace />;

  return <Landing />;
};

export default Index;
