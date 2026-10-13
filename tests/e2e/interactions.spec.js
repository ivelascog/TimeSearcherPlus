import {
  test,
  expect,
  open,
  mount,
  group,
  filter,
  ids,
  selections,
  coordinates,
  domains,
  draw,
  selectFirst,
  key,
} from "./helpers.js";

test.beforeEach(async ({ page }) => open(page));

test("coordinates are empty and disabled until a TimeBox is selected", async ({
  page,
}) => {
  await mount(page);
  await expect(coordinates(page)).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect(coordinates(page).nth(i)).toBeDisabled();
    await expect(coordinates(page).nth(i)).toHaveValue("");
  }
});

test("clicking a restored TimeBox enables and populates its coordinates", async ({
  page,
}) => {
  await mount(page, { filters: [group()] });
  await selectFirst(page);
  for (const [i, value] of ["2.0", "8.0", "40.0", "60.0"].entries()) {
    await expect(coordinates(page).nth(i)).toBeEnabled();
    await expect(coordinates(page).nth(i)).toHaveValue(value);
  }
});

for (const [i, value, corner, axis] of [
  [0, "3", 0, 0],
  [1, "7", 1, 0],
  [2, "45", 1, 1],
  [3, "55", 0, 1],
]) {
  test(`edit coordinate input ${i} updates domain and rendered TimeBox`, async ({
    page,
  }) => {
    await mount(page, { filters: [group()] });
    await selectFirst(page);
    const before = await selections(page).first().boundingBox();
    await coordinates(page).nth(i).fill(value);
    await coordinates(page).nth(i).press("Tab");
    await expect
      .poll(async () => (await domains(page))[0][corner][axis])
      .toBeCloseTo(Number(value), 5);
    expect(await selections(page).first().boundingBox()).not.toEqual(before);
    await ids(page, ["mid"]);
  });
}

for (const [arrow, dx, dy] of [
  ["ArrowRight", 1, 0],
  ["ArrowLeft", -1, 0],
  ["ArrowUp", 0, 5],
  ["ArrowDown", 0, -5],
]) {
  test(`${arrow} translates a selected TimeBox preserving its size`, async ({
    page,
  }) => {
    await mount(page, { filters: [group()] });
    await selectFirst(page);
    await key(page, arrow);
    const [d] = await domains(page);
    for (let i = 0; i < 2; i++) {
      expect(d[i][0]).toBeCloseTo([2, 8][i] + dx, 5);
      expect(d[i][1]).toBeCloseTo([60, 40][i] + dy, 5);
    }
  });
}

for (const value of ["Delete", "Backspace", "r"]) {
  test(`${value} removes the selected TimeBox and clears coordinates`, async ({
    page,
  }) => {
    await mount(page, { filters: [group()] });
    await selectFirst(page);
    await key(page, value);
    await expect(selections(page)).toHaveCount(0);
    await ids(page, []);
    for (let i = 0; i < 4; i++)
      await expect(coordinates(page).nth(i)).toBeDisabled();
  });
}

test("drag a selected TimeBox and resize it through an east handle", async ({
  page,
}) => {
  await mount(page, { filters: [group()] });
  const before = await selections(page).first().boundingBox();
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width / 2 + 35,
    before.y + before.height / 2,
    { steps: 8 }
  );
  await page.mouse.up();
  const moved = await selections(page).first().boundingBox();
  expect(moved.x - before.x).toBeCloseTo(35, 0);
  expect(moved.width).toBeCloseTo(before.width, 0);
  const handle = page
    .locator(".brush:has(rect.selection[width]) .handle--e")
    .first();
  const b = await handle.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 35, b.y + b.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  expect((await selections(page).first().boundingBox()).width).toBeCloseTo(
    moved.width - 35,
    0
  );
});

test("Shift selects multiple TimeBoxes and moves them together", async ({
  page,
}) => {
  await mount(page, {
    filters: [
      group([
        filter([
          [1, 60],
          [3, 40],
        ]),
        filter([
          [5, 60],
          [7, 40],
        ]),
      ]),
    ],
  });
  await selections(page)
    .first()
    .click({ modifiers: ["Shift"], position: { x: 20, y: 20 } });
  await selections(page)
    .nth(1)
    .click({ modifiers: ["Shift"], position: { x: 20, y: 20 } });
  const before = await domains(page);
  await key(page, "ArrowRight");
  const after = await domains(page);
  for (let i = 0; i < 2; i++)
    expect(after[i][0][0] - before[i][0][0]).toBeCloseTo(1, 5);
});

test("numeric snapping applies to both coordinates on drawing", async ({
  page,
}) => {
  await mount(page, { snapX: 1, snapY: 10 });
  await draw(page, [
    [2.3, 63],
    [7.7, 37],
  ]);
  const [d] = await domains(page);
  expect(d).toEqual([
    [2, 60],
    [8, 40],
  ]);
  await ids(page, ["mid"]);
});

test("date inputs edit a temporal TimeBox and arrow keys use day steps", async ({
  page,
}) => {
  await mount(page, {}, { dates: true });
  await draw(page, [
    [+new Date(2023, 0, 3), 60],
    [+new Date(2023, 0, 9), 40],
  ]);
  await expect(coordinates(page).nth(0)).toHaveAttribute("type", "Date");
  await coordinates(page).nth(0).fill("2023-01-04");
  await coordinates(page).nth(0).press("Tab");
  await key(page, "ArrowRight");
  await expect(coordinates(page).nth(0)).toHaveValue("2023-01-05");
  await expect(coordinates(page).nth(1)).toHaveValue("2023-01-10");
});

test("context menu changes mode, aggregation and negation and closes", async ({
  page,
}) => {
  await mount(page, { filters: [group()] });
  await selections(page)
    .first()
    .click({ button: "right", position: { x: 15, y: 15 } });
  await expect(page.locator(".__ts_contextMenu")).toBeVisible();
  await page.locator("#__ts_c_contains").check();
  await page.locator("#__ts_c_or").check();
  await page.locator("#__ts_c_not").check();
  await ids(page, ["low", "high"]);
  expect(
    await page.evaluate(() => {
      const b = [...window.widget.brushGroups.values()][0].brushes
        .values()
        .next().value;
      return { mode: b.mode, aggregation: b.aggregation, negate: b.negate };
    })
  ).toEqual({ mode: "contains", aggregation: "or", negate: true });
  await page.locator(".__ts_contextMenu button").click();
  await expect(page.locator(".__ts_contextMenu")).toBeHidden();
});

test("editable tooltip updates a coordinate on Enter and hides after leaving", async ({
  page,
}) => {
  await mount(page, { showBrushTooltip: true, filters: [group()] });
  await selections(page)
    .first()
    .hover({ position: { x: 15, y: 15 } });
  const tooltip = page.locator(".__ts_tooltip");
  await expect(tooltip.locator("input.x0")).toBeVisible();
  await tooltip.locator("input.x0").fill("3");
  await tooltip.locator("input.x0").press("Enter");
  await expect
    .poll(async () => (await domains(page))[0][0][0])
    .toBeCloseTo(3, 5);
  await tooltip.locator("input.x0").blur();
  await page.mouse.move(1000, 700);
  await expect(tooltip.locator("input.x0")).toBeHidden();
});
