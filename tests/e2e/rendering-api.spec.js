import {
  test,
  expect,
  open,
  mount,
  group,
  filter,
  ids,
  rows,
  selections,
  domains,
  draw,
} from "./helpers.js";

test.beforeEach(async ({ page }) => open(page));

test("canvas paints timeline pixels and respects configured dimensions", async ({
  page,
}) => {
  await mount(page);
  const canvas = page.locator('[data-testid="widget"] canvas');
  await expect(canvas).toHaveCount(1);
  expect(
    await canvas.evaluate((c) => {
      const pixels = c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height).data;
      return pixels.some((v, i) => i % 4 === 3 && v > 0);
    })
  ).toBe(true);
  await expect(page.locator('[data-testid="widget"] svg')).toHaveAttribute(
    "width",
    "800"
  );
  await expect(page.locator('[data-testid="widget"] svg')).toHaveAttribute(
    "height",
    "400"
  );
});

test("axis labels, custom ticks, grid and second Y axis render", async ({
  page,
}) => {
  await mount(page, {
    xLabel: "Time",
    yLabel: "Value",
    showGrid: true,
    doubleYlegend: true,
    xTicks: [
      [0, "Start"],
      [10, "End"],
    ],
    yTicks: [
      [20, "Low"],
      [80, "High"],
    ],
  });
  await expect(page.locator(".mainXAxis .label")).toHaveText("Time");
  await expect(page.locator(".mainYAxis .label")).toHaveText("Value");
  await expect(page.locator(".mainXAxis .tick text")).toHaveText([
    "Start",
    "End",
  ]);
  await expect(page.locator(".mainYAxis .tick text")).toHaveText([
    "Low",
    "High",
  ]);
  await expect(page.locator(".gridline")).toHaveCount(4);
  await expect(page.locator(".secondYaxis")).toHaveCount(1);
});

test("default axes omit grid and second Y axis", async ({ page }) => {
  await mount(page);
  await expect(page.locator(".gridline")).toHaveCount(0);
  await expect(page.locator(".secondYaxis")).toHaveCount(0);
});

for (const [option, property, selector] of [
  ["showBrushesControls", "groups", "#brushesGroups"],
  ["showBrushesCoordinates", "brushesCoordinates", "#brushesCoordinates"],
  ["showDataGroups", "dataGroups", "#dataGroups"],
  ["showDetails", "details", "#detail"],
]) {
  test(`${option}=false exports a control that can be mounted externally`, async ({
    page,
  }) => {
    await mount(page, { [option]: false, hasDetails: true, color: "category" });
    await expect(
      page.locator(`[data-testid="widget"] ${selector}`)
    ).toHaveCount(0);
    expect(
      await page.evaluate((property) => {
        const element = window.widget[property];
        if (!(element instanceof HTMLElement) || element.isConnected)
          return false;
        document.getElementById("target").appendChild(element);
        return element.isConnected;
      }, property)
    ).toBe(true);
    await expect(page.locator(`#target ${selector}`)).toBeVisible();
  });
}

test("data categories count timelines and toggle the exported selection", async ({
  page,
}) => {
  await mount(page, {
    color: "category",
    filters: [
      group([
        filter([
          [1, 85],
          [9, 15],
        ]),
      ]),
    ],
  });
  await expect(page.locator(".groupData span")).toHaveText(["A (2)", "B (1)"]);
  const before = await page.evaluate(() =>
    window.widget.value.map((d) => d.id)
  );
  expect(new Set(before).size).toBe(3);
  await page.locator(".groupData button").first().click();
  expect(
    await page.evaluate(() => [
      ...new Set(window.widget.value.map((d) => d.id)),
    ])
  ).toEqual(["mid"]);
  await page.locator(".groupData button").first().click();
  expect(
    new Set(await page.evaluate(() => window.widget.value.map((d) => d.id)))
      .size
  ).toBe(3);
});

