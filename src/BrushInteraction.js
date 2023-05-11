import * as d3 from "d3";
import { throttle } from "throttle-debounce";
import BVH from "./BVH";
import brushTooltipEditable from "./BrushTooltipEditable.js";
import { compareSets } from "./utils.js";

import { log } from "./utils";

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
  initialSelections, // Initial filters received from the outside
  minBrushSize = 5, // Min size in pixels of brushes
  selectionCallback = (dataSelected, dataNotSelected, hasSelection) => {}, // Called when selected elements change
  groupsCallback = (groups) => {}, // Called when information of the groups changes (not the selection made by them)
  changeSelectedCoordinatesCallback = (selection) => {}, // Called when the coordinates of the selected brush change.
  statusCallback = (status) => {},
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
    brushTooltip;

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
  BVH_ = BVH({
    data,
    x,
    y,
    width,
    height,
    scaleX,
    scaleY,
    xPartitions,
    yPartitions,
  });

  brushTooltip = brushTooltipEditable({
    fmtX,
    fmtY,
    target: tooltipTarget,
    margin: { top: ts.margin.top, left: ts.margin.left },
    callback: onTooltipChange,
  });

  function onTooltipChange(selection) {
    let [[x0, y0], [x1, y1]] = selection;
    me.moveSelectedBrush([
      [x0, y0],
      [x1, y1],
    ]);
  }

  const onBrushStart = (e, brushObject) => {
    log("💡  onBrushStart", brushObject, arguments.length);
    if (!brushObject || !brushObject.length) {
      // TODO
      log("🚫 ERRROR onBrushStart called with no or wrong brush", brushObject);
      return;
    }
    const [id, brush] = brushObject;

    // call when the user starts interacting with a timeBox
    // If the user is creating a new TimeBox, modify the group to which the timeBox belongs.
    if (id === brushCount - 1) {
      brushSize++;
      brushesGroup.get(brush.group).brushes.delete(id);
      brush.group = brushGroupSelected;
      brushesGroup.get(brushGroupSelected).brushes.set(id, brush);
      brushesGroup.get(brushGroupSelected).isEnable = true;
      selectedBrush = brush;
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
  function newBrush(initialSelection = undefined) {
    // Setup the brush
    let brush = d3.brush().on("start", onBrushStart);
    brush.on("brush.move", moveSelectedBrushes);
    brush.on("brush.Selected", tSelectionCall);
    if (ts.autoUpdate) {
      // Update brushSelection only if autoUpdate
      brush.on("brush.brushed", tBrushed);
    }
    if (ts.showBrushTooltip) {
      brush.on("brush.show", tShowTooltip);
    }
    brush.on("end", onBrushEnd);

    // Add the new brush to the group
    brushesGroup.get(brushGroupSelected).brushes.set(brushCount, {
      brush: brush,
      intersections: new Set(),
      isSelected: false,
      group: brushGroupSelected,
      selection: null,
      selectionDomain: null,
      initialSelection,
    });
    brushCount++;
  }

  function getSelectionDomain(selection) {
    return selection.map(([x, y]) => [scaleX.invert(x), scaleY.invert(y)]);
  }

  // Update brush intersections when moved
  function brushed({ selection, sourceEvent }, brush) {
    log("brushed", brush, arguments);
    if (!brush[1]) {
      // TODO
      log("**🚫 ERROR brushed called without a brush[1]", brush);
      return;
    }

    if (sourceEvent === undefined) return; // dont execute this method when move brushes programatically
    log("brushed", brush);
    brush[1].selection = selection;
    brush[1].selectionDomain = getSelectionDomain(selection); // Calculate the selection coordinates in data domain
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
        for (let [groupId, brushGroup] of brushesGroup.entries()) {
          if (intersectGroup(d, brushGroup.brushes)) {
            dataSelected.get(groupId).push(d);
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

    selectionCallback(dataSelected, dataNotSelected, brushSize !== 0);
  }

  function removeBrush([id, brush]) {
    brushSize--;
    brushesGroup.get(brush.group).brushes.delete(id);

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
    groupsCallback(brushesGroup);
  }

  function updateSelectedCoordinates({ selection }) {
    let selectionDomain = getSelectionDomain(selection);
    changeSelectedCoordinatesCallback(selectionDomain);
  }

  // Calculates whether a line intersects a complete brushGroup.
  function intersectGroup(data, group) {
    if (
      group.size === 0 ||
      (group.size === 1 && group.values().next().value.intersections.size === 0)
    )
      return false;
    let intersect = true;
    for (const brush of group.values()) {
      intersect =
        intersect &&
        (brush.intersections.has(data[0]) || brush.intersections.size === 0);
    }
    return intersect;
  }

  // Update the intersection of all selected brushes
  function updateSelection() {
    let someUpdate = false;
    for (const brushGroup of brushesGroup.values()) {
      for (const brush of brushGroup.brushes.values()) {
        if (brush.isSelected) {
          let update = updateBrush(brush); //avoid lazy evaluation
          someUpdate = someUpdate || update;
        }
      }
    }
    if (someUpdate) {
      brushFilter();
    }
  }

  // Move all selected brushes the same amount of the triggerBrush
  function moveSelectedBrushes(
    { selection, sourceEvent },
    [triggerId, triggerBrush]
  ) {
    log("moveSelectedBrushes", arguments);
    if (sourceEvent === undefined) return; // dont execute this method when move brushes programatically
    if (!selection || !triggerBrush.isSelected) return;

    let [[x0, y0]] = selection;
    let distX = x0 - triggerBrush.selection[0][0];
    let distY = y0 - triggerBrush.selection[0][1];
    triggerBrush.selection = selection;
    triggerBrush.selectionDomain = getSelectionDomain(selection);
    for (const brushGroup of brushesGroup.values()) {
      for (const [brushId, brush] of brushGroup.brushes) {
        if (brush[1].isSelected && !(triggerId === brushId)) {
          let [[x0, y0], [x1, y1]] = brush[1].selection;
          x0 += distX;
          x1 += distX;
          y0 += distY;
          y1 += distY;
          gBrushes.select("#brush-" + brushId).call(brush.brush.move, [
            [x0, y0],
            [x1, y1],
          ]);
          brush.selection = [
            [x0, y0],
            [x1, y1],
          ];
          brush.selectionDomain = getSelectionDomain(brush[1].selection);
        }
      }
    }

    if (ts.autoUpdate) {
      tUpdateSelection();
    }
  }

  // Calculate the intersection of one brush with all the lines. Returns true if any changes have been made
  function updateBrush([, brush]) {
    let [[x0, y0], [x1, y1]] = brush.selection;
    let newIntersections = BVH_.intersect(x0, y0, x1, y1);
    let updated = !compareSets(newIntersections, brush.intersections);
    brush.intersections = newIntersections;
    return updated;
  }

  function selectBrush(brush) {
    brush[1].isSelected = !brush[1].isSelected;
    updateGroups();
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

  function showBrushTooltip({ selection, sourceEvent }) {
    if (!selection || sourceEvent === undefined) return;

    let selectionInverted = selection.map(([x, y]) => [
      scaleX.invert(+x),
      scaleY.invert(+y),
    ]);

    brushTooltip.__update({
      selection: selectionInverted,
      selectionPixels: selection,
    });
  }

  // Called by drawBrushes
  function drawOneBrush(d) {
    const brushValue = d[1];

    d3.select(this)
      .selectAll(".selection")
      .style("outline", "-webkit-focus-ring-color solid 0px")
      .style("fill", ts.brushesColorScale(brushValue.group))
      .style(
        "stroke-width",
        brushValue.group === brushGroupSelected ? "2px" : "0.5px"
      )
      // .style("outline-style", brushValue.isSelected ? "dashed" : "solid")
      .style("stroke-dasharray", brushValue.isSelected ? "4" : "")
      .style("stroke", ts.brushesColorScale(brushValue.group))
      .style("outline-color", ts.brushesColorScale(brushValue.group))
      .style("fill", ts.brushesColorScale(brushValue.group))
      .attr("tabindex", 0)
      .on("mousedown", (sourceEvent) => {
        let selection = brushValue.selection;
        updateSelectedCoordinates({ selection });
        selectedBrush = d;

        // Show shadow on current brush
        gBrushes
          .selectAll(".brush")
          .style("-webkit-filter", brushShadowIfSelected)
          .style("filter", brushShadowIfSelected);

        if (sourceEvent.shiftKey) {
          selectBrush(d);
        }
      });
    if (ts.showBrushTooltip) {
      d3.select(this)
        .selectAll(":not(.overlay)")
        .on("mousemove", (sourceEvent) => {
          let selection = brushValue.selection;
          showBrushTooltip({ selection, sourceEvent });
        });
    }
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
      .style("display", (d) =>
        brushesGroup.get(d[1].group).isEnable ? "" : "none"
      ) // Hide brushes when their group is not enabled
      .style("pointer-events", (d) =>
        d[1].group === brushGroupSelected ? "all" : "none"
      ) // disable interaction with not active brushes.
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
        log(
          "setting initial selection",
          brush.initialSelection,
          brush.initialSelection.map(([px, py]) => [scaleX(px), scaleY(py)])
        );

        // me.moveBrush([id, brush], brush.initialSelection);

        // log(
        //   "setting initial selection",
        //   brush.initialSelection,
        //   brush.initialSelection.map(([px, py]) => [scaleX(px), scaleY(py)])
        // );
        // // if so set the new brush programatically, and delete the initial selection
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
      name: "Group " + newId,
      brushes: new Map(),
    };

    brushesGroup.set(newId, brushGroup);
    dataSelected.set(newId, []);
    me.selectBrushGroup(newId);

    updateStatus();
    updateGroups();
  };
  me.changeBrushGroupState = function (id, newState) {
    if (brushesGroup.get(id).isEnable === newState) return; //same state so no update needed

    brushesGroup.get(id).isEnable = newState;

    if (!newState) {
      // Hide tooltip if it was in a brush of that group.
      if (selectedBrush && selectedBrush[1].group === id) {
        brushTooltip.__hide();
      }
    }

    drawBrushes();
    updateStatus();
    updateGroups();
  };

  me.selectBrushGroup = function (id) {
    brushesGroup.get(brushGroupSelected).isActive = false;
    brushGroupSelected = id;
    brushesGroup.get(id).isActive = true;
    brushesGroup.get(id).isEnable = true;
    drawBrushes();
    updateStatus();
    updateGroups();
  };

  me.removeBrushGroup = function (id) {
    if (brushesGroup.length <= 1) return;

    let itKeys = brushesGroup.keys();
    let newId = itKeys.next().value;
    newId = newId === id ? itKeys.next().value : newId;

    let brushGroupToDelete = brushesGroup.get(id);

    for (let [id, brush] of brushGroupToDelete.brushes.entries()) {
      // delete all brushes of the group to be deleted, except the brush prepared to create a new timeBox
      if (brush.selection !== null) {
        removeBrush(brush);
      } else {
        // Change the brush prepared to create a new timeBox to another group
        brush.group = newId;
        brushesGroup.get(newId).brushes.set(id, brush);
        brushGroupToDelete.delete(id);
      }
    }

    // Select new active group if needed
    if (brushGroupSelected === id) {
      brushesGroup.get(newId).isActive = true;
      brushGroupSelected = newId;
    }

    brushesGroup.delete(id);

    updateGroups();
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
    return brushesGroup;
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
    return brushSize !== 0;
  };

  me.recreate = function (brushesGroups_) {
    brushCount = 0;
    brushSize = 0;
    for (let brushGroup of brushesGroups_) {
      if (brushGroup[1].isActive) brushGroupSelected = brushGroup[0];
      for (let brush of brushGroup[1].brushes) {
        brushSize++;
        brushCount = Math.max(brushCount, brush[0]);
        if (brush[1].selection) updateBrush(brush);
      }
      brushesGroup.set(brushGroup[0], brushGroup[1]);
    }
    brushCount++;

    drawBrushes();
    for (let brushGroup of brushesGroups_) {
      for (let brush of brushGroup[1].brushes) {
        if (brush[1].selection) {
          gBrushes
            .select("#brush-" + brush[0])
            .call(brush[1].brush.move, brush[1].selection);
        }
      }
    }

    drawBrushes();

    //brushFilter();
  };

  me.moveBrush = function ([brushID, brushValue], [[x0, y0], [x1, y1]]) {
    //Domain coordinates
    let minX = scaleX.domain()[0];
    let maxX = scaleX.domain()[1];
    let minY = scaleY.domain()[0];
    let maxY = scaleY.domain()[1];

    x0 = Math.max(x0, minX);
    x1 = Math.min(x1, maxX);
    y0 = Math.max(y0, minY);
    y1 = Math.min(y1, maxY);

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

    log("moveBrush", brushID, brushValue, arguments[1]);
    gBrushes.selectAll("#brush-" + brushID).call(brushValue.brush.move, [
      [x0p, y0p],
      [x1p, y1p],
    ]);

    let selection = [
      [x0p, y0p],
      [x1p, y1p],
    ];
    let selectionDomain = [
      [x0, y0],
      [x1, y1],
    ];

    let sourceEvent = new Event("move"); // fake event to be able to call brushed programmatically
    brushed({ selection, sourceEvent }, [brushID, brushValue]);
    brushTooltip.__update({
      selection: selectionDomain,
      selectionPixels: selection,
    });
    //moveSelectedBrushes({selection,sourceEvent},brushInSpinBox)
  };

  me.moveSelectedBrush = function ([[x0, y0], [x1, y1]]) {
    log("move selected brush", selectedBrush);
    me.moveBrush(selectedBrush, [
      [x0, y0],
      [x1, y1],
    ]);
  };

  // add brush group without funct to avoid callback
  let newId = getUnusedIdBrushGroup();
  let brushGroup = {
    isEnable: true,
    isActive: true,
    name: "Group " + newId,
    brushes: new Map(),
  };

  brushesGroup.set(newId, brushGroup);
  dataSelected.set(newId, []);
  brushGroupSelected = newId;
  brushesGroup.get(newId).isEnable = true;

  newBrush(initialSelections);
  drawBrushes();

  return me;
}

export default brushInteraction;
