import {
  test,
  expect,
  open,
  mount,
  group,
  filter,
  ids,
  draw,
  selections,
  key,
} from "./helpers.js";

test.beforeEach(async ({ page }) => open(page));

test("initial state exposes all timelines as non-selected", async ({
  page,
}) => {
  await mount(page);
  await ids(page, []);
  expect(
    await page.evaluate(() => window.widget.value.nonSelectedIds.sort())
  ).toEqual(["high", "low", "mid"]);
  await expect(selections(page)).toHaveCount(0);
});

for (const autoUpdate of [true, false]) {
  test(`drawing filters the data with autoUpdate=${autoUpdate}`, async ({
    page,
  }) => {
    await mount(page, { autoUpdate });
    await draw(page, [
      [2, 60],
      [8, 40],
    ]);
    await ids(page, ["mid"]);
    await expect(selections(page)).toHaveCount(1);
    expect(await page.evaluate(() => window.inputEvents)).toBeGreaterThan(0);
  });
}

for (const mode of ["intersect", "contains"]) {
  test(`${mode} selects only the middle horizontal timeline`, async ({
    page,
  }) => {
    await mount(page, { filters: [group([filter(undefined, { mode })])] });
    await ids(page, ["mid"]);
    expect(
      await page.evaluate(() => window.widget.value.nonSelectedIds.sort())
    ).toEqual(["high", "low"]);
  });
}

for (const [aggregation, expected] of [
  ["and", []],
  ["or", ["low", "mid"]],
]) {
  test(`${aggregation} combines two disjoint TimeBoxes`, async ({ page }) => {
    await mount(page, {
      filters: [
        group([
          filter(
            [
              [2, 60],
              [8, 40],
            ],
            { aggregation }
          ),
          filter(
            [
              [2, 30],
              [8, 10],
            ],
            { aggregation }
          ),
        ]),
      ],
    });
    await ids(page, expected);
    await expect(selections(page)).toHaveCount(2);
  });
}

test("intersect and contains distinguish a line leaving the vertical interval", async ({
  page,
}) => {
  await page.evaluate(() => {
    const data = [];
    for (let t = 0; t <= 10; t++) {
      data.push({ t, v: 50, id: "flat" }, { t, v: t * 10, id: "crossing" });
    }
    window.widget = window.makeWidget(data, {
      showBrushTooltip: false,
      filters: [
        {
          name: "Query",
          isActive: true,
          isEnable: true,
          brushes: [
            {
              mode: "intersect",
              aggregation: "and",
              selectionDomain: [
                [2, 60],
                [8, 40],
              ],
            },
          ],
        },
      ],
    });
    window.widget.dataset.testid = "widget";
  });
  await ids(page, ["flat", "crossing"]);
  await selections(page)
    .first()
    .click({ button: "right", position: { x: 15, y: 15 } });
  await page.locator("#__ts_c_contains").check();
  await ids(page, ["flat"]);
});

test("multiple groups expose independent selections in legacy and tidy outputs", async ({
  page,
}) => {
  await mount(page, {
    filters: [
      group(),
      group(
        [
          filter([
            [2, 30],
            [8, 10],
          ]),
        ],
        { name: "Low", isActive: false }
      ),
    ],
  });
  const value = await page.evaluate(() => ({
    groups: [...window.widget.value.legacyValue].map(([name, values]) => [
      name,
      [...values.keys()],
    ]),
    tidy: window.widget.value.map((d) => [d.id, d.tw_group]),
    array: window.widget.value.asArray().map((d) => [d.id, d.tw_group]),
    color: window.widget.value.getColor("Query"),
  }));
  expect(value.groups).toEqual([
    ["Query", ["mid"]],
    ["Low", ["low"]],
  ]);
  expect(value.tidy).toHaveLength(22);
  expect(value.array).toEqual([
    ["mid", "Query"],
    ["low", "Low"],
  ]);
  expect(value.color).toBeTruthy();
});

test("inverting the selected query mirrors its vertical interval", async ({
  page,
}) => {
  await mount(page, {
    filters: [
      group([
        filter([
          [2, 35],
          [8, 15],
        ]),
      ]),
    ],
  });
  await ids(page, ["low"]);
  await key(page, "i");
  await ids(page, ["high"]);
});
