import { expect, test } from "@playwright/test";
import { buildMapData } from "../src/lib/journey/map-data";
import type { JourneyStop } from "../src/lib/journey/types";

test("geometry follows stored sequence and never nearest-neighbor order", () => {
  const stop = (id: string, sequence: number, longitude: number | null): JourneyStop => ({ id, sequence, longitude, latitude: longitude == null ? null : 10, name: id, description: "", photo: null, rating: null, dayNumber: null });
  const stops = [stop("D", 3, 80), stop("B", 1, 85), stop("A", 0, 76), stop("C", 2, 77)];
  const data = buildMapData(stops);
  expect(data.markers.map((marker) => marker.id)).toEqual(["A", "B", "C", "D"]);
  expect(data.markers.map((marker) => marker.number)).toEqual([1, 2, 3, 4]);
  expect(data.line.geometry.coordinates).toEqual([[[76, 10], [85, 10], [77, 10], [80, 10]]]);
  expect(stops.map((stop) => stop.id)).toEqual(["D", "B", "A", "C"]);
  const missing = buildMapData([stop("A", 0, 76), stop("B", 1, null), stop("C", 2, 77), stop("D", 3, 80)]);
  expect(missing.markers.map((marker) => marker.number)).toEqual([1, 3, 4]);
  expect(missing.line.geometry.coordinates).toEqual([[[77, 10], [80, 10]]]);
  expect(buildMapData([]).markers).toEqual([]);
});

test("anonymous detail, linked map/timeline, login prompts, share and mobile layout", async ({ page }, testInfo) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (url: string) => { (window as Window & { copiedUrl?: string }).copiedUrl = url; } }, configurable: true });
  });
  await page.goto("/journey/demo-goa-couple");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A little slower, a little closer");
  await expect(page.getByTestId("journey-stop")).toHaveCount(4);
  expect(await page.getByTestId("journey-stop").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-sequence")))).toEqual(["0", "1", "2", "3"]);
  await page.getByRole("link", { name: "Use This Journey", exact: true }).click();
  await expect(page).toHaveURL(/#journey-route$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("route-marker")).toHaveCount(4);
  await expect(page.locator('section[aria-label="Journey route map"] polyline')).toHaveCount(1);
  expect(await page.getByTestId("route-marker").allTextContents()).toEqual(["1", "2", "3", "4"]);
  await page.getByRole("button", { name: "Select stop 2: Fontainhas" }).click();
  await expect(page.getByRole("button", { name: "Stop 2: Fontainhas", exact: true })).toHaveAttribute("aria-pressed", "true");
  const popupClose = page.locator('.mapboxgl-popup-close-button');
  if (await popupClose.count()) await popupClose.click();
  await page.getByRole("button", { name: "Stop 3: Reis Magos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Select stop 3: Reis Magos" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: "3. Reis Magos" })).toBeVisible();
  for (const name of ["Like journey", "Save", "Remix This Journey"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Log in to continue" })).toBeVisible();
    await page.getByRole("button", { name: "Close login" }).click();
  }
  await page.getByRole("button", { name: "Share ↗", exact: true }).click();
  await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { copiedUrl?: string }).copiedUrl)).toBe("http://localhost:3100/journey/demo-goa-couple");
  expect(requests.some((url) => /directions|optimization|routing|geocoding/.test(url))).toBe(false);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("journey-detail.png"), fullPage: true });
});

test("authenticated action UI persists state, handles errors and starts copy (mock API)", async ({ page }) => {
  let liked = false, saved = false;
  let fail = false;
  const actions: { action: string; enabled?: boolean }[] = [];
  await page.route("**/api/journeys/*/actions", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); actions.push(body);
      if (fail) { await route.fulfill({ status: 503, json: { error: "Please try again later." } }); return; }
      if (body.action === "copy") { await route.fulfill({ json: { copiedId: "demo-varkala-couple" } }); return; }
      if (body.action === "like") liked = body.enabled;
      if (body.action === "save") saved = body.enabled;
    }
    await route.fulfill({ json: { user: { id: "test-user" }, liked, saved, likes: liked ? 1 : 0 } });
  });
  await page.goto("/journey/demo-goa-couple");
  await page.getByRole("button", { name: "Like journey", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unlike journey" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Unlike journey" })).toContainText("1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved ✓", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Unlike journey" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Saved ✓", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unlike journey" }).click();
  await page.getByRole("button", { name: "Saved ✓", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveAttribute("aria-pressed", "false");
  fail = true;
  await page.getByRole("button", { name: "Like journey" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Please try again later." })).toHaveText("Please try again later.");
  await expect(page.getByRole("button", { name: "Like journey" })).toHaveAttribute("aria-pressed", "false");
  fail = false;
  await page.getByRole("button", { name: "Remix This Journey", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/create?draft=demo-varkala-couple");
  expect(actions.slice(0, 4)).toEqual([{ action: "like", enabled: true }, { action: "save", enabled: true }, { action: "like", enabled: false }, { action: "save", enabled: false }]);
});

test("mutation endpoint refuses cross-origin requests", async ({ request }) => {
  const response = await request.post("/api/journeys/demo-goa-couple/actions", { headers: { origin: "https://untrusted.example" }, data: { action: "like", enabled: true } });
  expect(response.status()).toBe(403);
});

test('broken cover image uses the local fallback', async ({ page }) => {
  await page.route(/\/_next\/image\?url=%2Fimages%2Fvarkala\.jpg/, route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/journey/demo-varkala-couple');
  const cover = page.getByAltText('Varkala journey cover');
  await expect(cover).toHaveAttribute('src', /goa\.jpg/);
  await expect.poll(() => cover.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
