import { expect, test } from "@playwright/test";
import { as, db, noHorizontalScroll, publishedPaper, watchErrors } from "./helpers";

/**
 * Every admin page loads real data without errors, and the write paths work:
 * schedule save/delete, question reports end to end, question bank search.
 */
test.describe.configure({ mode: "serial" });

test.describe("admin pages", () => {
  test.use({ storageState: as("admin") });

  for (const [path, heading] of [
    ["/admin/overview", /overview/i],
    ["/admin/create", /import pyq pdf/i],
    ["/admin/bank", /question bank|bank/i],
    ["/admin/reviews", /review inbox/i],
    ["/admin/contributors", /contributors/i],
    ["/admin/schedule", /schedule/i],
    ["/admin/performance", /performance/i],
    ["/settings", /settings/i],
  ] as const) {
    test(`${path} loads without errors`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.getByText(heading).first()).toBeVisible();
      await expect(page.getByText(/could not load this page/i)).toHaveCount(0);
      await noHorizontalScroll(page);
      expect(errors).toEqual([]);
    });
  }

  test("overview counts match the database", async ({ page }) => {
    const { count } = await db().from("papers").select("id", { count: "exact", head: true }).eq("published", true);
    await page.goto("/admin/overview");
    const card = page.getByText(/published papers/i).first().locator("..").locator("..");
    await expect(card).toContainText(String(count));
  });

  test("question bank lists published questions and filters by search", async ({ page }) => {
    const paper = await publishedPaper();
    await page.goto("/admin/bank");
    const search = page.getByPlaceholder(/search/i);
    await search.fill(paper.course.split(" ")[0]);
    await expect(page.getByText(paper.course).first()).toBeVisible();
  });

  test("schedule: add, persist across reload, delete", async ({ page }) => {
    await db().from("academic_schedule").delete().eq("id", "2028-jan");
    await page.goto("/admin/schedule");
    await page.getByRole("button", { name: /add schedule entry/i }).first().click();
    await page.locator("#draft-year").selectOption("2028");
    await page.locator("#draft-term").selectOption("jan");
    await page.locator('input[type="date"]').first().fill("2028-02-15");
    await page.getByRole("button", { name: /save schedule/i }).click();
    await expect(page.getByText(/schedule (added|updated)/i).first()).toBeVisible();
    await page.reload();
    const { data } = await db().from("academic_schedule").select("id").eq("id", "2028-jan");
    expect(data!.length).toBe(1);
    await db().from("academic_schedule").delete().eq("id", "2028-jan");
  });
});

test.describe("question reports", () => {
  test("a student reports a question and the admin resolves it", async ({ browser }) => {
    const paper = await publishedPaper();
    await db().from("question_reports").delete().neq("reason", "__none__");

    const student = await browser.newContext({ storageState: as("student") });
    const sp = await student.newPage();
    await sp.goto(`/data-science-and-applications/${paper.slug}/exam?paper=${paper.id}&mode=practice`);
    await sp.getByRole("checkbox").check();
    await sp.getByRole("button", { name: /begin practice/i }).click();
    await sp.getByRole("button", { name: /report a problem/i }).first().click();
    await sp.locator("#report-reason").selectOption("wrong_answer");
    await sp.getByPlaceholder(/details/i).fill("Option B looks right");
    await sp.getByRole("button", { name: /send report/i }).click();
    await expect(sp.getByText(/report was sent/i)).toBeVisible();
    await student.close();

    const admin = await browser.newContext({ storageState: as("admin") });
    const ap = await admin.newPage();
    await ap.goto("/admin/overview");
    await expect(ap.getByText("Option B looks right")).toBeVisible();
    await ap.getByRole("button", { name: /resolve/i }).first().click();
    await expect(ap.getByText(/report resolved/i)).toBeVisible();
    await admin.close();
  });
});
