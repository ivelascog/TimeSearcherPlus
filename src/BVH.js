import { log } from "./utils.js";
import * as d3 from "d3";


/*Data is an array of the next form
[
  [id,[[x0,y0],[x1,y1]...]]
  .
  .
  .
]
 */
function BVH({
  data,
  xPartitions = 10,
  yPartitions = 10,
  polylines = true,
}) {
  let me = {};
  let BVH = makeBVH();

  function pupulateBVHPolylines(data, BVH) {
    let xinc = BVH.xinc;
    let yinc = BVH.yinc;
    data.forEach((d) => {
      let key = d[0];
      let lastXindex = -1;
      let lastYindex = -1;
      for (let i = 0; i < d[1].length; ++i) {
        let current = d[1][i];
        let xCoor = current[0];
        let yCoor = current[1];
        if (xCoor != null && yCoor != null) {
          let xIndex = Math.floor(xCoor / xinc);
          let yIndex = Math.floor(yCoor / yinc);
          if (isNaN(xIndex) || isNaN(yIndex)) {
            log("ERROR: xIndex or YIndex is NaN: XCoor: " + xCoor +"; yCoor: " + yCoor );
          }

          if (i === 0) {
            BVH.BVH[xIndex][yIndex].data.set(key, [[current]]);
          } else {
            if (xIndex === lastXindex && yIndex === lastYindex) {
              BVH.BVH[xIndex][yIndex].data.get(key).at(-1).push(current);
            } else {
              let previousCell = BVH.BVH[lastXindex][lastYindex];
              previousCell.data.get(key).at(-1).push(current);
              let previous = d[1][i - 1];
              for (let row of BVH.BVH) {
                for (let cell of row) {
                  if (cell !== previousCell) {
                    if (
                      lineIntersection(
                        [previous, current],
                        cell.x0,
                        cell.y0,
                        cell.x1,
                        cell.y1
                      )
                    ) {
                      if (cell.data.has(key)) {
                        cell.data.get(key).push([previous]);
                        cell.data.get(key).at(-1).push(current);
                      } else {
                        cell.data.set(key, [[previous]]);
                        cell.data.get(key).at(-1).push(current);
                      }
                    }
                  }
                }
              }
            }
          }
          lastXindex = xIndex;
          lastYindex = yIndex;
        }
      }
    });
  }

  function populateBVHPoints(data, BVH) {
    let xinc = BVH.xinc;
    let yinc = BVH.yinc;
    data.forEach(d => {
      let key = d[0];
      for (let point of d[1]) {
        let [x, y] = point;
        let Iindex = Math.floor(x / xinc);
        let Jindex = Math.floor(y / yinc);
        let cell = BVH.BVH[Iindex][Jindex];

        if (cell.data.has(key)) {
          cell.data.get(key).push([x,y]);
        } else {
          cell.data.set(key,[x,y]);
        }
      }
    });
  }

  function makeBVH() {
    let keys = data.map((d) => d[0]);
    let allValues = data.map(d => d[1]).flat();
    let extentX = d3.extent(allValues, d => d[0]);
    let extentY = d3.extent(allValues, d => d[1]);
    let width = (extentX[1] - extentX[0]) + 1;
    let height = (extentY[1] - extentY[0]) + 1;
    let xinc = width / xPartitions;
    let yinc = height / yPartitions;
    let BVH = {
      width: width,
      height: height,
      xinc: xinc,
      yinc: yinc,
      offsetX: extentX[0],
      offsetY: extentY[0],
      keys: keys,
      BVH: [],
    };

    for (let i = 0; i < xPartitions; ++i) {
      BVH.BVH[i] = [];
      let currentX = i * xinc;
      for (let j = 0; j < yPartitions; ++j) {
        let currentY = yinc * j;
        BVH.BVH[i][j] = {
          x0: currentX,
          x1: currentX + xinc,
          y0: currentY,
          y1: currentY + yinc,
          data: new Map(),
        };
      }
    }

    // Move the data to start at coordinates [0,0]
    data = data.map(([k, v]) => [k, v.map(([x, y]) => [x - BVH.offsetX, y - BVH.offsetY])]);


    if (polylines)
      pupulateBVHPolylines(data, BVH);
    else
      populateBVHPoints(data, BVH);

    return BVH;
  }

  function pointIntersection(point, x0, y0, x1, y1) {
    let [px,py] = point;
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  }

  //Calculate the intersection with the first vertical line of the box.
  function intersectX0(initPoint, finalPoint, x0, y0, x1, y1) {
    let intersectX0 =
      (initPoint[0] <= x0 && finalPoint[0] >= x0) ||
      (initPoint[0] >= x0 && finalPoint[0] <= x0);
    if (intersectX0) {
      let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
      let y = m * (x0 - initPoint[0]) + initPoint[1];
      return y >= y0 && y <= y1;
    }
    return false;
  }

  function intersectX1(initPoint, finalPoint, x0, y0, x1, y1) {
    let intersectX1 =
      (initPoint[0] <= x1 && finalPoint[0]) >= x1 ||
      (initPoint[0] >= x1 && finalPoint[0] <= x1);
    if (intersectX1) {
      let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
      let y = m * (x1 - initPoint[0]) + initPoint[1];
      return y >= y0 && y <= y1;
    }
    return false;
  }

  function intersectY0(initPoint, finalPoint, x0, y0, x1, y1) {
    let intersectY0 =
      (initPoint[1] <= y0 && finalPoint[1] >= y0) ||
      (initPoint[1] >= y0 && finalPoint[1] <= y0);
    if (intersectY0) {
      let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
      let x = (y0 - initPoint[1]) / m + initPoint[0];
      return x >= x0 && x <= x1;
    }
    return false;
  }

  function intersectY1(initPoint, finalPoint, x0, y0, x1, y1) {
    let intersectY1 =
      (initPoint[1] >= y1 && finalPoint[1] <= y1) ||
      (initPoint[1] <= y1 && finalPoint[1] >= y1);
    if (intersectY1) {
      let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
      let x = (y1 - initPoint[1]) / m + initPoint[0];
      return x >= x0 && x <= x1;
    }
    return false;
  }

  function lineIntersection(line, x0, y0, x1, y1) {
    let initPoint = line[0];

    for (let index = 1; index < line.length; ++index) {
      let finalPoint = line[index];
      if (intersectX0(initPoint, finalPoint, x0, y0, x1, y1)) return true;
      if (intersectX1(initPoint, finalPoint, x0, y0, x1, y1)) return true;
      if (intersectY0(initPoint, finalPoint, x0, y0, x1, y1)) return true;
      if (intersectY1(initPoint, finalPoint, x0, y0, x1, y1)) return true;
      initPoint = finalPoint;
    }
    return pointIntersection(initPoint, x0, y0, x1, y1);
  }

  function containIntersection(line, x0, y0, x1, y1) {
    let initPoint = line[0];
    let finalPoint = line[line.length - 1];
    let isIntersectX0 = false;
    let isIntersectX1 = false;

    if (initPoint[0] < x0 && finalPoint[0] < x0) return undefined;
    if (initPoint[0] > x1 && finalPoint[0] > x1) return undefined;

    for (let index = 1; index < line.length; ++index) {
      let finalPoint = line[index];
      if (isIntersectX0 || intersectX0(initPoint, finalPoint, x0, y0, x1, y1)) isIntersectX0 = true;
      if (isIntersectX1 || intersectX1(initPoint, finalPoint, x0, y0, x1, y1)) isIntersectX1 = true;
      if (intersectY0(initPoint, finalPoint, x0, y0, x1, y1)) return false;
      if (intersectY1(initPoint, finalPoint, x0, y0, x1, y1)) return false;
      initPoint = finalPoint;
    }

    let isAllLineInside = !isIntersectX0 && !isIntersectX1;
    if (isAllLineInside) {
      return pointIntersection(line[0], x0, y0, x1, y1);
    }

    return true;
  }

  // Returns the range of cells that collide with the given box. The result is of the form [[InitI,EndI],[INiJ, EndJ]]]
  function getCollidingCells(x0, y0, x1, y1) {
    if (x1 > BVH.width || y1 > BVH.height || x0 < 0 || y0 < 0)
      log("👁️ BVH is called off limits", [
        [x0, y0],
        [x1, y1],
      ]);

    // Esure that the coordinates are in the limits oh the BVH
    x1 = Math.min(x1, BVH.width - 1);
    y1 = Math.min(y1, BVH.height - 1);
    x0 = Math.max(x0, 0);
    y0 = Math.max(y0, 0);

    let initI = Math.floor(x0 / BVH.xinc);
    let finI = Math.floor(x1 / BVH.xinc);
    let initJ = Math.floor(y0 / BVH.yinc);
    let finJ = Math.floor(y1 / BVH.yinc);
    return [[initI, finI], [initJ, finJ]];
  }

  //
  function applyOffsets(x0, y0, x1, y1) {
    return [x0 - BVH.offsetX, y0 - BVH.offsetY, x1 - BVH.offsetX, y1 - BVH.offsetY];
  }

  // Returns all the polylines that satisfy the function "testFunc" for a complete polyline. The function testFunct must be as follows
  // TestFunc( Entity, x0, x1,y0,y1). Where entity is a polyline and return true, false or undefined if the result of the cuerrent entity dosent matter
  function testsEntitiesAll(x0, y0, x1, y1, testFunc) {
    [x0, y0, x1, y1] = applyOffsets(x0, y0, x1, y1);
    let [[initI, finI], [initJ, finJ]] = getCollidingCells(x0, y0, x1, y1);

    let contains = new Set();
    let notContains = new Set();


    for (let i = initI; i <= finI; ++i)
      for (let j = initJ; j <= finJ; ++j)
        for (const entities of BVH.BVH[i][j].data)
          if (!notContains.has(entities[0])){
            for (const entity of entities[1]) {
              let intersect = testFunc(entity, x0, y0, x1, y1);
              if (intersect !== undefined) {
                if (intersect) {
                  contains.add(entities[0]);
                } else {
                  notContains.add(entities[0]);
                }
              }
            }
          }

    notContains.forEach(d => contains.delete(d));

    return contains;

  }

  // Returns all the polylines that satisfy the function "testFunc" for any piece of polyline. The function testFunct must be as follows
  // TestFunc( Entity, x0, x1,y0,y1). Where entity is a polyline.
  function testsEntitiesAny(x0, y0, x1, y1, testFunc) {
    [x0, y0, x1, y1] = applyOffsets(x0, y0, x1, y1);
    let [[initI, finI], [initJ, finJ]] = getCollidingCells(x0, y0, x1, y1);

    let intersections = new Set();

    for (let i = initI; i <= finI; ++i)
      for (let j = initJ; j <= finJ; ++j)
        for (const entities of BVH.BVH[i][j].data)
          if (!intersections.has(entities[0]))
            for (const entity of entities[1]) {
              let intersect = testFunc(entity, x0, y0, x1, y1);
              if (intersect) {
                intersections.add(entities[0]);
                break;
              }
            }

    return intersections;
  }

  me.contains = function(x0, y0, x1, y1) {
    return testsEntitiesAll(x0, y0, x1, y1, containIntersection);
  };


  me.intersect = function(x0, y0, x1, y1) {
    return testsEntitiesAny(x0, y0, x1, y1, lineIntersection);

  };

  return me;
}

export default BVH;
