import {domains, expect, filter, group, ids, key, mount, open, rows, selections, test,} from "./helpers.js";

test.beforeEach(async ({page}) => open(page));

for (const via of ["button", "keyboard", "plot label"]) {
    test(`add and activate a group using ${via}`, async ({page}) => {
        await mount(page);
        if (via === "button")
            await page
                .getByRole("button", {name: "Add Group", exact: true})
                .click();
        if (via === "keyboard") await key(page, "+");
        if (via === "plot label") await page.locator("g.colorBrushes text").click();
        await expect(rows(page)).toHaveCount(2);
        expect(
            await page.evaluate(
                () =>
                    [...window.widget.brushGroups.values()].filter((g) => g.isActive)
                        .length
            )
        ).toBe(1);
        expect(await page.evaluate(() => window.widget.value.selectedGroup)).toBe(
            "Group 2"
        );
    });
}

test("rename a group updates exported status and output", async ({page}) => {
    await mount(page, {filters: [group()]});
    await rows(page).first().locator("#groupName").fill("Renamed");
    await rows(page).first().locator("#groupName").press("Tab");
    expect(
        await page.evaluate(() => [...window.widget.value.status.keys()])
    ).toEqual(["Renamed"]);
    expect(await page.evaluate(() => window.widget.value.selectedGroup)).toBe(
        "Renamed"
    );
    expect(
        await page.evaluate(() =>
            window.widget.value.every((d) => d.tw_group === "Renamed")
        )
    ).toBe(true);
});

for (const via of ["button", "API"]) {
    test(`duplicate a populated group using ${via} preserves filters independently`, async ({
                                                                                                page,
                                                                                            }) => {
        await mount(page, {filters: [group()]});
        const before = await domains(page);
        if (via === "button")
            await page.getByRole("button", {name: "Duplicate Group"}).click();
        else
            expect(
                await page.evaluate(
                    () => window.widget.ts.duplicateSelectedGroup() === window.widget.ts
                )
            ).toBe(true);
        await expect(rows(page)).toHaveCount(2);
        await ids(page, ["mid"]);
        const after = await domains(page);
        expect(after).toEqual([before[0], before[0]]);
        expect(
            await page.evaluate(() => {
                const groups = [...window.widget.brushGroups.values()];
                const a = [...groups[0].brushes.values()][0];
                const b = [...groups[1].brushes.values()][0];
                return a !== b && a.selectionDomain !== b.selectionDomain;
            })
        ).toBe(true);
        await key(page, "Delete");
        expect((await domains(page))[0]).toEqual(before[0]);
    });
}

test("duplicating an empty group creates a fresh empty group", async ({
                                                                          page,
                                                                      }) => {
    await mount(page);
    await page.getByRole("button", {name: "Duplicate Group"}).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(selections(page)).toHaveCount(0);
});

for (const via of ["control color", "control count", "plot color"]) {
    test(`switch active group using ${via}`, async ({page}) => {
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
                    {name: "Low", isActive: false}
                ),
            ],
        });
        if (via === "plot color")
            await page.locator("rect.colorBrushes").nth(1).click();
        else
            await rows(page)
                .nth(1)
                .locator(via === "control color" ? "#groupColor" : "#groupSize")
                .click();
        await ids(page, ["low"]);
        expect(await page.evaluate(() => window.widget.value.selectedGroup)).toBe(
            "Low"
        );
    });
}

test("disable and re-enable a group hides and restores its TimeBoxes", async ({
                                                                                  page,
                                                                              }) => {
    await mount(page, {filters: [group()]});
    await expect(selections(page)).toHaveCount(1);
    await expect(selections(page).first()).toBeVisible();
    const before = await domains(page);

    await rows(page).first().locator('input[type="checkbox"]').uncheck();
    await expect(selections(page)).toHaveCount(1);
    await expect(selections(page).first()).toBeHidden();
    expect(await domains(page)).toEqual(before);
    expect(
        await page.evaluate(
            () => [...window.widget.brushGroups.values()][0].isEnable
        )
    ).toBe(false);

    await rows(page).first().locator('input[type="checkbox"]').check();
    await expect(selections(page)).toHaveCount(1);
    await expect(selections(page).first()).toBeVisible();
    expect(await domains(page)).toEqual(before);
    expect(
        await page.evaluate(
            () => [...window.widget.brushGroups.values()][0].isEnable
        )
    ).toBe(true);
    await ids(page, ["mid"]);
});

test("remove the active populated group and retain the remaining query", async ({
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
                {name: "Low", isActive: false}
            ),
        ],
    });
    await rows(page).first().locator("#btnRemoveBrushGroup").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(selections(page)).toHaveCount(1);
    await ids(page, ["low"]);
    await expect(rows(page).first().locator("#btnRemoveBrushGroup")).toBeHidden();
});

test("non-selected visibility toggles without changing the query", async ({
                                                                              page,
                                                                          }) => {
    await mount(page, {filters: [group()]});
    const checkbox = page.locator('.nonSelectedControl input[type="checkbox"]');
    await checkbox.uncheck();
    await ids(page, ["mid"]);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await ids(page, ["mid"]);
    expect(
        await page.evaluate(() => window.widget.value.nonSelectedIds.sort())
    ).toEqual(["high", "low"]);
});
