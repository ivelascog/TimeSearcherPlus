import * as d3 from "d3";
import { add, intervalToDuration, sub } from "date-fns";

import { eventType, log } from "./utils.js";

import TimelineDetails from "./TimelineDetails.js";
import TimeLineOverview from "./TimeLineOverview";
import brushInteraction from "./BrushInteraction";

function TimeSearcher(data, {
  target = document.createElement("div"), // pass a html element where you want to render
  detailsElement, // pass a html element where you want to render the details
  coordinatesElement = document.createElement("div"), // pass a html element where you want to render the brush coordinates Input.
  groupsElement, // pass a html element where you want to have the brushes controls.
  showBrushesControls = false, // If false you can still use brushesControlsElement to show the control on a different element on your app
  x = (d) => d.x, // Attribute to show in the X axis (Note that it also supports functions)
  y = (d) => d.y, // Attribute to show in the Y axis (Note that it also supports functions)
  id = (d) => d.id, // Attribute to group the input data (Note that it also supports functions)
  color = null,  //Specifies the attribute to be used to discriminate the groups (Note that it also supports functions).
  groupAttr = null, // DEPRECATED use color instead: Specifies the attribute to be used to discriminate the groups (Note that it also supports functions).
  referenceCurves = null, // Specifies a Json object with the information of the reference lines.
  width = 1200, // Set the desired width of the overview Widget
  detailsWidth = 400, // Set the desired width of the details Widget
  height = 600, // Set the desired height of the overview Widget
  detailsHeight = 300, // Set the desired height of the overview Widget
  detailsContainerHeight = 400,
  detailsMargin = null, // Margin options for details view, d3 common format, leave null for using the overview margin
  updateCallback = () => {
  }, // (data) => doSomethingWithData
  statusCallback = () => {
  }, // (status) => doSomethingWithStatus
  fmtX = d3.format(".1f"), // Function, how to format x points in the tooltip
  fmtY = d3.format(".1f"), // Function, how to format x points in the tooltip
  yLabel = "",
  xLabel = "",
  filters = [], // Array of filters to use, format [[x1, y1], [x2, y2], ...]
  brushShadow = "drop-shadow( 2px 2px 2px rgba(0, 0, 0, .7))",
  maxDetailsRecords = 10, // How many results to show in the detail view
  maxTimelines = null, // Set to a value to limit the number of distinct timelines to show
  showGroupMedian = true, // If active show a line with the median of the enabled groups.
  medianNumBins = 10, // Number of bins used to compute the group median.
  medianLineDash = [7], // Selected group median line dash pattern canvas style
  medianLineAlpha = 1, // Selected group median line opacity
  medianLineWidth = 2, // Selected group median line width
  medianFn = d3.median, // Function to use when showing the median
  medianMinRecordsPerBin = 5, // Min number of records each bin must have to be considered
  xPartitions = 10, // Partitions performed on the X-axis for the collision acceleration algorithm.
  yPartitions = 10, // Partitions performed on the Y-axis for the collision acceleration algorithm.
  defaultAlpha = 0.7, // Default transparency (when no selection is active) of drawn lines
  selectedAlpha = 1.0, // Transparency of selected lines
  noSelectedAlpha = 0.1, // Transparency of unselected lines
  highlightAlpha = 1, // Transparency oh the highlighted lines (lines selected in other TS)
  alphaScale = d3.scalePow().exponent(0.25).range([1, 1]), // A scale to adjust the alpha by the number of rendering elements
  backgroundColor = "#ffffff",
  defaultColor = "#aaa", // Default color (when no selection is active) of the drawn lines. It only has effect when "groupAttr" is not defined.
  selectedColor = "#aaa", // Color of selected lines. It only has effect when "groupAttr" is not defined.
  noSelectedColor = "#dce0e5", // Color of unselected lines. It only has effect when "groupAttr" is not defined.
  hasDetails = false, // Determines whether detail data will be displayed or not. Disabling it saves preprocessing time if detail data is not to be displayed.
  margin = { left: 50, top: 30, bottom: 50, right: 20 },
  colorScale = d3.scaleOrdinal(d3.schemeAccent), // The color scale to be used to display the different groups defined by the "groupAttr" attribute.
  brushesColorScale = color ? d3.scaleOrdinal(d3.schemeGreys[3].reverse()) : d3.scaleOrdinal(d3.schemeTableau10), // The color scale to be used to display the brushes
  selectedColorTransform = (color, groupId) => d3.color(color).darker(groupId), // Function to be applied to the color of the selected group. It only has effect when "groupAttr" is defined.
  doubleYlegend = false, // Allows the y-axis legend to be displayed on both sides of the chart.
  showGrid = false, // If active, a reference grid is displayed.
  showBrushTooltip = true, // Allows to display a tooltip on the brushes containing its coordinates.
  autoUpdate = true, // Allows to decide whether changes in brushes are processed while moving, or only at the end of the movement.
  brushGroupSize = 15, //Controls the size of the colored rectangles used to select the different brushGroups.
  stepX = { days: 10 }, // Defines the step used, both in the spinboxes and with the arrows on the X axis.
  stepY = 1, // // Defines the step used, both in the spinboxes and with the arrows on the Y axis.
  yScale = d3.scaleLinear(),
  overviewWidth, // Legacy, to be deleted
  overviewHeight, // Legacy, to be deleted
  _this, // pass the object this in order to be able to maintain the state in case of changes in the input
  tsParent, // Set other TimeSearcher parent to connect them.
  fixAxis // When active, the axes will not change when modifying the data.
} = {}) {
  width = overviewWidth || width;
  height = overviewHeight || height;
  detailsMargin = detailsMargin || margin;

  let ts = {},
    groupedData,
    fData,
    overviewX,
    overviewY,
    divOverview,
    divRender,
    divControls,
    divData,
    divBrushesCoordinates,
    svg,
    g,
    gGroupBrushes,
    gBrushes,
    gReferences,
    line2,
    brushSpinBoxes = null,
    medianBrushGroups,
    dataSelected,
    dataNotSelected,
    renderSelected, // Selected data to render. Depends on selected DataGroup and the selection of other TS
    renderNotSelected, // Non Selected data to render. Depends on selected DataGroup and the selection of other TS
    showNonSelected, // Determines if unselected data is rendered
    selectedGroupData,
    hasScaleTime,
    nGroupsData,
    timelineDetails, // Centralizes the details component
    timelineOverview, // Centralizes the overview component
    tsElements, // Stores the HTML target of all coneceted TimeSearchers
    tsElementsSelection, // Stores the selection made by other connectedTimeSearchers
    positionTs, // Stores the position of the current TimeSearcher. 0 is the top.
    otherSelectionToHightlight, // Determines what group and certain ts level must be highlighted
    brushes;

  // Exported Parameters
  ts.xPartitions = xPartitions;
  ts.yPartitions = yPartitions;
  ts.defaultAlpha = defaultAlpha;
  ts.selectedAlpha = selectedAlpha;
  ts.noSelectedAlpha = noSelectedAlpha;
  ts.backgroundColor = backgroundColor;
  ts.defaultColor = defaultColor;
  ts.selectedColor = selectedColor;
  ts.noSelectedColor = noSelectedColor;
  ts.hasDetails = hasDetails;
  ts.margin = margin;
  ts.colorScale = colorScale;
  ts.brushesColorScale = brushesColorScale;
  ts.color = color;
  ts.doubleYlegend = doubleYlegend;
  ts.showGrid = showGrid;
  ts.showBrushTooltip = showBrushTooltip;
  ts.autoUpdate = autoUpdate;
  ts.brushGroupSize = brushGroupSize;
  ts.stepX = stepX;
  ts.stepY = stepY;
  ts.medianLineAlpha = medianLineAlpha;
  ts.medianLineWidth = medianLineWidth;
  ts.medianLineDash = medianLineDash;
  ts.medianNumBins = medianNumBins;
  ts.medianFn = medianFn;
  ts.alphaScale = alphaScale;
  ts.medianMinRecordsPerBin = medianMinRecordsPerBin;
  ts.yScale = yScale;
  ts.highlightAlpha = highlightAlpha;
  ts.selectedColorTransform = selectedColorTransform;

  //Backwards compatibility with groupAttr.
  if (groupAttr) {
    console.warn("The attribute \"groupAttr\" is deprecated use \"color\" instead");
    color = groupAttr;
  }

  // Convert attrStrings to functions
  if (typeof x === "string") {
    let _x = x;
    x = (d) => d[_x];
  }
  if (typeof y === "string") {
    let _y = y;
    y = (d) => d[_y];
  }
  if (typeof id === "string") {
    let _id = id;
    id = (d) => d[_id];
  }
  if (color && typeof color === "string") {
    let _color = color;
    color = (d) => d[_color];
  }

  const formatTime = d3.timeFormat("%Y-%m-%d");

  divOverview = d3
    .select(target)
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("position", "relative")
    .style("top", "0px")
    .style("left", "0px")
    .style("background-color", ts.backgroundColor)
    .node();

  // Listen to customEvent to connect timeSearchers
  d3.select(target).on("timeSearcher", onTimeSearcherEvent);

  divBrushesCoordinates = d3.select(coordinatesElement);
  groupsElement =
    groupsElement ||
    d3.select(target).select("#brushesGroups").node() ||
    d3.create("div").attr("id", "brushesGroups").node();
  medianBrushGroups = new Map();
  dataSelected = new Map();
  dataNotSelected = [];
  selectedGroupData = new Set();
  nGroupsData = 0;
  showNonSelected = true;
  //positionTs = 0;
  tsElementsSelection = [];

  function initBrushesControls() {
    groupsElement.innerHTML = `<div style="flex-basis:100%;">
    <ul id="brushesList">
      
    </ul>
    <button id="btnAddBrushGroup">Add Group</button>
    </div>`;

    groupsElement
      .querySelector("button#btnAddBrushGroup")
      .addEventListener("click", onAddBrushGroup);

    if (showBrushesControls) divOverview.appendChild(groupsElement);
  }

  function computeBrushColor(groupId) {
    if (positionTs !== undefined)
      return ts.brushesColorScale[groupId](positionTs);

    if (ts.brushesColorScale instanceof Array)
      return ts.brushesColorScale[groupId](positionTs);

    return ts.brushesColorScale(groupId);
  }

  function onAddBrushGroup() {
    brushes.addBrushGroup();

    //Sent event to others TS
    if (tsElements) {
      let event = new CustomEvent("timeSearcher", {
        detail: {
          type: eventType.addBrushGroup
        }
      });
      sentEvent(event);
    }
  }

  function onChangeNonSelected(newState) {
    showNonSelected = newState;

    if (tsElements) {
      let event = new CustomEvent("timeSearcher", {
        detail: {
          type: eventType.changeNonSelected,
          data: {
            newState: newState
          }
        }
      });
      sentEvent(event);
    }
  }

  function onChangeBrushGroupState(id, newState) {
    brushes.changeBrushGroupState(id, newState);

    //Sent event to ohter Ts
    if (tsElements) {
      let event = new CustomEvent("timeSearcher", {
        detail: {
          type: eventType.changeBrushGroupState,
          data: {
            id: id,
            newState: newState
          }
        }
      });
      sentEvent(event);
    }
  }

  function onRemoveBrushGroup(id) {
    brushes.removeBrushGroup(id);

    // Sent event to others TS
    if (tsElements) {
      let event = new CustomEvent("timeSearcher", {
        detail: {
          type: eventType.removeBrushGroup,
          data: id
        }
      });

      sentEvent(event);
    }
  }

  function onSelectBrushGroup(id) {
    brushes.selectBrushGroup(id);
    // Sent event to others TS
    if (tsElements) {
      let event = new CustomEvent("timeSearcher", {
        detail: {
          type: eventType.selectBrushGroup,
          data: id
        }
      });

      sentEvent(event);
    }
  }

  function onChangeSelectedBrush(brush) {
    if (tsElements) {
      if (brush) {
        let event = new CustomEvent("timeSearcher", {
          detail: {
            type: eventType.deselectAllBrushes
          }
        });
        sentEvent(event);
      }

      let event;
      if (brush) {
        event = new CustomEvent("timeSearcher", {
          detail: {
            type: eventType.highlightSelection,
            data: {
              positionTs: positionTs,
              groupId: brush[1].group
            }
          }
        });
      } else {
        event = new CustomEvent("timeSearcher", {
          detail: {
            type: eventType.highlightSelection
          }
        });
      }
      sentEvent(event);
    }
  }

  function renderBrushesControls() {
    d3.select(groupsElement)
      .select("#brushesList")
      .selectAll(".brushControl")
      .data(brushes.getBrushesGroup(), (d) => d[0])
      .join("li")
      .attr("class", "brushControl")
      .each(function (d) {
        const li = d3.select(this);
        let groupName = d[1].name;
        let groupCount = renderSelected.has(d[0])
          ? renderSelected.get(d[0]).length
          : 0;
        li.node().innerHTML = `<div style="
            display: flex;
            flex-wrap: nowrap;        
            align-items: center;
          ">
            <style>
              li #btnRemoveBrushGroup {
                display: none;
              }
              li:hover #btnRemoveBrushGroup {
                display: block;
              }
            </style>
            <input type="checkbox" id="checkBoxShowBrushGroup" ${
  d[1].isEnable ? "checked" : ""
} ></input>                        
            <div 
              id="groupColor"
              style="
              min-width: ${ts.brushGroupSize}px; 
              width: ${ts.brushGroupSize}px; 
              height: ${ts.brushGroupSize}px;
              background-color: ${computeBrushColor(d[0])};
              border-width: ${
  d[0] === brushes.getBrushGroupSelected() ? 2 : 0
}px;
              border-color: black;
              border-style: solid;
              margin-right: 5px;
              cursor: pointer;
            "></div>
            <input 
              id="groupName"
              style="margin-right: 5px; border: none;outline: none; width: ${
  groupName.length
}ch;"
              contenteditable="true" 
              value="${groupName}"></input>
            <span id="groupSize" style="margin-right: 5px;">(${groupCount})</span>
            <button style="display" id="btnRemoveBrushGroup">-</button>
          </div>
        `;

        li.select("input#groupName").on("input", function (evt) {
          // Only update the name on change

          // make the input fit the content
          d3.select(this).style("width", evt.target.value.length + "ch");
        });
        li.select("input#groupName").on("change", (evt) => {
          // make the input fit the content
          d3.select(this).style("width", evt.target.value.length + "ch");
          brushes.updateBrushGroupName(d[0], evt.target.value);
          triggerValueUpdate();
        });
        li.select("#btnRemoveBrushGroup").on("click", (event) => {
          event.stopPropagation();
          onRemoveBrushGroup(d[0]);
        });
        li.select("#checkBoxShowBrushGroup").on("click", (event) => {
          //Prevent the event from reaching the element li
          event.stopPropagation();
        });
        li.select("#checkBoxShowBrushGroup").on("change", (event) => {
          event.stopPropagation();
          onChangeBrushGroupState(d[0], event.target.checked);
          console.log(
            "Should change state of brushesGroup " + d[0],
            event.target.checked
          );
        });

        // Select only on the box and size
        li.select("div#groupColor").on("click", () => onSelectBrushGroup(d[0]));
        li.select("span#groupSize").on("click", () => onSelectBrushGroup(d[0]));
      });

    // Render the nonSelected Group always on bottom of list
    d3.select(groupsElement)
      .select("#brushesList")
      .selectAll(".nonSelectedControl")
      .remove();

    d3.select(groupsElement)
      .select("#brushesList")
      .append("li")
      .attr("class", "nonSelectedControl")
      .each(function () {
        const li = d3.select(this);
        let groupName = "Non selected";
        let groupCount = renderNotSelected.length;

        li.node().innerHTML = `<div style="
            display: flex;
            flex-wrap: nowrap;        
            align-items: center;
          ">
            <input type="checkbox" id="checkBoxShowBrushGroup" ${
  showNonSelected ? "checked" : ""
} ></input>                        
            <output 
              style="margin-right: 0px; border: none;outline: none; width: ${
  groupName.length
}ch;"
              >${groupName}</output>
            <span id="groupSize" style="margin-right: 5px;">(${groupCount})</span>
          </div>
        `;

        li.select("#checkBoxShowBrushGroup").on("change", (event) => {
          event.stopPropagation();
          onChangeNonSelected(event.target.checked);
          onSelectionChange();
        });
      });

    // Render internal brush  controls
    gGroupBrushes
      .selectAll(".colorBrushes")
      .data(brushes.getBrushesGroup(), (d) => d[0])
      .join("rect")
      .attr("class", "colorBrushes")
      .attr("id", (d) => "colorBrush-" + d[0])
      .attr("height", ts.brushGroupSize)
      .attr("width", ts.brushGroupSize)
      .attr(
        "transform",
        (d, i) => `translate(${90 + i * (ts.brushGroupSize + 5)}, -2)`
      )
      .style("stroke-width", (d) =>
        d[0] === brushes.getBrushGroupSelected() ? 2 : 0
      )
      .style("stroke", "black")
      .style("fill", (d) => computeBrushColor(d[0]))
      .on("click", function () {
        let id = d3.select(this).attr("id").substr("11");
        onSelectBrushGroup(+id);
      });
  }

  function initDomains({ xDataType, groupedData, fData }) {
    // Adjust the alpha based on the number of lines

    log("Sorting data");
    groupedData.map((d) => [
      d[0],
      d[1].sort((a, b) => d3.ascending(x(a), x(b)))
    ]);

    log("Sorting data: done");

    ts.alphaScale.domain([0, groupedData.length]);

    let domainX = fixAxis && _this ? _this.extent.x : d3.extent(fData, x); // Keep same axes as in the first rendering
    if (xDataType === "object" && x(fData[0]) instanceof Date) {
      // X is Date
      hasScaleTime = true;
      overviewX = d3
        .scaleTime()
        .domain(domainX)
        .range([0, width - ts.margin.right - ts.margin.left]);
    } else {
      // We if x is something else overviewX won't be assigned
      // if (xDataType === "number") {
      // X is number
      overviewX = d3
        .scaleLinear()
        .domain(domainX)
        .range([0, width - ts.margin.right - ts.margin.left]);
      //.nice();
    }

    let domainY = fixAxis && _this ? _this.extent.y : d3.extent(fData, y); // Keep same axes as in the first rendering

    overviewY = yScale;
    if (yScale.domain()[0] === 0 && yScale.domain()[1] === 1) { //Default Domain
      overviewY.domain(domainY);
    }

    overviewY.range([height - ts.margin.top - ts.margin.bottom, 0])
      .nice()
      .clamp(true);
  }

  function init() {
    //CreateOverView
    divControls = d3
      .select(divOverview)
      .selectAll("div#controls")
      .data([1])
      .join("div")
      .attr("id", "controls")
      .style("margin-top", `${ts.margin.top}px`);

    divData = divControls
      .selectAll("div#divData")
      .data([1])
      .join("div")
      .attr("id", "divData");

    divRender = d3
      .select(divOverview)
      .selectAll("div#render")
      .data([1])
      .join("div")
      .attr("id", "render")
      .style("position", "relative")
      .style("z-index", 1);

    timelineOverview = TimeLineOverview({
      ts,
      element: divRender.node(),
      width: width,
      height: height,
      x,
      y,
      groupAttr: color,
      overviewX,
      overviewY
    });

    svg = divRender
      .selectAll("svg")
      .data([1])
      .join("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("height", height)
      .attr("width", width);

    const g = svg
      .selectAll("g.gDrawing")
      .data([1])
      .join("g")
      .attr("class", "gDrawing")
      .attr("transform", `translate(${ts.margin.left}, ${ts.margin.top})`)
      .attr("tabindex", 0)
      .style("pointer-events", "all")
      .style("outline", "-webkit-focus-ring-color solid 0px")
      .on("keydown", (e) => {
        e.preventDefault();
        switch (e.key) {
          case "r":
          case "Backspace":
            brushes.removeSelectedBrush();
            break;
          case "+":
            onAddBrushGroup();
            break;
          case "ArrowRight":
            onArrowRigth(e);
            break;
          case "ArrowLeft":
            onArrowLeft(e);
            break;
          case "ArrowUp":
            onArrowUp(e);
            break;
          case "ArrowDown":
            onArrowDown(e);
            break;
        }
      });

    let gmainY = g
      .selectAll("g.mainYAxis")
      .data([1])
      .join("g")
      .attr("class", "mainYAxis")
      .call(d3.axisLeft(overviewY))
      .call((axis) =>
        axis
          .selectAll("text.label")
          .data([1])
          .join("text")
          .text(yLabel)
          .attr("dy", -15)
          .attr("class", "label")
          .style("fill", "black")
          .style("text-anchor", "end")
          .style("pointer-events", "none")
      )
      .style("pointer-events", "none");

    if (ts.doubleYlegend) {
      g.selectAll("g.secondYaxis")
        .data([1])
        .join("g")
        .attr("class", "secondYaxis")
        .call(d3.axisRight(overviewY))
        .attr(
          "transform",
          `translate(${width - ts.margin.left - ts.margin.right},0)`
        )
        .style("pointer-events", "none");
    }

    let gmainx = g
      .selectAll("g.mainXAxis")
      .data([1])
      .join("g")
      .attr("class", "mainXAxis")
      .call(d3.axisBottom(overviewX))
      .attr(
        "transform",
        `translate(0, ${height - ts.margin.top - ts.margin.bottom})`
      )
      .call((axis) =>
        axis
          .selectAll("text.label")
          .data([1])
          .join("text")
          .attr("class", "label")
          .text(xLabel)
          .attr(
            "transform",
            `translate(${width - ts.margin.right - ts.margin.left - 5}, -10 )`
          )
          .style("fill", "black")
          .style("text-anchor", "end")
          .style("pointer-events", "none")
      )
      .style("pointer-events", "none");

    gReferences = g
      .selectAll("g.gReferences")
      .data([1])
      .join("g")
      .attr("class", "gReferences")
      .style("pointer-events", "none");

    gmainY
      .selectAll("g.tick")
      .selectAll(".gridline")
      .data(ts.showGrid ? [1] : [])
      .join("line")
      .attr("class", "gridline")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", width - ts.margin.right - ts.margin.left)
      .attr("y2", 0)
      .attr("stroke", "#9ca5aecf") // line color
      .attr("stroke-dasharray", "4"); // make it dashed;;

    gmainx
      .selectAll("g.tick")
      .selectAll(".gridline")
      .data(ts.showGrid ? [1] : [])
      .join("line")
      .attr("class", "gridline")
      .attr("x1", 0)
      .attr("y1", -height + ts.margin.top + ts.margin.bottom)
      .attr("x2", 0)
      .attr("y2", 0)
      .attr("stroke", "#9ca5aecf") // line color
      .attr("stroke-dasharray", "4"); // make it dashed;

    if (color) {
      fData.forEach((d) => selectedGroupData.add(color(d)));
      nGroupsData = selectedGroupData.size;
    }

    gGroupBrushes = svg
      .selectAll("g.colorBrushes")
      .data([1])
      .join("g")
      .attr("class", "colorBrushes")
      .attr(
        "transform",
        `translate(${ts.margin.left + 10},${
          ts.margin.top - ts.brushGroupSize - 5
        } )`
      );

    // TODO John: We might want to move this into brushInteraction
    gBrushes = g
      .selectAll("g#brushes")
      .data([1])
      .join("g")
      .attr("id", "brushes");

    brushes = brushInteraction({
      ts,
      element: gBrushes.node(),
      data: groupedData,
      tooltipTarget: divRender.node(),
      contextMenuTarget: divRender.node(),
      width,
      height,
      xPartitions,
      yPartitions,
      x,
      y,
      brushShadow,
      fmtX,
      fmtY,
      scaleX: overviewX,
      scaleY: overviewY,
      updateTime: 150,
      tsLevel: positionTs,
      selectionCallback: onSelectionChange,
      groupsCallback: onBrushGroupsChange,
      changeSelectedCoordinatesCallback: updateBrushSpinBox,
      selectedBrushCallback: onChangeSelectedBrush
    });

    gGroupBrushes
      .selectAll("text")
      .data([1])
      .join("text")
      .attr("x", 0)
      .attr("y", ts.brushGroupSize / 2 + 2)
      .text("Groups + : ")
      .style("cursor", "pointer")
      .on("click", onAddBrushGroup);

    initBrushesControls();

    return g;
  }

  // Callback that is called every time the coordinates of the selected brush are modified.
  function updateBrushSpinBox(selection) {
    if (selection) {
      let [[x0, y0], [x1, y1]] = selection;

      // When initializing the brushes the spinbox is not ready
      if (brushSpinBoxes) {
        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        sx0.node().value = hasScaleTime ? formatTime(x0) : fmtX(x0);
        sx1.node().value = hasScaleTime ? formatTime(x1) : fmtX(x1);
        sy0.node().value = fmtY(y1).replace("\u2212", "-"); // Change D3 minus sign to parseable minus
        sy1.node().value = fmtY(y0).replace("\u2212", "-");
      } else {
        log(
          "updateBrushSpinBox called, but brushSpinBoxes not ready ",
          brushSpinBoxes
        );
      }
    } else {
      emptyBrushSpinBox();
    }
  }

  function emptyBrushSpinBox() {
    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    sx0.node().value = "";
    sx1.node().value = "";
    sy0.node().value = "";
    sy1.node().value = "";
  }

  function generateBrushCoordinatesDiv() {
    divBrushesCoordinates.node().innerHTML = "";
    let divX = divBrushesCoordinates.append("div");

    divX.append("span").text(xLabel);

    let divInputX = divX.append("div");

    let domainX = overviewX.domain();
    let x0 = divInputX
      .append("input")
      .attr("type", hasScaleTime ? "Date" : "number")
      .attr("min", hasScaleTime ? formatTime(domainX[0]) : domainX[0])
      .attr("max", hasScaleTime ? formatTime(domainX[1]) : domainX[1])
      .attr("step", ts.stepX)
      .attr("width", "50%")
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    let x1 = divInputX
      .append("input")
      .attr("type", hasScaleTime ? "Date" : "number")
      .attr("min", hasScaleTime ? formatTime(domainX[0]) : domainX[0])
      .attr("max", hasScaleTime ? formatTime(domainX[1]) : domainX[1])
      .attr("width", "50%")
      .attr("step", ts.stepX)
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    let divY = divBrushesCoordinates.append("div");

    divY.append("span").text(yLabel);

    let divInputY = divY.append("div");

    let domainY = overviewY.domain();

    let y0 = divInputY
      .append("input")
      .attr("type", "number")
      .attr("min", domainY[0])
      .attr("max", domainY[1])
      .attr("width", "50%")
      .attr("step", ts.stepY)
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    let y1 = divInputY
      .append("input")
      .attr("type", "number")
      .attr("min", domainY[0])
      .attr("max", domainY[1])
      .attr("width", "50%")
      .attr("step", ts.stepY)
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    brushSpinBoxes = [
      [x0, y0],
      [x1, y1]
    ];
  }

  function generateDataSelectionDiv() {
    if (color) {
      divData.node().innerHTML = "";
      divData.append("span").text("Data groups: ");

      let divButtons = divData
        .selectAll(".groupData")
        .data(selectedGroupData)
        .join("div")
        .attr("class", "groupData");
      divButtons
        .append("button")
        .style("font-size", `${ts.brushGroupSize}px`)
        .style("stroke", "black")
        .style("margin", "2px")
        .style("margin-right", "10px")
        .style("border-width", "3px")
        .style("border", "solid black")
        .style("width", `${ts.brushGroupSize}px`)
        .style("height", `${ts.brushGroupSize}px`)
        .style("background-color", (d) => ts.colorScale(d))
        .on("click", function (event, d) {
          if (selectedGroupData.has(d)) {
            selectedGroupData.delete(d);
            d3.select(this).style("border", "solid transparent");
          } else {
            selectedGroupData.add(d);
            d3.select(this).style("border", "solid black");
          }

          onGroupDataChange();
        });
      divButtons.append("span").text((d) => d);
    }
  }

  // Filter dataSelected and dataNotSelected by enable dataGroups
  function filterDatabyDataGroups(dataSelected, dataNotSelected) {
    let dataSelectedF = new Map(dataSelected);
    let dataNotSelectedF = dataNotSelected;
    for (let d of dataSelectedF) {
      let filtered = d[1].filter((d) =>
        selectedGroupData.has(color(d[1][0]))
      );
      dataSelectedF.set(d[0], filtered);
    }
    dataNotSelectedF = dataNotSelectedF.filter((d) =>
      selectedGroupData.has(color(d[1][0]))
    );

    return [dataSelectedF, dataNotSelectedF];
  }

  // Called when the active dataGroups are modified.
  function onGroupDataChange() {
    onSelectionChange();
  }

  function initDetails({ xDataType, fData }) {
    if (ts.hasDetails) {
      // see if already exists and element and reutilize it, if not create new div
      if (!detailsElement) {
        detailsElement =
          d3.select(target).select("#details").node() ||
          d3.create("div").attr("id", "#details").node();
      }

      // TimelineDetails object
      timelineDetails = TimelineDetails({
        ts,
        detailsElement,
        detailsContainerHeight,
        detailsWidth,
        maxDetailsRecords,
        detailsHeight,
        x,
        y,
        margin: detailsMargin
      });
    }

    ts.hasDetails && timelineDetails.setScales({ xDataType, fData });
  }

  // Callback that is called when the value of the spinboxes is modified.
  function onSpinboxChange(sourceEvent) {
    let selectedBrush = brushes.getSelectedBrush();
    if (selectedBrush === null) return;

    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    let domainX = overviewX.domain();

    let x0;
    let x1;
    let y0 = +sy1.node().value;
    let y1 = +sy0.node().value;

    if (hasScaleTime) {
      x0 = new Date(sx0.node().value);
      x1 = new Date(sx1.node().value);
      if (x0 >= x1) {
        if (sourceEvent.target === sx0.node()) {
          x1 = add(x0, ts.stepX);
          x1 = Math.min(x1, domainX[1]);
          sx1.node().value = formatTime(x1);
        } else {
          x0 = sub(x1, ts.stepX);
          x0 = Math.max(x0, domainX[0]);
          sx0.node().value = formatTime(x0);
        }
      }

    } else {
      let x0 = +sx0.node().value;
      let x1 = +sx1.node().value;

      if (x0 >= x1) {
        if (sourceEvent.target === sx0.node()) {
          x1 = x0 + ts.stepX;
          sx1.node().value = x1;
        } else {
          x0 = x1 - ts.stepX;
          sx0.node().value = x0;
        }
      }
    }

    if (y1 >= y0) {
      if (sourceEvent.target === sy0.node()) {
        y0 = y1 + ts.stepY;
        sy1.node().value = y0;
      } else {
        y1 = y0 - ts.stepY;
        sy0.node().value = y1;
      }

    }

    brushes.moveSelectedBrush([
      [x0, y0],
      [x1, y1]
    ]);
  }

  function onArrowRigth() {
    let selectedBrush = brushes.getSelectedBrush();
    if (selectedBrush === null) return;

    let [[x0, y0], [x1, y1]] = selectedBrush[1].selectionDomain;

    let maxX = overviewX.domain()[1];

    if (hasScaleTime) {
      x1 = add(x1, ts.stepX);
      if (x1 > maxX) {
        x1 = sub(x1, ts.stepX);
        let dist = intervalToDuration({ start: x1, end: maxX });
        x1 = maxX;
        x0 = add(x0, dist);
      } else {
        x0 = add(x0, ts.stepX);
      }
    } else {
      x1 += ts.stepX;
      if (x1 > maxX) {
        let dist = maxX - x1 + ts.stepX;
        x1 = maxX;
        x0 -= dist;
      } else {
        x0 += ts.stepX;
      }
    }

    brushes.moveSelectedBrush([
      [x0, y0],
      [x1, y1]
    ], true);
  }

  function onArrowLeft() {
    let selectedBrush = brushes.getSelectedBrush();
    if (selectedBrush === null) return;

    let [[x0, y0], [x1, y1]] = selectedBrush[1].selectionDomain;

    let minX = overviewX.domain()[0];

    if (hasScaleTime) {
      x0 = sub(x0, ts.stepX);
      if (x0 < minX) {
        x0 = add(x0, ts.stepX);
        let dist = intervalToDuration({ start: minX, end: x0 });
        x0 = minX;
        x1 = sub(x1, dist);
      } else {
        x1 = sub(x1, ts.stepX);
      }
    } else {
      x0 -= ts.stepX;
      if (x0 < minX) {
        let dist = x0 + ts.stepX - minX;
        x0 = minX;
        x1 -= dist;
      } else {
        x1 -= ts.stepX;
      }
    }

    brushes.moveSelectedBrush([
      [x0, y0],
      [x1, y1]
    ], true);
  }

  function onArrowDown() {
    let selectedBrush = brushes.getSelectedBrush();
    if (selectedBrush === null) return;

    let [[x0, y0], [x1, y1]] = selectedBrush[1].selectionDomain;

    y1 -= ts.stepY;

    let minY = overviewY.domain()[0];

    if (y1 < minY) {
      let dist = y1 + ts.stepY - minY;
      y1 = minY;
      y0 -= dist;
    } else {
      y0 -= ts.stepY;
    }
    brushes.moveSelectedBrush([
      [x0, y0],
      [x1, y1]
    ], true);
  }

  function onArrowUp() {
    let selectedBrush = brushes.getSelectedBrush();
    if (selectedBrush === null) return;

    let [[x0, y0], [x1, y1]] = selectedBrush[1].selectionDomain;

    y0 += ts.stepY;

    let maxY = overviewY.domain()[1];

    if (y0 > maxY) {
      let dist = maxY - y0 + ts.stepY;
      y0 = maxY;
      y1 += dist;
    } else {
      y1 += ts.stepY;
    }

    brushes.moveSelectedBrush([
      [x0, y0],
      [x1, y1]
    ], true);
  }

  // To render the overview and detailed view based on the selectedData
  function render(dataSelected, dataNotSelected, hasSelection) {
    // Prepare the medians array to print ( only the enable groups)
    let medians = [];
    let enableBrushGroups = brushes.getEnableGroups();
    enableBrushGroups.forEach((id) => {
      if (medianBrushGroups.has(id)) {
        medians.push([id, medianBrushGroups.get(id)]);
      }
    });

    // Decide which elements are painted as selected or not, depending on the enable groups.
    let mDataSelected = new Map();
    let mDataNotSelected = new Set(dataNotSelected);
    dataSelected.forEach((g, i) => {
      if (enableBrushGroups.has(i)) {
        mDataSelected.set(i, g);
      } else {
        g.forEach((d) => mDataNotSelected.add(d));
      }
    });

    // Delete the groupsNotSelected in otherTs selection
    let mTsElementSelection = [];
    if (tsElementsSelection) {
      tsElementsSelection.forEach((tsSelection) => {
        if (!tsSelection) mTsElementSelection.push(null);
        else {
          let groupsSelected = new Map();
          tsSelection.forEach((dataGroup, gId) => {
            if (enableBrushGroups.has(gId)) groupsSelected.set(gId, dataGroup);
          });
          mTsElementSelection.push(groupsSelected);
        }
      });
    }

    // Delete the notSelected elements that are selected.
    mDataSelected.forEach((d) => mDataNotSelected.delete(d));
    dataNotSelected = Array.from(mDataNotSelected);

    timelineOverview.render(
      mDataSelected,
      brushes.getBrushGroupSelected(),
      showNonSelected ? dataNotSelected : [],
      medians,
      hasSelection,
      mTsElementSelection, // print the selections made by child Elements
      positionTs,
      otherSelectionToHightlight
    );

    if (ts.hasDetails) {
      let brushGroupSelected = brushes.getBrushGroupSelected();
      window.requestAnimationFrame(() =>
        timelineDetails.render({ data: dataSelected, brushGroupSelected })
      );
      // window.requestAnimationFrame(() => renderDetailsCanvas(dataSelected));
    }
  }

  function getBrushGroupsMedians(data) {
    if (!brushes.hasSelection()) return;
    // TODO use d3.bin()
    let minX = +overviewX.domain()[0];
    let maxX = +overviewX.domain()[1];

    let binW = (maxX - minX) / ts.medianNumBins;

    // log(
    //   "getBrushGroupsMedians: number of bins",
    //   ts.medianNumBins,
    //   " binW ",
    //   binW,
    //   minX,
    //   maxX
    // );

    for (let g of data.entries()) {
      let id = g[0];

      let bins = [];
      let cx = minX;
      for (let i = 0; i < ts.medianNumBins; ++i) {
        bins.push({
          x0: cx,
          x1: cx + binW,
          data: []
        });
        cx += binW;
      }
      for (let line of g[1]) {
        for (let point of line[1]) {
          let i = Math.floor((x(point) - minX) / binW);
          i = i > ts.medianNumBins - 1 ? i - 1 : i;
          bins[i].data.push(y(point));
        }
      }

      let median = [];
      for (let bin of bins) {
        if (bin.data.length >= ts.medianMinRecordsPerBin) {
          let x = bin.x0 + (bin.x1 - bin.x0) / 2;
          let y = ts.medianFn(bin.data);
          median.push([x, y]);
        }
      }
      medianBrushGroups.set(id, median);
    }

    log(" Bins computed", medianBrushGroups);
  }

  // Callback that is called each time the selection made by the brushes is modified.
  function onSelectionChange(
    newDataSelected = dataSelected,
    newDataNotSelected = dataNotSelected,
    hasSelection = brushes.hasSelection(),
    update = true
  ) {
    dataSelected = newDataSelected;
    dataNotSelected = newDataNotSelected;

    // Filter data with active dataGroups
    if (color) {
      [renderSelected, renderNotSelected] = filterDatabyDataGroups(
        dataSelected,
        dataNotSelected
      );
    } else {
      renderSelected = dataSelected;
      renderNotSelected = dataNotSelected;
    }

    if (tsElements) {
      ({ renderSelected, renderNotSelected } = filterByExternalSelected(
        renderSelected,
        renderNotSelected
      ));
    }

    // Compute the medians if needed
    if (showGroupMedian) {
      getBrushGroupsMedians(renderSelected);
    }

    render(renderSelected, renderNotSelected, hasSelection); // Print the filtered data by active dataGroups

    renderBrushesControls();
    triggerValueUpdate(renderSelected);
    sentSelection(renderSelected, update);
  }

  // Function called to recreate the selection when dataInput change.
  function recreateBrushes(_this) {
    brushes.recreate(_this.brushGroups);
    sentSelection(renderSelected, true);
  }

  // Called every time the brushGroups changes
  function onBrushGroupsChange() {
    render(renderSelected, renderNotSelected, brushes.hasSelection());
    renderBrushesControls();
  }

  function updateStatus() {
    // TODO
    /* // exportColors
    let colors = [];
    for (let i of ts.colorScale.domain()) {
      colors.push({ value: i, color: ts.colorScale(i) });
    }
    //Export brushes
    let brushGroups = [];
    brushesGroup.forEach((d, i) => {
      let brushes = [];
      d.forEach((d) => {
        if (d.selection) brushes.push(d.selection);
      });
      brushGroups.push({ color: ts.brushesColorScale(i), brushes: brushes });
    });

    statusCallback({ colors: colors, brushGroups: brushGroups }); */
  }

  // Triggers the update of the selection calls callback and dispatches input event
  function triggerValueUpdate(sel = renderSelected) {
    let value = new Map();
    let status = new Map();

    for (let [id, brushGroup] of brushes.getBrushesGroup()) {
      let groupMap = new Map();
      sel.get(id).forEach(d => groupMap.set(d[0], d[1]));
      value.set(brushGroup.name, groupMap);

      let Gstatus = {
        id: id,
        name: brushGroup.name,
        isActive: brushGroup.isActive,
        isEnable: brushGroup.isEnable,
        brushes: brushGroup.brushes
      };
      status.set(brushGroup.name, Gstatus);
    }

    statusCallback(value);

    divOverview.value = value;
    divOverview.value.nonSelectedIds = dataNotSelected.map(d => d[0]);
    divOverview.value.status = status;
    divOverview.extent = {
      x: overviewX.domain(),
      y: overviewY.domain()
    };
    divOverview.brushGroups = brushes.getBrushesGroup();
    divOverview.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function sentSelection(selection, update) {
    //if (brushes.hasSelection()) {
    let eventSelection = new CustomEvent("timeSearcher", {
      detail: {
        type: eventType.changeSelection,
        data: brushes.hasSelection() ? selection : null
      }
    });

    sentEvent(eventSelection);

    if (update) {
      let eventUpdate = new CustomEvent("timeSearcher", {
        detail: {
          type: eventType.update
        }
      });
      sentEvent(eventUpdate);
    }

    render(renderSelected, renderNotSelected, brushes.hasSelection());
    //}
  }

  // Send a customEvent to all TimeSearchers but the sender
  function sentEvent(customEvent) {
    customEvent.detail.sourceId = positionTs;
    if (!tsElements) return;

    tsElements.forEach((otherTs, id) => {
      if (id !== positionTs) otherTs.dispatchEvent(customEvent);
    });
  }

  function onTimeSearcherEvent(event) {
    let eventData = event.detail;
    log(
      "customEvent",
      "destination",
      positionTs,
      "source",
      eventData.sourceId,
      eventData.type
    );
    switch (eventData.type) {
      case eventType.changeSelection:
        tsElementsSelection[eventData.sourceId] = eventData.data;
        break;
      case eventType.update:
        onUpdateEvent(eventData.sourceId, eventData.data);
        break;
      case eventType.addBrushGroup:
        brushes.addBrushGroup();
        break;
      case eventType.removeBrushGroup:
        brushes.removeBrushGroup(eventData.data);
        break;
      case eventType.selectBrushGroup:
        brushes.selectBrushGroup(eventData.data);
        break;
      case eventType.changeBrushGroupState:
        brushes.changeBrushGroupState(
          eventData.data.id,
          eventData.data.newState
        );
        break;
      case eventType.deselectAllBrushes:
        brushes.deselectBrush();
        break;
      case eventType.highlightSelection:
        if (eventData.data) {
          otherSelectionToHightlight = {
            positionTs: eventData.data.positionTs,
            groupId: eventData.data.groupId
          };
        } else {
          otherSelectionToHightlight = null;
        }
        render(renderSelected, renderNotSelected, brushes.hasSelection());
        break;
      case eventType.changeNonSelected:
        showNonSelected = eventData.data.newState;
        onSelectionChange();
        break;
      default:
        log("unsupported event", eventData);
    }
  }

  function onUpdateEvent(tsId) {
    // Only update the selection of the children, the parents only repaint
    if (positionTs <= tsId) {
      render(renderSelected, renderNotSelected, brushes.hasSelection());
    } else {
      onSelectionChange(
        dataSelected,
        dataNotSelected,
        brushes.hasSelection(),
        false
      );
    }
  }

  function changeBrushNames() {
    if (tsElements) {
      let groups = brushes.getBrushesGroup();
      groups.forEach((group, id) => {
        brushes.updateBrushGroupName(id, group.name + "." + positionTs);
      });
    }
  }

  function filterByExternalSelected(dataSelected, dataNotSelected) {
    if (!tsElementsSelection || positionTs === 0) {
      return {
        renderSelected: dataSelected,
        renderNotSelected: dataNotSelected
      };
    }

    /*
    // compute a map that contains the data Ids selected in upper levels by brushGroups
    let flatSelections = new Map();
    tsElementsSelection.forEach((tsSelection, ix) => {
      if (positionTs > ix) {
        tsSelection.forEach((g, gId) => {
          if (!flatSelections.has(gId)) {
            flatSelections.set(gId, new Set());
          }
          g.forEach((d) => flatSelections.get(gId).add(d[0]));
        });
      }
    }); */

    let allSelected = new Set();
    let previousSelected = new Map();

    // Find the closes TS with selection made
    let lastWithSelection;
    for (let i = positionTs - 1; i >= 0; i--) {
      if (tsElementsSelection[i]) {
        lastWithSelection = i;
        break;
      }
    }
    // Filter with the last selection made.
    if (lastWithSelection !== undefined) {
      // to this beacuse if(0) is false
      tsElementsSelection[lastWithSelection].forEach((g, gId) => {
        let selectedSet = new Set();
        g.forEach((d) => {
          selectedSet.add(d[0]);
          allSelected.add(d[0]);
        });
        previousSelected.set(gId, selectedSet);
      });

      let fDataSelected = new Map();
      dataSelected.forEach((g, id) => {
        if (previousSelected.has(id)) {
          let gFilter = g.filter((d) => previousSelected.get(id).has(d[0]));
          fDataSelected.set(id, gFilter);
        } else {
          fDataSelected.set(id, g);
        }
      });

      let fDataNotSelected = dataNotSelected.filter((d) =>
        allSelected.has(d[0])
      );
      return {
        renderSelected: fDataSelected,
        renderNotSelected: fDataNotSelected
      };
    } else {
      return {
        renderSelected: dataSelected,
        renderNotSelected: dataNotSelected
      };
    }
  }

  /*function brushesToDomain(brushesGroup) {
    let selectedBrush = brushes.getSelectedBrush();
    let outMap = new Map();
    for (let brushGroup of brushesGroup.entries()) {
      let innerMap = new Map();
      for (let brush of brushGroup[1].entries()) {
        if (brush[1].selection !== null) {
          let nBrush = Object.assign({}, brush[1]);

          // pixels
          let [[x0, y0], [x1, y1]] = brush[1].selection;
          nBrush.selectionPixels = [
            [x0, y0],
            [x1, y1],
          ];

          // data domain
          let [[xi0, yi0], [xi1, yi1]] = brush[1].selection.map(([x, y]) => [
            overviewX.invert(x),
            overviewY.invert(y),
          ]);
          nBrush.selection = [
            [xi0, yi0],
            [xi1, yi1],
          ];

          nBrush.isActive = !!selectedBrush && selectedBrush[0] === brush[0];

          innerMap.set(brush[0], nBrush);
        }
      }
      outMap.set(brushGroup[0], innerMap);
    }
    return outMap;
  } */

  ts.addReferenceCurves = function (curves) {
    if (!Array.isArray(curves)) {
      throw new Error("The reference curves must be an array of Objects");
    }

    curves.forEach((c) => {
      let [xmin, xmax] = overviewX.domain();
      let [ymin, ymax] = overviewY.domain();
      c.data = c.data.filter((point) => {
        return (
          point[0] <= xmax &&
          point[0] >= xmin &&
          point[1] <= ymax &&
          point[1] >= ymin
        );
      });
    });

    let line2 = d3
      .line()
      .defined((d) => d[1] !== undefined && d[1] !== null)
      .x((d) => overviewX(d[0]))
      .y((d) => overviewY(d[1]));

    gReferences
      .selectAll(".referenceCurve")
      .data(curves)
      .join("path")
      .attr("class", "referenceCurve")
      .attr("d", (c) => line2(c.data))
      .attr("stroke-width", 2)
      .style("fill", "none")
      .style("stroke", (c) => c.color)
      .style("opacity", (c) => c.opacity);
  };

  ts.updateCallback = function (_) {
    return arguments.length ? ((updateCallback = _), ts) : updateCallback;
  };

  ts.statusCallback = function (_) {
    return arguments.length ? ((statusCallback = _), ts) : statusCallback;
  };

  // Notify a parent timeSearcher the presence of a child, and calculate the total
  // TimeSearcher linked and the position of each of them.
  ts.notifyParent = function (linkedTs, childs) {
    linkedTs.unshift(target);
    if (tsParent) tsElements = tsParent.notifyParent(linkedTs, childs + 1);
    else tsElements = linkedTs;

    positionTs = tsElements.length - 1 - childs;

    if (brushes) brushes.setTsPosition(positionTs);
    if (groupedData) sentSelection(renderSelected, false);

    return tsElements;
  };

  ts.data = function (_data) {
    data = _data;
    log(" Processing data: ... ", data.length);
    // Ignore null values. Shouldn't be y(d) && x(d) because y(d) can be 0
    fData = data.filter(
      (d) =>
        y(d) !== undefined &&
        y(d) !== null &&
        x(d) !== undefined &&
        x(d) !== null
    );
    /* log(
      `Processing data: done filtering ${fData.length} left out of ${data.length}`
    );*/
    groupedData = d3.groups(fData, id);
    /*log(
      `Processing data: grouping done ${groupedData.length} timelines out of ${data.length} records`
    );*/

    // Limit the number of timelines
    if (maxTimelines) groupedData = groupedData.slice(0, maxTimelines);

    let xDataType = typeof x(fData[0]);

    initDomains({ xDataType, fData, groupedData });

    line2 = d3
      .line()
      .defined((d) => y(d) !== undefined && y(d) !== null)
      .x((d) => overviewX(+x(d)))
      .y((d) => overviewY(y(d)));

    g = init();

    timelineOverview.setScales({
      scaleX: overviewX,
      scaleY: overviewY
    });
    timelineOverview.data(groupedData);

    generateDataSelectionDiv();
    generateBrushCoordinatesDiv();

    initDetails({ xDataType, fData });

    dataSelected.set(0, []);
    renderSelected = dataSelected;
    dataNotSelected = groupedData;
    renderNotSelected = dataNotSelected;

    if (_this) recreateBrushes(_this);

    onSelectionChange();
    //render(renderSelected, renderNotSelected, brushes.hasSelection());
    //renderBrushesControls();
    //triggerValueUpdate(new Map().set(0, groupedData));

    // Create initial filters
    if (filters && filters.length > 0) brushes.addFilters(filters);

    // Change brushName if multiple TS TODO
    // changeBrushNames();
  };

  if (tsParent) {
    ts.notifyParent([], 0);
    // Add the own selection
    tsElementsSelection[positionTs] = null;
  }

  // If we receive the data on initialization call ts.Data
  if (data) {
    ts.data(data);
  }

  if (referenceCurves) {
    ts.addReferenceCurves(referenceCurves);
  }

  // To allow a message from the outside to rerender
  ts.render = () => {
    // render(dataSelected, dataNotSelected);
    onSelectionChange();
  };

  // Remove possible previous event listener
  //target.removeEventListener("timeSearcher", onTimeSearcherEvent);

  // Make the ts object accesible
  divOverview.ts = ts;
  divOverview.details = detailsElement;
  divOverview.brushesCoordinates = divBrushesCoordinates.node();
  divOverview.groups = groupsElement;
  return divOverview;
}

export default TimeSearcher;
