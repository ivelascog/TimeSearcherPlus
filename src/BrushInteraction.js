import * as d3 from "d3";
import {throttle} from "throttle-debounce";
import BVH from "./BVH";
import brushTooltipEditable from "./BrushTooltipEditable.js";
import BrushContextMenu from "./BrushContextMenu.js";
import {compareSets, darken, isInsideDomain} from "./utils.js";

import {BrushAggregation, BrushModes, log} from "./utils";

function brushInteraction({
  ts,
  data,
  element,
  extent = undefined, //Defines the area in which the brush can move ([[[x0, y0], [x1, y1]])
  tooltipTarget,
  contextMenuTarget,
  xPartitions,
  yPartitions,
  x,
  y,
  scaleX,
  scaleY,
  fmtX,
  fmtY,
  updateTime,
  brushShadow,
  minBrushSize = 5, // Min size in pixels of brushes
  selectionCallback = () => {}, // (dataSelected, dataNotSelected, hasSelection) => {} Called when selected elements change
  groupsCallback = () => {}, // (groups) => {} Called when information of the groups changes (not the selection made by them)
  changeSelectedCoordinatesCallback = () => {}, // (selection) => {} Called when the coordinates of the selected brush change.
  selectedBrushCallback = () => {}, // (brush) => {} Called when the selected Brush changes.
  statusCallback = () => {}, // (status) => {}
  referenceCurves,
  getProbePairBoxes,
  getSliders,
  getYAtX,
  printSlidersCallback = () => {},
}) {
  let me = {},
    brushSize,
    brushesGroup,
    brushCount = 0,
    gBrushes,
    tBrushed,
    tUpdateSelection,
    tShowTooltip,
    tSelectionCall,
    brushGroupSelected,
    selectedBrush,
    dataSelected,
    dataNotSelected,
    BVH_,
    brushTooltip,
    brushContextMenu,
    suppress = false,
    brushWithTooltip;
    const dataMap = new Map(data.map(d => [d[0], d]));
    if (!data) return;
    me.getSliders = getSliders;
    gBrushes = d3.select(element);
    gBrushes.node().innerHTML = "";
    tBrushed = throttle(updateTime, brushed);
    tUpdateSelection = throttle(updateTime, updateSelection);
    tShowTooltip = throttle(50, showBrushTooltip);
    tSelectionCall = throttle(50, updateSelectedCoordinates);

  dataSelected = new Map();
  dataNotSelected = [];
  brushesGroup = new Map();
  brushCount = 0;
  brushSize = 0;
  const unclampedScaleY = scaleY.copy().clamp(false);

  let BVHData = data.map((d) => {
    let polyline = d[1].map((d) => [scaleX(x(d)), scaleY(y(d))]);
    return [d[0], polyline];
  });

   let curves = referenceCurves || [];
  let BVHReferenceLines = curves
    ? curves.map((ref) => {
        let scaledData = ref.data.map((pt) => {
          return [scaleX(pt[0]), scaleY(pt[1])];
        });

        return Object.assign({}, ref, { data: scaledData });
      })
    : null;

  BVH_ = BVH({
    data: BVHData,
    xPartitions,
    yPartitions,
    referenceLines: BVHReferenceLines,
    scaleY: unclampedScaleY, 
  });
  

  brushTooltip = brushTooltipEditable({
    fmtX,
    fmtY,
    target: tooltipTarget,
    margin: { top: ts.margin.top, left: ts.margin.left },
    callback: onTooltipChange,
  });

  brushContextMenu = BrushContextMenu({
    target: contextMenuTarget,
    callback: onContextMenuChange,
  });
  function onTooltipChange([[x0, y0], [x1, y1]]) {
    y0 = +y0;
    y1 = +y1;
    if (isNaN(+x0)) {
      let timeParse = d3.timeParse(fmtX);
      x0 = timeParse(x0);
      x1 = timeParse(x1);
    } else {
      x0 = +x0;
      x1 = +x1;
    }
    me.moveBrush(brushWithTooltip, [
      [x0, y0],
      [x1, y1],
    ]);
  }

  function onContextMenuChange(mode, aggregation, not, entity) {
    if (Array.isArray(entity) && entity.length === 2) {
      const brush = entity;
      brush[1].mode = mode;
      brush[1].aggregation = aggregation;
      brush[1].negate = not;
      updateBrush(brush);
      brushFilter();
      drawBrushes();
    } else if (entity && entity.rcId !== undefined) {
      const slider = entity;
      slider.mode = mode;
      slider.aggregation = aggregation;
      slider.negate = not;
      brushFilter();
      printSlidersCallback();
    }
  }

  const onBrushStart = (e, brushObject) => {
    log("💡  onBrushStart", brushObject, arguments.length);
    if (!brushObject || !brushObject.length) {
      // TODO
      log("🚫 ERRROR onBrushStart called with no or wrong brush", brushObject);
      return;
    }

    // if (!brushObject[1].selection) {
    //   log("👁️ brushStart, selection is null, not doing anything ");
    //   return;
    // }
    const [id, brush] = brushObject;

    // call when the user starts interacting with a timeBox
    // If the user is creating a new TimeBox, modify the group to which the timeBox belongs.
    if (id === brushCount - 1) {
      brushSize++;
      changeBrushOfGroup([id, brush], brushGroupSelected);
      brushesGroup.get(brushGroupSelected).isEnable = true;
      selectedBrush = [id, brush];
      selectedBrushCallback(selectedBrush);
      drawBrushes();
    }
    if (ts.autoUpdate) {
      tBrushed(e, [id, brush]);
    }
  };

  function onBrushEnd({ selection, sourceEvent }, brush) {
    if (sourceEvent === undefined) return;
    if (selection) {
      let [[x0, y0], [x1, y1]] = selection;
      if (
        Math.abs(x0 - x1) < minBrushSize &&
        Math.abs(y0 - y1) < minBrushSize
      ) {
        // Remove brush smaller than 5px
        removeBrush(brush);
      } else if (!ts.autoUpdate) {
        // update manually if not autoupdate with brushed event.
        if (brush[1].isSelected) {
          updateSelection();
        } else {
          brushed({ selection, sourceEvent }, brush);
        }
      }
    } else {
      removeBrush(brush);
    }
    if (brush[0] === brushCount - 1) newBrush(); // If the user has just created a new TimeBox, prepare the next one so that it can be created.

    drawBrushes();
  }

  // Call newBrush with an initial Selection to create the brush on initial selection
  function newBrush(
    mode = BrushModes.Intersect,
    aggregation = BrushAggregation.And,
    brushGroup = brushGroupSelected,
    brushinitialSelection = undefined,
    negate = false
  ) {
    // Create the brush
    let brush = d3.brush().on("start", onBrushStart);

    // Add the new brush to the group
    brushesGroup
      .get(brushGroup)
      .brushes.set(
        brushCount,
        generateBrush(
          brush,
          mode,
          aggregation,
          brushGroup,
          null,
          null,
          brushinitialSelection
        )
      );
    brushesGroup.get(brushGroup).brushes.get(brushCount).negate = negate;
    let brushObject = [
      brushCount,
      brushesGroup.get(brushGroup).brushes.get(brushCount),
    ];
    // Set events for Brush
    brush.on("brush.move", moveSelectedBrushes);
    brush.on("brush.Selected", tSelectionCall);
    if (ts.autoUpdate) {
      // Update brushSelection only if autoUpdate
      brush.on("brush.brushed", tBrushed);
    }
    if (ts.showBrushTooltip) {
      brush.on("brush.show", (event) => tShowTooltip(event, brushObject));
    }
    brush.on("end", onBrushEnd);
    if (extent) brush.extent(extent);

    brushCount++;
  }

  function getSelectionDomain(selection) {
    return selection.map(([x, y]) => [scaleX.invert(x), scaleY.invert(y)]);
  }

  function getSelectionPixels(selectionDomain) {
    return selectionDomain.map(([x, y]) => [scaleX(x), scaleY(y)]);
  }

  // Update brush intersections when moved
  function brushed({ selection, sourceEvent }, brush) {
    //log("brushed", brush, arguments);
    if (!brush[1]) {
      // TODO
      log("**🚫 ERROR brushed called without a brush[1]", brush);
      return;
    }

    // dont execute this method when move brushes programmatically (sourceEvent === null) or when there is no selection
    if (sourceEvent === undefined || !selection) return;
    //log("brushed", brush);
    brush[1].selection = selection;
    brush[1].selectionDomain = getSelectionDomain(selection); // Calculate the selection coordinates in data domain
    if (updateBrush(brush)) {
      //Update intersections with modified brush
      brushFilter();
    }
  }
  function isTimelineInSliderCurtain(timelinePolyline, slider, refCurve) {
    const sliderMinX = +slider.leftX;
    const sliderMaxX = +slider.rightX;

    const yDomain = scaleY.domain();
    const yBoundary = slider.side === "above" ? yDomain[1] : yDomain[0];

    const yRefLeft = getYAtX(refCurve, sliderMinX);
    const yRefRight = getYAtX(refCurve, sliderMaxX);

    if (yRefLeft === null || yRefRight === null) return false;

    const refSegment = refCurve.data.filter(
      (p) => +p[0] >= sliderMinX && +p[0] <= sliderMaxX
    );

    const curtainPolygon = [];
    curtainPolygon.push([sliderMinX, yRefLeft]);
    refSegment.forEach((p) => curtainPolygon.push([+p[0], p[1]]));
    curtainPolygon.push([sliderMaxX, yRefRight]);
    curtainPolygon.push([sliderMaxX, yBoundary]);
    curtainPolygon.push([sliderMinX, yBoundary]);

    for (let i = 0; i < timelinePolyline.length; i++) {
      const p = timelinePolyline[i];
      const pointCoords = [+x(p), y(p)];
      if (d3.polygonContains(curtainPolygon, pointCoords)) {
        return true;
      }
    }

    for (let i = 0; i < timelinePolyline.length - 1; i++) {
      const p1 = [+x(timelinePolyline[i]), y(timelinePolyline[i])];
      const p2 = [+x(timelinePolyline[i + 1]), y(timelinePolyline[i + 1])];

      for (let j = 0; j < curtainPolygon.length; j++) {
        const polyP1 = curtainPolygon[j];
        const polyP2 = curtainPolygon[(j + 1) % curtainPolygon.length];
        if (segmentIntersect(p1, p2, polyP1, polyP2).hit) {
          return true;
        }
      }
    }

    return false;
  }

  function isTimelineFullyInSliderCurtain(timelinePolyline, slider, refCurve) {
    const sliderMinX = +slider.leftX;
    const sliderMaxX = +slider.rightX;

    const yDomain = scaleY.domain();
    const yBoundary = slider.side === "above" ? yDomain[1] : yDomain[0];
    const yRefLeft = getYAtX(refCurve, sliderMinX);
    const yRefRight = getYAtX(refCurve, sliderMaxX);

    if (yRefLeft === null || yRefRight === null) return false;

    const refSegmentPoints = refCurve.data.filter(
      (p) => +p[0] >= sliderMinX && +p[0] <= sliderMaxX
    );

    const curtainPolygon = [];
    const refCurveBoundary = []; // Store just the ref-curve part

    const startPt = [sliderMinX, yRefLeft];
    curtainPolygon.push(startPt);
    refCurveBoundary.push(startPt);

    refSegmentPoints.forEach((p) => {
      const pt = [+p[0], p[1]];
      curtainPolygon.push(pt);
      refCurveBoundary.push(pt);
    });

    const endPt = [sliderMaxX, yRefRight];
    curtainPolygon.push(endPt);
    refCurveBoundary.push(endPt);

    // These are the top/bottom boundary points
    const boundaryPt1 = [sliderMaxX, yBoundary];
    const boundaryPt2 = [sliderMinX, yBoundary];
    curtainPolygon.push(boundaryPt1);
    curtainPolygon.push(boundaryPt2);

    // This is the top/bottom "horizontal" boundary segment
    const horizontalBoundary = [boundaryPt1, boundaryPt2];

    // --- Logic Check ---
    let hasLeftPoint = false;
    let hasRightPoint = false;

    for (const p of timelinePolyline) {
      const px = +x(p);
      const py = y(p);

      if (px <= sliderMinX) {
        hasLeftPoint = true;
      } else if (px >= sliderMaxX) {
        hasRightPoint = true;
      } else {
        // Point is within slider's X-range.
        // Check if it's outside the curtain (crosses horizontal boundary)
        if (!d3.polygonContains(curtainPolygon, [px, py])) {
          return false; // Fails Rule 2 (point check)
        }
      }
    }

    // If it doesn't even span across, it's not "contained"
    if (!hasLeftPoint || !hasRightPoint) {
      return false;
    }

    let yAtMinX = null;
    for (let i = 0; i < timelinePolyline.length - 1; i++) {
        const p1 = timelinePolyline[i];
        const p2 = timelinePolyline[i + 1];
        const x1 = +x(p1), x2 = +x(p2);
        if ((x1 <= sliderMinX && x2 >= sliderMinX) || (x2 <= sliderMinX && x1 >= sliderMinX)) {
            if (Math.abs(x1 - x2) < 1e-10) {
                yAtMinX = y(p1);
            } else {
                const t = (sliderMinX - x1) / (x2 - x1);
                yAtMinX = y(p1) * (1 - t) + y(p2) * t;
            }
            break;
        }
    }
    if (yAtMinX !== null && !d3.polygonContains(curtainPolygon, [sliderMinX, yAtMinX])) {
        return false;
    }

    // Check segments for horizontal crossings
    for (let i = 0; i < timelinePolyline.length - 1; i++) {
      const p1 = [+x(timelinePolyline[i]), y(timelinePolyline[i])];
      const p2 = [+x(timelinePolyline[i + 1]), y(timelinePolyline[i + 1])];

      // We only care about segments that are at least partially inside the slider's X-range
      const p1_x = p1[0];
      const p2_x = p2[0];

      // Check if segment is at least partially inside the X range
      const segmentInRange =
        (p1_x >= sliderMinX && p1_x <= sliderMaxX) || // p1 is inside
        (p2_x >= sliderMinX && p2_x <= sliderMaxX) || // p2 is inside
        (p1_x < sliderMinX && p2_x > sliderMinX) || // crosses left boundary
        (p1_x > sliderMaxX && p2_x < sliderMaxX) || // crosses right boundary
        (p1_x < sliderMaxX && p2_x > sliderMaxX) || // crosses right boundary
        (p1_x > sliderMinX && p2_x < sliderMinX); // crosses left boundary

      if (!segmentInRange) {
        continue; // This segment is entirely outside the X-range, skip it
      }

      // Check intersection with top/bottom boundary
      const topIntersectData = segmentIntersect(
        p1,
        p2,
        horizontalBoundary[0],
        horizontalBoundary[1]
      );
      if (topIntersectData.hit) {
        // Check if the intersection point is within the slider's X-range
        const intersectionPoint = topIntersectData.point;
        if (
          intersectionPoint[0] >= sliderMinX &&
          intersectionPoint[0] <= sliderMaxX
        ) {
          return false; // Fails Rule 2 (segment check on top/bottom)
        }
      }

      // Check intersection with ref-curve boundary
      for (let j = 0; j < refCurveBoundary.length - 1; j++) {
        const ref_p1 = refCurveBoundary[j];
        const ref_p2 = refCurveBoundary[j + 1];

        // We only check for intersection if the timeline segment is not identical
        // to the ref_curve segment (which would be a 'touch' not a 'cross')
        if (
          p1[0] === ref_p1[0] &&
          p1[1] === ref_p1[1] &&
          p2[0] === ref_p2[0] &&
          p2[1] === ref_p2[1]
        ) {
          continue;
        }

        if (segmentIntersect(p1, p2, ref_p1, ref_p2).hit) {
          return false; // Fails Rule 2 (segment check on ref curve)
        }
      }
    }

    // If all checks passed (spans across, no points or segments crossed horizontal boundaries)
    return true;
  }

  function segmentIntersect(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]];
    const s = [d[0] - c[0], d[1] - c[1]];
    const rxs = r[0] * s[1] - r[1] * s[0];
    const qpxr = (c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0];
    if (rxs === 0) return { hit: false };
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / rxs;
    const u = qpxr / rxs;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { hit: true, t, u, point: [a[0] + t * r[0], a[1] + t * r[1]] };
    }
    return { hit: false };
  }

  function getBrushResultWithNegation(resultSet, negate) {
    if (!negate) {
      return resultSet;
    }
    const allKeys = new Set(data.map((d) => d[0]));
    for (const key of resultSet) {
      allKeys.delete(key);
    }
    return allKeys;
  }
