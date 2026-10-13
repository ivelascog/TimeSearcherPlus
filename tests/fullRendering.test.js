import { afterAll, beforeEach, expect, jest, test } from "@jest/globals";
import * as d3 from "d3";

let canvas;
let context;
const uploadData = jest.fn();
const setAdaptiveSampleCount = jest.fn();
const updateStyles = jest.fn();
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
    updateStyles = updateStyles;
    updateUniforms() {}
    uploadMedians() {}
    draw() {}
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
  context = {
    scale: jest.fn(),
    clearRect: jest.fn(),
    stroke: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
  };
  canvas = { width: 700, height: 520, getContext: () => context };
  uploadData.mockClear();
  updateStyles.mockClear();
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
      selectedAlpha: 1,
      brushesColorScale: () => "#4682b4",
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

test.each(["canvas", "webgpu"])(
  "%s renders every selection group beyond 256 groups",
  async (renderer) => {
    const data = Array.from({ length: 300 }, (_, id) => [
      id,
      [
        { x: 0, y: id },
        { x: 1, y: id },
      ],
    ]);
    const selected = new Map(data.map((line) => [line[0], [line]]));
    const overview = createOverview(renderer);
    overview.data(data);
    await Promise.resolve();
    overview.render(selected, 299, [], [], true);
    if (renderer === "canvas") {
      expect(context.stroke).toHaveBeenCalledTimes(300);
      const rendered = context.stroke.mock.calls.map(([path]) => path.path);
      expect(new Set(rendered).size).toBe(300);
    } else {
      expect(updateStyles).toHaveBeenCalledTimes(1);
      const styles = updateStyles.mock.calls[0][0];
      expect([...styles.keys()]).toEqual(data.map((line) => line[0]));
      expect([...styles.values()].every((style) => style.color[3] === 1)).toBe(
        true
      );
    }
  }
);
