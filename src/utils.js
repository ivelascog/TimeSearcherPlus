import * as d3 from "d3";

let DEBUG = true;
let before = 0;

export function log() {
  if (DEBUG) console.log(performance.now() - before, ...arguments);
  before = performance.now();
}

export function darken(color, k = 1) {
  const { l, c, h } = d3.lch(color);
  return d3.lch(l - 18 * k, c, h);
}

export function compareSets(set1, set2) {
  if (set1 === set2) return true;
  if (set1 === null) return false;
  if (set2 === null) return false;

  if (set1.size !== set2.size) return false;

  for (const val of set1) {
    if (!set2.has(val)) {
      return false;
    }
  }
  return true;
}

export function isInsideDomain(domain, scaleX, scaleY) {
  let scaleXDomain = scaleX.domain();
  let scaleYDomain = scaleY.domain();
  let domainX = [domain[0][0], domain[1][0]];
  let domainY = [domain[1][1], domain[0][1]];

  return (
    domainX[0] > scaleXDomain[0] &&
    domainX[1] < scaleXDomain[1] &&
    domainY[0] > scaleYDomain[0] &&
    domainY[1] < scaleYDomain[1]
  );
}

export const eventType = Object.freeze({
  changeSelection: "changeSelection",
  addBrushGroup: "newBrushGroup",
  removeBrushGroup: "deleteBrushGroup",
  selectBrushGroup: "selectBrushGroup",
  changeNonSelected: "changeNonSelected",
  changeBrushGroupState: "changeBrushGroupState",
  deselectAllBrushes: "deselectAllBrushes",
  highlightSelection: "highlightSelection",
  update: "update",
});

export const BrushModes = Object.freeze({
  Intersect: "intersect",
  Contains: "contains",
});

export const BrushAggregation = Object.freeze({
  And: "and",
  Or: "OR",
});
