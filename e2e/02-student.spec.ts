import { expect, test } from "@playwright/test";
import { as, db, noHorizontalScroll, publishedPaper, watchErrors } from "./helpers";
import { ROLES } from "./global-setup";

/**
 * Student journeys on the papers the admin spec published: browse, sit an
 * exam end to end with server-side grading, practice with "Check answer",
 * resume after a refresh, history on the profile, and the guards that keep a
 * student out of admin pages.
 */
test.describe.configure({ mode: "serial" });

async function studentId() {
  const { data } = await db().auth.admin.listUsers({ perPage: 200 });
  return data!.users.find((u) => u.email === ROLES.student.email)!.id;
}

test.describe("signed out", () => {
  test("browses degrees, courses and papers without an account", async ({ page }) => {
    const errors = watchErrors(page);
    const paper = await publishedPaper();
    await page.goto("/data-science-and-applications");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto(`/data-science-and-applications/${paper.slug}`);
    await expect(page.getByRole("link", { name: /exam mode/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /practice mode/i }).first()).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test("cannot open admin or contributor pages", async ({ page }) => {
    for (const path of ["/admin/overview", "/admin/create", "/contributor/overview"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth$/);
    }
  });

  test("finishing a paper asks to sign in and keeps the answers", async ({ page }) => {
    const paper = await publishedPaper();
    await page.goto(`/data-science-and-applications/${paper.slug}/exam?paper=${paper.id}&mode=practice`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /begin practice/i }).click();
    await page.getByRole("button", { name: /end practice/i }).first().click();
    await page.getByRole("button", { name: /end & score/i }).click();
    await expect(page).toHaveURL(/\/auth$/);
    const pending = await page.evaluate(() => localStorage.getItem("quizzo_pending_attempt"));
    expect(pending).toContain(paper.id);
  });
});

test.describe("signed-in student", () => {
  test.use({ storageState: as("student") });

  test("cannot reach admin pages", async ({ page }) => {
    await page.goto("/admin/overview");
    await expect(page).toHaveURL(/\/$/);
  });

  test("sits an exam, submits, and gets a server-graded report", async ({ page }) => {
    const errors = watchErrors(page);
    const paper = await publishedPaper();
    const uid = await studentId();
    await db().from("attempts").delete().eq("user_id", uid);

    await page.goto(`/data-science-and-applications/${paper.slug}/exam?paper=${paper.id}&mode=exam`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(paper.course);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /begin exam/i }).click();
    await expect(page.getByRole("timer")).toBeVisible();

    // Answer three questions using whatever control each one has.
    for (let i = 0; i < 3; i++) {
      const radios = page.getByRole("radio");
      const boxes = page.getByRole("main").getByRole("checkbox");
      if (await radios.count()) await radios.first().click();
      else if (await boxes.count()) await boxes.first().click();
      else await page.keyboard.type("1");
      await page.getByRole("button", { name: /save & next/i }).click();
    }
    // Mark the 4th and check the palette shows it.
    await page.keyboard.press("m");
    await expect(page.getByRole("button", { name: /^Question 4, marked/i }).first()).toBeVisible();

    await page.getByRole("button", { name: /review & submit/i }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(/answered/i);
    await dialog.getByRole("button", { name: /submit now/i }).click();

    await expect(page).toHaveURL(/\/report\?attempt=/, { timeout: 30_000 });
    const attemptId = new URL(page.url()).searchParams.get("attempt")!;
    const { data: attempt } = await db().from("attempts").select("score, total_marks, correct_count, incorrect_count, skipped_count").eq("id", attemptId).single();
    expect(attempt!.correct_count + attempt!.incorrect_count + attempt!.skipped_count).toBe(paper.questions);
    expect(attempt!.correct_count + attempt!.incorrect_count).toBe(3);
    const { data: answers } = await db().from("attempt_answers").select("time_seconds").eq("attempt_id", attemptId);
    expect(answers!.length).toBe(paper.questions);
    await expect(page.getByText(/score/i).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the attempt shows in profile history", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: /history/i }).first().click();
    const paper = await publishedPaper();
    await expect(page.getByText(paper.course).first()).toBeVisible();
  });

  test("practice: check answer reveals the key with a verdict", async ({ page }) => {
    const paper = await publishedPaper();
    await page.goto(`/data-science-and-applications/${paper.slug}/exam?paper=${paper.id}&mode=practice`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /begin practice/i }).click();
    const radios = page.getByRole("radio");
    if (await radios.count()) await radios.first().click();
    await page.getByRole("button", { name: /^check/i }).click();
    await expect(page.getByRole("region", { name: /solution/i })).toContainText(/answer:|no answer key/i);
  });

  test("an accidental refresh offers to resume with answers intact", async ({ page }) => {
    const paper = await publishedPaper();
    const url = `/data-science-and-applications/${paper.slug}/exam?paper=${paper.id}&mode=exam`;
    await page.goto(url);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /begin exam/i }).click();
    const radios = page.getByRole("radio");
    test.skip((await radios.count()) === 0, "first question is not a choice question");
    await radios.nth(1).click();
    await page.getByRole("button", { name: /save & next/i }).click();
    await page.waitForTimeout(800); // progress saves after 400ms
    page.once("dialog", (d) => void d.accept());
    await page.reload();
    await expect(page.getByText(/unfinished session/i)).toBeVisible();
    await page.getByRole("button", { name: /^resume$/i }).click();
    await page.getByRole("button", { name: /^Question 1,/ }).first().click();
    await expect(page.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
  });

  test("notes are saved per question", async ({ page }) => {
    const paper = await publishedPaper();
    await page.goto(`/data-science-and-applications/${paper.slug}/exam?paper=${paper.id}&mode=practice`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /begin practice/i }).click();
    await page.getByRole("button", { name: /notes for this question/i }).click();
    await page.getByLabel(/note for question 1/i).fill("Q1 working");
    const notes = page.getByRole("complementary");
    await notes.getByRole("button", { name: /next question/i }).click();
    await page.getByLabel(/note for question 2/i).fill("Q2 working");
    await notes.getByRole("button", { name: /previous question/i }).click();
    await expect(page.getByLabel(/note for question 1/i)).toHaveValue("Q1 working");
    await page.getByRole("tab", { name: /all notes/i }).click();
    await expect(page.getByText("Q2 working")).toBeVisible();
  });

  test("@mobile the exam works on a phone", async ({ page }) => {
    const errors = watchErrors(page);
    const paper = await publishedPaper();
    await page.goto(`/data-science-and-applications/${paper.slug}/exam?paper=${paper.id}&mode=practice`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /begin practice/i }).click();
    await page.getByRole("button", { name: /open question palette/i }).click();
    await expect(page.getByRole("navigation", { name: "Questions" })).toBeVisible();
    await page.getByRole("button", { name: /^Question 2,/ }).last().click();
    await expect(page.getByRole("heading", { name: /question 2/i })).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
