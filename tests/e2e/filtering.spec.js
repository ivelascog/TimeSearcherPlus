import {domains, draw, expect, filter, group, ids, key, mount, open, selections, test,} from "./helpers.js";

test.beforeEach(async ({page}) => open(page));

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
        await mount(page, {autoUpdate});
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
        await mount(page, {filters: [group([filter(undefined, {mode})])]});
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
    test(`${aggregation} combines two disjoint TimeBoxes`, async ({page}) => {
        await mount(page, {
            filters: [
                group([
                    filter(
                        [
                            [2, 60],
                            [8, 40],
                        ],
                        {aggregation}
                    ),
                    filter(
                        [
                            [2, 30],
                            [8, 10],
                        ],
                        {aggregation}
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
            data.push({t, v: 50, id: "flat"}, {t, v: t * 10, id: "crossing"});
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
        .click({button: "right", position: {x: 15, y: 15}});
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
                {name: "Low", isActive: false}
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

test("inverting the selected query mirrors TimeBoxes around their shared vertical midpoint", async ({
                                                                                                        page,
                                                                                                    }) => {
    await mount(page, {
        filters: [
            group([
                filter(
                    [
                        [1, 35],
                        [4, 20],
                    ],
                    {aggregation: "or"}
                ),
                filter(
                    [
                        [6, 80],
                        [9, 60],
                    ],
                    {aggregation: "or"}
                ),
            ]),
        ],
    });
    await ids(page, ["low", "high"]);
    const before = await domains(page);
    await key(page, "i");
    const after = await domains(page);
    const expected = [
        [
            [1, 80],
            [4, 65],
        ],
        [
            [6, 40],
            [9, 20],
        ],
    ];
    expect(after).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
        for (let corner = 0; corner < 2; corner++) {
            for (let axis = 0; axis < 2; axis++) {
                expect(after[i][corner][axis]).toBeCloseTo(
                    expected[i][corner][axis],
                    5
                );
            }
        }
        expect(after[i][1][0] - after[i][0][0]).toBeCloseTo(
            before[i][1][0] - before[i][0][0],
            5
        );
        expect(after[i][0][1] - after[i][1][1]).toBeCloseTo(
            before[i][0][1] - before[i][1][1],
            5
        );
    }
    await ids(page, ["low", "high"]);

    // Reflecting twice must restore each original TimeBox, including its X interval.
    await key(page, "i");
    const restored = await domains(page);
    expect(restored).toHaveLength(before.length);
    for (let i = 0; i < 2; i++) {
        for (let corner = 0; corner < 2; corner++) {
            for (let axis = 0; axis < 2; axis++) {
                expect(restored[i][corner][axis]).toBeCloseTo(
                    before[i][corner][axis],
                    5
                );
            }
        }
    }
});
