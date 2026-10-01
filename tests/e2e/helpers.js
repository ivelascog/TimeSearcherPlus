import { test as base, expect } from "@playwright/test";

// Fail uncaught browser errors even when a later DOM assertion passes. Keep
// state alongside traces/screenshots so failures can be reviewed before edits.
export const test = base.extend({
  browserErrors: [
    async ({ page }, use, testInfo) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      if (testInfo.status !== testInfo.expectedStatus || errors.length) {
        const state = await page
          .evaluate(() => {
            const w = window.widget;
            return w
              ? {
                  selectedIds: w.value.selectedIds,
                  nonSelectedIds: w.value.nonSelectedIds,
                  extent: w.extent,
                  groups: [...w.brushGroups].map(([id, g]) => ({
                    id,
                    name: g.name,
                    isEnable: g.isEnable,
                    isActive: g.isActive,
                    brushes: [...g.brushes].map(([id, b]) => ({
                      id,
                      mode: b.mode,
                      aggregation: b.aggregation,
                      not: b.not,
                      selectionDomain: b.selectionDomain,
                    })),
                  })),
                }
              : null;
          })
          .catch(() => null);
        await testInfo.attach("browser-state", {
          body: JSON.stringify({ errors, state }, null, 2),
          contentType: "application/json",
        });
      }
      expect(errors, "uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function open(page) {
  await page.goto("/tests/e2e/fixture.html");
  await page.waitForFunction(() => window.makeWidget && window.TimeWidget);
}

export function filter(
  selectionDomain = [
    [2, 60],
    [8, 40],
  ],
  extra = {}
) {
  return { mode: "intersect", aggregation: "and", selectionDomain, ...extra };
}

export function group(brushes = [filter()], extra = {}) {
  return { name: "Query", isEnable: true, isActive: true, brushes, ...extra };
}

export async function mount(page, opts = {}, { dates = false } = {}) {
  await page.evaluate(
    ({ opts, dates }) => {
      const data = [];
      for (const [id, v, category] of [
        ["low", 20, "A"],
        ["mid", 50, "B"],
        ["high", 80, "A"],
      ]) {
        for (let t = 0; t <= 10; t++) {
          data.push({
            id,
            t: dates ? new Date(2023, 0, t + 1) : t,
            v,
            category,
          });
        }
      }
      window.widget = window.makeWidget(
        data,
        Object.assign(
          {
            width: 800,
            height: 400,
            stepX: dates ? { days: 1 } : 1,
            stepY: 5,
            showBrushTooltip: false,
          },
          opts
        )
      );
      window.widget.dataset.testid = "widget";
      window.inputEvents = 0;
      window.widget.addEventListener("input", () => window.inputEvents++);
    },
    { opts, dates }
  );
}

export const selections = (page) =>
  page.locator('[data-testid="widget"] rect.selection[width]');
export const coordinates = (page) =>
  page.locator('[data-testid="widget"] #brushesCoordinates input');
export const rows = (page) =>
  page.locator('[data-testid="widget"] .brushControl');

export async function ids(page, expected) {
  await expect
    .poll(() =>
      page.evaluate(() => window.widget.value.selectedIds.slice().sort())
    )
    .toEqual(expected.slice().sort());
}

export async function domains(page) {
  return page.evaluate(() =>
    [...window.widget.brushGroups.values()].flatMap((g) =>
      [...g.brushes.values()].map((b) => b.selectionDomain)
    )
  );
}

// Coordinates in domain space; use the SVG's actual plot bounds, not the
// surrounding controls or the hidden pending rect.selection.
export async function draw(page, corners) {
  const points = await page.evaluate((corners) => {
    const w = window.widget;
    const svg = w.querySelector("svg").getBoundingClientRect();
    const rect = w.querySelector("clipPath rect");
    const [xmin, xmax] = w.extent.x.map(Number);
    const [ymin, ymax] = w.extent.y;
    return corners.map(([x, y]) => ({
      x:
        svg.left +
        w.ts.margin.left +
        ((x - xmin) / (xmax - xmin)) * +rect.getAttribute("width"),
      y:
        svg.top +
        w.ts.margin.top +
        ((ymax - y) / (ymax - ymin)) * +rect.getAttribute("height"),
    }));
  }, corners);
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, { steps: 8 });
  await page.mouse.up();
}

export async function selectFirst(page) {
  await selections(page)
    .first()
    .click({ position: { x: 15, y: 15 } });
}

export async function key(page, value) {
  await page.locator('[data-testid="widget"] .gDrawing').focus();
  await page.keyboard.press(value);
}
