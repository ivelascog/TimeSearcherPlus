import * as d3 from "d3";
import { throttle } from "throttle-debounce";
import BVH from "./BVH";
import brushTooltipEditable from "./BrushTooltipEditable.js";
import BrushContextMenu from "./BrushContextMenu.js";
import { compareSets, darken } from "./utils.js";

import { BrushAggregation, BrushModes, log } from "./utils";

  me.invertQuery = function (brushGroup) {
    let brushes = brushesGroup.get(brushGroup).brushes;
    let miny = Number.MAX_VALUE;
    let maxy = Number.MIN_VALUE;
    brushes.forEach(brush => {
      if (!brush.selection) return;
      miny = Math.min(brush.selection[0][1],miny);
      maxy = Math.max(brush.selection[1][1],maxy);
    });
    let midPointQuery = (maxy - miny)/ 2 + miny;
    brushes.forEach( (brush, brushId) => {
      if (!brush.selection) return;
      let brushHeight  = brush.selection[1][1] - brush.selection[0][1];
      let brushMidPoint = brushHeight/ 2 + brush.selection[0][1];
      let distY = midPointQuery - brushMidPoint;
      moveBrush([brushId,brush], 0, distY * 2);
    });

    tUpdateSelection();

  };

  me.invertQuerySelectedGroup = function () {
    me.invertQuery(brushGroupSelected);
  };

