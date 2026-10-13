import { jest } from "@jest/globals";
import {
  summarizePerformanceMetrics,
  configurePerformance,
  resetPerformanceMetrics,
  startPerformanceMeasurement,
  finishSelectionMeasurement,
  startRenderMeasurement,
  finishRenderMeasurement,
  finishPerformanceMeasurement,
  getPerformanceReport,
} from "../src/PerformanceMonitor.js";

test("reports only internal CPU metrics, without frame times or FPS", () => {
  const report = summarizePerformanceMetrics({
    frame: [100, 100, 200],
    collision: [1, 2, 3],
    render: [4, 5, 6],
    totalCpu: [5, 7, 9],
  });

  expect(Object.keys(report)).toEqual([
    "collisionMs",
    "renderMs",
    "totalCpuMs",
  ]);
  expect(report.collisionMs).toMatchObject({ samples: 3, mean: 2, p50: 2 });
  expect(report.renderMs.p95).toBeCloseTo(5.9);
  expect(report.totalCpuMs.p99).toBeCloseTo(8.96);
});

test("completes CPU measurements and reports synchronously without a presentation callback", () => {
  const onReport = jest.fn();
  configurePerformance({ log: false, reportEvery: 2, onReport });
  resetPerformanceMetrics();
  try {
    for (let i = 0; i < 2; i++) {
      const measurement = startPerformanceMeasurement();
      finishSelectionMeasurement(measurement);
      startRenderMeasurement(measurement);
      finishRenderMeasurement(measurement);
      // No window or requestAnimationFrame exists in this Node test.
      finishPerformanceMeasurement(measurement);
    }
    expect(onReport).toHaveBeenCalledTimes(1);
    const report = getPerformanceReport();
    for (const metric of Object.values(report)) {
      expect(metric.samples).toBe(2);
      expect(metric.mean).toBeGreaterThanOrEqual(0);
    }
    expect(onReport).toHaveBeenCalledWith(report);
    resetPerformanceMetrics();
    expect(getPerformanceReport().totalCpuMs.samples).toBe(0);
  } finally {
    configurePerformance({
      enabled: false,
      log: true,
      reportEvery: 60,
      onReport: null,
    });
    resetPerformanceMetrics();
  }
});
