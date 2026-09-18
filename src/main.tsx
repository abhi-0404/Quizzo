import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "katex/dist/katex.min.css";
import "./index.css";

const missingEnvVars = [
  !import.meta.env.VITE_SUPABASE_URL && "VITE_SUPABASE_URL",
  !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY && "VITE_SUPABASE_PUBLISHABLE_KEY",
].filter(Boolean);

if (missingEnvVars.length > 0) {
  document.getElementById("root")!.innerHTML = `
    <div style="font-family:monospace;padding:40px;background:#0e0e10;color:#e2e2e5;min-height:100vh">
      <h2 style="color:#f87171;margin-bottom:16px">&#9888; Missing environment variables</h2>
      <p style="color:#a1a1aa;margin-bottom:16px">
        Create a <code style="background:#1e1e22;padding:2px 6px;border-radius:4px">.env</code> file
        in the project root with the following variables:
      </p>
      <pre style="background:#1e1e22;padding:16px;border-radius:8px;line-height:1.7">${missingEnvVars.map(v => `${v}=your_value_here`).join("\n")}</pre>
      <p style="color:#a1a1aa;margin-top:16px">
        Get your values from
        <a href="https://supabase.com/dashboard" style="color:#818cf8">supabase.com/dashboard</a>
        &#x2192; Project Settings &#x2192; API, then restart the dev server.
      </p>
    </div>
  `;
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
