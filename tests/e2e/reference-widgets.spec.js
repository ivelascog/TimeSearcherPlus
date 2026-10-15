import {expect, filter, group, ids, mount, open, rows, test,} from "./helpers.js";

test.beforeEach(async ({page}) => open(page));

for (const part of [
    ".slider-background",
    ".handle-left .slider-hit-area",
    ".handle-right .slider-hit-area",
]) {
    test(`clicking ${part} selects the slider without moving it`, async ({
                                                                             page,
                                                                         }) => {
        await mount(page, {
            filters: [group([filter()])],
            referenceCurves: [
                {
                    id: "line",
                    data: [
                        [0, 60],
                        [10, 60],
                    ],
                    isSimplePoints: false,
                },
            ],
        });
        await page.locator(".add-slider-btn").click();
        await page
            .locator("rect.selection[width]")
            .click({position: {x: 15, y: 15}});
        const before = await page.evaluate(() =>
            window.widget.ts.getActiveSliderBoxes()
        );
        const area = await page.locator(part).boundingBox();
        expect(area).not.toBeNull();
        await page.mouse.click(area.x + area.width / 2, area.y + area.height / 2);
        await expect(page.locator("g.slider-group.selected")).toHaveCount(1);
        await expect(page.locator("#coordsTitle")).toHaveText(
            "Current Slider Coordinates:"
        );
        const inputs = page.locator("#brushesCoordinates input");
        await expect(inputs.nth(0)).toHaveValue("2.5");
        await expect(inputs.nth(1)).toHaveValue("7.5");
        await expect(inputs.nth(2)).toBeDisabled();
        await expect(inputs.nth(3)).toBeDisabled();
        expect(
            await page.evaluate(() => window.widget.ts.getActiveSliderBoxes())
        ).toEqual(before);
        await page
            .locator("rect.selection[width]")
            .click({position: {x: 15, y: 15}});
        await expect(page.locator("g.slider-group.selected")).toHaveCount(0);
        await expect(inputs.nth(2)).toBeEnabled();
    });
}

test("editing a slider shades and disables Y fields, then restores them for a TimeBox", async ({
                                                                                                   page,
                                                                                               }) => {
    await mount(page, {
        filters: [group([filter()])],
        referenceCurves: [
            {
                id: "line",
                data: [
                    [0, 60],
                    [10, 60],
                ],
                isSimplePoints: false,
            },
        ],
    });
    await page.locator(".add-slider-btn").click();
    const area = await page.locator(".slider-background").boundingBox();
    expect(area).not.toBeNull();
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.down();
    await page.mouse.move(
        area.x + area.width / 2 + 10,
        area.y + area.height / 2,
        {steps: 3}
    );
    await page.mouse.up();
    const yRow = page.locator("#coordsYRow");
    await expect(yRow).toBeVisible();
    await expect(yRow).toHaveCSS("opacity", "0.5");
    for (const input of await yRow.locator("input").all()) {
        await expect(input).toBeDisabled();
        await expect(input).toHaveValue("");
    }
    await expect(page.locator("#brushesCoordinates input").first()).toBeEnabled();
    await page
        .locator("rect.selection[width]")
        .click({position: {x: 15, y: 15}});
    await expect(yRow).toHaveCSS("opacity", "1");
    for (const input of await yRow.locator("input").all())
        await expect(input).toBeEnabled();
});

test("reference sliders keep filtering and their geometry follows setDomains", async ({
                                                                                          page,
                                                                                      }) => {
    await mount(page, {
        referenceCurves: [
            {
                id: "baseline",
                isSimplePoints: false,
                data: [
                    [0, 60],
                    [10, 60],
                ],
            },
        ],
    });
    await page.locator(".add-slider-btn").click();
    await expect(page.locator("g.slider-group")).toHaveCount(1);
    await ids(page, ["high"]);
    const before = await page.evaluate(() => ({
        box: window.widget.ts.getActiveSliderBoxes()[0].box,
        curve: window.widget.querySelector("path.referenceCurve").getAttribute("d"),
    }));
    await page.evaluate(() => window.widget.ts.setDomains({x: [2, 8]}));
    await ids(page, ["high"]);
    const after = await page.evaluate(() => ({
        box: window.widget.ts.getActiveSliderBoxes()[0].box,
        curve: window.widget.querySelector("path.referenceCurve").getAttribute("d"),
        points: window.widget.ts._referenceCurves[0].data,
        clip: window.widget.querySelector("g.gProbes").getAttribute("clip-path"),
        expectedClip: `url(#${window.widget.querySelector("clipPath").id})`,
    }));
    expect(after.box).not.toEqual(before.box);
    expect(after.curve).not.toEqual(before.curve);
    expect(after.points).toEqual([
        [0, 60],
        [10, 60],
    ]);
    expect(after.clip).toBe(after.expectedClip);
    await page.locator(".slider-enabled-toggle").uncheck();
    await ids(page, []);
    await page.locator(".slider-enabled-toggle").check();
    await ids(page, ["high"]);
});

