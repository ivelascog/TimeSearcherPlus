import { expect, jest, test } from "@jest/globals";
import * as d3 from "d3";
import createReferenceControls from "../src/ReferenceControls.js";

function createControls(curves = []) {
  let scaleX = d3.scaleLinear().domain([0, 10]).range([0, 100]);
  let scaleY = d3.scaleLinear().domain([0, 10]).range([100, 0]);
  let groups = new Map([[0, { isEnable: true }]]);
  const updateReferenceCurves = jest.fn();
  const ts = { brushesColorScale: d3.scaleOrdinal(d3.schemeTableau10) };
  const controls = createReferenceControls(
    {
      ts,
      get overviewX() {
        return scaleX;
      },
      get overviewY() {
        return scaleY;
      },
      get brushes() {
        return { getBrushesGroup: () => groups, updateReferenceCurves };
      },
    },
    curves
  );
  return {
    controls,
    ts,
    updateReferenceCurves,
    setScales(x, y) {
      scaleX = x;
      scaleY = y;
    },
    setGroups(value) {
      groups = value;
    },
  };
}

test("slider boxes follow replacement scales after widget reinitialization", () => {
  const state = createControls([
    {
      id: "line",
      isSimplePoints: false,
      data: [
        [0, 2],
        [10, 8],
      ],
    },
  ]);
  state.controls.sliders.set(1, {
    id: 1,
    rcId: "line",
    groupId: 0,
    enabled: true,
    leftX: 2,
    rightX: 8,
  });
  expect(state.ts.getActiveSliderBoxes()).toEqual([
    {
      groupId: 0,
      sliderId: 1,
      box: [
        [20, 0],
        [80, 100],
      ],
    },
  ]);
  state.setScales(
    d3.scaleLinear().domain([0, 10]).range([0, 200]),
    d3.scaleLinear().domain([0, 10]).range([300, 0])
  );
  expect(state.ts.getActiveSliderBoxes()).toEqual([
    {
      groupId: 0,
      sliderId: 1,
      box: [
        [40, 0],
        [160, 300],
      ],
    },
  ]);
});

test("widget instances keep separate sliders and reference associations", () => {
  const first = createControls();
  const second = createControls();
  first.controls.sliders.set(1, { groupId: 0, enabled: true });
  expect(first.controls.hasEnabledFilters(0)).toBe(true);
  expect(second.controls.hasEnabledFilters(0)).toBe(false);
  expect(second.controls.sliders.size).toBe(0);
});

test("removed groups prune their sliders and point associations only", () => {
  const state = createControls([
    {
      id: "points",
      isSimplePoints: true,
      associations: [
        { id: 0, enabled: true },
        { id: 1, enabled: true },
      ],
    },
  ]);
  state.controls.sliders.set(1, { groupId: 0, enabled: true });
  state.controls.sliders.set(2, { groupId: 1, enabled: true });
  state.setGroups(new Map([[1, { isEnable: true }]]));
  expect(state.controls.removeMissingGroups()).toEqual({
    slidersWereRemoved: true,
    associationsWereRemoved: true,
  });
  expect([...state.controls.sliders.keys()]).toEqual([2]);
  expect(state.controls.referenceCurves[0].associations).toEqual([
    { id: 1, enabled: true },
  ]);
  expect(state.controls.hasEnabledFilters(0)).toBe(false);
  expect(state.controls.hasEnabledFilters(1)).toBe(true);
});

test("re-enabling a group preserves each dependant's disabled preference", () => {
  const curves = [
    {
      id: "points",
      isSimplePoints: true,
      associations: [{ id: 0, userEnabled: false, enabled: false }],
    },
  ];
  const state = createControls(curves);
  state.controls.sliders.set(1, {
    groupId: 0,
    userEnabled: true,
    enabled: true,
  });
  state.controls.sliders.set(2, {
    groupId: 0,
    userEnabled: false,
    enabled: false,
  });
  state.controls.updateDependentStates(0, false);
  expect(state.controls.hasEnabledFilters(0)).toBe(false);
  state.controls.updateDependentStates(0, true);
  expect(state.controls.sliders.get(1).enabled).toBe(true);
  expect(state.controls.sliders.get(2).enabled).toBe(false);
  expect(curves[0].associations[0].enabled).toBe(false);
  expect(state.updateReferenceCurves).toHaveBeenLastCalledWith(curves);
});
