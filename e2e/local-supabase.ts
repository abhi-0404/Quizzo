import { execSync } from "node:child_process";

export interface LocalSupabase {
  url: string;
  anonKey: string;
  serviceKey: string;
}

let cached: LocalSupabase | null = null;

/**
 * Connection details of the local Supabase started with `supabase start`.
 * Refuses anything that is not on localhost, so these tests can never touch
 * the live project.
 */
export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  let out: string;
  try {
    out = execSync("pnpm exec supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("Local Supabase is not running. Start it with: pnpm exec supabase start");
  }
  const env: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  const url = env.API_URL;
  const anonKey = env.PUBLISHABLE_KEY || env.ANON_KEY;
  const serviceKey = env.SECRET_KEY || env.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Could not read the local Supabase keys from `supabase status`.");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error(`Refusing non-local Supabase URL ${url}`);
  cached = { url, anonKey, serviceKey };
  return cached;
}

/**
 * supabase-js builds a realtime client eagerly and needs a WebSocket class,
 * which Node 20 does not have globally. The tests never use realtime, so a
 * stub that is never instantiated is enough.
 */
class NoWebSocket {
  constructor() {
    throw new Error("Realtime is not used in the e2e tests");
  }
}
export const nodeClientOptions = { realtime: { transport: NoWebSocket as never } };
