import BVH from "../src/BVH.js";

// To force the BVH to have a size of 0-20 in both y and x independently of the line to be treated
var baselineBottom = ["BaseLineBottom", [[0, 0], [20, 0]]];
var baseLineTop = ["BaseLineTop", [[0, 20], [20, 20]]];

/** *************IMPORTANT**************
 * Note that the coordinates of the BVH system is similar to that of SVG, i.e., the start of coordinates is the upper left corner.
 */

test("Normal Intersection", () => {
  let data = [
    ["line1", [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [5, 4],
      [3, 1]]]
  ];

  let _BVH = BVH({ data });
  let inters = _BVH.intersect(2, 2, 4, 4);
  expect(inters).toEqual(new Set(["line1"]));
});

test("Only Left Intersection", () => {
  let data = [["line1", [[1, 3], [2, 4], [3, 5]]], baselineBottom, baseLineTop];
  let _BVH = BVH({ data });
  let inters = _BVH.intersect(2, 3, 4, 8);
  expect(inters).toEqual(new Set(["line1"]));
});

test("Only Right Intersection", () => {
  let data = [["line1", [[3, 4], [4, 5], [5, 6]]], baselineBottom, baseLineTop];
  let _BVH = BVH({ data });
  let inters = _BVH.intersect(2, 2, 4, 8);
  expect(inters).toEqual(new Set(["line1"]));
});

test("Only Top Intersection", () => {
  let data = [["line1", [[1, 8], [2, 6], [3, 4]]], baselineBottom, baseLineTop];
  let _BVH = BVH({ data });
  let inters = _BVH.intersect(0, 3, 2, 10);
  expect(inters).toEqual(new Set(["line1"]));
});

test("Only Bottom Intersection", () => {
  let data = [["line1", [[1, 4], [2, 6], [3, 8]]], baselineBottom, baseLineTop];
  let _BVH = BVH({ data });
  let inters = _BVH.intersect(0, 3, 2, 10);
  expect(inters).toEqual(new Set(["line1"]));
});
