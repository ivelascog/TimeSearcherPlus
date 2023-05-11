import * as d3 from "d3";
import { add, intervalToDuration, sub } from "date-fns";

import { log } from "./utils.js";

import TimelineDetails from "./TimelineDetails.js";
import TimeLineOverview from "./TimeLineOverview";
import brushInteraction from "./BrushInteraction";

function TimeSearcher({
  // John TODO: Let's change everything to Observable's style TimeSearcher(data, { width, etc})
  data,
  target = document.createElement("div"), // pass a html element where you want to render
  detailsElement, // pass a html element where you want to render the details
  brushCoordinatesElement = document.createElement("div"), // pass a html element where you want to render the brush coordinates Input.
  brushesControlsElement = document.createElement("div"), // pass a html element where you want to have the brushes controls.
  showBrushesControls = true, // If false you can still use brushesControlsElement to show the control on a different element on your app
  x = (d) => d.x, // Attribute to show in the X axis (Note that it also supports functions)
  y = (d) => d.y, // Attribute to show in the Y axis (Note that it also supports functions)
  id = (d) => d.id, // Attribute to group the input data (Note that it also supports functions)
  groupAttr = null, // Specifies the attribute to be used to discriminate the groups (Note that it also supports functions).
  width = 1200, // Set the desired width of the overview Widget
  detailsWidth = 400, // Set the desired width of the details Widget
  height = 600, // Set the desired height of the overview Widget
  detailsHeight = 300, // Set the desired height of the overview Widget
  detailsContainerHeight = 400,
  detailsMargin = null, // Margin options for details view, d3 common format, leave null for using the overview margin
  updateCallback = (data) => {},
  statusCallback = (status) => {},
  fmtX = d3.timeFormat("%d/%m/%y"), // Function, how to format x points in the tooltip
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
  defaultAlpha = 1, // Default transparency (when no selection is active) of drawn lines
  selectedAlpha = 1, // Transparency of selected lines
  noSelectedAlpha = 0.6, // Transparency of unselected lines
  alphaScale = d3.scalePow().exponent(0.25).range([1, 1]), // A scale to adjust the alpha by the number of rendering elements
  backgroundColor = "#ffffff",
  defaultColor = "#aaa", // Default color (when no selection is active) of the drawn lines. It only has effect when "groupAttr" is not defined.
  selectedColor = "#aaa", // Color of selected lines. It only has effect when "groupAttr" is not defined.
  noSelectedColor = "#dce0e5", // Color of unselected lines. It only has effect when "groupAttr" is not defined.
  hasDetails = false, // Determines whether detail data will be displayed or not. Disabling it saves preprocessing time if detail data is not to be displayed.
  margin = { left: 50, top: 30, bottom: 50, right: 20 },
  colorScale = d3.scaleOrdinal(d3.schemeAccent), // The color scale to be used to display the different groups defined by the "groupAttr" attribute.
  brushesColorScale = d3.scaleOrdinal(d3.schemeCategory10), // The color scale to be used to display the brushes
  doubleYlegend = false, // Allows the y-axis legend to be displayed on both sides of the chart.
  showGrid = false, // If active, a reference grid is displayed.
  showBrushTooltip = true, // Allows to display a tooltip on the brushes containing its coordinates.
  autoUpdate = true, // Allows to decide whether changes in brushes are processed while moving, or only at the end of the movement.
  brushGroupSize = 15, //Controls the size of the colored rectangles used to select the different brushGroups.
  stepX = { days: 10 }, // Defines the step used, both in the spinboxes and with the arrows on the X axis.
  stepY = 1, // // Defines the step used, both in the spinboxes and with the arrows on the Y axis.
  yScale = d3.scaleLinear,
  overviewWidth, // Legacy, to be deleted
  overviewHeight, // Legacy, to be deleted
  _this,
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
    divDetails,
    divBrushesCoordinates,
    svg,
    g,
    gGroupBrushes,
    gBrushes,
    gReferences,
    line2,
    brushSpinBoxes,
    medianBrushGroups,
    dataSelected,
    dataNotSelected,
    dataSelectedGroupData, // Stores the selected data filtered with active dataGroups
    dataNotSelectedGroupData, // Stores the not-selected data filtered with active dataGroups
    gGroupData,
    selectedGroupData,
    hasScaleTime,
    nGroupsData,
    timelineDetails, // Centralizes the details component
    timelineOverview, // Centralizes the overview component
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
  ts.groupAttr = groupAttr;
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
  if (groupAttr && typeof groupAttr === "string") {
    let _groupAttr = groupAttr;
    groupAttr = (d) => d[_groupAttr];
  }

  divOverview = d3
    .select(target)
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("position", "relative")
    .style("top", "0px")
    .style("left", "0px")
    .style("background-color", ts.backgroundColor)
    .node();

  divBrushesCoordinates = d3.select(brushCoordinatesElement);
  brushesControlsElement = brushesControlsElement || d3.create("div");
  medianBrushGroups = new Map();
  dataSelected = new Map();
  dataNotSelected = [];
  if (groupAttr) dataNotSelectedGroupData = [];
  selectedGroupData = new Set();
  nGroupsData = 0;

  function initBrushesControls() {
    brushesControlsElement.innerHTML = `<div id="brushesGroups" style="flex-basis:100%;">
    <h3>Groups</h3>
    <ul id="brushesList">
      
    </ul>
    <button id="btnAddBrushGroup">Add Group</button>
    </div>`;

    brushesControlsElement
      .querySelector("button#btnAddBrushGroup")
      .addEventListener("click", brushes.addBrushGroup);

    if (showBrushesControls) divOverview.appendChild(brushesControlsElement);
  }

  function renderBrushesControls() {
    d3.select(brushesControlsElement)
      .select("#brushesList")
      .selectAll(".brushControl")
      .data(brushes.getBrushesGroup(), (d) => d[0])
      .join("li")
      .attr("class", "brushControl")
      .each(function (d) {
        const li = d3.select(this);
        let groupName = d[1].name;
        let groupCount = dataSelected.has(d[0])
          ? dataSelected.get(d[0]).length
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
              background-color: ${ts.brushesColorScale(d[0])};
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
        });
        li.select("#btnRemoveBrushGroup").on("click", (event) => {
          event.stopPropagation();
          brushes.removeBrushGroup(d[0]);
        });
        li.select("#checkBoxShowBrushGroup").on("click", (event) => {
          //Prevent the event from reaching the element li
          event.stopPropagation();
        });
        li.select("#checkBoxShowBrushGroup").on("change", (event) => {
          event.stopPropagation();
          brushes.changeBrushGroupState(d[0], event.target.checked);
          console.log(
            "Should change state of brushesGroup " + d[0],
            event.target.checked
          );
        });

        // Select only on the box and size
        li.select("div#groupColor").on("click", () =>
          brushes.selectBrushGroup(d[0])
        );
        li.select("span#groupSize").on("click", () =>
          brushes.selectBrushGroup(d[0])
        );
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
      .style("fill", (d) => ts.brushesColorScale(d[0]))
      .on("click", function () {
        let id = d3.select(this).attr("id").substr("11");
        brushes.selectBrushGroup(+id);
      });
  }

  function initDomains({ xDataType, groupedData, fData }) {
    // Adjust the alpha based on the number of lines

    log("Sorting data");
    groupedData.map((d) => [
      d[0],
      d[1].sort((a, b) => d3.ascending(x(a), x(b))),
    ]);

    log("Sorting data: done");

    ts.alphaScale.domain([0, groupedData.length]);

    if (xDataType === "object" && x(fData[0]) instanceof Date) {
      // X is Date
      hasScaleTime = true;
      overviewX = d3
        .scaleTime()
        .domain(d3.extent(fData, x))
        .range([0, width - ts.margin.right - ts.margin.left]);
    } else {
      // We if x is something else overviewX won't be assigned
      // if (xDataType === "number") {
      // X is number
      overviewX = d3
        .scaleLinear()
        .domain(d3.extent(fData, x))
        .range([0, width - ts.margin.right - ts.margin.left]);
      //.nice();
    }

    overviewY = ts
      .yScale()
      .domain(d3.extent(fData, y))
      .range([height - ts.margin.top - ts.margin.bottom, 0]);
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
      .select("div#divData")
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
      groupAttr,
      overviewX,
      overviewY,
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
            brushes.addBrushGroup();
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

    gGroupData = svg
      .selectAll("g.groupData")
      .data([1])
      .join("g")
      .attr("class", "groupData")
      .attr("transform", `translate(10,${ts.margin.top} )`);

    if (groupAttr) {
      fData.forEach((d) => selectedGroupData.add(groupAttr(d)));
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

    gBrushes = g
      .selectAll("g#brushes")
      .data([1])
      .join("g")
      .attr("id", "brushes");

    brushes = brushInteraction({
      ts,
      element: gBrushes.node(),
      data: groupedData,
      tooltipTarget: target,
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
      statusCallback: (status) => log("status brush Change", status),
      selectionCallback: onSelectionChange,
      groupsCallback: onBrushGroupsChange,
      changeSelectedCoordinatesCallback: updateBrushSpinBox,
    });

    gGroupBrushes
      .selectAll("text")
      .data([1])
      .join("text")
      .attr("x", 0)
      .attr("y", ts.brushGroupSize / 2 + 2)
      .text("Groups + : ")
      .style("cursor", "pointer")
      .on("click", brushes.addBrushGroup);

    initBrushesControls();

    return g;
  }

  // Callback that is called every time the coordinates of the selected brush are modified.
  function updateBrushSpinBox(selection) {
    if (selection) {
      let [[x0, y0], [x1, y1]] = selection;
      let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

      sx0.node().value = fmtX(x0);
      sx1.node().value = fmtX(x1);
      sy0.node().value = fmtY(y1);
      sy1.node().value = fmtY(y0);
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
    divBrushesCoordinates.append("h3").text("Current TimeBox Coordinates: ");
    let divX = divBrushesCoordinates.append("div");

    divX.append("span").text(xLabel);

    let divInputX = divX.append("div");

    let domainX = overviewX.domain();
    let x0 = divInputX
      .append("input")
      // .attr("type", "number")
      .attr("min", domainX[0])
      .attr("max", domainX[1])
      .attr("step", ts.stepX)
      .attr("width", "50%")
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    let x1 = divInputX
      .append("input")
      // .attr("type", "number")
      .attr("min", domainX[0])
      .attr("max", domainX[1])
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
      [x1, y1],
    ];
  }

  function generateDataSelectionDiv() {
    if (groupAttr) {
      divData.innerHTML = "";
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
          // TODO
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
  function filterDatabyDataGroups() {
    dataSelectedGroupData = new Map(dataSelected);
    dataNotSelectedGroupData = dataNotSelected;
    for (let d of dataSelectedGroupData) {
      let filtered = d[1].filter((d) =>
        selectedGroupData.has(groupAttr(d[1][0]))
      );
      dataSelectedGroupData.set(d[0], filtered);
    }
    dataNotSelectedGroupData = dataNotSelectedGroupData.filter((d) =>
      selectedGroupData.has(groupAttr(d[1][0]))
    );
  }

  // Called when the active dataGroups are modified.
  function onGroupDataChange() {
    // Filter dataSelected and dataNotSelected by enable dataGroups
    filterDatabyDataGroups();

    // Compute the medians if needed
    if (showGroupMedian) getBrushGroupsMedians(dataSelectedGroupData);

    render(
      dataSelectedGroupData,
      dataNotSelectedGroupData,
      brushes.hasSelection()
    );
  }

  function initDetails({ xDataType, fData }) {
    if (ts.hasDetails) {
      // We didn't receive a HTML element for the details div,
      // let's create it and add it to the target
      if (!detailsElement) {
        detailsElement = document.createElement("div");
        divOverview.appendChild(detailsElement);
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
        margin: detailsMargin,
      });
    }

    ts.hasDetails && timelineDetails.setScales({ xDataType, fData });
  }

  // Callback that is called when the value of the spinboxes is modified.
  function onSpinboxChange(sourceEvent) {
    let selectedBrush = brushes.getSelectedBrush();
    if (selectedBrush === null) return;

    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    let x0 = +sx0.node().value;
    let x1 = +sx1.node().value;
    let y0 = +sy1.node().value;
    let y1 = +sy0.node().value;

    if (x0 >= x1) {
      if (sourceEvent.target === sx0.node()) {
        x1 = x0 + ts.stepX;
        sx1.node().value = x1;
      } else {
        x0 = x1 - ts.stepX;
        sx0.node().value = x0;
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

    brushes.moveSelectedBrush(x0, x1, y0, y1);
  }

  function getSpinBoxValues() {
    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    let x0, x1;
    if (hasScaleTime) {
      let timeParse = d3.timeParse(fmtX);
      x0 = timeParse(sx0.node().value);
      x1 = timeParse(sx1.node().value);
    } else {
      x0 = +sx0.node().value;
      x1 = +sx1.node().value;
    }
    let y0 = +sy1.node().value;
    let y1 = +sy0.node().value;
    return { x0, x1, y0, y1 };
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

    brushes.moveSelectedBrush(x0, x1, y0, y1);
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

    brushes.moveSelectedBrush(x0, x1, y0, y1);
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
    brushes.moveSelectedBrush(x0, x1, y0, y1);
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

    brushes.moveSelectedBrush(x0, x1, y0, y1);
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
    let mDataSelected = [];
    dataSelected.forEach((g, i) => {
      if (enableBrushGroups.has(i)) {
        mDataSelected = mDataSelected.concat(g);
      } else {
        dataNotSelected = dataNotSelected.concat(g);
      }
    });

    timelineOverview.render(
      mDataSelected,
      dataNotSelected,
      medians,
      hasSelection
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
    // TODO use d3.bin()
    let minX = +overviewX.domain()[0];
    let maxX = +overviewX.domain()[1];

    let binW = (maxX - minX) / ts.medianNumBins;

    log(
      "getBrushGroupsMedians: number of bins",
      ts.medianNumBins,
      " binW ",
      binW,
      minX,
      maxX
    );

    for (let g of data.entries()) {
      let id = g[0];

      let bins = [];
      let cx = minX;
      for (let i = 0; i < ts.medianNumBins; ++i) {
        bins.push({
          x0: cx,
          x1: cx + binW,
          data: [],
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
    hasSelection = false
  ) {
    console.log("onSelection");
    dataSelected = newDataSelected;
    dataNotSelected = newDataNotSelected;

    // Filter data with active dataGroups
    if (groupAttr) {
      filterDatabyDataGroups();
    }

    // Compute the medians if needed
    if (showGroupMedian)
      getBrushGroupsMedians(groupAttr ? dataSelectedGroupData : dataSelected);

    if (groupAttr) {
      render(dataSelectedGroupData, dataNotSelectedGroupData, hasSelection); // Print the filtered data by active dataGroups
    } else {
      render(dataSelected, dataNotSelected, hasSelection);
    }
    renderBrushesControls();
    triggerValueUpdate(dataSelected);
  }

  // Function called to recreate the selection when dataInput change.
  function recreateBrushes() {
    brushes.recreate(_this.value.brushes);
  }

  // Called every time the brushGroups changes
  function onBrushGroupsChange() {
    if (groupAttr) {
      // Render for possible change in brushGroups enable.
      render(
        dataSelectedGroupData,
        dataNotSelectedGroupData,
        brushes.hasSelection()
      );
    } else {
      render(dataSelected, dataNotSelected, brushes.hasSelection());
    }

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
  function triggerValueUpdate(sel = divOverview.value) {
    //TODO
    if (!sel) {
      log("Return selection with empty selection", sel);
      return;
    }
    updateCallback(sel);

    divOverview.value = sel;
    divOverview.value.brushes = Array.from(brushes.getBrushesGroup().entries());
    divOverview.dispatchEvent(new Event("input", { bubbles: true }));
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
    log(
      `Processing data: done filtering ${fData.length} left out of ${data.length}`
    );
    groupedData = d3.groups(fData, id);
    log(
      `Processing data: grouping done ${groupedData.length} timelines out of ${data.length} records`
    );

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

    timelineOverview.setScales({ data: fData, xDataType });
    timelineOverview.data(groupedData);

    generateDataSelectionDiv();
    generateBrushCoordinatesDiv();

    initDetails({ xDataType, fData });

    dataSelected.set(0, groupedData);
    if (groupAttr) dataSelectedGroupData = new Map(dataSelected); // Initialize data filtered by enable dataGroups if needed.

    if (_this) recreateBrushes();

    render(dataSelected, [], false);
    renderBrushesControls();
    triggerValueUpdate(dataSelected);
  };

  // If we receive the data on initialization call ts.Data
  if (data) {
    ts.data(data);
  }

  // To allow a message from the outside to rerender
  ts.render = () => {
    // render(dataSelected, dataNotSelected);
    onSelectionChange();
  };

  // Make the ts object accesible
  divOverview.ts = ts;
  divOverview.details = divDetails;
  divOverview.brushesCoordinates = divBrushesCoordinates;

  return divOverview;
}

export default TimeSearcher;

/*function renderSVG() {
    const gData = g.append("g").attr("id", "gData");
    // let prerenderDetails = null;

    function render(data) {
      renderOverviewSVG(data);
      ts.hasDetails && timelineDetails.renderDetailsSVG(data);
    }

    function renderOverviewSVG(data) {
      // const g = d3.select(chart).select(".gDrawing");
      let flatData = data.map((d) => d[1]).flat();

      gData
        .selectAll(".point")
        .data(flatData, (d) => d.__id__)
        .join(
          (enter) => {
            enter
              .append("circle")
              .attr("class", "point")
              .attr("cy", (d) => overviewY(y(d)))
              .attr("cx", (d) => overviewX(x(d)))
              .attr("fill", "black")
              .attr("r", 2)
              .style("opacity", 1.0);
          },
          (update) => {
            update.attr("fill", "black").style("opacity", 1.0);
          },
          (exit) => {
            exit.attr("fill", "gray").style("opacity", 0.1);
          }
        );

      let lines = gData
        .selectAll(".line")
        .data(data, (d) => d[0])
        .join(
          (enter) => {
            enter
              .append("path")
              .attr("class", "line")
              .attr("d", (g) => line2(g[1]))
              .style("fill", "none")
              .style("stroke", "black")
              .style("opacity", 1.0);
          },
          (update) => {
            update.style("stroke", "black").style("opacity", 1.0);
          },
          (exit) => {
            exit.style("stroke", "gray").style("opacity", 0.1);
          }
        );
    }
    return { render: render };
  } */
