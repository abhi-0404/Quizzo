import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { localSupabase, nodeClientOptions } from "./local-supabase";
import { statePath, type Role } from "./global-setup";

export const PYQ_PDF = path.resolve("PYQ pdf/IIT M IMPROVEMENT AN EXAM QIV4 26 Oct 2025.pdf");
export const hasPyqPdf = () => fs.existsSync(PYQ_PDF);

/** Storage state for a role, for `test.use({ storageState: as("admin") })`. */
export const as = (role: Role) => statePath(role);

/** Service-role client for assertions and cleanup. Local database only. */
export function db() {
  const sb = localSupabase();
  return createClient(sb.url, sb.serviceKey, { ...nodeClientOptions, auth: { persistSession: false, autoRefreshToken: false } });
}

/** Collects page errors and console errors so a test can assert there were none. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // React Router future-flag notices and aborted image loads are noise.
    if (/React Router Future Flag|net::ERR_ABORTED/.test(t)) return;
    errors.push(`console: ${t.slice(0, 300)}`);
  });
  return errors;
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
}

/** First published paper with at least `minQuestions` questions, with its course slug. */
export async function publishedPaper(minQuestions = 5) {
  const { data, error } = await db()
    .from("papers")
    .select("id, question_count, total_marks, duration_minutes, courses!inner(slug, name)")
    .eq("published", true)
    .gte("question_count", minQuestions)
    .order("question_count", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No published paper: run the admin import spec first");
  const c = (data as unknown as { courses: { slug: string; name: string } }).courses;
  return { id: data.id as string, questions: data.question_count as number, slug: c.slug, course: c.name };
}