function brushFilter() {
    const newDataSelected = new Map();

    // Get all programmatic filter data once
    const sliderBoxes =
      (typeof getProbePairBoxes === "function" ? getProbePairBoxes() : []) || [];
    const getSlidersFunc = me.getSliders || (() => new Map());
    const sliders = getSlidersFunc();
    const dataDomainCurves = referenceCurves || [];
    const bvh =
      BVH_ && typeof BVH_.getBvh === "function" ? BVH_.getBvh() : BVH_;
    const curvesFromBvh =
      bvh && Array.isArray(bvh.referenceLines) ? bvh.referenceLines : [];

    for (const [groupId, group] of brushesGroup.entries()) {
      const andFilters = [];
      const orFilters = [];

      // --- 1. Collect ALL filters for this group ---

      // Collect Timeboxes
      if (group.isEnable) {
        group.brushes.forEach((brush) => {
          if (brush.selection) {
            const filter = {
              aggregation: brush.aggregation,
              getResults: () => {
                const [[x0, y0], [x1, y1]] = brush.selection;
                const results =
                  brush.mode === BrushModes.Contains
                    ? BVH_.contains(x0, y0, x1, y1)
                    : BVH_.intersect(x0, y0, x1, y1);
                // NOT se aplica aquí, al resultado individual
                return getBrushResultWithNegation(results, brush.negate);
              },
            };
            (brush.aggregation === BrushAggregation.And
              ? andFilters
              : orFilters
            ).push(filter);
          }
        });
      }

      // Collect Sliders
      const slidersForGroup = sliderBoxes.filter((s) => s.groupId === groupId);
      slidersForGroup.forEach((sliderInfo) => {
        const slider = sliders.get(sliderInfo.sliderId);
        if (slider) {
          const filter = {
            aggregation: slider.aggregation,
            getResults: () => {
              const refCurve = dataDomainCurves.find(
                (rc) => rc.id === slider.rcId
              );
              // Si la curva no existe o está oculta, no aplicamos filtro
              if (!refCurve || refCurve.isVisible === false) return new Set();
              
              let candidateIds;
              if (slider.mode === BrushModes.Contains) {
                candidateIds = new Set(data.map((d) => d[0]));
              } else {
                const [[x0, y0], [x1, y1]] = sliderInfo.box;
                candidateIds = BVH_.intersect(x0, y0, x1, y1);
              }

              const singleSliderResult = new Set();
              for (const id of candidateIds) {
                const timeline = dataMap.get(id);
                if (!timeline || !timeline[1]) continue;
                let inCurtain =
                  slider.mode === BrushModes.Contains
                    ? isTimelineFullyInSliderCurtain(
                        timeline[1],
                        slider,
                        refCurve
                      )
                    : isTimelineInSliderCurtain(timeline[1], slider, refCurve);
                if (inCurtain) singleSliderResult.add(id);
              }
              // NOT se aplica aquí, al resultado individual
              return getBrushResultWithNegation(
                singleSliderResult,
                slider.negate
              );
            },
          };
          (slider.aggregation === BrushAggregation.And
            ? andFilters
            : orFilters
          ).push(filter);
        }
      });

      // Collect Points
      curvesFromBvh.forEach((rcFromBvh) => {
        if (
          rcFromBvh.isSimplePoints &&
          Array.isArray(rcFromBvh.associations) &&
          Array.isArray(rcFromBvh.collisions)
        ) {
          rcFromBvh.associations.forEach((assoc) => {
            if (assoc.enabled && assoc.id === groupId && rcFromBvh.isVisible !== false) {
              const aggregation = assoc.aggregation || BrushAggregation.Or;
              const filterList =
                aggregation === BrushAggregation.And ? andFilters : orFilters;

              filterList.push({
                aggregation: aggregation,
                getResults: () => {
                  const pointResults = new Set();
                  const currentCollisions = Array.isArray(rcFromBvh.collisions) ? rcFromBvh.collisions : [];
                  currentCollisions.forEach((collision) => {
                    pointResults.add(collision.dataId);
                  });
                  return getBrushResultWithNegation(
                    pointResults,
                    assoc.negate || false
                  );
                },
              });
            }
          });
        }
      });

      // --- 2. Process the unified AND/OR filter lists ---

      const orResults = new Set();
      if (orFilters.length > 0) {
        // Unir todos los resultados OR
        orFilters.forEach((filter, idx) => {
          const filterResults = filter.getResults();
          filterResults.forEach((id) => orResults.add(id));
        });
      }

      let andResults = new Set();
      let hasAndFilters = andFilters.length > 0;

      if (hasAndFilters) {
        andResults = andFilters[0].getResults();
        
        for (let i = 1; i < andFilters.length; i++) {
          if (andResults.size === 0) {
            break; 
          }
          const currentResults = andFilters[i].getResults();
          andResults = new Set(
            [...andResults].filter((id) => currentResults.has(id))
          );
        }
      }

      const finalSelectedIds = new Set();
      
      const hasOrFilters = orFilters.length > 0;

      if (hasOrFilters) {
         orResults.forEach((id) => finalSelectedIds.add(id));
      }

      if (hasAndFilters) {
        andResults.forEach((id) => finalSelectedIds.add(id));
      }
      
      // --- 4. Populate newDataSelected ---
      const groupSelection = [];
      finalSelectedIds.forEach((id) => {
        if (dataMap.has(id)) {
          groupSelection.push(dataMap.get(id));
        }
      });
      newDataSelected.set(groupId, groupSelection);
    } // end for-loop over groups

    // --- 5. Update global state ---
    const allSelectedIds = new Set();
    newDataSelected.forEach((items) => {
      items.forEach((item) => allSelectedIds.add(item[0]));
    });
    dataSelected = newDataSelected;
    dataNotSelected = data.filter((d) => !allSelectedIds.has(d[0]));
    const hasAnySelection = allSelectedIds.size > 0;

    if (!suppress) {
      selectionCallback(dataSelected, dataNotSelected, hasAnySelection);
    }
  }

  function removeBrush([id, brush]) {
    brushSize--;
    brushesGroup.get(brush.group).brushes.delete(id);

    if (selectedBrush && selectedBrush[0] === id) {
      selectedBrush = null;
      selectedBrushCallback(null);
    }
    drawBrushes();
    brushFilter();
    updateStatus();
    brushTooltip.__hide();
  }

  function updateStatus() {
    // TODO
    statusCallback();
  }

  function updateGroups() {
    if (!suppress) groupsCallback(brushesGroup);
  }

  function updateSelectedCoordinates({ selection }) {
    let selectionDomain = getSelectionDomain(selection);
    changeSelectedCoordinatesCallback(selectionDomain);
  }

  // Calculates whether a line intersects a complete brushGroup.
  function intersectGroup(data, group) {
    if (group.size === 0) return false;

    // If the group only have a 1 uninitialized brush not have intersection
    if (group.size === 1 && !group.values().next().value.intersections)
      return false;

    let intersect = true;
    let anyAnd = false;
    for (const brush of group.values())
      if (brush.intersections) {
        //initialize brush only
        switch (brush.aggregation) {
          case BrushAggregation.And:
            intersect = intersect && brush.intersections.has(data[0]);
            anyAnd = true;
            break;
          case BrushAggregation.Or:
            if (brush.intersections.has(data[0])) return true;
        }
      }
    return intersect && anyAnd;
  }

  // Update the intersection of all selected brushes
  function updateSelection() {
    let someUpdate = false;
    for (const brushGroup of brushesGroup.values()) {
      for (const brush of brushGroup.brushes) {
        if (brush[1].isSelected) {
          let update = updateBrush(brush); //avoid lazy evaluation
          someUpdate = someUpdate || update;
        }
      }
    }
    if (someUpdate) {
      brushFilter();
    }
  }

  function moveBrush([brushId, brush], distX, distY) {
    let [[x0, y0], [x1, y1]] = brush.selection;
    x0 += distX;
    x1 += distX;
    y0 += distY;
    y1 += distY;
    let d3Brush = gBrushes.selectAll("#brush-" + brushId);
    d3Brush.call(brush.brush.move, [
      [x0, y0],
      [x1, y1],
    ]);
    brush.selection = [
      [x0, y0],
      [x1, y1],
    ];

    updateCirclesSelected(d3Brush, brush);
    brush.selectionDomain = getSelectionDomain(brush.selection);
  }

  // Move all selected brushes the same amount of the triggerBrush
  function moveSelectedBrushes({ selection, sourceEvent }, trigger) {
    // dont execute this method when move brushes programmatically
    if (sourceEvent === undefined) return;
    if (!Array.isArray(trigger) || trigger.length !== 2) {
      log(
        "👁️ moveSelectedBrushes called without array trigger returning",
        trigger
      );
      return;
    }
    const [triggerId, triggerBrush] = trigger;
    updateCirclesSelected(d3.select(this), triggerBrush);

    if (!selection || !triggerBrush.isSelected) return;

    let [[x0, y0]] = selection;
    let distX = x0 - triggerBrush.selection[0][0];
    let distY = y0 - triggerBrush.selection[0][1];
    triggerBrush.selection = selection;
    triggerBrush.selectionDomain = getSelectionDomain(selection);
    for (const brushGroup of brushesGroup.values()) {
      for (const [brushId, brush] of brushGroup.brushes) {
        if (brush.isSelected && !(triggerId === brushId)) {
          moveBrush([brushId, brush], distX, distY, brushId);
        }
      }
    }

    if (ts.autoUpdate) {
      tUpdateSelection();
    }
  }

  // Calculate the intersection of one brush with all the lines. Returns true if any changes have been made
  function updateBrush([brushId, brush]) {
    let [[x0, y0], [x1, y1]] = brush.selection;
    let newIntersections = null;
    // TODO Another form to do that is to asing the brush the function to calculate the intersection. It would make the code shorter, but I think less readable.
    switch (brush.mode) {
      case BrushModes.Intersect:
        newIntersections = BVH_.intersect(x0, y0, x1, y1);
        break;
      case BrushModes.Contains:
        newIntersections = BVH_.contains(x0, y0, x1, y1);
        break;
      default:
        newIntersections = BVH_.intersect(x0, y0, x1, y1);
        log(
          "🚫 ERROR The method elected to compute the selection are not support, using default intersection instead "
        );
    }

    if (brush.negate) {
      let allKeys = new Set(data.map((d) => d[0]));
      for (const key of newIntersections) {
        allKeys.delete(key);
      }
      newIntersections = allKeys;
    }

    let updated = !compareSets(newIntersections, brush.intersections);
    brush.intersections = newIntersections;

    return updated;
  }

  function selectBrush(brush) {
    brush[1].isSelected = !brush[1].isSelected;
    updateGroups();
    selectedBrushCallback(brush);
  }

  function deselectAllBrushes() {
    for (let brushGroup of brushesGroup.values()) {
      for (let brush of brushGroup.brushes) {
        brush[1].isSelected = false;
      }
    }
    selectedBrush = null;
    selectedBrushCallback(null);
  }

  function getUnusedIdBrushGroup() {
    let keys = Array.from(brushesGroup.keys()).sort();
    let lastKey = -1;

    for (let key of keys) {
      if (lastKey + 1 !== key) {
        break;
      }
      lastKey++;
    }

    lastKey++;
    return lastKey;
  }

  function brushShadowIfSelected(d) {
    return selectedBrush && d[0] === selectedBrush[0] ? brushShadow : "";
  }

  function showBrushTooltip({ selection, sourceEvent }, brush) {
    if (!selection || sourceEvent === undefined) return;

    let selectionInverted = selection.map(([x, y]) => [
      scaleX.invert(+x),
      scaleY.invert(+y),
    ]);

    brushWithTooltip = brush;
    brushTooltip.__update({
      selection: selectionInverted,
      selectionPixels: selection,
    });
  }

  function updateCirclesSelected(d3Brush, brushValue) {
    let selectedCircles = [];
    if (brushValue.isSelected) {
      let padding = 10;
      selectedCircles = [
        {
          x: brushValue.selection[0][0] + padding,
          y: brushValue.selection[0][1] + padding,
        },
        {
          x: brushValue.selection[1][0] - padding,
          y: brushValue.selection[1][1] - padding,
        },
        {
          x: brushValue.selection[0][0] + padding,
          y: brushValue.selection[1][1] - padding,
        },
        {
          x: brushValue.selection[1][0] - padding,
          y: brushValue.selection[0][1] + padding,
        },
      ];
    }

    d3Brush
      .selectAll(".circle")
      .data(selectedCircles)
      .join("circle")
      .attr("class", "circle")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", "4px")
      .attr("fill", darken(computeColor(brushValue.group)))
      .attr("fill-opacity", 0.5);
  }

  // Called by drawBrushes
  function drawOneBrush(d) {
    const brushValue = d[1];

    d3.select(this)
      .selectAll(".selection")
      .style("outline", "-webkit-focus-ring-color solid 0px")
      .style("fill", computeColor(brushValue.group))
      .style(
        "stroke-width",
        brushValue.group === brushGroupSelected ? "2px" : "0.5px"
      )
      .style(
        "stroke-dasharray",
        brushValue.mode === BrushModes.Intersect ? "4" : ""
      )
      .style("stroke", darken(computeColor(brushValue.group)))
      .style("outline-color", darken(computeColor(brushValue.group)))
      .style("fill", computeColor(brushValue.group))
      .attr("tabindex", 0)
      .on("mousedown", (sourceEvent) => {
        if (sourceEvent.button === 0) {
          //Do that in left click
          let selection = brushValue.selection;
          updateSelectedCoordinates({ selection });
          selectedBrush = d;
          selectedBrushCallback(selectedBrush);

          // Show shadow on current brush
          gBrushes
            .selectAll(".brush")
            .style("-webkit-filter", brushShadowIfSelected)
            .style("filter", brushShadowIfSelected);

          if (sourceEvent.shiftKey) {
            selectBrush(d);
          }
        }
      })
      .on("contextmenu", (sourceEvent) => {
        sourceEvent.preventDefault();
        let px = brushValue.selection[0][0];
        let py = brushValue.selection[0][1];
        brushContextMenu.__show(
          brushValue.mode,
          brushValue.aggregation,
          brushValue.negate,
          px,
          py,
          d
        );
      });

    updateCirclesSelected(d3.select(this), brushValue);

    d3.select(this)
      .selectAll(".handle--w, .handle--e")
      .style(
        "fill",
        brushValue.aggregation === BrushAggregation.Or
          ? darken(computeColor(brushValue.group))
          : "none"
      )
      .style("opacity", 0.4);

    d3.select(this)
      .selectAll(".handle--n, .handle--s")
      .style("fill", brushValue.negate ? "red" : "none")
      .style("opacity", 0.4);

    d3.select(this)
      .selectAll("title")
      .data([0]) // hack to create the title only once used instead of .append("title")
      .join("title")
      .text(
        `Mode: ${
          brushValue.mode === BrushModes.Contains ? "Contains" : "Intersect"
        }\nAggregation: ${
          brushValue.aggregation === BrushAggregation.And ? "And" : "Or"
        }\nRight click for options`
      );

    if (ts.showBrushTooltip) {
      d3.select(this)
        .selectAll(":not(.overlay)")
        .on("mousemove", (sourceEvent) => {
          let selection = brushValue.selection;
          showBrushTooltip({ selection, sourceEvent }, d);
        });
    }
  }

  function selectBrushGroup(id) {
    if (brushGroupSelected !== id && brushGroupSelected !== undefined) {
      const oldGroup = brushesGroup.get(brushGroupSelected);
      if (oldGroup) {
        oldGroup.isActive = false;

        const placeholderBrushId = brushCount - 1;
        if (oldGroup.brushes.has(placeholderBrushId)) {
          const placeholder = oldGroup.brushes.get(placeholderBrushId);
          oldGroup.brushes.delete(placeholderBrushId);
          const newGroup = brushesGroup.get(id);
          if (newGroup) {
            placeholder.group = id;
            newGroup.brushes.set(placeholderBrushId, placeholder);
          }
        }
      }
      deselectAllBrushes();
    }

    brushGroupSelected = id;
    const g = brushesGroup.get(id);
    if (g) {
      g.isActive = true;
      g.isEnable = true;
    }

    brushFilter();
    drawBrushes();
    updateGroups();
  }
  function computeColor(groupId) {
    return ts.brushesColorScale(groupId);
  }

  // Change one brush to a new BrushGroup
  function changeBrushOfGroup([brushId, brush], newBrushGroupId) {
    brushesGroup.get(brush.group).brushes.delete(brushId);
    brush.group = newBrushGroupId;
    brushesGroup.get(newBrushGroupId).brushes.set(brushId, brush);
  }

  function drawBrushes() {
    let brushes = [];
    brushesGroup.forEach(
      (d) => (brushes = brushes.concat(Array.from(d.brushes)))
    );
    brushes.sort((a, b) => d3.descending(a[0], b[0]));

    const brushesSelection = gBrushes
      .selectAll(".brush")
      .data(brushes, (d) => d[0])
      .join("g")
      .attr("class", "brush")
      .attr("id", ([id]) => "brush-" + id)
      .each(function ([, brush]) {
        // Actually create the d3 brush
        const sel = d3.select(this).call(brush.brush);

        return sel;
      })
      .style("-webkit-filter", brushShadowIfSelected)
      .style("filter", brushShadowIfSelected)
      .style("display", (d) => {
        const g = brushesGroup.get(d[1].group);
        const isPlaceholder = d[0] === brushCount - 1;
        return isPlaceholder || (g && g.isEnable) ? "" : "none";
      })
      // Permitir eventos si es el placeholder O si pertenece al grupo seleccionado
      .style("pointer-events", (d) => {
        const isPlaceholder = d[0] === brushCount - 1;
        return isPlaceholder || d[1].group === brushGroupSelected
          ? "all"
          : "none";
      })
      .each(drawOneBrush);

    brushesSelection.each(function (d) {
      d3.select(this)
        .selectAll(".overlay")
        .style("pointer-events", () => {
          return brushCount - 1 === d[0] ? "all" : "none";
        });
    });

    brushesSelection.each(function ([id, brush]) {
      // Are we creating a brush for a predefined filter?
      if (brush.initialSelection) {
        log("🎉 setting initial selection", brush.initialSelection);

        // Update brushColor
        d3.select(this)
          .selectAll(".selection")
          .style("stroke", darken(computeColor(brush.group)))
          .style("outline-color", darken(computeColor(brush.group)))
          .style("fill", computeColor(brush.group));

        // // if so set the new brush programmatically, and delete the initial selection
        me.moveBrush([id, brush], brush.initialSelection);
        // d3.select(this).call(
        //   brush.brush.move,
        //   // [[52, 254], [237, 320]]
        //   // convert to pixels
        //   brush.initialSelection.map(([px, py]) => [scaleX(px), scaleY(py)])
        // );
        brush.initialSelection = undefined;
      }
    });
  }

  me.updateBrushGroupName = function (id, name) {
    brushesGroup.get(id).name = name;
    updateGroups();
    updateStatus();
  };

  me.addBrushGroup = function () {
    let newId = getUnusedIdBrushGroup();
    let brushGroup = {
      isEnable: true,
      isActive: false,
      name: "Group " + (newId + 1),
      brushes: new Map(),
    };
    brushesGroup.set(newId, brushGroup);
    dataSelected.set(newId, []);
    selectBrushGroup(newId);

    if (!suppress) {
      brushFilter();
    }
    updateStatus();
    updateGroups();
  };

  function removeBrushGroup(id) {
    if (!brushesGroup.has(id) || brushesGroup.size <= 1) return;

    if (Array.isArray(referenceCurves)) {
      referenceCurves.forEach((curve) => {
        if (curve.isSimplePoints && Array.isArray(curve.associations)) {
          curve.associations = curve.associations.filter(
            (assoc) => assoc.id !== id
          );
        }
      });
      me.updateReferenceCurves(referenceCurves);
    }

    const groupToDelete = brushesGroup.get(id);

    const currentGroup = brushesGroup.get(brushGroupSelected);
    const currentPlaceholder = currentGroup
      ? currentGroup.brushes.get(brushCount - 1)
      : undefined;
    if (currentPlaceholder) {
      brushesGroup.get(brushGroupSelected).brushes.delete(brushCount - 1);
    }
    for (const [brushId, brush] of groupToDelete.brushes.entries()) {
      brushSize--;
    }
    if (selectedBrush && selectedBrush[1].group === id) {
      selectedBrush = null;
      selectedBrushCallback(null);
    }
    brushesGroup.delete(id);
    dataSelected.delete(id);

    if (brushGroupSelected === id) {
      const newActiveId = brushesGroup.keys().next().value;
      selectBrushGroup(newActiveId);
    }
    newBrush();
    brushFilter();
    drawBrushes();
    updateGroups();
  }

  me.changeBrushGroupState = function (id, newState) {
    const g = brushesGroup.get(id);
    if (!g || g.isEnable === newState) return;

    g.isEnable = newState;

    if (!newState && selectedBrush && selectedBrush[1].group === id) {
      brushTooltip.__hide();
    }

    if (typeof g.name === "string" && g.name.startsWith("RC ")) {
      const ref = Array.isArray(referenceCurves)
        ? referenceCurves.find((r) => r.id === id)
        : null;

      if (ref) {
        ref.isVisible = newState;
        if (ts && typeof ts.printReferenceCurves === "function") {
          ts.printReferenceCurves(referenceCurves);
        }
      }
    }

    drawBrushes();
    updateStatus();
    updateGroups();

    // Si acabo de ocultar el grupo seleccionado, cambia a otro habilitado
    if (newState === false && id === brushGroupSelected) {
      // busca algún grupo habilitado distinto
      let nextId = null;
      for (const [gid, g] of brushesGroup.entries()) {
        if (gid !== id && g.isEnable) {
          nextId = gid;
          break;
        }
      }
      if (nextId != null) {
        selectBrushGroup(nextId);
      } else {
        // si no queda ninguno habilitado, crea uno vacío y selecciónalo
        const nid = getUnusedIdBrushGroup();
        const bg = {
          isEnable: true,
          isActive: true,
          name: "Group " + (nid + 1),
          brushes: new Map(),
        };
        brushesGroup.set(nid, bg);
        dataSelected.set(nid, []);
        selectBrushGroup(nid);
        newBrush();
      }
      drawBrushes();
      updateStatus();
      updateGroups();
    }
  };

  me.selectBrushGroup = function (id) {
    selectBrushGroup(id);
    updateStatus();
    updateGroups();
  };

  me.selectBrush = function (groupId, brushId) {
    const group = brushesGroup.get(groupId);
    if (group && group.brushes.has(brushId)) {
      selectedBrush = [brushId, group.brushes.get(brushId)];
      brushGroupSelected = groupId;
      drawBrushes();
      selectedBrushCallback(selectedBrush);
    }
  };

  me.duplicateBrushGroup = function (sourceId = brushGroupSelected) {
    const source = brushesGroup.get(sourceId);
    if (!source) return;
    const payload = cloneBrushGroupPayload(source);
    if (payload.brushes.length === 0) {
      me.addBrushGroup(); // nothing committed → behave like Add Group
      return;
    }
    const before = new Set(brushesGroup.keys());
    me.addFilters([payload], false); // appends a new group, materializes copied brushes
    const newId = [...brushesGroup.keys()].find((k) => !before.has(k));
    if (newId !== undefined) selectBrushGroup(newId);
    updateStatus();
    updateGroups();
  };

  me.getBrushesGroupSize = function () {
    return brushesGroup.size;
  };

  me.removeBrushGroup = function (id) {
    removeBrushGroup(id);
  };

  me.getEnableGroups = function () {
    let enable = new Set();
    brushesGroup.forEach((d, id) => {
      if (d.isEnable) {
        enable.add(id);
      }
    });
    return enable;
  };

  me.getBrushesGroup = function () {
    //return brushesGroup;

    // Return a copy of brushesGroups without the uninitialized brushes
    let filterBrushesGroup = new Map();
    // Deep copy
    brushesGroup.forEach((g, gId) => {
      let o = Object.assign({}, g);
      o.brushes = new Map(g.brushes);
      filterBrushesGroup.set(gId, o);
    });

    filterBrushesGroup.forEach((group) => {
      group.brushes.forEach((brush, brushId) => {
        if (brush.selection === null) group.brushes.delete(brushId);
      });
    });
    return filterBrushesGroup;
  };

  me.getBrushGroupSelected = function () {
    return brushGroupSelected;
  };

  me.removeSelectedBrush = function () {
    if (selectedBrush) removeBrush(selectedBrush);
  };

  me.getSelectedBrush = function () {
    return selectedBrush;
  };

  me.hasSelection = function () {
    if (brushSize !== 0) return true;
    if (dataSelected) {
      for (const groupEntries of dataSelected.values()) {
        if (groupEntries && groupEntries.length > 0) return true;
      }
    }

    const bvh =
      BVH_ && typeof BVH_.getBvh === "function" ? BVH_.getBvh() : BVH_;
    const refs =
      bvh && Array.isArray(bvh.referenceLines) ? bvh.referenceLines : [];
    for (const [groupId, group] of brushesGroup.entries()) {
      if (group.name && group.name.startsWith("RC ")) {
        const ref = refs.find((r) => r.id === groupId);
        if (ref && Array.isArray(ref.collisions) && ref.collisions.length)
          return true;
      }
    }
    return false;
  };

  me.deselectBrush = function () {
    if (selectedBrush) {
      selectedBrush = null;
      drawBrushes();
      selectedBrushCallback(selectedBrush);
    }
  };

  me.changeSelectedBrushMode = function (brushMode) {
    selectedBrush.mode = brushMode;
    updateBrush(selectedBrush);
  };

  me.changeSelectedBrushAggregation = function (brushAggregation) {
    selectedBrush.aggregation = brushAggregation;
    brushFilter();
  };

  me.moveBrush = function (
    [brushID, brushValue],
    selection,
    moveSelection = false
  ) {
    let [[x0, y0], [x1, y1]] = selection;
    //Domain coordinates
    let minX = scaleX.domain()[0];
    let maxX = scaleX.domain()[1];
    let minY = scaleY.domain()[0];
    let maxY = scaleY.domain()[1];

    x0 = Math.max(x0, minX);
    x1 = Math.min(x1, maxX);
    y0 = Math.min(y0, maxY);
    y1 = Math.max(y1, minY);

    // if the X axis is a Date return to Date after clamping
    if (minX instanceof Date) {
      x0 = new Date(x0);
      x1 = new Date(x1);
    }

    if (x0 > x1) {
      [x0, x1] = [x1, x0];
    }

    if (y0 < y1) {
      [y0, y1] = [y1, y0];
    }

    let x0p = scaleX(x0);
    let x1p = scaleX(x1);
    let y0p = scaleY(y0);
    let y1p = scaleY(y1);

    //log("moveBrush", brushID, brushValue, arguments[1]);
    gBrushes.selectAll("#brush-" + brushID).call(brushValue.brush.move, [
      [x0p, y0p],
      [x1p, y1p],
    ]);

    selection = [
      [x0p, y0p],
      [x1p, y1p],
    ];
    let selectionDomain = [
      [x0, y0],
      [x1, y1],
    ];

    let sourceEvent = new Event("move"); // fake event to be able to call brushed programmatically
    if (moveSelection) {
      moveSelectedBrushes({ selection, sourceEvent }, [brushID, brushValue]);
    } else {
      brushed({ selection, sourceEvent }, [brushID, brushValue]);
      brushTooltip.__update({
        selection: selectionDomain,
        selectionPixels: selection,
      });
    }
  };

  me.moveSelectedBrush = function (
    [[x0, y0], [x1, y1]],
    moveSelection = false
  ) {
    //log("Move selected brush", selectedBrush);
    if (!selectedBrush) {
      log(
        "🚫 ERROR moveSelectedBrush called but selectedBrush is falsy ",
        selectedBrush
      );
      return;
    }

    me.moveBrush(
      selectedBrush,
      [
        [x0, y0],
        [x1, y1],
      ],
      moveSelection
    );
  };

  function processFilters(filters) {
    let processedFilters = [];
    for (let i = 0; i < filters.length; ++i) {
      let filter = filters[i];
      let processedFilter = generateFilter({
        mode: Object.prototype.hasOwnProperty.call(filter, "mode")
          ? filter.mode
          : null,
        aggregation: Object.prototype.hasOwnProperty.call(filter, "aggregation")
          ? filter.aggregation
          : null,
        selectionPixels: Object.prototype.hasOwnProperty.call(
          filter,
          "selectionPixels"
        )
          ? filter.selectionPixels
          : null,
        selectionDomain: Object.prototype.hasOwnProperty.call(
          filter,
          "selectionDomain"
        )
          ? filter.selectionDomain
          : null,
      });
      processedFilters.push(processedFilter);
    }
    return processedFilters;
  }

  function generateFilter({
    groupId,
    selectionDomain,
    selectionPixels,
    mode,
    aggregation,
  }) {
    return {
      groupId: groupId,
      selectionDomain: selectionDomain,
      selectionPixels: selectionPixels,
      mode: mode ? mode : BrushModes.Intersect,
      aggregation: aggregation ? aggregation : BrushAggregation.And,
    };
  }

  function generateBrush(
    brush,
    mode,
    aggregation,
    group,
    selection,
    selectionDomain,
    initialSelection
  ) {
    return {
      brush: brush,
      intersections: null,
      mode: mode,
      aggregation: aggregation,
      negate: false,
      isSelected: false,
      group: group,
      selection: selection,
      selectionDomain: selectionDomain,
      initialSelection: initialSelection,
    };
  }
  me.invertQuery = function (brushGroup) {
    let brushes = brushesGroup.get(brushGroup).brushes;
    let miny = Number.MAX_VALUE;
    let maxy = Number.MIN_VALUE;
    brushes.forEach((brush) => {
      if (!brush.selection) return;
      miny = Math.min(brush.selection[0][1], miny);
      maxy = Math.max(brush.selection[1][1], maxy);
    });
    let midPointQuery = (maxy - miny) / 2 + miny;
    brushes.forEach((brush, brushId) => {
      if (!brush.selection) return;
      let brushHeight = brush.selection[1][1] - brush.selection[0][1];
      let brushMidPoint = brushHeight / 2 + brush.selection[0][1];
      let distY = midPointQuery - brushMidPoint;
      moveBrush([brushId, brush], 0, distY * 2);
    });

    tUpdateSelection();
  };

  me.invertQuerySelectedGroup = function () {
    me.invertQuery(brushGroupSelected);
  };

  me.addFilters = function (filters, wipeAll = false) {
    if (filters instanceof Map) {
      filters = Array.from(filters.values());
      filters.forEach((f) => (f.brushes = Array.from(f.brushes.values())));
    }

    if (filters.length === 0) return;

    if (wipeAll) {
      brushesGroup.clear();
    } else {
      // Remove the brush prepared to generate new TimeBox. Will be added later.
      brushesGroup.forEach((group) => {
        group.brushes.forEach((brush, id) => {
          if (!brush.selection) group.brushes.delete(id);
        });
      });
    }

    for (let group of filters) {
      let groupId = getUnusedIdBrushGroup();
      let brushGroup = {
        isEnable: group.isEnable ? group.isEnable : true,
        isActive: group.isActive ? group.isActive : false,
        name: group.name,
        brushes: new Map(),
      };
      brushesGroup.set(groupId, brushGroup);
      dataSelected.set(groupId, []);

      for (const brush of group.brushes) {
        if (!isInsideDomain(brush.selectionDomain, scaleX, scaleY)) {
          // If the provided domain is out of bounds use the pixel selection. If not, set default value.
          if (brush.selection)
            brush.selectionDomain = getSelectionDomain(brush.selection);
          else
            brush.selectionDomain = getSelectionDomain([
              [0, 100],
              [0, 100],
            ]);
        }
        newBrush(brush.mode, brush.aggregation, groupId, brush.selectionDomain, Boolean(brush.negate));
        brushSize++; // The brushSize will not be increased in onStartBrush
        // because the last brush added will be the one set for a new Brush.
      }
    }

    newBrush(); // Add another brush that handle the possible new TimeBox

    brushFilter();
    drawBrushes();
  };

  //Fucntion to concat the actual referece curves with the news.
  function updateReferenceCurve(curve) {
    if (!curve) return;

    if (curve.isVisible === undefined) curve.isVisible = true;

    if (!referenceCurves.some((ref) => ref.id === curve.id)) {
      referenceCurves.push(curve);
      const BVHReferenceLines = [curve].map((ref) =>
        Object.assign({}, ref, {
          data: ref.data.map((pt) => [scaleX(pt[0]), scaleY(pt[1])]),
        })
      );
      BVH_.addReferenceCurves(BVHReferenceLines);
    }
  }

  me.suppressCallbacks = (on = true) => {
    suppress = !!on;
  };

  me.getBvh = function () {
    return BVH_;
  };

  me.drawBrushes = function () {
    drawBrushes();
  };

  // add brush group without func to avoid callback
  let newId = getUnusedIdBrushGroup();
  let brushGroup = {
    isEnable: true,
    isActive: true,
    name: "Group " + (newId + 1),
    brushes: new Map(),
  };

  brushesGroup.set(newId, brushGroup);
  dataSelected.set(newId, []);
  brushGroupSelected = newId;
  brushesGroup.get(newId).isEnable = true;

  newBrush();
  drawBrushes();

  me.updateReferenceCurves = function (newCurves) {
    referenceCurves = newCurves;
  };

  me.recomputeSelection = function () {
    brushFilter();
  };
  me.getBrushSize = function () {
      return brushSize;
    };
  me.contextMenu = brushContextMenu;
  return me;
}

export function cloneBrushGroupPayload(group, {suffix = " (copy)"} = {}) {
  const brushes = [];
  if (group && group.brushes) {
    for (const brush of group.brushes.values()) {
      if (brush.selection !== null && brush.selectionDomain) {
        brushes.push({
          mode: brush.mode,
          aggregation: brush.aggregation,
          selectionDomain: brush.selectionDomain.map(corner => corner.map(value => value instanceof Date ? new Date(+value) : value)),
        });
        if (Object.prototype.hasOwnProperty.call(brush, "negate")) brushes[brushes.length - 1].negate = brush.negate;
      }
    }
  }
  return {
    isEnable: true,
    isActive: false,
    name: ((group && group.name) || "Group") + suffix,
    brushes,
  };
}

export default brushInteraction;