test("details render selected timelines and honor maxDetailsRecords", async ({
  page,
}) => {
  await mount(page, {
    hasDetails: true,
    maxDetailsRecords: 2,
    filters: [
      group([
        filter([
          [1, 85],
          [9, 15],
        ]),
      ]),
    ],
  });
  await expect(page.locator(".detailsContainer")).toHaveCount(2);
  expect(
    await page
      .locator(".detailsContainer")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("group")))
  ).toEqual(["low", "mid"]);
  expect(
    await page.locator("#detail canvas, #detail svg").count()
  ).toBeGreaterThan(0);
});

test("details disabled avoids creating the details component", async ({
  page,
}) => {
  await mount(page, { hasDetails: false, filters: [group()] });
  await expect(page.locator("#detail")).toHaveCount(0);
  expect(await page.evaluate(() => window.widget.details === undefined)).toBe(
    true
  );
});

test("function accessors and custom scales work in a real widget", async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const data = window.makeData({ series: 2, points: 10 });
    const w = window.makeWidget(data, {
      x: (d) => d.t,
      y: (d) => d.v,
      id: (d) => d.id,
      yScale: d3.scaleLog(),
      xScale: d3.scaleLinear(),
    });
    return {
      extent: w.ts.getExtent(),
      ids: w.value.nonSelectedIds,
      ticks: w.querySelectorAll(".mainYAxis .tick").length,
    };
  });
  expect(result.extent.x).toEqual([0, 9]);
  expect(result.ids).toEqual(["s0", "s1"]);
  expect(result.ticks).toBeGreaterThan(0);
});

test("missing values are filtered while zero remains valid", async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const w = window.makeWidget([
      { t: 0, v: 0, id: "zero" },
      { t: 1, v: 10, id: "zero" },
      { t: null, v: 10, id: "null-x" },
      { t: 1, v: null, id: "null-y" },
      { v: 10, id: "missing-x" },
      { t: 1, id: "missing-y" },
    ]);
    return { ids: w.value.nonSelectedIds, extent: w.ts.getExtent() };
  });
  expect(result).toEqual({ ids: ["zero"], extent: { x: [0, 1], y: [0, 10] } });
});

test("maxTimelines limits distinct rendered and queryable series", async ({
  page,
}) => {
  await mount(page, {
    maxTimelines: 2,
    filters: [
      group([
        filter([
          [1, 85],
          [9, 15],
        ]),
      ]),
    ],
  });
  await ids(page, ["low", "mid"]);
});

test("render and update preserve the query and avoid duplicate controls", async ({
  page,
}) => {
  await mount(page, { filters: [group()] });
  const before = await domains(page);
  await page.evaluate(() => {
    window.widget.ts.render();
    window.widget.ts.update();
    window.widget.ts.update();
  });
  await ids(page, ["mid"]);
  expect(await domains(page)).toEqual(before);
  await expect(rows(page)).toHaveCount(1);
  await expect(selections(page)).toHaveCount(1);
  await expect(page.locator('[data-testid="widget"] canvas')).toHaveCount(1);
  await expect(page.locator(".__ts_contextMenu")).toHaveCount(1);
  await expect(page.locator(".__ts_tooltip")).toHaveCount(1);
});

test("replace data updates output and the full extent", async ({ page }) => {
  await mount(page);
  await page.evaluate(() =>
    window.widget.ts.data([
      { id: "replacement", t: 0, v: 0 },
      { id: "replacement", t: 20, v: 200 },
    ])
  );
  expect(await page.evaluate(() => window.widget.ts.getExtent())).toEqual({
    x: [0, 20],
    y: [0, 200],
  });
  expect(await page.evaluate(() => window.widget.value.nonSelectedIds)).toEqual(
    ["replacement"]
  );
});

test("an exported status Map can restore the same query in a second widget", async ({
  page,
}) => {
  await mount(page, { filters: [group()] });
  expect(
    await page.evaluate(() => {
      const original = window.widget;
      const restored = window.makeWidget(
        window.makeData({ points: 11 }),
        {
          _this: original,
        },
        { hidden: true }
      );
      return [...restored.value.status.keys()];
    })
  ).toEqual(["Query"]);
});

