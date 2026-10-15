import {expect, test} from "@playwright/test";

// The benchmark harness (bench/) drives TimeWidget and three baselines through
// one common driver. These tests pin behaviour, never timing: numbers from a
// headless CI browser are meaningless (software raster), but a broken adapter
// or a baseline that selects less than TimeWidget would silently corrupt the
// paper's comparison.

test.describe("benchmark API", () => {
    test("internal CPU monitoring reports without waiting for presentation", async ({page}) => {
        await page.goto("/tests/e2e/fixture.html");
        const result = await page.evaluate(() => {
            const el = window.makeWidget(window.makeData({series: 20, points: 20}));
            const ext = el.ts.getExtent();
            const handle = el.ts.performance.prepareBrush([
                [[ext.x[0], ext.y[1]], [ext.x[1], ext.y[0]]],
            ]);
            let callbackReport = null;
            el.ts.performance.configure({
                enabled: true, log: false, reportEvery: 1,
                onReport: (report) => {
                    callbackReport = report;
                }
            });
            el.ts.performance.reset();
            handle.move(0, [
                [ext.x[0], ext.y[0] + (ext.y[1] - ext.y[0]) / 5],
                [ext.x[0] + (ext.x[1] - ext.x[0]) / 2, ext.y[0]],
            ]);
            // Read immediately, before any animation-frame callback can fire.
            return {callbackReport, report: el.ts.performance.report()};
        });
        expect(result.callbackReport).not.toBeNull();
        expect(Object.keys(result.report)).toEqual(["collisionMs", "renderMs", "totalCpuMs"]);
        expect(result.report.collisionMs.samples).toBeGreaterThan(0);
        expect(result.report.renderMs.samples).toBeGreaterThan(0);
        expect(result.report.totalCpuMs.samples).toBeGreaterThan(0);
    });

    test("internal brush benchmark returns only CPU metrics after warm-up", async ({page}) => {
        await page.goto("/tests/e2e/fixture.html");
        const report = await page.evaluate(async () => {
            const el = window.makeWidget(window.makeData({series: 20, points: 20}), {
                performanceMonitoring: {log: false, reportEvery: 1e9},
            });
            return el.ts.performance.runBrush({frames: 5, warmupFrames: 2});
        });
        expect(Object.keys(report)).toEqual(["collisionMs", "renderMs", "totalCpuMs"]);
        for (const metric of Object.values(report)) {
            // Unchanged selections may skip filtering/rendering entirely.
            expect(metric.samples).toBeGreaterThan(0);
            expect(metric.samples).toBeLessThanOrEqual(5);
            expect(Number.isFinite(metric.p50)).toBe(true);
        }
    });

    test("prepareBrush creates one group per domain and move() changes the selection", async ({page}) => {
        await page.goto("/tests/e2e/fixture.html");
        const result = await page.evaluate(() => {
            const el = window.makeWidget(window.makeData({series: 200, points: 40}));
            const ext = el.ts.getExtent();
            const [x0, x1] = [+ext.x[0], +ext.x[1]];
            const [y0, y1] = [+ext.y[0], +ext.y[1]];
            const d = (fx0, fx1, fyHigh, fyLow) => [
                [x0 + (x1 - x0) * fx0, y0 + (y1 - y0) * fyHigh],
                [x0 + (x1 - x0) * fx1, y0 + (y1 - y0) * fyLow],
            ];
            const handle = el.ts.performance.prepareBrush([d(0, 0.2, 1, 0), d(0.5, 0.6, 0.6, 0.4)]);
            const counts = () => handle.groupNames.map((n) => el.value.legacyValue.get(n).size);
            const before = counts();
            handle.move(0, d(0.8, 0.85, 0.1, 0.0));
            return {names: handle.groupNames, before, after: counts()};
        });
        expect(result.names).toEqual(["Performance benchmark 1", "Performance benchmark 2"]);
        expect(result.before[0]).toBe(200); // full-height brush selects everything
        expect(result.after[0]).toBeLessThan(200);
    });
});

