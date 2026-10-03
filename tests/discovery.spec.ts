import { expect, test } from "@playwright/test";

test("anonymous home shortcut → Goa → Couple → journey", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Where will your");
  await page.getByRole("link", { name: "Goa", exact: true }).click();
  await expect(page).toHaveURL(/\/destination\/goa$/);
  await expect(page.getByRole("heading", { name: "Goa", exact: true })).toBeVisible();
  await expect(page.getByTestId("journey-card")).toHaveCount(4);
  await page.getByRole("navigation", { name: "Traveler type filters" }).getByRole("link", { name: "Couple", exact: true }).click();
  await expect(page).toHaveURL(/traveler=couple/);
  await expect(page.getByTestId("journey-card")).toHaveCount(1);
  await expect(page.getByTestId("journey-card")).toHaveAttribute("data-traveler", "couple");
  await page.getByRole("link", { name: "Open journey: A little slower, a little closer" }).click();
  await expect(page).toHaveURL(/\/journey\/demo-goa-couple$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A little slower, a little closer");
  await expect(page.getByText("This is a sample journey", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Candolim Beach" })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("browse all destinations, empty filter, invalid URLs and search", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByTestId("journey-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No journeys here yet." })).toBeVisible();
  for (const [slug, count] of [["goa", 4], ["varkala", 4], ["munnar", 3], ["kochi", 3], ["thenkasi", 2]] as const) {
    await page.goto(`/destination/${slug}`);
    await expect(page.getByTestId("journey-card")).toHaveCount(count);
  }
  await page.goto("/destination/munnar?traveler=solo");
  await expect(page.getByText("No journeys for this travel style yet.")).toBeVisible();
  await page.getByRole("link", { name: "All", exact: true }).click();
  await expect(page.getByTestId("journey-card")).toHaveCount(3);
  await page.goto("/destination/goa?traveler=invalid");
  await expect(page.getByTestId("journey-card")).toHaveCount(4);
  await page.goto("/destination/unknown");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This path ends here.");
  await page.goto("/journey/not-a-journey");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This path ends here.");
  await page.goto("/");
  await page.getByRole("combobox").fill("Atlantis");
  await expect(page.getByRole("status")).toContainText("Destination search is not connected yet");
  await page.getByRole("heading", { level: 1 }).click();
  await page.getByRole("link", { name: /Kochi travel inspiration/ }).click();
  await expect(page).toHaveURL(/\/destination\/kochi$/);
});

test("responsive imagery, navigation and homepage empty state", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Login / Profile", exact: true })).toBeVisible();
  await expect(page.getByTestId("journey-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The next great journey could be yours." })).toBeVisible();
  await page.getByRole("heading", { name: "Find somewhere that feels like you." }).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('main img')).filter((image) => image.getBoundingClientRect().width > 0).every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
  await page.goto("/destination/goa?traveler=couple");
  await expect(page.getByTestId("journey-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("goa-couple.png"), fullPage: true });
  await page.getByRole("link", { name: "Journey home" }).click();
  await expect(page).toHaveURL("/");
});
