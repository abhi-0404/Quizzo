import { expect, test } from "@playwright/test";
import { as, db, publishedPaper, watchErrors } from "./helpers";
import { ROLES } from "./global-setup";

/**
 * The reviewer loop: admin manages contributors, a contributor confirms and
 * flags answer keys and attaches a video solution, the admin accepts the flag
 * (the live key changes) and approves the video, and a student then sees it.
 */
test.describe.configure({ mode: "serial" });

const VIDEO = "https://youtu.be/dQw4w9WgXcQ";

async function userId(email: string) {
  const { data } = await db().auth.admin.listUsers({ perPage: 200 });
  return data!.users.find((u) => u.email === email)!.id;
}

test.describe("admin manages contributors", () => {
  test.use({ storageState: as("admin") });

  test("lists contributors, invites a new email, revokes it", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/admin/contributors");
    await expect(page.getByText(ROLES.contributor.email)).toBeVisible();
    const invite = `new-reviewer-${Date.now()}@quizzo.test`;
    await page.getByLabel("Contributor email").fill(invite);
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByText(invite)).toBeVisible();
    await page.getByRole("button", { name: /revoke/i }).first().click();
    await expect(page.getByText(invite)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("contributor reviews a paper", () => {
  test.use({ storageState: as("contributor") });

  test("confirms one key, flags another, adds a video link", async ({ page }) => {
    const errors = watchErrors(page);
    const paper = await publishedPaper();
    const uid = await userId(ROLES.contributor.email);
    await db().from("answer_reviews").delete().eq("reviewer_id", uid);
    await db().from("paper_solutions").delete().eq("author_id", uid);

    await page.goto("/contributor/papers");
    await expect(page.getByRole("heading", { name: /papers to review/i })).toBeVisible();
    await page.goto(`/contributor/papers/${paper.id}`);

    // Q1: key is correct.
    await page.getByRole("button", { name: /^Question 1,/ }).click();
    await page.getByRole("button", { name: /key is correct/i }).click();
    await expect(page.getByRole("button", { name: /^Question 1, .*confirmed/i })).toBeVisible();

    // First choice question after Q1: flag with a different option.
    const q = await db().from("questions").select("id, position, kind, options, correct").eq("paper_id", paper.id).in("kind", ["single"]).order("position").gt("position", 1).limit(1).single();
    const correct = (q.data!.correct as number[])[0];
    const other = (q.data!.options as string[]).findIndex((o, i) => i !== correct && !!o?.trim());
    await page.getByRole("button", { name: new RegExp(`^Question ${q.data!.position},`) }).click();
    await page.getByRole("button", { name: /key is wrong/i }).click();
    await page.getByRole("checkbox", { name: new RegExp(`^Option ${String.fromCharCode(65 + other)}$`) }).or(page.getByRole("radio", { name: new RegExp(`^Option ${String.fromCharCode(65 + other)}$`) })).first().click();
    await page.getByPlaceholder(/short working/i).fill("Worked it out on paper.");
    await page.getByRole("button", { name: /save flag/i }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^Question ${q.data!.position}, .*flagged`, "i") })).toBeVisible();

    // Video solution for Q1.
    await page.getByRole("button", { name: /^Question 1,/ }).click();
    await page.getByRole("tab", { name: /video link/i }).first().click();
    await page.getByLabel(/^video link$/i).first().fill(VIDEO);
    await page.getByPlaceholder(/title/i).first().fill("Q1 walkthrough");
    await page.getByRole("button", { name: /add video/i }).first().click();
    await expect(page.getByText("Q1 walkthrough")).toBeVisible();

    const { data: video } = await db().from("paper_solutions").select("kind, video_url, status").eq("author_id", uid).single();
    expect(video).toMatchObject({ kind: "video", video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", status: "pending" });
    expect(errors).toEqual([]);
  });

  test("cannot edit questions directly", async () => {
    // The UI never offers it; the database must refuse it too.
    const paper = await publishedPaper();
    const { localSupabase, nodeClientOptions } = await import("./local-supabase");
    const { createClient } = await import("@supabase/supabase-js");
    const sb = localSupabase();
    const c = createClient(sb.url, sb.anonKey, { ...nodeClientOptions, auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: ROLES.contributor.email, password: "e2e-Password-123!" });
    const { data } = await c.from("questions").update({ marks: 99 }).eq("paper_id", paper.id).select("id");
    expect(data ?? []).toHaveLength(0);
  });
});

test.describe("admin decides", () => {
  test.use({ storageState: as("admin") });

  test("accepts the flag (key changes) and approves the video", async ({ page }) => {
    const errors = watchErrors(page);
    const uid = await userId(ROLES.contributor.email);
    const { data: flag } = await db().from("answer_reviews").select("question_id, suggested_correct").eq("reviewer_id", uid).eq("verdict", "incorrect").single();

    await page.goto("/admin/reviews");
    await page.getByRole("button", { name: /^accept$/i }).first().click();
    await page.getByRole("button", { name: /change the key/i }).click();
    await expect(page.getByText(/key corrected/i)).toBeVisible();
    const { data: q } = await db().from("questions").select("correct").eq("id", flag!.question_id).single();
    expect(q!.correct).toEqual(flag!.suggested_correct);

    await page.getByRole("tab", { name: /solutions/i }).click();
    await page.getByRole("button", { name: /^approve$/i }).first().click();
    await expect(page.getByText(/solution approved/i)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("student sees the approved video", () => {
  test.use({ storageState: as("student") });

  test("practice mode shows the worked video after Check", async ({ page }) => {
    const paper = await publishedPaper();
    await page.goto(`/data-science-and-applications/${paper.slug}/exam?paper=${paper.id}&mode=practice`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /begin practice/i }).click();
    await page.getByRole("button", { name: /^check/i }).click();
    await expect(page.getByRole("button", { name: /play video: q1 walkthrough/i })).toBeVisible();
  });
});