test("all coordinate inputs keep equal widths through a zoom", async ({
                                                                          page,
                                                                      }) => {
    await mount(page);
    await page.evaluate(() => window.widget.ts.setDomains({x: [2, 8]}));
    const widths = await page
        .locator("#brushesCoordinates input")
        .evaluateAll((inputs) =>
            inputs.map((input) => input.getBoundingClientRect().width)
        );
    expect(widths).toHaveLength(4);
    expect(new Set(widths).size).toBe(1);
});

test("slider context menu combines its filter with a TimeBox using AND, OR and NOT", async ({
                                                                                                page,
                                                                                            }) => {
    await mount(page, {
        filters: [group([filter()])],
        referenceCurves: [
            {
                id: "baseline",
                data: [
                    [0, 60],
                    [10, 60],
                ],
                isSimplePoints: false,
            },
        ],
    });
    await ids(page, ["mid"]);
    await page.locator(".add-slider-btn").click();
    await ids(page, []);
    const handle = await page
        .locator(".handle-left .slider-hit-area")
        .boundingBox();
    expect(handle).not.toBeNull();
    await page.mouse.click(handle.x, handle.y + handle.height / 2, {
        button: "right",
    });
    await expect(page.locator(".__ts_contextMenu")).toBeVisible();
    await page.locator("#__ts_c_or").check();
    await ids(page, ["mid", "high"]);
    await page.locator("#__ts_c_not").check();
    await ids(page, ["low", "mid"]);
});

test("point associations keep their NOT filter when disabled and re-enabled", async ({
                                                                                         page,
                                                                                     }) => {
    await mount(page, {
        referenceCurves: [
            {
                id: "point",
                data: [[5, 50]],
                isSimplePoints: true,
                collisionActive: true,
                epsilon: 1,
                associations: [{id: 0, enabled: true, userEnabled: true}],
            },
        ],
    });
    await page.locator(".assoc-enabled-toggle").uncheck();
    await page.locator(".assoc-enabled-toggle").check();
    await ids(page, ["mid"]);
    await page.locator('#rcWidget input[id$="-not"]').check();
    await ids(page, ["low", "high"]);
    await page.locator(".assoc-enabled-toggle").uncheck();
    await ids(page, []);
    await page.locator(".assoc-enabled-toggle").check();
    await ids(page, ["low", "high"]);
});

test("removing a group removes its sliders and point associations", async ({
                                                                               page,
                                                                           }) => {
    await mount(page, {
        referenceCurves: [
            {
                id: "line",
                data: [
                    [0, 60],
                    [10, 60],
                ],
                isSimplePoints: false,
            },
            {
                id: "point",
                data: [[5, 50]],
                isSimplePoints: true,
                collisionActive: true,
                epsilon: 1,
                associations: [{id: 0, enabled: true, userEnabled: true}],
            },
        ],
    });
    await page.locator(".add-slider-btn").click();
    await expect(page.locator("g.slider-group")).toHaveCount(1);
    await page.locator("#btnAddBrushGroup").click();
    await expect(rows(page)).toHaveCount(2);
    await rows(page).first().locator("#btnRemoveBrushGroup").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.locator("g.slider-group")).toHaveCount(0);
    expect(
        await page.evaluate(() => ({
            boxes: window.widget.ts.getActiveSliderBoxes(),
            associations: window.widget.ts._referenceCurves.find(
                (curve) => curve.id === "point"
            ).associations,
        }))
    ).toEqual({boxes: [], associations: []});
    await ids(page, []);
});
