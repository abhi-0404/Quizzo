import { useAuth } from "@/contexts/AuthContext";
import Landing from "./Landing";

const Index = () => {
  const { loading } = useAuth();
  if (loading) return null;
  return <Landing />;
};

export default Index;