test("widgets coexist with independent interaction and domains", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(
    () =>
      (window.other = window.makeWidget(
        window.makeData({ points: 15 }),
        {},
        { hidden: true }
      ))
  );
  await draw(page, [
    [2, 60],
    [8, 40],
  ]);
  await ids(page, ["mid"]);
  expect(
    await page.evaluate(() => ({
      selected: window.other.value.selectedIds,
      brushes: [...window.other.brushGroups.values()][0].brushes.size,
    }))
  ).toEqual({ selected: [], brushes: 0 });
});

test("callback getters and setters retain functions and chaining", async ({
  page,
}) => {
  await mount(page);
  expect(
    await page.evaluate(() => {
      const fn = () => {};
      const ts = window.widget.ts;
      return (
        ts.updateCallback(fn) === ts &&
        ts.statusCallback(fn) === ts &&
        ts.updateCallback() === fn &&
        ts.statusCallback() === fn
      );
    })
  ).toBe(true);
});

for (const name of ["updateCallback", "statusCallback"]) {
  test(`${name} receives changes after drawing a TimeBox`, async ({ page }) => {
    await mount(page);
    await page.evaluate((name) => {
      window.callbackCalls = 0;
      window.widget.ts[name](() => window.callbackCalls++);
    }, name);
    await draw(page, [
      [2, 60],
      [8, 40],
    ]);
    await ids(page, ["mid"]);
    expect(await page.evaluate(() => window.callbackCalls)).toBeGreaterThan(0);
  });
}

test("reference curves apply style and replacing them removes old paths", async ({
  page,
}) => {
  await mount(page);
  expect(
    await page.evaluate(
      () =>
        window.widget.ts.addReferenceCurves([
          {
            data: [
              [0, 20],
              [10, 80],
            ],
            color: "red",
            opacity: 0.5,
          },
          {
            data: [
              [0, 80],
              [10, 20],
            ],
            color: "blue",
            opacity: 1,
          },
        ]) === window.widget.ts
    )
  ).toBe(true);
  await expect(page.locator("path.referenceCurve")).toHaveCount(2);
  await expect(page.locator("path.referenceCurve").first()).toHaveAttribute(
    "stroke",
    "red"
  );
  await page.evaluate(() => window.widget.ts.addReferenceCurves([]));
  await expect(page.locator("path.referenceCurve")).toHaveCount(0);
});

for (const method of ["run", "runBrush"]) {
  test(`performance.${method} completes and exports measured frames`, async ({
    page,
  }) => {
    await mount(page, {
      performanceMonitoring: { enabled: false, log: false },
    });
    const report = await page.evaluate(
      (method) =>
        window.widget.ts.performance[method]({ frames: 5, warmupFrames: 1 }),
      method
    );
    expect(report.renderMs.samples).toBeGreaterThan(0);
    expect(report.renderMs.mean).toBeGreaterThanOrEqual(0);
    if (method === "runBrush") {
      expect(report.collisionMs.samples).toBeGreaterThan(0);
      expect(report.frameMs.samples).toBeGreaterThan(0);
    }
    await page.evaluate(() => window.widget.ts.performance.reset());
    expect(
      await page.evaluate(
        () => window.widget.ts.performance.report().renderMs.samples
      )
    ).toBe(0);
  });
}

test("enabling group medians changes canvas pixels", async ({ page }) => {
  const different = await page.evaluate(() => {
    const data = window.makeData({ series: 10, points: 40 });
    const opts = {
      showGroupMedian: false,
      medianMinRecordsPerBin: 1,
      filters: [
        {
          name: "All",
          isEnable: true,
          isActive: true,
          brushes: [
            {
              selectionDomain: [
                [1, 139],
                [38, 61],
              ],
            },
          ],
        },
      ],
    };
    const a = window.makeWidget(data, opts);
    const b = window.makeWidget(
      data,
      Object.assign({}, opts, { showGroupMedian: true }),
      { hidden: true }
    );
    return (
      a.querySelector("canvas").toDataURL() !==
      b.querySelector("canvas").toDataURL()
    );
  });
  expect(different).toBe(true);
});
