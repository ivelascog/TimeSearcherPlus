import {expect, mount, open, test} from "./helpers.js";

async function expectCanvasToMatchPlot(page) {
    const bounds = await page.evaluate(() => {
        const widget = window.widget;
        const canvas = widget.querySelector("#render > canvas");
        const plot = widget.querySelector("clipPath rect");
        const transform = widget.querySelector("g.gDrawing").getScreenCTM();
        const origin = new DOMPoint(0, 0).matrixTransform(transform);
        const corner = new DOMPoint(
            Number(plot.getAttribute("width")),
            Number(plot.getAttribute("height"))
        ).matrixTransform(transform);
        const rect = canvas.getBoundingClientRect();
        return {
            canvas: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
            },
            plot: {
                left: origin.x,
                top: origin.y,
                right: corner.x,
                bottom: corner.y,
            },
            buffer: {width: canvas.width, height: canvas.height},
            expectedBuffer: {
                width: Number(plot.getAttribute("width")) * window.devicePixelRatio,
                height: Number(plot.getAttribute("height")) * window.devicePixelRatio,
            },
        };
    });
    for (const edge of ["left", "top", "right", "bottom"]) {
        expect(
            bounds.canvas[edge],
            `Canvas ${edge} matches the SVG plot`
        ).toBeCloseTo(bounds.plot[edge], 5);
    }
    expect(bounds.buffer).toEqual(bounds.expectedBuffer);
}

for (const deviceScaleFactor of [1, 2]) {
    test.describe(`Canvas alignment at pixel ratio ${deviceScaleFactor}`, () => {
        test.use({deviceScaleFactor});
        for (const renderer of ["canvas", "webgpu"]) {
            for (const layout of [
                {name: "default margins", options: {}},
                {
                    name: "custom size and asymmetric margins",
                    options: {
                        width: 930,
                        height: 510,
                        margin: {left: 85, right: 25, top: 45, bottom: 65},
                    },
                },
            ]) {
                test(`${renderer} matches the SVG plot with ${layout.name}`, async ({
                                                                                        page,
                                                                                    }) => {
                    await open(page);
                    await mount(page, Object.assign({renderer}, layout.options));
                    await expectCanvasToMatchPlot(page);
                    await page.evaluate(() =>
                        window.widget.ts.setDomains({x: [2, 8], y: [30, 70]})
                    );
                    await expectCanvasToMatchPlot(page);
                    await page.evaluate(() => window.widget.ts.update());
                    await expectCanvasToMatchPlot(page);
                });
            }
        }
    });
}
