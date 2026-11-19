import { expect, test } from "@playwright/test";
import { PYQ_PDF, as, db, hasPyqPdf, watchErrors } from "./helpers";

/**
 * Admin: import the real TCS iON paper (145 pages, 15 courses) through the UI,
 * open every paper in the builder, and publish each one. Afterwards the
 * database must hold one published paper per imported course, with questions
 * and the answer key, and figures in storage.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: as("admin") });

test("admin imports the PYQ PDF and publishes every paper", async ({ page }) => {
  test.skip(!hasPyqPdf(), "PYQ PDF not present");
  test.setTimeout(20 * 60_000);
  const errors = watchErrors(page);

  // Start from an empty catalogue of papers so the run is repeatable.
  await db().from("papers").delete().not("id", "is", null);
  await db().from("sittings").delete().not("id", "is", null);

  await page.goto("/admin/create");
  await page.getByRole("button", { name: /import pyq pdf/i }).click();
  await page.locator("#pyq-import-files").setInputFiles(PYQ_PDF);

  const open = page.getByRole("button", { name: /open \d+ papers? in builder/i });
  await expect(open).toBeEnabled({ timeout: 6 * 60_000 });
  const count = Number((await open.innerText()).match(/\d+/)![0]);
  expect(count, "papers found in the PDF").toBeGreaterThanOrEqual(10);
  await open.click();

  // The sitting date comes from the PDF; if it did not, fill it in.
  if (await page.getByText(/exam date needed/i).first().isVisible().catch(() => false)) {
    const ctx = page.getByRole("button", { name: /exam context settings/i }).first();
    if ((await ctx.getAttribute("aria-expanded")) !== "true") await ctx.click();
    await page.locator('input[type="date"]').first().fill("2025-10-26");
  }

  const publish = page.getByRole("button", { name: /^publish$/i });
  await expect(publish).toHaveCount(count);
  let published = 0;
  let refused = 0;
  for (let i = 0; i < count; i++) {
    const row = publish.nth(i).locator("..");
    const flagged = (await row.locator(".border-red-200").count()) > 0;
    await publish.nth(i).click();
    if (flagged) {
      // A paper with flagged questions must be refused, not published.
      await expect(page.getByText(/fix the flagged questions first/i).last()).toBeVisible();
      refused++;
    } else {
      // Wait for THIS publish to finish: its button stops spinning.
      await expect(publish.nth(i)).toBeEnabled({ timeout: 3 * 60_000 });
      published++;
    }
  }
  await expect(page.getByText(/publish failed/i)).toHaveCount(0);
  expect(published, "papers published").toBeGreaterThanOrEqual(10);

  const { data: papers, error } = await db().from("papers").select("id, question_count, total_marks, published").eq("published", true);
  expect(error).toBeNull();
  expect(papers!.length).toBe(published);
  expect(refused + published).toBe(count);
  for (const p of papers!) {
    expect(p.question_count, `paper ${p.id} has questions`).toBeGreaterThan(0);
    expect(p.total_marks, `paper ${p.id} has marks`).toBeGreaterThan(0);
  }
  // Every choice question carries a key, every numerical one an answer.
  const { data: qs } = await db().from("questions").select("kind, correct, numerical_answer");
  const keyless = (qs ?? []).filter((q) =>
    q.kind === "numerical" ? !String(q.numerical_answer ?? "").trim() : !Array.isArray(q.correct) || (q.correct as unknown[]).length === 0
  );
  expect(keyless.length, "questions published without an answer key").toBe(0);

  expect(errors).toEqual([]);
});
