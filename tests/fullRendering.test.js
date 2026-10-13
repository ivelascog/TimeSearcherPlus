import { afterAll, beforeEach, expect, jest, test } from "@jest/globals";
import * as d3 from "d3";

let canvas;
let context;
const uploadData = jest.fn();
const setAdaptiveSampleCount = jest.fn();
const selection = {};
for (const method of ["style", "selectAll", "data", "join", "attr"]) {
  selection[method] = () => selection;
}
selection.node = () => canvas;

jest.unstable_mockModule("d3", () => ({ ...d3, select: () => selection }));
jest.unstable_mockModule("../src/WebGPURenderer.js", () => ({
  default: class {
    init() {
      return Promise.resolve(true);
    }
    uploadData = uploadData;
    setAdaptiveSampleCount = setAdaptiveSampleCount;
  },
}));
const { default: TimeLineOverview } = await import(
  "../src/TimeLineOverview.js"
);
const previousWindow = globalThis.window;
const previousPath = globalThis.Path2D;
const log = jest.spyOn(console, "log").mockImplementation(() => {});
beforeEach(() => {
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.Path2D = class {
    constructor(path) {
      this.path = path;
    }
  };
  context = { scale: jest.fn(), clearRect: jest.fn(), stroke: jest.fn() };
  canvas = { width: 700, height: 520, getContext: () => context };
  uploadData.mockClear();
  setAdaptiveSampleCount.mockClear();
});
afterAll(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousPath === undefined) delete globalThis.Path2D;
  else globalThis.Path2D = previousPath;
  log.mockRestore();
});
function createOverview(renderer) {
  const overview = TimeLineOverview({
    ts: {
      margin: { left: 50, right: 50, top: 30, bottom: 50 },
      backgroundColor: "white",
      defaultAlpha: 1,
      defaultColor: "gray",
      alphaScale: () => 1,
    },
    element: {},
    x: (d) => d.x,
    y: (d) => d.y,
    renderer,
  });
  overview.setScales({ scaleX: d3.scaleLinear(), scaleY: d3.scaleLinear() });
  return overview;
}
function dataset(count, points) {
  return Array.from({ length: count }, (_, id) => [id, points]);
}
test("Canvas renders every series above the former line-reduction threshold", () => {
  const data = dataset(80001, [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]);
  const overview = createOverview("canvas");
  overview.data(data);
  overview.render(new Map(), 0, data, [], false);
  expect(context.stroke).toHaveBeenCalledTimes(data.length);
});
test.each([20001, 80001])(
  "WebGPU receives every valid point and series for %i series",
  async (count) => {
    const points = Array.from({ length: 20 }, (_, x) => ({
      x,
      y: x === 7 ? 1000 : x,
    }));
    const data = dataset(count, points);
    const overview = createOverview("webgpu");
    // Exercise the queued dataset as well as the ready renderer.
    overview.data(data);
    await Promise.resolve();
    expect(uploadData).toHaveBeenCalledTimes(1);
    const uploaded = uploadData.mock.calls[0][0];
    expect(uploaded).toHaveLength(count);
    expect(uploaded.map((d) => d.id)).toEqual(data.map((d) => d[0]));
    for (const line of uploaded)
      expect(line.points).toHaveLength(points.length);
    expect(uploaded[1].points).toEqual(points.map((p) => [p.x, p.y]));
  }
);
