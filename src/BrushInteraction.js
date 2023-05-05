import * as d3 from "d3";
import {throttle} from "throttle-debounce";
import {compareMaps} from "./utils";
import BVH from "./BVH";
import brushTooltipEditable from "./BrushTooltipEditable.js";

function brushInteraction({
  ts,
  data,
  element,
  tooltipTarget,
  width,
  height,
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
  selectionCallback = (dataSelected, dataNotSelected, hasSelection) => {},
  groupsCallback = (groups) => {},
  changeSelectedCoordinatesCallback = (selection) => {},
  statusCallback = (status) => {}
}) {
  let me = {},
    brushSize,
    brushesGroup,
    brushCount,
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
    brushTooltip

  gBrushes = d3.select(element);

  tBrushed = throttle(updateTime, brushed);
  tUpdateSelection = throttle(updateTime, updateSelection);
  tShowTooltip = throttle(50, showBrushTooltip);
  tSelectionCall = throttle(50, updateSelectedCoordinates);


  dataSelected = new Map();
  dataNotSelected = [];
  brushesGroup = new Map();
  brushCount = 0;
  brushSize = 0;
  BVH_ = BVH({data, x, y, width, height, scaleX, scaleY, xPartitions, yPartitions})

  brushTooltip = brushTooltipEditable({
    fmtX,
    fmtY,
    target: tooltipTarget,
    margin: { top: ts.margin.top, left: ts.margin.left }})


  function newBrush() {
    let brush = d3.brush().on("start", (e, brush) => {
      if (brush[0] === brushCount - 1) {
        brushSize++;
        brushesGroup.get(brush[1].group).brushes.delete(brush[0]);
        brush[1].group = brushGroupSelected;
        brushesGroup.get(brushGroupSelected).brushes.set(brush[0], brush[1]);
        selectedBrush = brush;
        drawBrushes();
      }
      if (ts.autoUpdate) {
        tBrushed(e, brush);
      }
    });
    brush.on("brush.move", moveSelectedBrushes);
    brush.on("brush.Selected", tSelectionCall);

    if (ts.autoUpdate) {
      brush.on("brush.brushed", tBrushed);
    }
    if (ts.showBrushTooltip) {
      brush.on("brush.show", tShowTooltip);
    }
    brush.on("end", endBrush);
    brushesGroup.get(brushGroupSelected).brushes.set(brushCount, {
      brush: brush,
      intersections: new Map(),
      isSelected: false,
      group: brushGroupSelected,
      selection: null,
      selectionDomain: null
    });
    brushCount++;
  }

  function endBrush({selection, sourceEvent}, brush) {
    if (sourceEvent === undefined) return;
    if (selection) {
      let [[x0, y0], [x1, y1]] = selection;
      if (Math.abs(x0 - x1) < 5 && Math.abs(y0 - y1) < 5) {
        removeBrush(brush);
      } else if (!ts.autoUpdate) {
        if (brush[1].isSelected) {
          updateSelection();
        } else {
          brushed({selection, sourceEvent}, brush);
        }
      }
    } else {
      removeBrush(brush);
    }
    if (brush[0] === brushCount - 1) newBrush();

    drawBrushes();
  }

  function getSelectionDomain(selection) {
    return selection.map(([x, y]) => [
      scaleX.invert(x),
      scaleY.invert(y),
    ]);
  }

  function brushed({selection, sourceEvent}, brush) {
    if (sourceEvent === undefined) return; // dont execute this method when move brushes programatically

    brush[1].selection = selection;
    brush[1].selectionDomain = getSelectionDomain(selection);
    if (updateBrush(brush)) {
      //Update intersections with modified brush
      brushFilter();
    }
  }

  function brushFilter() {
    dataNotSelected = [];
    dataSelected = new Map();
    brushesGroup.forEach((d, key) => dataSelected.set(key, []));

    if (brushSize > 0) {
      for (let d of data) {
        let isSelected = false;
        for (let brushGroup of brushesGroup.entries()) {
          if (intersectGroup(d, brushGroup[1].brushes)) {
            dataSelected.get(brushGroup[0]).push(d);
            isSelected = true;
          }
        }
        if (!isSelected) {
          dataNotSelected.push(d);
        }
      }
    } else {
      dataSelected.set(0, data);
    }

    selectionCallback(dataSelected, dataNotSelected, brushSize !== 0)
  }


  function removeBrush(brush) {
    brushSize--;
    brushesGroup.get(brush[1].group).brushes.delete(brush[0]);

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
    let groups = new Map()

    brushesGroup.forEach((d,id) => {
      let o = {
        isEnable: d.isEnable,
        isActive: id === brushGroupSelected,
        name: d.name
      }
      groups.set(id,o)
    })

    groupsCallback(groups);
  }

  function updateSelectedCoordinates ({selection}) {
    let selectionDomain = getSelectionDomain(selection);
    changeSelectedCoordinatesCallback(selectionDomain);
  }

  function intersectGroup(data, group) {
    if (
      group.size === 0 ||
      (group.size === 1 && group.values().next().value.intersections.size === 0)
    )
      return false;
    let intersect = true;
    for (const brush of group) {
      intersect =
        intersect &&
        (brush[1].intersections.get(data[0]) ||
          brush[1].intersections.size === 0);
    }
    return intersect;
  }

  function updateSelection() {
    let someUpdate = false;
    for (const brushGroup of brushesGroup.values()) {
      for (const brush of brushGroup) {
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

  function moveSelectedBrushes({ selection, sourceEvent }, triggerBrush) {
    if (sourceEvent === undefined) return; // dont execute this method when move brushes programatically
    if (!selection || !triggerBrush[1].isSelected) return;

    let [[x0, y0], [x1, y1]] = selection;
    let distX = x0 - triggerBrush[1].selection[0][0];
    let distY = y0 - triggerBrush[1].selection[0][1];
    triggerBrush[1].selection = selection;
    triggerBrush[1].selectionDomain = getSelectionDomain(selection);
    for (const brushGroup of brushesGroup.values()) {
      for (const brush of brushGroup) {
        if (brush[1].isSelected && !(triggerBrush[0] === brush[0])) {
          let [[x0, y0], [x1, y1]] = brush[1].selection;
          x0 += distX;
          x1 += distX;
          y0 += distY;
          y1 += distY;
          gBrushes.select("#brush-" + brush[0]).call(brush[1].brush.move, [
            [x0, y0],
            [x1, y1],
          ]);
          brush[1].selection = [
            [x0, y0],
            [x1, y1],
          ];
          brush[1].selectionDomain = getSelectionDomain(brush[1].selection);
        }
      }
    }

    if (ts.autoUpdate) {
      tUpdateSelection();
    }
  }

  function updateBrush(brush) {
    let [[x0, y0], [x1, y1]] = brush[1].selection;
    let newIntersections = BVH_.intersect(x0, y0, x1, y1);
    let updated = !compareMaps(newIntersections, brush[1].intersections);
    brush[1].intersections = newIntersections;
    return updated;
  }

  function selectBrush(brush) {
    brush[1].isSelected = !brush[1].isSelected;
  }
  function deselectAllBrushes() {
    for (let brushGroup of brushesGroup.values()) {
      for (let brush of brushGroup) {
        brush[1].isSelected = false;
      }
    }
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

  function showBrushTooltip({selection, sourceEvent}) {
    if (!selection || sourceEvent === undefined) return;

    let selectionInverted = selection.map(([x, y]) => [
      scaleX.invert(+x),
      scaleY.invert(+y),
    ]);

    brushTooltip.__update({
      selection: selectionInverted,
      selectionPixels: selection,
    })
  }

  function drawBrushes() {
    let brushes = [];
    brushesGroup.forEach((d) => (brushes = brushes.concat(Array.from(d.brushes))));

    gBrushes
      .selectAll(".brush")
      .data(brushes, (d) => d[0])
      .join(
        (enter) => {
          enter
            // Insert on top of the g
            .insert("g", ".brush")
            .attr("class", "brush")
            .attr("id", (d) => "brush-" + d[0])

            .each(function (d) {
              return d3.select(this).call(d[1].brush);
            })
            .style("-webkit-filter", brushShadowIfSelected)
            .style("filter", brushShadowIfSelected)
            .each(function (d, i) {
              d3.select(this)
                .selectAll(".selection")
                .style("outline", "-webkit-focus-ring-color solid 0px")
                .attr("tabindex", 0)
                .on("mousedown", (sourceEvent) => {
                  let selection = d[1].selection;
                  // updateBrushSpinBox({ selection, sourceEvent }, d); TODO
                  selectedBrush = d;

                  // Show shadow on current brush
                  gBrushes
                    .selectAll(".brush")
                    .style("-webkit-filter", brushShadowIfSelected)
                    .style("filter", brushShadowIfSelected);

                  if (sourceEvent.shiftKey) {
                    selectBrush(d);
                    triggerValueUpdate();
                  }
                });
              if (ts.showBrushTooltip) {
                d3.select(this)
                  .selectAll(":not(.overlay)")
                  .on("mousemove", (sourceEvent) => {
                    let selection = d[1].selection;
                    showBrushTooltip({ selection, sourceEvent });
                  })
                  .on(
                    "mouseout",
                    () => {
                       //brushTooltip.__hide();
                    },
                    false
                  );
              }
            });
        },
        (update) =>
          update
            //  Draw a shadow on the current brush
            .style("-webkit-filter", brushShadowIfSelected)
            .style("filter", brushShadowIfSelected)
            .style("display", (d) =>
              brushesGroup.get(d[1].group).isEnable ? "" : "none"
            ) // Hide brushes when their group is not enabled
            .style("pointer-events", (d) =>
              d[1].group === brushGroupSelected ? "all" : "none"
            ) // disable interaction with not active brushes.
            .each(function (d) {
              d3.select(this)
                .selectAll(".selection")
                .style(
                  "stroke-width",
                  d[1].group === brushGroupSelected ? "2px" : "0.5px"
                )
                // .style("outline-style", d[1].isSelected ? "dashed" : "solid")
                .style("stroke-dasharray", d[1].isSelected ? "4" : "")
                .style("stroke", ts.brushesColorScale(d[1].group))
                .style("outline-color", ts.brushesColorScale(d[1].group))
                .style("fill", ts.brushesColorScale(d[1].group));
            }),
        (exit) => exit.remove()
      );

    gBrushes
      .selectAll(".brush")
      .data(brushes, (d) => d[0])
      .each(function (d) {
        d3.select(this)
          .selectAll(".overlay")
          .style("pointer-events", () =>
            brushCount - 1 === d[0] ? "all" : "none"
          );
      });
  }

  me.updateBrushGroupName = function (id, name) { // TODO
    brushesGroup.get(id).name = name
    updateStatus();

  }
  me.addBrushGroup = function () {
    let newId = getUnusedIdBrushGroup();
    let brushGroup = {
      isEnable: true,
      name: "Group " + newId,
      brushes: new Map()
    }

    brushesGroup.set(newId, brushGroup);
    dataSelected.set(newId, []);
    me.selectBrushGroup(newId);

    updateStatus();
    updateGroups();
  }
  me.changeBrushGroupState = function (id, newState) {
    if (brushesGroup.get(id).isEnable === newState) return; //same state so no update needed

    if (!newState) {
      brushesGroup.get(id).isEnable = newState;
      if (selectedBrush[1].group === id) {
        brushTooltip.__hide();
      }
    }

    drawBrushes();
    updateStatus();
    updateGroups();
  }

  me.selectBrushGroup = function (id) {
    brushGroupSelected = id;
    brushesGroup.get(id).isEnable = true;
    drawBrushes();
    updateStatus();
    updateGroups();
  }

  me.removeBrushGroup = function (id) { // TODO
    if (brushesGroup.length <= 1) return;

    let itKeys = brushesGroup.keys();
    let newId = itKeys.next().value;
    newId = newId === id ? itKeys.next().value : newId;

    let brushGroupToDelete = brushesGroup.get(id);

    for (let brush of brushGroupToDelete.entries()) {
      if (brush[1].selection !== null) {
        removeBrush(brush);
      } else {
        brush[1].group = newId;
        brushesGroup.get(newId).brushes.set(brush[0], brush[1]);
        brushGroupToDelete.delete(brush[0]);
      }
    }

    updateGroups();
  }

  me.getEnableGroups = function () {
    let enable = new Set();
    brushesGroup.forEach( (d, id) => {
      if (d.isEnable) {
        enable.add(id)
      }
    });
    return enable;
  }

  me.getBrushesGroup = function () {
    return brushesGroup;
  }

  me.getBrushGroupSelected = function () {
    return brushGroupSelected;
  }

  me.removeSelectedBrush = function () {
    if (selectedBrush) removeBrush(selectedBrush)
  }

  me.getSelectedBrush = function () {
    return selectedBrush;
  }

  me.moveSelectedBrush = function (x0, x1, y0, y1) { //Domain coordinates
    let minX = scaleX.domain()[0];
    let maxX = scaleX.domain()[1];
    let minY = scaleY.domain()[0];
    let maxY = scaleY.domain()[1];

    x0 = Math.max(x0, minX);
    x1 = Math.min(x1, maxX);
    y0 = Math.max(y0, minY);
    y1 = Math.min(y1, maxY);

    if (x0 > x1) {
      [x0, x1] = [x1, x0]
    }

    if (y0 < y1) {
      [y0, y1] =  [y1, y0]
    }


    let x0p = scaleX(x0);
    let x1p = scaleX(x1);
    let y0p = scaleY(y0);
    let y1p = scaleY(y1);

    gBrushes
      .select("#brush-" + selectedBrush[0])
      .call(selectedBrush[1].brush.move, [
        [x0p, y0p],
        [x1p, y1p],
      ])

    let selection = [[x0p,y0p],[x1p,y1p]];
    let selectionDomain = [[x0,y0],[x1,y1]]

    let sourceEvent = new Event("move")
    brushed({ selection, sourceEvent }, selectedBrush);
    brushTooltip.__update({selection: selectionDomain, selectionPixels: selection})
    //moveSelectedBrushes({selection,sourceEvent},brushInSpinBox)
  }

  // add brush group without funct to avoid callback
  let newId = getUnusedIdBrushGroup();
  let brushGroup = {
    isEnable: true,
    name: "Group " + newId,
    brushes: new Map()
  }

  brushesGroup.set(newId, brushGroup);
  dataSelected.set(newId, []);
  brushGroupSelected = newId;
  brushesGroup.get(newId).isEnable = true;

  newBrush();
  drawBrushes();

  return me;
}

export default brushInteraction