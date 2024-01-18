import { log } from "./utils.js";

function BVH({
  data,
  x,
  y,
  width,
  height,
  scaleX,
  scaleY,
  xPartitions,
  yPartitions,
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
        let xCoor = scaleX(x(current));
        let yCoor = scaleY(y(current));
        if (xCoor != null && yCoor != null) {
          let xIndex = Math.floor(xCoor / xinc);
          let yIndex = Math.floor(yCoor / yinc);

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
        let [x,y] = [scaleX(x(point)), scaleY(y(point))];
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
    let xinc = width / xPartitions;
    let yinc = height / yPartitions;
    let BVH = {
      width: width,
      height: height,
      xinc: xinc,
      yinc: yinc,
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
    if (polylines)
      pupulateBVHPolylines(data, BVH);
    else
      populateBVHPoints(data, BVH);

    return BVH;
  }

  function pointIntersection(point, x0, y0, x1, y1) {
    let [px,py] = [scaleX(x(point)), scaleY(y(point))];
    return px > x0 && px < x1 && py > y0 && py < y1;
  }

  function lineIntersection(line, x0, y0, x1, y1) {
    line = line.map((d) => [scaleX(x(d)), scaleY(y(d))]);
    let initPoint = line[0];

    for (let index = 1; index < line.length; ++index) {
      let finalPoint = line[index];
      let intersectX0 =
        (initPoint[0] <= x0 && finalPoint[0] >= x0) ||
        (initPoint[0] >= x0 && finalPoint[0] <= x0);
      if (intersectX0) {
        let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
        let y = m * (x0 - initPoint[0]) + initPoint[1];
        let intersect = y >= y0 && y <= y1;
        if (intersect) return true;
      }

      let intersectX1 =
        (initPoint[0] <= x1 && finalPoint[0]) >= x1 ||
        (initPoint[0] >= x1 && finalPoint[0] <= x1);
      if (intersectX1) {
        let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
        let y = m * (x1 - initPoint[0]) + initPoint[1];
        let intersect = y >= y0 && y <= y1;
        if (intersect) return true;
      }

      let intersectY0 =
        (initPoint[1] <= y0 && finalPoint[1] >= y0) ||
        (initPoint[1] >= y0 && finalPoint[1] <= y0);
      if (intersectY0) {
        let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
        let x = (y0 - initPoint[1]) / m + initPoint[0];
        let intersect = x >= x0 && x <= x1;
        if (intersect) return true;
      }

      let intersectY1 =
        (initPoint[1] >= y1 && finalPoint[1] <= y1) ||
        (initPoint[1] <= y1 && finalPoint[1] >= y1);
      if (intersectY1) {
        let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
        let x = (y1 - initPoint[1]) / m + initPoint[0];
        let intersect = x >= x0 && x <= x1;
        if (intersect) return true;
      }

      initPoint = finalPoint;
    }
    return false;
  }

  me.intersect = function (x0, y0, x1, y1) {
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

    let intersections = new Set();

    for (let i = initI; i <= finI; ++i)
      for (let j = initJ; j <= finJ; ++j)
        for (const entities of BVH.BVH[i][j].data)
          if (!intersections.has(entities[0]))
            for (const entity of entities[1]) {
              let intersect = polylines ? lineIntersection(entity, x0, y0, x1, y1) : pointIntersection(entity, x0, y0, x1, y1);
              if (intersect) {
                intersections.add(entities[0]);
                break;
              }
            }

    return intersections;
  }


  return me;
}

export default BVH;