function brushInteraction({
  ts,
  data,
  element,
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
  tsLevel, // Store the level of the TS for brushColor. See how to change this TODO
  selectionCallback = () => {}, // (dataSelected, dataNotSelected, hasSelection) => {} Called when selected elements change
  groupsCallback = () => {}, // (groups) => {} Called when information of the groups changes (not the selection made by them)
  changeSelectedCoordinatesCallback = () => {}, // (selection) => {} Called when the coordinates of the selected brush change.
  selectedBrushCallback = () => {}, // (brush) => {} Called when the selected Brush changes.
  statusCallback = () => {}, // (status) => {}
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
    brushContextMenu;

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
  let BVHData = data.map(d => {
    let polyline = d[1].map(d => [scaleX(x(d)), scaleY(y(d))]);
    return [d[0], polyline];
  });

  BVH_ = BVH({
    data: BVHData,
    xPartitions,
    yPartitions
  });

  brushTooltip = brushTooltipEditable({
    fmtX,
    fmtY,
    target: tooltipTarget,
    margin: { top: ts.margin.top, left: ts.margin.left },
    callback: onTooltipChange
  });

  brushContextMenu = BrushContextMenu({
    target: contextMenuTarget,
    callback: onContextMenuChange
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
    me.moveSelectedBrush([
      [x0, y0],
      [x1, y1]
    ]);
  }

  function onContextMenuChange(mode, aggregation, brush) {
    brush[1].mode = mode;
    brush[1].aggregation = aggregation;
    updateBrush(brush);
    brushFilter();
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
  function newBrush(mode = BrushModes.Intersect, aggregation = BrushAggregation.And, brushGroup = brushGroupSelected, brushinitialSelection = undefined) {
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
    brushesGroup.get(brushGroup).brushes.set(brushCount, generateBrush(brush, mode, aggregation, brushGroup, null, null, brushinitialSelection));
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

    // dont execute this method when move brushes programatically (sourceEvent === null) or when there is no selection
    if (sourceEvent === undefined || !selection) return;
    //log("brushed", brush);
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
      dataNotSelected = data;
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
    if (group.size === 0) return false;

    // If the group only have a 1 uninitialized brush not have intersection
    if (group.size === 1 && !group.values().next().value.intersections)
      return false;

    let intersect = true;
    let anyAnd = false;
    for (const brush of group.values())
      if (brush.intersections) { //initialize brush only
        switch (brush.aggregation) {
          case BrushAggregation.And:
            intersect =
              intersect && brush.intersections.has(data[0]);
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
    gBrushes.selectAll("#brush-" + brushId).call(brush.brush.move, [
      [x0, y0],
      [x1, y1]
    ]);
    brush.selection = [
      [x0, y0],
      [x1, y1]
    ];
    brush.selectionDomain = getSelectionDomain(brush.selection);
  }

  // Move all selected brushes the same amount of the triggerBrush
  function moveSelectedBrushes({ selection, sourceEvent }, trigger) {
    // dont execute this method when move brushes programatically
    if (sourceEvent === undefined) return;
    if (!Array.isArray(trigger) || trigger.length !== 2) {
      log(
        "👁️ moveSelectedBrushes called without array trigger returning",
        trigger
      );
      return;
    }

    const [triggerId, triggerBrush] = trigger;
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
  function updateBrush([, brush]) {
    let [[x0, y0], [x1, y1]] = brush.selection;
    let newIntersections = null;
    // TODO Another form to do that is to assing the brush the function to calculate the intersection. It would make the code shorter, but I think less readable.
    switch (brush.mode) {
      case BrushModes.Intersect:
        newIntersections = BVH_.intersect(x0, y0, x1, y1);
        break;
      case BrushModes.Contains:
        newIntersections = BVH_.contains(x0, y0, x1, y1);
        break;
      default:
        newIntersections = BVH_.intersect(x0, y0, x1, y1);
        log("🚫 ERROR The method elected to compute the selection are not support, using default intersection instead ");

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
      scaleY.invert(+y)
    ]);

    brushTooltip.__update({
      selection: selectionInverted,
      selectionPixels: selection
    });
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
      // .style("outline-style", brushValue.isSelected ? "dashed" : "solid")
      .style("stroke-dasharray", brushValue.isSelected ? "4" : "")
      .style("stroke", darken(computeColor(brushValue.group)))
      .style("outline-color", darken(computeColor(brushValue.group)))
      .style("fill", computeColor(brushValue.group))
      .attr("tabindex", 0)
      .on("mousedown", (sourceEvent) => {
        if (sourceEvent.button === 0) { //Do that in left click
          let selection = brushValue.selection;
          updateSelectedCoordinates({ selection });
          selectedBrush = selectedBrush && d[0] === selectedBrush[0] ? null : d;
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
        brushContextMenu.__show(brushValue.mode, brushValue.aggregation, px, py, d);
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

  function computeColor(groupId) {
    // Not do if(tsLevel) because if(0) is false.
    if (tsLevel !== undefined) return ts.brushesColorScale[groupId](tsLevel);

    if (ts.brushesColorScale instanceof Array)
      return ts.brushesColorScale[groupId](tsLevel);

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
      .each(function([, brush]) {
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

    brushesSelection.each(function(d) {
      d3.select(this)
        .selectAll(".overlay")
        .style("pointer-events", () => {
          return brushCount - 1 === d[0] ? "all" : "none";
        });
    });

    brushesSelection.each(function([id, brush]) {
      // Are we creating a brush for a predefined filter?
      if (brush.initialSelection) {
        log(
          "🎉 setting initial selection",
          brush.initialSelection);

        // Update brushColor
        d3.select(this)
          .selectAll(".selection")
          .style("stroke", darken(computeColor(brush.group)))
          .style("outline-color", darken(computeColor(brush.group)))
          .style("fill", computeColor(brush.group));

        // // if so set the new brush programatically, and delete the initial selection
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

  me.updateBrushGroupName = function(id, name) {
    brushesGroup.get(id).name = name;
    updateGroups();
    updateStatus();
  };

  me.addBrushGroup = function() {
    // In case of a multivariate TS, it is not possible to add more groups than defined color families.
    if (
      tsLevel !== undefined &&
      brushesGroup.size === ts.brushesColorScale.length
    ) {
      log(
        "Another group cannot be added because there is no defined color family. "
      );
      return;
    }
    let newId = getUnusedIdBrushGroup();
    let brushGroup = {
      isEnable: true,
      isActive: false,
      name: "Group " + (newId + 1),
      brushes: new Map()
    };

    brushesGroup.set(newId, brushGroup);
    dataSelected.set(newId, []);
    me.selectBrushGroup(newId);

    updateStatus();
    updateGroups();
    selectionCallback(dataSelected, dataNotSelected, brushSize !== 0);
  };

  me.changeBrushGroupState = function(id, newState) {
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

  me.selectBrushGroup = function(id) {
    if (brushGroupSelected === id) return;

    let oldBrushGroupSelected = brushesGroup.get(brushGroupSelected);
    oldBrushGroupSelected.isActive = false;
    deselectAllBrushes();

    brushesGroup.get();
    brushGroupSelected = id;
    brushesGroup.get(id).isActive = true;
    brushesGroup.get(id).isEnable = true;
    drawBrushes();
    updateStatus();
    updateGroups();
  };

  me.removeBrushGroup = function(id) {
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

  me.getEnableGroups = function() {
    let enable = new Set();
    brushesGroup.forEach((d, id) => {
      if (d.isEnable) {
        enable.add(id);
      }
    });
    return enable;
  };

  me.getBrushesGroup = function() {
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

  me.getBrushGroupSelected = function() {
    return brushGroupSelected;
  };

  me.removeSelectedBrush = function() {
    if (selectedBrush) removeBrush(selectedBrush);
  };

  me.getSelectedBrush = function() {
    return selectedBrush;
  };

  me.hasSelection = function() {
    return brushSize !== 0;
  };

  me.deselectBrush = function() {
    if (selectedBrush) {
      selectedBrush = null;
      drawBrushes();
      selectedBrushCallback(selectedBrush);
    }
  };

  me.changeSelectedBrushMode = function(brushMode) {
    selectedBrush.mode = brushMode;
    updateBrush(selectedBrush);
  };

  me.changeSelectedBrushAggregation = function(brushAggregation) {
    selectedBrush.aggregation = brushAggregation;
    brushFilter();
  };

  me.recreate = function(brushesGroups_) {
    let filters = [];
    for (let [groupId, group] of brushesGroups_) {
      // Create or update the brushGroup
      if (!brushesGroup.has(groupId)) {
        let brushGroup = {
          isEnable: group.isEnable,
          isActive: group.isActive,
          name: group.name,
          brushes: new Map()
        };
        brushesGroup.set(groupId, brushGroup);
        dataSelected.set(groupId, []);
      } else {
        let brushGroup = brushesGroup.get(groupId);
        brushGroup.isEnable = group.isEnable;
        brushGroup.isActive = group.isActive;
        brushGroup.name = group.name;
      }

      for (let [brushId, brush] of group.brushes) {
        let filter = {
          id: brushId,
          groupId: groupId,
          selectionDomain: getSelectionDomain(brush.selection)
        };
        filters.push(filter);
      }
    }

    me.addFilters(filters);
    drawBrushes();
  };

  me.moveBrush = function([brushID, brushValue], selection, moveSelection = false) {
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
      [x1p, y1p]
    ]);

    selection = [
      [x0p, y0p],
      [x1p, y1p]
    ];
    let selectionDomain = [
      [x0, y0],
      [x1, y1]
    ];

    let sourceEvent = new Event("move"); // fake event to be able to call brushed programmatically
    if (moveSelection) {
      moveSelectedBrushes({ selection, sourceEvent }, [brushID, brushValue]);
    } else {
      brushed({ selection, sourceEvent }, [brushID, brushValue]);
      brushTooltip.__update({
        selection: selectionDomain,
        selectionPixels: selection
      });
    }
  };

  me.moveSelectedBrush = function([[x0, y0], [x1, y1]], moveSelection = false) {
    //log("Move selected brush", selectedBrush);
    if (!selectedBrush) {
      log(
        "🚫 ERROR moveSelectedBrush called but selectedBrush is falsy ",
        selectedBrush
      );
      return;
    }

    me.moveBrush(selectedBrush, [
      [x0, y0],
      [x1, y1]
    ], moveSelection);
  };

  function procesFilters(filters) {
    let processedFilters = [];
    for (let i = 0; i < filters.length; ++i) {
      let filter = filters[i];
      let processedFilter = generateFilter({
        mode: filter.hasOwnProperty("mode") ? filter.mode : null ,
        aggregation: filter.hasOwnProperty("aggregation") ? filter.aggregation : null,
        selectionPixels: filter.hasOwnProperty("selectionPixels") ? filter.selectionPixels : null,
        selectionDomain: filter.hasOwnProperty("selectionDomain") ? filter.selectionDomain : null
      });
      processedFilters.push(processedFilter);
    }
    return processedFilters;
  }

  function generateFiltersArray(filters) {
    let groupId = getUnusedIdBrushGroup();
    let processedBrushGroup = new Map();
    processedBrushGroup.set("Group " + groupId, procesFilters(filters));
    return processedBrushGroup;
  }

  function generateFiltersObject(filters) {
    let processedBrushGroups = new Map();
    for (const [groupName, groupData] of Object.entries(filters)) {
      processedBrushGroups.set(groupName, procesFilters(groupData));
    }
    return processedBrushGroups;
  }

  function generateFilter({ groupId, selectionDomain, selectionPixels, mode, aggregation }) {
    return {
      groupId: groupId,
      selectionDomain: selectionDomain,
      selectionPixels: selectionPixels,
      mode: mode ? mode : BrushModes.Intersect,
      aggregation: aggregation ? aggregation : BrushAggregation.And
    };
  }

  function generateBrush(brush, mode, aggregation, group, selection, selectionDomain, initialSelection) {
    return {
      brush: brush,
      intersections: null,
      mode: mode,
      aggregation: aggregation,
      isSelected: false,
      group: group,
      selection: selection,
      selectionDomain: selectionDomain,
      initialSelection: initialSelection
    };
  }


  me.addFilters = function(filters, wipeAll = false) {
    if (filters.length === 0) return;

    let proccessedFilters;
    if (Array.isArray(filters)) {
      proccessedFilters = generateFiltersArray(filters);
    } else if (filters.constructor === Object) {
      proccessedFilters = generateFiltersObject(filters);
    } else {
      throw new Error("Filters parameter only accept an array or an object");
    }

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

    for (let [grouName, brushes] of proccessedFilters) {
      let groupId = getUnusedIdBrushGroup();
      let brushGroup = {
        isEnable: true,
        isActive: false,
        name: grouName,
        brushes: new Map()
      };
      brushesGroup.set(groupId, brushGroup);
      dataSelected.set(groupId, []);

      for (const brush of brushes) {
        newBrush(
          brush.mode,
          brush.aggregation,
          groupId,
          brush.selectionDomain
        );
        brushSize++; // The brushSize will not be increased in onStartBrush
        // because the last brush added will be the one set for a new Brush.
      }
    }

    newBrush(); // Add another brush that handle the possible new TimeBox

    brushFilter();
    drawBrushes();
  };

  me.drawBrushes = function() {
    drawBrushes();
  };

  me.setTsPosition = function(position) {
    tsLevel = position;
    //drawBrushes();
  };

  // add brush group without funct to avoid callback
  let newId = getUnusedIdBrushGroup();
  let brushGroup = {
    isEnable: true,
    isActive: true,
    name: "Group " + (newId + 1),
    brushes: new Map()
  };

  brushesGroup.set(newId, brushGroup);
  dataSelected.set(newId, []);
  brushGroupSelected = newId;
  brushesGroup.get(newId).isEnable = true;

  newBrush();
  drawBrushes();

  return me;
}

export default brushInteraction;