test.describe("bench harness", () => {
    test.beforeEach(async ({page}) => {
        await page.goto("/bench/page.html");
        await page.waitForFunction(() => typeof window.benchCell === "function");
    });

    test("timewidget cell returns finite frame stats and a breakdown", async ({page}) => {
        const r = await page.evaluate(() =>
            window.benchCell({adapter: "timewidget", lines: 300, points: 20, groups: 3, frames: 10, warmupFrames: 2})
        );
        expect(r.measuredFrames).toBe(10);
        expect(Number.isFinite(r.frameMs.p50)).toBe(true);
        expect(r.totalCpuMs.samples).toBeGreaterThan(0);
        expect(r.loadMs).toBeGreaterThan(0);
    });

    test("trace setup failures prevent accepting an untraced measurement", async ({page}) => {
        await expect(page.evaluate(() => window.benchCell({
            adapter: "canvas", lines: 10, points: 5, groups: 1, frames: 3, warmupFrames: 8,
            beforeTrace: async () => {
                throw new Error("trace setup failed");
            },
        }))).rejects.toThrow("trace setup failed");
    });

    test("async trace setup finishes once before measurement starts", async ({page}) => {
        const result = await page.evaluate(async () => {
            let calls = 0;
            let ready;
            const cell = await window.benchCell({
                adapter: "canvas", lines: 10, points: 5, groups: 1, frames: 3, warmupFrames: 8,
                beforeTrace: async () => {
                    calls++;
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    ready = performance.now();
                },
            });
            return {
                calls, frames: cell.measuredFrames,
                setupBeforeMeasurement: ready <= performance.getEntriesByName("bench-measure-start")[0].startTime
            };
        });
        expect(result).toEqual({calls: 1, frames: 3, setupBeforeMeasurement: true});
    });

    // Baselines must answer the same query as TimeWidget, or a cheaper baseline
    // could just be one that selects less.
    test("naive baselines select exactly what TimeWidget selects", async ({page}) => {
        for (const groups of [1, 3]) {
            const r = await page.evaluate(
                (g) => window.benchPreflight({
                    adapters: ["timewidget", "canvas", "svg"],
                    lines: 1000,
                    points: 20,
                    groups: g
                }),
                groups
            );
            expect(r.canvas).toEqual(r.timewidget);
            expect(r.svg).toEqual(r.timewidget);
            expect(r.timewidget.flat().some((c) => c > 0)).toBe(true);
        }
    });

    // Vega-Lite tests points, not segments, so agreement is high but not exact.
    // A count of 0 everywhere would mean the brush never reached Vega.
    test("vegalite applies brushes programmatically and mostly agrees with TimeWidget", async ({page}) => {
        for (const groups of [1, 3]) {
            const r = await page.evaluate(
                (g) => window.benchPreflight({
                    adapters: ["timewidget", "vegalite"],
                    lines: 1000,
                    points: 20,
                    groups: g
                }),
                groups
            );
            const tw = r.timewidget.flat();
            const vl = r.vegalite.flat();
            expect(vl.some((c) => c > 0)).toBe(true);
            const diff = tw.reduce((s, c, i) => s + Math.abs(c - vl[i]), 0);
            const agreement = 1 - diff / Math.max(1, tw.reduce((a, b) => a + b, 0));
            expect(agreement).toBeGreaterThan(0.9);
        }
    });

    test("budget truncates a run", async ({page}) => {
        const r = await page.evaluate(() =>
            window.benchCell({
                adapter: "timewidget", lines: 300, points: 20, groups: 1, frames: 300, warmupFrames: 0, budgetMs: 1,
            })
        );
        expect(r.truncated).toBe(true);
        expect(r.measuredFrames).toBeLessThan(300);
    });

    // The trace buckets each stage's work by these marks, one per measured frame.
    test("each measured frame is marked, and the pacing gap is reported", async ({page}) => {
        const r = await page.evaluate(async () => {
            performance.clearMarks();
            const res = await window.benchCell({
                adapter: "timewidget",
                lines: 300,
                points: 20,
                groups: 1,
                frames: 12,
                warmupFrames: 3,
                paceMs: 2
            });
            return {res, marks: performance.getEntriesByName("bench-frame").length};
        });
        expect(r.marks).toBe(12);
        expect(r.res.measuredFrames).toBe(12);
        expect(r.res.paceMs).toBe(2);
    });

    // Review finding: focus checked only at start and end; a focus steal in the
    // middle of a run passed both checks.
    test("a blur during the run is recorded", async ({page}) => {
        const {result, blurFrameCount} = await page.evaluate(async () => {
            performance.clearMarks();
            let blurFrameCount = 0;
            const result = await window.benchCell({
                adapter: "timewidget", lines: 300, points: 20, groups: 1,
                frames: 12, warmupFrames: 0, paceMs: 0,
                beforeTrace: () => {
                    // Adapter loading and listener registration have finished. Dispatch
                    // on the next frame, after the driver starts measuring, not on a timer.
                    requestAnimationFrame(() => {
                        blurFrameCount = performance.getEntriesByName("bench-frame").length;
                        window.dispatchEvent(new Event("blur"));
                    });
                },
            });
            return {result, blurFrameCount};
        });
        expect(blurFrameCount).toBeGreaterThan(0);
        expect(blurFrameCount).toBeLessThan(12);
        expect(result.measuredFrames).toBe(12);
        expect(result.focusLost).toBe(true);
    });

    // Review finding: the budget started after load, so a huge load had no bound.
    test("the budget includes load time", async ({page}) => {
        const r = await page.evaluate(() =>
            window.benchCell({
                adapter: "timewidget",
                lines: 300,
                points: 20,
                groups: 1,
                frames: 300,
                warmupFrames: 0,
                budgetMs: 0
            })
        );
        expect(r.truncated).toBe(true);
        expect(r.measuredFrames).toBe(0);
    });
});
