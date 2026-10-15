import {log} from "./utils.js";
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
  referenceLines = null,
  scaleY = d3.scaleLinear()
}) {
  let me = {};
  const unclampedScaleY = scaleY.copy().clamp(false);
  let BVH = makeBVH();

  function pupulateBVHPolylines(data, BVH, Rcurve) {
    let xinc = BVH.xinc;
    let yinc = BVH.yinc;
    data.forEach((d) => {
      let key = d[0];
      let collisionActive = d[2];
      let isSimplePoints = d[3];

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
            log(
              "ERROR: xIndex or YIndex is NaN: XCoor: " +
                xCoor +
                "; yCoor: " +
                yCoor
            );
          }

          if (i === 0) {
            if (Rcurve) {
              // Almacenar como objeto con propiedades
              BVH.BVH[xIndex][yIndex].referenceLines.set(key, {
                data: [[current]],
                collisionActive: collisionActive,
                isSimplePoints: isSimplePoints,
              });
            } else {
              BVH.BVH[xIndex][yIndex].data.set(key, [[current]]);
            }
          } else {
            if (xIndex === lastXindex && yIndex === lastYindex) {
              if (Rcurve) {
                BVH.BVH[xIndex][yIndex].referenceLines
                  .get(key)
                  .data.push(current);
              } else {
                BVH.BVH[xIndex][yIndex].data.get(key).at(-1).push(current);
              }
            } else {
              let previousCell = BVH.BVH[lastXindex][lastYindex];
              if (Rcurve) {
                previousCell.referenceLines.get(key).data.push(current);
              } else {
                previousCell.data.get(key).at(-1).push(current);
              }
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
                      if (Rcurve) {
                        if (cell.referenceLines.has(key)) {
                          cell.referenceLines.get(key).data.push([previous]);
                          cell.referenceLines
                            .get(key)
                            .data.at(-1)
                            .push(current);
                        } else {
                          // Crear nuevo objeto con propiedades
                          cell.referenceLines.set(key, {
                            data: [[previous]],
                            collisionActive: collisionActive,
                            isSimplePoints: isSimplePoints,
                          });
                          cell.referenceLines
                            .get(key)
                            .data.at(-1)
                            .push(current);
                        }
                      } else {
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
          }

          lastXindex = xIndex;
          lastYindex = yIndex;
        }
      }
    });
  }
  // Devuelve {hit, t, u, point} donde t y u en [0,1] indican el punto de corte.
  // hit=false si no hay intersección (segmentos paralelos o fuera de rango)
  function segmentIntersect(a, b, c, d) {
    // r = vector AB (del primer segmento)
    const r = [b[0] - a[0], b[1] - a[1]];

    // s = vector CD (del segundo segmento)
    const s = [d[0] - c[0], d[1] - c[1]];

    // Producto cruzado r × s (determinante 2D). Si 0 → paralelos o colineales.
    const rxs = r[0] * s[1] - r[1] * s[0];

    // (QP × R) con Q = C, P = A (vector CA cruz R). Útil para parámetro u luego.
    const qpxr = (c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0];

    // Si rxs = 0, segmentos paralelos (o colineales). Aquí lo tratamos como "sin corte".
    if (rxs === 0) {
      return { hit: false };
    }

    // Parámetro t en AB donde caería la intersección con la recta CD.
    // Fórmula: t = ( (C-A) × s ) / (r × s )
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / rxs;

    // Parámetro u en CD donde caería la intersección con la recta AB.
    // Fórmula: u = ( (C-A) × r ) / (r × s )
    const u = qpxr / rxs;

    // Si t∈[0,1] y u∈[0,1], el punto de corte está dentro de ambos segmentos
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      // Punto de corte: A + t*R
      return { hit: true, t, u, point: [a[0] + t * r[0], a[1] + t * r[1]] };
    }

    // Si no, las rectas se cruzan fuera de los tramos de segmento
    return { hit: false };
  }
  // Distancia mínima entre punto p y el segmento ab
  function pointSegmentDistance(p, a, b) {
    // Vectores AP y AB
    const ap = [p[0] - a[0], p[1] - a[1]];
    const ab = [b[0] - a[0], b[1] - a[1]];

    // Longitud al cuadrado de AB (para evitar sqrt temprano)
    const ab2 = ab[0] * ab[0] + ab[1] * ab[1];

    // Si a==b (segmento degenerado), distancia euclídea de p a a
    if (ab2 === 0) return Math.hypot(ap[0], ap[1]);

    // Proyección escalar “t” de AP sobre AB normalizado, acotada a [0,1]
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / ab2));

    // Punto más cercano sobre el segmento: a + t*AB
    const closest = [a[0] + t * ab[0], a[1] + t * ab[1]];

    // Distancia euclídea de P a ese punto más cercano
    return Math.hypot(p[0] - closest[0], p[1] - closest[1]);
  }

 function RCIntersection(BVH) {
    const collisions = new Map();
    const refMeta = new Map();

    // 1. Aplanar todos los puntos de referencia simples en una sola lista para un acceso más fácil.
    const allRefPoints = [];
    if (BVH.referenceLines) {
        BVH.referenceLines.forEach(ref => {
            if (ref.isSimplePoints && ref.collisionActive) {
                refMeta.set(ref.id, { isSimplePoints: true });
                (ref.data || []).forEach(pointCoords => {
                    allRefPoints.push({
                        id: ref.id,
                        point: pointCoords,
                        epsilon: ref.epsilon !== undefined ? ref.epsilon : 0,
                    });
                });
            }
        });
    }

    // 2. Iterar sobre puntos 
    allRefPoints.forEach(refPoint => {
        if (refPoint.epsilon <= 0) return; 

        // 3. Calcular el área de búsqueda en píxeles.
        const epsilon_data = refPoint.epsilon;
        const epsilon_px = Math.abs(unclampedScaleY(0) - unclampedScaleY(epsilon_data));
        const [px, py] = refPoint.point;

        // Definimos una "caja de búsqueda" (bounding box) alrededor del círculo de tolerancia.
        const searchBox = {
            x0: px - epsilon_px,
            y0: py - epsilon_px,
            x1: px + epsilon_px,
            y1: py + epsilon_px,
        };

        // 4. Usar la caja de búsqueda para obtener todas las celdas del BVH relevantes.
        const [[initI, finI], [initJ, finJ]] = getCollidingCells(searchBox.x0, searchBox.y0, searchBox.x1, searchBox.y1, BVH);

        // 5. Recopilar todas las líneas de datos únicas de esas celdas para evitar comprobaciones repetidas.
        const candidatePolylines = new Map();
        for (let i = initI; i <= finI; i++) {
            for (let j = initJ; j <= finJ; j++) {
                if (BVH.BVH[i] && BVH.BVH[i][j]) {
                    for (const [dataKey, polylines] of BVH.BVH[i][j].data.entries()) {
                        if (!candidatePolylines.has(dataKey)) {
                            candidatePolylines.set(dataKey, polylines);
                        }
                    }
                }
            }
        }
        
        // 6. Realizar la comprobación de distancia precisa solo con las líneas candidatas.
        for (const [dataKey, dataPolylines] of candidatePolylines.entries()) {
            let collisionFound = false;
            for (const poly of dataPolylines) {
                for (let k = 1; k < poly.length; k++) {
                    const a = poly[k - 1];
                    const b = poly[k];
                    const distance = pointSegmentDistance(refPoint.point, a, b);

                    if (distance <= epsilon_px) {
                        if (!collisions.has(refPoint.id)) collisions.set(refPoint.id, new Map());
                        const byData = collisions.get(refPoint.id);
                        if (!byData.has(dataKey)) byData.set(dataKey, new Map());
                        const hits = byData.get(dataKey);

                        const hitKey = `p:${px},${py}`;
                        if (!hits.has(hitKey)) {
                            hits.set(hitKey, { type: "point", point: [px, py] });
                        }
                        
                        collisionFound = true;
                        break; // Salimos del bucle de segmentos
                    }
                }
                if (collisionFound) break; // Salimos del bucle de polilíneas
            }
        }
    });

    // 7. Formatear el resultado final (sin cambios en esta parte).
    const result = [];
    
    if (BVH.referenceLines) {
        BVH.referenceLines.forEach((ref) => {
            if (collisions.has(ref.id)) {
                const byData = collisions.get(ref.id);
                const formattedCollisions = [];
                for (const [dataId, hitsMap] of byData) {
                    formattedCollisions.push({
                        dataId,
                        count: hitsMap.size,
                        hits: Array.from(hitsMap.values()),
                    });
                }
                ref.collisions = formattedCollisions;
            } else {
                ref.collisions = [];
            }

            if (ref.collisions.length > 0) {
                 result.push({
                    refId: ref.id,
                    isSimplePoints: ref.isSimplePoints,
                    collisions: ref.collisions
                });
            }
        });
    }

    return result;
  }
  function populateBVHReferenceLines(newReferenceLines, BVH) {
    const inBounds = (x, y) => {
      const result = x >= 0 && x < BVH.width && y >= 0 && y < BVH.height;
      return result;
    };
    if (!BVH.referenceLines) {
      BVH.referenceLines = [];
    }
    BVH.referenceLines = BVH.referenceLines.concat(newReferenceLines);
    if (!BVH.referenceLines) BVH.referenceLines = [];
    const byId = new Map(BVH.referenceLines.map((r) => [r.id, r]));
    for (const ref of newReferenceLines) {
      if (!byId.has(ref.id)) {
        byId.set(ref.id, ref);
      } else {
        byId.set(ref.id, Object.assign({}, byId.get(ref.id), ref));
      }
    }
    BVH.referenceLines = Array.from(byId.values());
    newReferenceLines.forEach((ref) => {
      const id = ref.id;
      const collisionActive = ref.collisionActive;
      const isSimplePoints = ref.isSimplePoints;
      // 1) Aplica offset y filtra valores no finitos
      const adjustedPoints = (ref.data || [])
        .map(([x, y]) => {
          const adjusted = [x - BVH.offsetX, y - BVH.offsetY];
          return adjusted;
        })
        .filter(([x, y]) => {
          const isFinite = Number.isFinite(x) && Number.isFinite(y);
          return isFinite;
        })
        .filter(([x, y]) => {
          const bounds = inBounds(x, y);
          return bounds;
        });

      // 2) Si no queda nada, saltamos
      if (adjustedPoints.length === 0) {
        return;
      }
      // 3) Decide a qué función llamar
      if (ref.isSimplePoints || adjustedPoints.length === 1) {
        // puntos sueltos
        populateBVHPoints(
          [[id, adjustedPoints, collisionActive, isSimplePoints]],
          BVH,
          true
        );
      } else {
        // polilínea (mínimo 2 puntos)
        if (adjustedPoints.length >= 2) {
          pupulateBVHPolylines(
            [[id, adjustedPoints, collisionActive, isSimplePoints]],
            BVH,
            true
          );
        }
      }
    });
    return RCIntersection(BVH);
  }

  function populateBVHPoints(data, BVH, Rcurve) {
    let xinc = BVH.xinc;
    let yinc = BVH.yinc;
    data.forEach((d) => {
      let key = d[0];
      let collisionActive = d[2];
      let isSimplePoints = d[3];

      for (let point of d[1]) {
        let [x, y] = point;
        let Iindex = Math.floor(x / xinc);
        let Jindex = Math.floor(y / yinc);
        let cell = BVH.BVH[Iindex][Jindex];

        if (Rcurve) {
          if (!cell.referenceLines.has(key)) {
            cell.referenceLines.set(key, {
              data: [],
              collisionActive: collisionActive,
              isSimplePoints: isSimplePoints,
            });
          }
          cell.referenceLines.get(key).data.push([x, y]);
        } else {
          if (!cell.data.has(key)) {
            cell.data.set(key, []);
          }
          cell.data.get(key).push([x, y]);
        }
      }
    });
  }

  function makeBVH() {
    let keys = data.map((d) => d[0]);
    let allValues = data.map((d) => d[1]).flat();
    if (referenceLines && referenceLines.length > 0) {
      referenceLines.forEach((ref) => {
        if (ref.data && Array.isArray(ref.data)) {
          allValues = allValues.concat(ref.data);
        }
      });
    }

    let extentX = d3.extent(allValues, (d) => d[0]);
    let extentY = d3.extent(allValues, (d) => d[1]);
    let width = extentX[1] - extentX[0] + 1;
    let height = extentY[1] - extentY[0] + 1;
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
          referenceLines: new Map(), //Map to store reference lines
        };
      }
    }
    // Move the data to start at coordinates [0,0]
    data = data.map(([k, v]) => [
      k,
      v.map(([x, y]) => [x - BVH.offsetX, y - BVH.offsetY]),
    ]);

    if (polylines) pupulateBVHPolylines(data, BVH, false);
    else populateBVHPoints(data, BVH, false);

    if (referenceLines != null) {
      populateBVHReferenceLines(referenceLines, BVH);
    }
    return BVH;
  }

  function pointIntersection(point, x0, y0, x1, y1) {
    let [px, py] = point;
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  }

  //Calculate the intersection with the first vertical line of the box.
  function intersectX0(initPoint, finalPoint, x0, y0, x1, y1) {
    if (
      (initPoint[0] < x0 && finalPoint[0] < x0) ||
      (initPoint[0] > x0 && finalPoint[0] > x0)
    )
      return false;
    let dx = finalPoint[0] - initPoint[0];
    if (Math.abs(dx) < 1e-10) {
      return (
        initPoint[0] === x0 &&
        Math.max(initPoint[1], finalPoint[1]) >= y0 &&
        Math.min(initPoint[1], finalPoint[1]) <= y1
      );
    }
    let m = (finalPoint[1] - initPoint[1]) / dx;
    let y = m * (x0 - initPoint[0]) + initPoint[1];
    return y >= y0 && y <= y1;
  }

  function intersectX1(initPoint, finalPoint, x0, y0, x1, y1) {
    if (
      (initPoint[0] < x1 && finalPoint[0] < x1) ||
      (initPoint[0] > x1 && finalPoint[0] > x1)
    )
      return false;
    let dx = finalPoint[0] - initPoint[0];
    if (Math.abs(dx) < 1e-10) {
      return (
        initPoint[0] === x1 &&
        Math.max(initPoint[1], finalPoint[1]) >= y0 &&
        Math.min(initPoint[1], finalPoint[1]) <= y1
      );
    }
    let m = (finalPoint[1] - initPoint[1]) / dx;
    let y = m * (x1 - initPoint[0]) + initPoint[1];
    return y >= y0 && y <= y1;
  }

  function intersectY0(initPoint, finalPoint, x0, y0, x1, y1) {
    if (
      (initPoint[1] < y0 && finalPoint[1] < y0) ||
      (initPoint[1] > y0 && finalPoint[1] > y0)
    )
      return false;
    let dy = finalPoint[1] - initPoint[1];
    if (Math.abs(dy) < 1e-10) {
      return (
        initPoint[1] === y0 &&
        Math.max(initPoint[0], finalPoint[0]) > x0 &&
        Math.min(initPoint[0], finalPoint[0]) < x1
      );
    }
    let dx = finalPoint[0] - initPoint[0];
    if (Math.abs(dx) < 1e-10) {
      return initPoint[0] > x0 && initPoint[0] < x1;
    }
    let m = dy / dx;
    let x = (y0 - initPoint[1]) / m + initPoint[0];
    return x > x0 && x < x1;
  }

  function intersectY1(initPoint, finalPoint, x0, y0, x1, y1) {
    if (
      (initPoint[1] < y1 && finalPoint[1] < y1) ||
      (initPoint[1] > y1 && finalPoint[1] > y1)
    )
      return false;
    let dy = finalPoint[1] - initPoint[1];
    if (Math.abs(dy) < 1e-10) {
      return (
        initPoint[1] === y1 &&
        Math.max(initPoint[0], finalPoint[0]) > x0 &&
        Math.min(initPoint[0], finalPoint[0]) < x1
      );
    }
    let dx = finalPoint[0] - initPoint[0];
    if (Math.abs(dx) < 1e-10) {
      return initPoint[0] > x0 && initPoint[0] < x1;
    }
    let m = dy / dx;
    let x = (y1 - initPoint[1]) / m + initPoint[0];
    return x > x0 && x < x1;
  }

  function lineIntersection(line, x0, y0, x1, y1) {
    let initPoint = line[0];
    if (pointIntersection(initPoint, x0, y0, x1, y1)) return true;

    for (let index = 1; index < line.length; ++index) {
      let finalPoint = line[index];
      if (intersectX0(initPoint, finalPoint, x0, y0, x1, y1)) return true;
      if (intersectX1(initPoint, finalPoint, x0, y0, x1, y1)) return true;
      if (intersectY0(initPoint, finalPoint, x0, y0, x1, y1)) return true;
      if (intersectY1(initPoint, finalPoint, x0, y0, x1, y1)) return true;
      if (pointIntersection(finalPoint, x0, y0, x1, y1)) return true;
      initPoint = finalPoint;
    }
    return false;
  }

  function containIntersection(line, x0, y0, x1, y1) {
    let initPoint = line[0];
    let finalPoint = line[line.length - 1];

    if (initPoint[0] < x0 && finalPoint[0] < x0) return undefined;
    if (initPoint[0] > x1 && finalPoint[0] > x1) return undefined;

    for (let index = 1; index < line.length; ++index) {
      let finalPoint = line[index];
      if (intersectY0(initPoint, finalPoint, x0, y0, x1, y1)) return false;
      if (intersectY1(initPoint, finalPoint, x0, y0, x1, y1)) return false;
      initPoint = finalPoint;
    }

    return line[0][1] >= y0 && line[0][1] <= y1;
  }

  // Returns the range of cells that collide with the given box. The result is of the form [[InitI,EndI],[INiJ, EndJ]]]
  // bvhRef: optional explicit BVH object (used when called before the outer BVH variable is initialized)
  function getCollidingCells(x0, y0, x1, y1, bvhRef) {
    const b = bvhRef || BVH;
    if (x1 > b.width || y1 > b.height || x0 < 0 || y0 < 0)
      log("👁️ BVH is called off limits", [
        [x0, y0],
        [x1, y1],
      ]);

    // Ensure that the coordinates are in the limits of the BVH
    x1 = Math.min(x1, b.width - 1);
    y1 = Math.min(y1, b.height - 1);
    x0 = Math.max(x0, 0);
    y0 = Math.max(y0, 0);

    let initI = Math.floor(x0 / b.xinc);
    let finI = Math.floor(x1 / b.xinc);
    let initJ = Math.floor(y0 / b.yinc);
    let finJ = Math.floor(y1 / b.yinc);
    return [
      [initI, finI],
      [initJ, finJ],
    ];
  }

  //
  function applyOffsets(x0, y0, x1, y1) {
    return [
      x0 - BVH.offsetX,
      y0 - BVH.offsetY,
      x1 - BVH.offsetX,
      y1 - BVH.offsetY,
    ];
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
          if (!notContains.has(entities[0])) {
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

    notContains.forEach((d) => contains.delete(d));

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
  me.contains = function (x0, y0, x1, y1) {
    return testsEntitiesAll(x0, y0, x1, y1, containIntersection);
  };

  me.intersect = function (x0, y0, x1, y1) {
    return testsEntitiesAny(x0, y0, x1, y1, lineIntersection);
  };

  me.addReferenceCurves = function (curves) {
    populateBVHReferenceLines(curves, BVH);
  };

  me.getBvh = function () {
    return BVH;
  };

  me.removeReferenceCurves = function (ids) {
    if (!Array.isArray(ids)) ids = [ids];
    if (!BVH) return;

    if (Array.isArray(BVH.referenceLines)) {
      BVH.referenceLines = BVH.referenceLines.filter(
        (r) => !ids.includes(r.id)
      );
    }

    if (Array.isArray(BVH.BVH)) {
      for (const row of BVH.BVH) {
        for (const cell of row) {
          if (cell && cell.referenceLines) {
            for (const id of ids) cell.referenceLines.delete(id);
          }
        }
      }
    }

    RCIntersection(BVH);
  };

  return me;
}

export default BVH;
