import {expect, mount, open, test} from "./helpers.js";

test.beforeEach(async ({page}) => {
    await open(page);
    await mount(page, {
        color: "category",
        hasDetails: true,
        referenceCurves: [
            {
                id: "baseline",
                data: [
                    [0, 50],
                    [10, 50],
                ],
            },
        ],
    });
});

async function startTour(page) {
    await page.locator(".__tw-help-btn").click();
    await page.locator(".__tw-help-tour-cta").click();
    await expect(page.locator(".__tw-tour-card")).toBeVisible();
}

test("help button opens documentation with all sections and language controls", async ({
                                                                                           page,
                                                                                       }) => {
    await expect(page.locator(".__tw-help-btn")).toBeVisible();
    await page.locator(".__tw-help-btn").click();
    await expect(page.locator(".__tw-help-modal")).toBeVisible();
    await expect(page.locator(".__tw-help-section summary")).toHaveCount(11);
    await expect(page.locator(".__tw-lang-switcher")).toBeVisible();
});

test("documentation switches between Spanish and English", async ({page}) => {
    await page.locator(".__tw-help-btn").click();
    const title = page.locator(".__tw-help-modal h2");
    await expect(title).toContainText("Ayuda");
    await page.locator(".__tw-lang-btn").filter({hasText: "EN"}).click();
    await expect(title).toContainText("Help");
    await page.locator(".__tw-lang-btn").filter({hasText: "ES"}).click();
    await expect(title).toContainText("Ayuda");
});

test("Escape closes documentation", async ({page}) => {
    await page.locator(".__tw-help-btn").click();
    await expect(page.locator(".__tw-help-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".__tw-help-overlay")).toHaveCount(0);
});

test("guided tour shows each step and closes after finishing", async ({
                                                                          page,
                                                                      }) => {
    await startTour(page);
    const counter = page.locator(".__tw-tour-step-counter");
    await expect(counter).toHaveText(/^1 \/ \d+$/);
    await expect(page.locator(".__tw-tour-card h3")).not.toBeEmpty();
    const totalSteps = Number((await counter.textContent()).split("/")[1]);
    expect(totalSteps).toBeGreaterThanOrEqual(5);
    for (let step = 1; step <= totalSteps; step++) {
        await expect(counter).toHaveText(`${step} / ${totalSteps}`);
        await page.locator(".__tw-tour-btn.__tw-primary").click();
    }
    await expect(page.locator(".__tw-tour-card")).toHaveCount(0);
});

test("keyboard advances and dismisses the guided tour", async ({page}) => {
    await startTour(page);
    await expect(page.locator(".__tw-tour-step-counter")).toHaveText(
        /^1 \/ \d+$/
    );
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".__tw-tour-step-counter")).toHaveText(
        /^2 \/ \d+$/
    );
    await page.keyboard.press("Escape");
    await expect(page.locator(".__tw-tour-card")).toHaveCount(0);
});
