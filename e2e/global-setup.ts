import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { localSupabase, nodeClientOptions } from "./local-supabase";

/**
 * Creates the three test accounts in the LOCAL database (admin, contributor,
 * student), signs each in with supabase-js and saves the exact localStorage
 * entry the app's client reads, as one Playwright storage state per role.
 * The app only offers Google sign-in, so the UI login itself is not exercised.
 */
export const ROLES = {
  admin: { email: "admin@quizzo.test", name: "Ada Admin", roles: ["admin"] },
  contributor: { email: "contrib@quizzo.test", name: "Cora Contributor", roles: ["contributor"] },
  student: { email: "student@quizzo.test", name: "Sam Student", roles: [] as string[] },
} as const;
export type Role = keyof typeof ROLES;
export const PASSWORD = "e2e-Password-123!";
export const STATE_DIR = path.resolve("e2e/.auth");
export const statePath = (r: Role) => path.join(STATE_DIR, `${r}.json`);

export default async function globalSetup() {
  const sb = localSupabase();
  const admin = createClient(sb.url, sb.serviceKey, { ...nodeClientOptions, auth: { persistSession: false, autoRefreshToken: false } });
  fs.mkdirSync(STATE_DIR, { recursive: true });

  for (const [role, info] of Object.entries(ROLES) as [Role, (typeof ROLES)[Role]][]) {
    // Create (or find) the user, confirmed, so sign-in works immediately.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    let user = list?.users.find((u) => u.email === info.email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: info.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: info.name },
      });
      if (error) throw error;
      user = data.user;
    }
    for (const r of info.roles) {
      const { error } = await admin.from("user_roles").upsert({ user_id: user!.id, role: r as never }, { onConflict: "user_id,role" });
      if (error) throw error;
    }

    // Sign in through supabase-js with a capturing storage, so the saved entry
    // has exactly the key and shape the browser client expects.
    const captured: Record<string, string> = {};
    const client = createClient(sb.url, sb.anonKey, {
      ...nodeClientOptions,
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        storage: {
          getItem: (k) => captured[k] ?? null,
          setItem: (k, v) => void (captured[k] = v),
          removeItem: (k) => void delete captured[k],
        },
      },
    });
    const { error } = await client.auth.signInWithPassword({ email: info.email, password: PASSWORD });
    if (error) throw error;

    const state = {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:5180",
          localStorage: [
            ...Object.entries(captured).map(([name, value]) => ({ name, value })),
            { name: "theme", value: "light" },
          ],
        },
      ],
    };
    fs.writeFileSync(statePath(role), JSON.stringify(state, null, 2));
  }
}
