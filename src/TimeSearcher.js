import * as d3 from "d3";
import { throttle } from "throttle-debounce";
import { createPopper } from "@popperjs/core";
import { add, sub, intervalToDuration } from "date-fns";
import * as htl from "htl";

let DEBUG = true;
let before = 0;

function log() {
  if (DEBUG) console.log(performance.now() - before, ...arguments);
  before = performance.now();
}

function BrushTooltipEditable({
  selection = null,
  fmtX,
  fmtY,
  target,
  margin = { top: 0, left: 0 },
  callback = () => {},
}) {
  const x0E = htl.html`<input class="x0" contenteditable="true"></input>`;
  const y0E = htl.html`<input class="y0" contenteditable="true"></input>`;
  const x1E = htl.html`<input class="x1" contenteditable="true"></input>`;
  const y1E = htl.html`<input class="y1" contenteditable="true"></input>`;

  // https://stackoverflow.com/questions/3392493/adjust-width-of-input-field-to-its-input
  const adjustInputWidth = (input) => {
    input.addEventListener("input", resizeInput); // bind the "resizeInput" callback on "input" event
    resizeInput.call(input); // immediately call the function

    function resizeInput() {
      this.style.width = this.value.length  + "ch";
    }
  };

  const resizeInputs = () => [x0E, y0E, x1E, y1E].map(adjustInputWidth);

  const btnChange0E = htl.html`<button>✅</button>`;
  const btnChange1E = htl.html`<button>✅</button>`;

  const fromE = htl.html`<div style="position: absolute; top:0; left:0;">
    <div style="display:flex; position: absolute; bottom: 0px; right: 0px;">
      ${x0E}<strong> x </strong>${y0E} ${btnChange0E}
    </div>
  </div>`;
  const toE = htl.html`<div style="position: absolute; display:flex;">${x1E}<strong> x </strong>${y1E} ${btnChange1E}</div>`;

  const brushTooltip = htl.html`<div class="__ts_tooltip" style="display: none; z-index:2; position: absolute; top: ${margin.top}px; left: ${margin.left}px;">
    <style>
    div.__ts_tooltip { 
      font-family: sans-serif; font-size: 10pt; 
    }
    div.__ts_tooltip > div > div * { 
      margin-right: 1px;
    }
    div.__ts_tooltip div > button {
      padding: 0px;
      display: none;
    }
    div.__ts_tooltip div:hover > button {
      padding: 0px;
      display: block;
    }
    div.__ts_tooltip input {
      background-color:rgba(255, 255, 255, 0);    
      border: none;
      outline: none;
    }
    div.__ts_tooltip input:focus {
        border: solid #aaa;
    }


    </style>
    <div>${fromE}</div>
    <div>${toE}</div>

  </div>`;

  log("brushTooltipTooltipEditable", target);

  // x0E.oninput = (evt) => evt.preventDefault();
  // x1E.oninput = (evt) => evt.preventDefault();
  // y0E.oninput = (evt) => evt.preventDefault();
  // y1E.oninput = (evt) => evt.preventDefault();

  brushTooltip.__update = ({ selection, selectionPixels }) => {
    brushTooltip.style.display = "block";
    x0E.value = fmtX(selection[0][0]);
    x1E.value = fmtX(selection[1][0]);
    y0E.value = fmtY(selection[0][1]);
    y1E.value = fmtY(selection[1][1]);

    resizeInputs();

    fromE.style.top = selectionPixels[0][1] + "px";
    fromE.style.left = selectionPixels[0][0] + "px";
    toE.style.top = selectionPixels[1][1] + "px";
    toE.style.left = selectionPixels[1][0] + "px";
  };

  brushTooltip.__hide = () => (brushTooltip.style.display = "none");

  // brushTooltip.oninput = (evt) => evt.preventDefault();

  function triggerUpdate() {
    brushTooltip.value = [
      [x0E.value, y0E.value],
      [x1E.value, y1E.value],
    ];
    log("triggerUpdate", brushTooltip.value);
    brushTooltip.dispatchEvent(new Event("input", { bubbles: true }));

    callback(brushTooltip.value);
  }

  btnChange0E.addEventListener("click", triggerUpdate);
  btnChange0E.addEventListener("click", triggerUpdate);

  target.appendChild(brushTooltip);

  triggerUpdate();
  resizeInputs();

  return brushTooltip;
}

function TimeSearcher({
  // John TODO: Let's change everything to Observable's style TimeSearcher(data, { width, etc})
  data,
  target = document.createElement("div"), // pass a html element where you want to render
  detailedElement = document.createElement("div"), // pass a html element where you want to render the details
  brushCoordinatesElement = document.createElement("div"), // pass a html element where you want to render the brush coordinates Input.
  brushesControlsElement = document.createElement("div"), // pass a html element where you want to have the brushes controls.
  showBrushesControls = true, // If false you can still use brushesControlsElement to show the control on a different element on your app
  x = (d) => d.x, // Atribute to show in the X axis (Note that it also supports functions)
  y = (d) => d.y, // Atribute to show in the Y axis (Note that it also supports functions)
  id = (d) => d.id, // Atribute to group the input data (Note that it also supports functions)
  renderer = "canvas",
  overviewWidth = 1200, // Set the desired width of the overview Widget
  detailedWidth = 1200 - 20, // Set the desired width of the detailed Widget
  overviewHeight = 600, // Set the desired height of the overview Widget
  detailedHeight = 300, // Set the desired height of the overview Widget
  detailedContainerHeight = 400,
  updateCallback = (data) => {},
  statusCallback = (status) => {},
  fmtX = d3.timeFormat("%d/%m/%y"), // Function, how to format x points in the tooltip
  fmtY = d3.format(".1d"), // Function, how to format x points in the tooltip
  yLabel = "",
  xLabel = "",
  filters = [], // Array of filters to use, format [[x1, y1], [x2, y2], ...]
  brushShadow = "drop-shadow( 2px 2px 2px rgba(0, 0, 0, .7))",
  useNewTooltip = true, // TODO remove this option
  maxDetailedRecords = 100, // How many results to show in the detail view
  maxTimelines = null, // Set to a value to limit the number of distinct timelines to show
} = {}) {
  let ts = {},
    groupedData,
    fData,
    nGroups,
    overviewX,
    overviewY,
    detailedX,
    detailedY,
    line2,
    line2Detailed,
    render,
    renderObject,
    prerenderDetailed,
    divOverview,
    divRender,
    divControls,
    divDetailed,
    divBrushesCoordinates,
    svg,
    g,
    gGroupBrushes,
    gBrushes,
    gEditbrushes,
    gReferences,
    brushesGroup,
    enableBrushGroups, // TODO refactor to include an atribute of enabled/disabled in brushGroups
    brushGroupSelected,
    brushCount,
    brushSize,
    brushTooltipElement,
    brushTooltip,
    brushSpinBoxes,
    brushInSpinBox,
    tooltipCoords = { x: 0, y: 0 },
    BVH,
    dataSelected,
    dataNotSelected,
    tBrushed,
    tShowTooltip,
    tUpdateSelection,
    tUpdateBrushSpinBox,
    gGroupData,
    selectedGroupData,
    hasScaleTime,
    nGroupsData,
    brushTooltipEditable;

  // Default Parameters
  ts.xPartitions = 10; // Partitions performed on the X-axis for the collision acceleration algorithm.
  ts.yPartitions = 10; // Partitions performed on the Y-axis for the collision acceleration algorithm.
  ts.defaultAlpha = 0.8; // Default transparency (when no selection is active) of drawn lines
  ts.selectedAlpha = 1; // Transparency of selected lines
  ts.noSelectedAlpha = 0.6
  ; // Transparency of unselected lines
  ts.backgroundColor = "#ffffff";
  ts.defaultColor = "#aaa"; // Default color (when no selection is active) of the drawn lines. It only has effect when "groupAttr" is not defined.
  ts.selectedColor = "#aaa"; // Color of selected lines. It only has effect when "groupAttr" is not defined.
  ts.noSelectedColor = "#dce0e5"; // Color of unselected lines. It only has effect when "groupAttr" is not defined.
  ts.hasDetailed = true; // Determines whether detail data will be displayed or not. Disabling it saves preprocessing time if detail data is not to be displayed.
  ts.margin = { left: 50, top: 30, bottom: 50, right: 20 };
  ts.colorScale = d3.scaleOrdinal(d3.schemeCategory10); // The color scale to be used to display the different groups defined by the "groupAttr" attribute.
  ts.brushesColorScale = d3.scaleOrdinal(d3.schemeCategory10); // The color scale to be used to display the brushes
  ts.groupAttr = null; // Specifies the attribute to be used to discriminate the groups.
  ts.doubleYlegend = false; // Allows the y-axis legend to be displayed on both sides of the chart.
  ts.showGrid = false; // If active, a reference grid is displayed.
  ts.showBrushTooltip = true; // Allows to display a tooltip on the brushes containing its coordinates.
  ts.autoUpdate = true; // Allows to decide whether changes in brushes are processed while moving, or only at the end of the movement.
  ts.brushGruopSize = 15; //Controls the size of the colored rectangles used to select the different brushGroups.
  ts.stepX = { days: 10 }; // Defines the step used, both in the spinboxes and with the arrows on the X axis.
  ts.stepY = 1; // // Defines the step used, both in the spinboxes and with the arrows on the Y axis.

  // A scale to adjust the alpha
  ts.alphaScale = d3.scalePow().exponent(0.15).range([1, 0.01]);

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

  divOverview = d3
    .select(target)
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("position", "relative")
    .style("top", "0px")
    .style("left", "0px")
    .style("background-color", ts.backgroundColor)
    .node();

  if (ts.hasDetailed) {
    divDetailed = d3
      .select(detailedElement)
      .attr("id", "detail")
      .style("height", `${detailedContainerHeight}px`)
      .style("width", `${detailedWidth + 40}px`)
      .style("overflow-y", "scroll")
      .node();
  }
  divBrushesCoordinates = d3.select(brushCoordinatesElement);
  brushesControlsElement = brushesControlsElement || d3.create("div");
  brushesGroup = new Map();
  enableBrushGroups = new Set();
  brushGroupSelected = 0;
  brushCount = 0;
  brushSize = 0;
  dataSelected = new Map();
  selectedGroupData = new Set();
  nGroupsData = 0;

  tBrushed = throttle(250, brushed);
  tShowTooltip = throttle(50, showBrushTooltip);
  tUpdateSelection = throttle(100, updateSelection);
  tUpdateBrushSpinBox = throttle(50, updateBrushSpinBox);

  ts.observer = new IntersectionObserver(onDetailedScrolled, {
    root: divDetailed,
    threshold: 0.1,
  });

  function initBrushesControls() {
    brushesControlsElement.innerHTML = `<div id="brushesGroups" style="flex-basis:100%;">
    <h3>TimeBoxes Groups</h3>
    <ul id="brushesList">
      
    </ul>
    <button id="btnAddBrushGroup">Add Brush Group</button>
    </div>`;

    brushesControlsElement
      .querySelector("button#btnAddBrushGroup")
      .addEventListener("click", addBrushGroup);

    if (showBrushesControls) divOverview.appendChild(brushesControlsElement);
  }

  function renderBrushesControls() {
    d3.select(brushesControlsElement)
      .select("#brushesList")
      .selectAll(".brushControl")
      .data(brushesGroup, (d) => d[0])
      .join("li")
      .attr("class", "brushControl")
      .each(function (d) {
        const li = d3.select(this);
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
            <div style="
              width: ${ts.brushGruopSize}px; 
              height: ${ts.brushGruopSize}px;
              background-color: ${ts.brushesColorScale(d[0])};
              margin-right: 5px;
            "></div>
            <output style="margin-right: 5px;" contenteditable="true">Group ${
              d[0]
            }</output>
            <span style="margin-right: 5px;">(${
              dataSelected.get(d[0]).length
            })</span>
            <input type="checkbox" id="checkBoxShowBrushGroup" ${enableBrushGroups.has(d[0]) ? "checked" : ""}>
            <button style="display" id="btnRemoveBrushGroup">-</button>
          </div>
        `;

        li.select("#btnRemoveBrushGroup").on("click", (event) => {
          event.stopPropagation();
          removeBrushGroup(d[0]);
        });
        li.select("#checkBoxShowBrushGroup").on("click", (event) => { //Prevent the event from reaching the element li
          event.stopPropagation();
        });
        li.select("#checkBoxShowBrushGroup").on("change", (event) => {
          event.stopPropagation();
          changeBrushGroupState(d[0],event.target.checked)
          console.log("Should change state of brushesGroup " + d[0], event.target.checked);
        })
        li.on("click", () => selectBrushGroup(d[0]));
      });

    // Render internal brush  controls
    gGroupBrushes
      .selectAll(".colorBrushes")
      .data(brushesGroup, (d) => d[0])
      .join("rect")
      .attr("class", "colorBrushes")
      .attr("id", (d) => "colorBrush-" + d[0])
      .attr("height", ts.brushGruopSize)
      .attr("width", ts.brushGruopSize)
      .attr(
        "transform",
        (d, i) => `translate(${170 + i * (ts.brushGruopSize + 5)}, -2)`
      )
      .style("stroke-width", (d) => d[0] === brushGroupSelected ? 2 : 0)
      .style("stroke", "black")
      .style("fill", (d) => ts.brushesColorScale(d[0]))
      .on("click", function () {
        let id = d3.select(this).attr("id").substr("11");
        selectBrushGroup(+id);
      });
  }

  function changeBrushGroupState(id, newState) {
    if (enableBrushGroups.has(id) === newState) return //same state so no update needed

    if (newState)
      enableBrushGroups.add(id)
    else {
      enableBrushGroups.delete(id)
      if (brushInSpinBox[1].group === id) {
        hideTooltip(null, true)
      }
    }

    drawBrushes()
    render(dataSelected,dataNotSelected)
  }
  function removeBrushGroup(id) {
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
        brushesGroup.get(newId).set(brush[0], brush[1]);
        brushGroupToDelete.delete(brush[0]);
      }
    }

    if (id === brushGroupSelected) {
      selectBrushGroup(newId);
    }

    enableBrushGroups.delete(id);
    brushesGroup.delete(id);
    triggerValueUpdate();
    renderBrushesControls();
  }

  function init() {
    //CreateOverView
    divControls = d3
      .select(divOverview)
      .append("div")
      .attr("id", "controls")
      .style("margin-top", `${ts.margin.top}px`);

    divRender = d3
      .select(divOverview)
      .append("div")
      .attr("id", "render")
      .style("position", "relative")
      .style("z-index", 1);

    svg = divRender
      .append("svg")
      .attr("viewBox", [0, 0, overviewWidth, overviewHeight])
      .attr("height", overviewHeight)
      .attr("width", overviewWidth);

    const g = svg
      .append("g")
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
            if (brushInSpinBox) removeBrush(brushInSpinBox);
            break;
          case "+":
            addBrushGroup();
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
      .append("g")
      .attr("class", "mainYAxis")
      .call(d3.axisLeft(overviewY))
      .call((axis) =>
        axis
          .append("text")
          .text(yLabel)
          .attr("dy", -15)
          .style("fill", "black")
          .style("text-anchor", "end")
          .style("pointer-events", "none")
      )
      .style("pointer-events", "none");

    if (ts.doubleYlegend) {
      g.append("g")
        .attr("class", "secondYaxis")
        .call(d3.axisRight(overviewY))
        .attr(
          "transform",
          `translate(${overviewWidth - ts.margin.left - ts.margin.right},0)`
        )
        .style("pointer-events", "none");
    }

    let gmainx = g
      .append("g")
      .attr("class", "mainXAxis")
      .call(d3.axisBottom(overviewX))

      .attr(
        "transform",
        `translate(0, ${overviewHeight - ts.margin.top - ts.margin.bottom})`
      )
      .call((axis) =>
        axis
          .append("text")
          .text(xLabel)
          .attr(
            "transform",
            `translate(${
              overviewWidth - ts.margin.right - ts.margin.left - 5
            }, -10 )`
          )
          .style("fill", "black")
          .style("text-anchor", "end")
          .style("pointer-events", "none")
      )
      .style("pointer-events", "none");

    gReferences = g
      .append("g")
      .attr("class", "gReferences")
      .style("pointer-events", "none");

    if (ts.showGrid) {
      gmainY
        .selectAll("g.tick")
        .append("line")
        .attr("class", "gridline")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", overviewWidth - ts.margin.right - ts.margin.left)
        .attr("y2", 0)
        .attr("stroke", "#9ca5aecf") // line color
        .attr("stroke-dasharray", "4"); // make it dashed;;

      gmainx
        .selectAll("g.tick")
        .append("line")
        .attr("class", "gridline")
        .attr("x1", 0)
        .attr("y1", -overviewHeight + ts.margin.top + ts.margin.bottom)
        .attr("x2", 0)
        .attr("y2", 0)
        .attr("stroke", "#9ca5aecf") // line color
        .attr("stroke-dasharray", "4"); // make it dashed;
    }

    gGroupData = svg
      .append("g")
      .attr("class", "groupData")
      .attr("transform", `translate(10,${ts.margin.top} )`);

    if (ts.groupAttr) {
      fData.forEach((d) => selectedGroupData.add(d[ts.groupAttr]));
      nGroupsData = selectedGroupData.size;
    }

    gEditbrushes = svg.append("g").attr("class", "editBrushes");

    gGroupBrushes = svg
      .append("g")
      .attr("class", "colorBrushes")
      .attr(
        "transform",
        `translate(${ts.margin.left + 10},${
          ts.margin.top - ts.brushGruopSize - 5
        } )`
      );

    gGroupBrushes
      .append("text")
      .attr("x", 0)
      .attr("y", ts.brushGruopSize / 2 + 2)
      .text("TimeBoxes Groups + : ")
      .style("cursor", "pointer")
      .on("click", addBrushGroup);

    initBrushesControls();

    if (useNewTooltip) {
      brushTooltipEditable = BrushTooltipEditable({
        target,
        fmtX,
        fmtY,
        // TODO: this + 20 shouldn't be here...
        margin: { top: ts.margin.top, left: ts.margin.left },
        callback: (newSelection) => {
          log("tooltip new value", newSelection);
        },
      });
      // brushTooltipEditable.addEventListener("input", () => {

      // });
    }

    return g;
  }

  function updateBrushSpinBox({ selection, sourceEvent }, brush) {
    brushInSpinBox = brush;

    let [[x0, y0], [x1, y1]] = selection;
    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    sx0.node().value = fmtX(overviewX.invert(x0));
    sx1.node().value = fmtX(overviewX.invert(x1));
    sy0.node().value = fmtY(overviewY.invert(y1));
    sy1.node().value = fmtY(overviewY.invert(y0));
  }

  function emptyBrushSpinBox() {
    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    sx0.node().value = "";
    sx1.node().value = "";
    sy0.node().value = "";
    sy1.node().value = "";

    brushInSpinBox = null;
  }

  function generateBrushCoordinatesDiv() {
    divBrushesCoordinates.innerHTML = "";
    divBrushesCoordinates.append("h3").text("TimeBox Coordinates: ");
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
    if (ts.groupAttr) {
      let divData = divControls.append("div");

      divData.append("span").text("Data groups: ");

      let divButtons = divData
        .selectAll(".groupData")
        .data(selectedGroupData)
        .join("div")
        .attr("class", "groupData");
      divButtons
        .append("button")
        .style("font-size", `${ts.brushGruopSize}px`)
        .style("stroke", "black")
        .style("margin", "2px")
        .style("margin-right", "10px")
        .style("border-width", "3px")
        .style("border", "solid black")
        .style("width", `${ts.brushGruopSize}px`)
        .style("height", `${ts.brushGruopSize}px`)
        .style("background-color", (d) => ts.colorScale(d))
        .on("click", function (event, d) {
          if (selectedGroupData.has(d)) {
            selectedGroupData.delete(d);
            d3.select(this).style("border", "solid transparent");
          } else {
            selectedGroupData.add(d);
            d3.select(this).style("border", "solid black");
          }
          brushFilterRender();
        });
      divButtons.append("span").text((d) => d);
    }
  }

  function onSpinboxChange(sourceEvent) {
    if (brushInSpinBox === null) return;

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

    x0 = overviewX(x0);
    x1 = overviewX(x1);
    y0 = overviewY(y0);
    y1 = overviewY(y1);

    gBrushes
      .select("#brush-" + brushInSpinBox[0])
      .call(brushInSpinBox[1].brush.move, [
        [x0, y0],
        [x1, y1],
      ]);

    let selection = [
      [x0, y0],
      [x1, y1],
    ];

    brushed({ selection, sourceEvent }, brushInSpinBox);

    //moveSelectedBrushes({selection,sourceEvent},brushInSpinBox)
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

  function onArrowRigth(sourceEvent) {
    // TODO avoid using spinbox to get the actual selection and use the selectedBrush.
    if (brushInSpinBox === null) return;

    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    let { x0, x1, y0, y1 } = getSpinBoxValues();

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

    sx0.node().value = fmtX(x0);
    sx1.node().value = fmtX(x1);

    x0 = overviewX(x0);
    x1 = overviewX(x1);
    y0 = overviewY(y0);
    y1 = overviewY(y1);

    gBrushes
      .select("#brush-" + brushInSpinBox[0])
      .call(brushInSpinBox[1].brush.move, [
        [x0, y0],
        [x1, y1],
      ]);

    let selection = [
      [x0, y0],
      [x1, y1],
    ];

    brushed({ selection, sourceEvent }, brushInSpinBox);
  }

  function updateBrushSelection(nx0, nx1, ny0, ny1, brush) {
    let [[x0, y0], [x1, y1]] = brush[1].selection;

    let minX = overviewX.domain()[0];
    let maxX = overviewX.domain()[1];

    if (nx0) {
      if (nx0 > maxX) nx0 = maxX - ts.stepX;
      if (nx1 < minX) nx0 = minX;

      x0 = nx0;
      if (x0 > x1) x1 = x0 + ts.stepX;
    }

    if (nx1) {
      if (nx1 > maxX) nx1 = maxX;
      if (nx1 < minX) nx1 = minX + ts.stepX;

      x1 = nx1;
      if (x1 < x0) x0 = x1 - ts.stepX;
    }

    let miny = overviewY.domain()[0];
    let maxy = overviewY.domain()[1];

    if (ny0) {
      if (n) {
      }
    }
  }

  function onArrowLeft(sourceEvent) {
    if (brushInSpinBox === null) return;

    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    let { x0, x1, y0, y1 } = getSpinBoxValues();

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

    sx0.node().value = fmtX(x0);
    sx1.node().value = fmtX(x1);

    x0 = overviewX(x0);
    x1 = overviewX(x1);
    y0 = overviewY(y0);
    y1 = overviewY(y1);

    gBrushes
      .select("#brush-" + brushInSpinBox[0])
      .call(brushInSpinBox[1].brush.move, [
        [x0, y0],
        [x1, y1],
      ]);

    let selection = [
      [x0, y0],
      [x1, y1],
    ];

    brushed({ selection, sourceEvent }, brushInSpinBox);
  }

  function onArrowDown(sourceEvent) {
    if (brushInSpinBox === null) return;

    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    let { x0, x1, y0, y1 } = getSpinBoxValues();

    y1 -= ts.stepY;

    let minY = +sy0.node().min;

    if (y1 < minY) {
      let dist = y1 + ts.stepY - minY;
      y1 = minY;
      y0 -= dist;
    } else {
      y0 -= ts.stepY;
    }

    sy0.node().value = y1;
    sy1.node().value = y0;

    x0 = overviewX(x0);
    x1 = overviewX(x1);
    y0 = overviewY(y0);
    y1 = overviewY(y1);

    gBrushes
      .select("#brush-" + brushInSpinBox[0])
      .call(brushInSpinBox[1].brush.move, [
        [x0, y0],
        [x1, y1],
      ]);

    let selection = [
      [x0, y0],
      [x1, y1],
    ];

    brushed({ selection, sourceEvent }, brushInSpinBox);
  }

  function onArrowUp(sourceEvent) {
    if (brushInSpinBox === null) return;

    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    let { x0, x1, y0, y1 } = getSpinBoxValues();

    y0 += ts.stepY;

    let maxY = +sy0.node().max;

    if (y0 > maxY) {
      let dist = maxY - y0 + ts.stepY;
      y0 = maxY;
      y1 += dist;
    } else {
      y1 += ts.stepY;
    }

    sy0.node().value = y1;
    sy1.node().value = y0;

    x0 = overviewX(x0);
    x1 = overviewX(x1);
    y0 = overviewY(y0);
    y1 = overviewY(y1);

    gBrushes
      .select("#brush-" + brushInSpinBox[0])
      .call(brushInSpinBox[1].brush.move, [
        [x0, y0],
        [x1, y1],
      ]);

    let selection = [
      [x0, y0],
      [x1, y1],
    ];

    brushed({ selection, sourceEvent }, brushInSpinBox);
  }

  function onDetailedScrolled(entries, observer) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        let div = entry.target;
        let group = div.getAttribute("group");
        group = typeof groupedData[0][0] === "number" ? +group : group;
        const prerenderDetailedEle = prerenderDetailed.get(group);
        if (!prerenderDetailedEle) {
          console.log(
            "Error onDetailedScrolled couldn't find ",
            group,
            " on ",
            prerenderDetailed
          );
          return;
        }
        div.appendChild(prerenderDetailedEle.node());
      } else {
        entry.target.innerHTML = "";
      }
    });
  }

  function renderSVG() {
    const gData = g.append("g").attr("id", "gData");
    let prerenderDetailed = null;

    function render(data) {
      renderOverviewSVG(data);
      renderDetailedSVG(data);
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

    function renderDetailedSVG(data) {
      const div = d3.select(divDetailed);

      let slicedData = maxDetailedRecords
        ? data.slice(0, maxDetailedRecords)
        : data;

      div
        .selectAll(".detailed")
        .data(slicedData, (d) => d[0])
        .join(
          (enter) => {
            enter.each(function (d) {
              let g = d3
                .select(this)
                .append("svg")
                .attr("class", "detailed")
                .attr("viewBox", [0, 0, detailedWidth, detailedHeight])
                .attr("height", detailedHeight)
                .attr("width", detailedWidth)
                .append("g");
              g.attr(
                "transform",
                `translate(${ts.margin.left}, ${ts.margin.top})`
              );

              g.append("g")
                .attr("class", "mainYAxis")
                .call(d3.axisLeft(detailedY));

              g.append("g")
                .attr("class", "mainXAxis")
                .call(d3.axisBottom(detailedX))
                .attr(
                  "transform",
                  `translate(0, ${
                    detailedHeight - ts.margin.top - ts.margin.bottom
                  })`
                );

              g.append("text")
                .text(d[0])
                .attr("transform", "translate(10, 0)")
                .style("fill", "black")
                .style("font-size", "0.7em");

              g.selectAll(".point") //.select("#points") //TODO make new G with id for this cricles
                .data(d[1])
                .join("circle")
                .attr("class", "point")
                .attr("cy", (d) => detailedY(y(d)))
                .attr("cx", (d) => detailedX(x(d)))
                .attr("fill", "black")
                .attr("r", 2);

              g.selectAll(".lines") //TODO add to the new G
                .data([d])
                .join("path")
                .attr("class", "line")
                .attr("d", (g) => line2Detailed(g[1]))
                .style("fill", "none")
                .style("stroke", "black");
            });
          },
          (update) => update,
          (exit) => exit.remove()
        );
    }

    return { render: render, preRender: prerenderDetailed };
  }

  function renderCanvas(data) {
    const canvas = divRender
      .append("canvas")
      .attr("height", overviewHeight * window.devicePixelRatio)
      .attr("width", overviewWidth * window.devicePixelRatio)
      .style("position", "absolute")
      .style("z-index", "-1")
      .style("top", `${ts.margin.top}px`)
      .style("left", `${ts.margin.left}px`)
      .style("width", `${overviewWidth}px`)
      .style("height", `${overviewHeight}px`)
      .style("pointer-events", "none");

    const context = canvas.node().getContext("2d");
    canvas.node().onmousemove = (event) => {
      console.log("canvas");
    };

    // For retina display
    context.scale(window.devicePixelRatio, window.devicePixelRatio);

    let paths = new Map();
    data.forEach((d) => {
      let group = ts.groupAttr ? d[1][0][ts.groupAttr] : null;
      let pathObject = { path: new Path2D(line2(d[1])), group: group };
      paths.set(d[0], pathObject);
    });

    prerenderDetailed = ts.hasDetailed ? generatePrerenderDetailed(data) : null;

    function render(dataSelected, dataNotSelected) {
      renderOverviewCanvas(dataSelected, dataNotSelected);
      if (ts.hasDetailed) {
        window.requestAnimationFrame(() => renderDetailedCanvas(dataSelected));
      }
    }

    function renderOverviewCanvas(dataSelected, dataNotSelected) {
      context.clearRect(0, 0, canvas.node().width, canvas.node().height);
      if (brushSize === 0) {
        // Render all
        renderOverviewCanvasSubset(
          dataSelected.get(0),
          ts.defaultAlpha,
          ts.defaultColor
        );
      } else {
        dataSelected.forEach((g, i) => {
          if (i !== brushGroupSelected) {
            dataNotSelected = dataNotSelected.concat(g);
          }
        });

        // Render Non selected
        renderOverviewCanvasSubset(
          dataNotSelected,
          ts.noSelectedAlpha,
          ts.noSelectedColor
        );

        // Render selected
        renderOverviewCanvasSubset(
          dataSelected.get(brushGroupSelected),
          ts.selectedAlpha,
          ts.selectedColor
        );
      }
    }

    // Draws a subset of lines with a default alpha and color
    function renderOverviewCanvasSubset(dataSubset, alpha, color) {
      context.save();
      // Compute the transparency with respect to the number of lines drawn
      // Min 0.05, then adjust by the expected alpha divided by 10% of the number of lines
      // context.globalAlpha = 0.05 + alpha / (dataSubset.length * 0.1);
      context.globalAlpha = alpha * ts.alphaScale(dataSubset.length);

      log(
        "computed alpha",
        ts.alphaScale(dataSubset.length),
        alpha / dataSubset.length,
        alpha,
        dataSubset.length
      );
      for (let d of dataSubset) {
        let path = paths.get(d[0]);
        if (!path) {
          console.log("renderOverviewCanvasSubset error finding path", d[0], d);
          return;
        }
        context.strokeStyle = ts.groupAttr ? ts.colorScale(path.group) : color;
        context.stroke(path.path);
      }
    }

    function renderDetailedCanvas(data) {
      let frag = document.createDocumentFragment();

      let slicedData = maxDetailedRecords
        ? data.get(brushGroupSelected).slice(0, maxDetailedRecords)
        : data;

      for (let d of slicedData) {
        let div = document.createElement("div");
        div.className = "detailedContainer";
        div.setAttribute("group", d[0]);
        div.style.height = `${detailedHeight}px`;
        frag.appendChild(div);
      }

      // removed to reduce flickering
      // divDetailed.innerHTML = "";

      // Observer API To only show in the detailed view the divs that are visible
      window.requestIdleCallback(() => {
        divDetailed.replaceChildren(frag);
        divDetailed.querySelectorAll(".detailedContainer").forEach((d) => {
          ts.observer.observe(d);
        });
      });
    }

    function generatePrerenderDetailed(data) {
      let prerenderDetailed = new Map();
      data.forEach((d) => {
        let div = d3
          .create("div")
          .attr("class", "detailed")
          .style("position", "relative");

        let g = div
          .append("svg")
          .attr("viewBox", [0, 0, detailedWidth, detailedHeight])
          .attr("height", detailedHeight)
          .attr("width", detailedWidth)
          .append("g")
          .attr("class", "gDrawing")
          .attr("transform", `translate(${ts.margin.left}, ${ts.margin.top})`);

        g.append("g")
          .attr("class", "detailedYAxis")
          .call(d3.axisLeft(detailedY));

        g.append("g")
          .attr("class", "detailedXAxis")
          .call(d3.axisBottom(detailedX))
          .attr(
            "transform",
            `translate(0, ${detailedHeight - ts.margin.top - ts.margin.bottom})`
          );

        g.append("text")
          .text(d[0])
          .attr("transform", "translate(10, 0)")
          .style("fill", "black")
          .style("font-size", "0.7em");

        g.append("path")
          .attr("d", line2Detailed(d[1]))
          .style("fill", "none")
          .style("stroke", "black");

        /*  let canvas = div
            .append("canvas")
            .attr("height", detailedHeight)
            .attr("width", detailedWidth)
            .style("position", "absolute")
            .style("top", `${ts.margin.top}px`)
            .style("left", `${ts.margin.left}px`)
            .style("pointer-events", "none");

          let context = canvas.node().getContext("2d");
          let path = new Path2D(line2Detailed(d[1]));
          context.stroke(path); */

        prerenderDetailed.set(d[0], div);
      });
      return prerenderDetailed;
    }

    return { render: render, preRender: prerenderDetailed };
  }

  //------------- Brush section ---------- //

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
  function addBrushGroup() {
    let newId = getUnusedIdBrushGroup();
    enableBrushGroups.add(newId);
    brushesGroup.set(newId, new Map());
    dataSelected.set(newId, []);
    selectBrushGroup(newId)


    updateStatus();
    triggerValueUpdate();

    renderBrushesControls();
  }

  function selectBrushGroup(id) {
    brushGroupSelected = id;
    renderBrushesControls();
    drawBrushes();
    render(dataSelected, dataNotSelected);
  }

  function createBrushTooltip() {
    if (useNewTooltip) return;

    brushTooltipElement = d3
      .select("body")
      .append("div")
      .attr("class", "__ts_popper")
      .style("pointer-events", "none")
      .style("display", "none")
      .style("z-index", 2);

    let ul = brushTooltipElement.append("div");

    ul.append("div").attr("class", "tool_x_text");

    ul.append("div").attr("class", "tool_y_text");

    const ref = {
      getBoundingClientRect: () => {
        const svgBR = g.node().getBoundingClientRect();
        return {
          top: tooltipCoords.y, //+ svgBR.top,
          right: tooltipCoords.x, // + svgBR.left,
          bottom: tooltipCoords.y, // + svgBR.top,
          left: tooltipCoords.x, // + svgBR.left,
          width: 0,
          height: 0,
        };
      },
    };

    brushTooltip = createPopper(ref, brushTooltipElement.node(), {
      placement: "right",
    });
  }

  function showBrushTooltip({ selection, sourceEvent }) {
    if (!selection || sourceEvent === undefined) return;

    let [[x0, y0], [x1, y1]] = selection;

    let selectionInverted = selection.map(([x, y]) => [
      overviewX.invert(+x),
      overviewY.invert(+y),
    ]);

    let [[xi0, yi0], [xi1, yi1]] = selectionInverted;
    let textX = "X: [" + fmtX(xi0) + ", " + fmtX(xi1) + "]";
    let textY = "Y: [" + fmtY(yi1) + ", " + fmtY(yi0) + "]";

    if (!useNewTooltip) {
      brushTooltipElement.style("display", "initial");
      brushTooltipElement.select(".tool_x_text").text(textX);
      brushTooltipElement.select(".tool_y_text").text(textY);
    }
    // tooltipCoords.x = sourceEvent.x;
    // tooltipCoords.y = sourceEvent.y;

    tooltipCoords.x = Math.min(x0, x1);
    tooltipCoords.y = Math.min(y0, y1);

    if (useNewTooltip) {
      brushTooltipEditable.__update({
        selection: selectionInverted,
        selectionPixels: selection,
      });
    }
  }

  function hideTooltip(element, removed) {
    if (removed || element.style("pointer-events") === "all") {
      if (!useNewTooltip) brushTooltipElement.style("display", "none");
    }

    if (useNewTooltip) brushTooltipEditable.__hide();
  }

  function brushed({ selection, sourceEvent }, brush) {
    if (sourceEvent === undefined) return; // dont execute this method when move brushes programatically

    brush[1].selection = selection;
    if (updateBrush(brush)) {
      //Update intersections with modified brush
      brushFilterRender();
      updateStatus();
      triggerValueUpdate();
    }
  }

  function endBrush({ selection, sourceEvent }, brush) {
    if (sourceEvent === undefined) return;
    if (selection) {
      let [[x0, y0], [x1, y1]] = selection;
      if (Math.abs(x0 - x1) < 5 && Math.abs(y0 - y1) < 5) {
        removeBrush(brush);
      } else if (!ts.autoUpdate) {
        if (brush[1].isSelected) {
          updateSelection();
        } else {
          brushed({ selection, sourceEvent }, brush);
        }
      }
    } else {
      removeBrush(brush);
    }
    if (brush[0] === brushCount - 1) newBrush();

    drawBrushes();
  }

  function newBrush() {
    let brush = d3.brush().on("start", (e, brush) => {
      if (brush[0] === brushCount - 1) {
        brushSize++;
        brushesGroup.get(brush[1].group).delete(brush[0]);
        brush[1].group = brushGroupSelected;
        brushesGroup.get(brushGroupSelected).set(brush[0], brush[1]);
        drawBrushes();
      }
      if (ts.autoUpdate) {
        tBrushed(e, brush);
      }
    });
    brush.on("brush.move", moveSelectedBrushes);
    brush.on("brush.spinBox", tUpdateBrushSpinBox);

    if (ts.autoUpdate) {
      brush.on("brush.brushed", tBrushed);
    }
    if (ts.showBrushTooltip) {
      brush.on("brush.show", tShowTooltip);
    }
    brush.on("end", endBrush);
    brushesGroup.get(brushGroupSelected).set(brushCount, {
      brush: brush,
      intersections: new Map(),
      isSelected: false,
      group: brushGroupSelected,
      selection: null,
    });
    brushCount++;
  }

  // Returns a shadow if the brush is the current one
  function brushShadowIfInSpinBox(d) {
    return brushInSpinBox && d[0] === brushInSpinBox[0] ? brushShadow : "";
  }

  function drawBrushes() {
    let brushes = [];
    brushesGroup.forEach((d) => (brushes = brushes.concat(Array.from(d))));

    g.select("#brushes")
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
            .style("-webkit-filter", brushShadowIfInSpinBox)
            .style("filter", brushShadowIfInSpinBox)
            .each(function (d, i) {
              d3.select(this)
                .selectAll(".selection")
                .style("outline", "-webkit-focus-ring-color solid 0px")
                .attr("tabindex", 0)
                .on("mousedown", (sourceEvent) => {
                  let selection = d[1].selection;
                  updateBrushSpinBox({ selection, sourceEvent }, d);

                  // Show shadow on current brush
                  g.select("#brushes")
                    .selectAll(".brush")
                    .style("-webkit-filter", brushShadowIfInSpinBox)
                    .style("filter", brushShadowIfInSpinBox);

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
                      if (!useNewTooltip) hideTooltip(d3.select(this));
                    },
                    false
                  );
              }
            });
        },
        (update) =>
          update
            //  Draw a shadow on the current brush
            .style("-webkit-filter", brushShadowIfInSpinBox)
            .style("filter", brushShadowIfInSpinBox)
            .style("display", (d) => enableBrushGroups.has(d[1].group) ? "" : "none" ) // Hide brushes when their group is not enabled
            .style("pointer-events", (d) => d[1].group === brushGroupSelected ? "all" : "none") // disable interaction with not active brushes.
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

    g.select("#brushes")
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

  function brushFilterRender() {
    dataNotSelected = [];
    dataSelected = new Map();
    brushesGroup.forEach((d, key) => dataSelected.set(key, []));

    if (brushSize > 0) {
      for (let d of groupedData) {
        if (!ts.groupAttr || selectedGroupData.has(d[1][0][ts.groupAttr])) {
          let isSelected = false;
          for (let brushGroup of brushesGroup.entries()) {
            if (intersectGroup(d, brushGroup[1])) {
              dataSelected.get(brushGroup[0]).push(d);
              isSelected = true;
            }
          }
          if (!isSelected) {
            dataNotSelected.push(d);
          }
        }
      }

      triggerValueUpdate(dataSelected);

      render(dataSelected, dataNotSelected);
    } else {
      triggerValueUpdate([]);

      if (ts.groupAttr) {
        let data = groupedData.filter((d) =>
          selectedGroupData.has(d[1][0][ts.groupAttr])
        );
        dataSelected.set(0, data);
        render(dataSelected, dataNotSelected);
      } else {
        dataSelected.set(0, groupedData);
        render(dataSelected, dataNotSelected);
      }
    }

    renderBrushesControls();

    return [dataSelected, dataNotSelected];
  }

  function removeBrush(brush) {
    brushSize--;
    brushesGroup.get(brush[1].group).delete(brush[0]);
    // Clears selected brush, must be done before rendering
    emptyBrushSpinBox();

    drawBrushes();
    brushFilterRender();
    hideTooltip(null, true);
  }

  function updateBrush(brush) {
    let [[x0, y0], [x1, y1]] = brush[1].selection;
    let newIntersections = inteserctBVH(BVH, x0, y0, x1, y1);
    let updated = !compareMaps(newIntersections, brush[1].intersections);
    brush[1].intersections = newIntersections;
    return updated;
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
      renderBrushesControls();
      brushFilterRender();
      updateStatus();
      triggerValueUpdate();
    }
  }

  function moveSelectedBrushes({ selection, sourceEvent }, triggerBrush) {
    if (sourceEvent === undefined) return; // dont execute this method when move brushes programatically
    if (!selection || !triggerBrush[1].isSelected) return;

    let [[x0, y0], [x1, y1]] = selection;
    let distX = x0 - triggerBrush[1].selection[0][0];
    let distY = y0 - triggerBrush[1].selection[0][1];
    triggerBrush[1].selection = selection;
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
        }
      }
    }

    if (ts.autoUpdate) {
      tUpdateSelection();
    }
  }

  function makeBVH(data, xPartitions, yPartitions, width, height) {
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

    data.forEach((d) => {
      let key = d[0];
      let lastXindex = -1;
      let lastYindex = -1;
      for (let i = 0; i < d[1].length; ++i) {
        let current = d[1][i];
        let xCoor = overviewX(x(current));
        let yCoor = overviewY(y(current));
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
    return BVH;
  }

  function inteserctBVH(BVH, x0, y0, x1, y1) {
    //avoid overflow when brush are in the limits
    x1 = x1 === BVH.width ? x1 - 1 : x1;
    y1 = y1 === BVH.height ? y1 - 1 : y1;

    let initI = Math.floor(x0 / BVH.xinc);
    let finI = Math.floor(x1 / BVH.xinc);
    let initJ = Math.floor(y0 / BVH.yinc);
    let finJ = Math.floor(y1 / BVH.yinc);

    let intersections = new Map();
    BVH.keys.forEach((d) => intersections.set(d, false));
    for (let i = initI; i <= finI; ++i) {
      for (let j = initJ; j <= finJ; ++j) {
        for (const segments of BVH.BVH[i][j].data) {
          if (!intersections.get(segments[0])) {
            for (const segment of segments[1]) {
              let intersect = lineIntersection(segment, x0, y0, x1, y1);
              if (intersect) {
                intersections.set(segments[0], true);
                break;
              }
            }
          }
        }
      }
    }
    return intersections;
  }

  function lineIntersection(line, x0, y0, x1, y1) {
    line = line.map((d) => [overviewX(x(d)), overviewY(y(d))]);
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

  function compareMaps(map1, map2) {
    for (const [key, value] of map1) {
      if (map2.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  function updateStatus() {
    // exportColors
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

    statusCallback({ colors: colors, brushGroups: brushGroups });
  }

  // Triggers the update of the selection calls callback and dispatches input event
  function triggerValueUpdate(sel = divOverview.value) {
    if (!sel) {
      log("Return selection with empty selection", sel);
      return;
    }
    updateCallback(sel);

    divOverview.value = Array.from(sel.values());
    divOverview.value.brushes = Array.from(
      brushesToDomain(brushesGroup).values()
    );
    divOverview.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function brushesToDomain(brushesGroup) {
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

          nBrush.isActive = !!brushInSpinBox && brushInSpinBox[0] === brush[0];

          innerMap.set(brush[0], nBrush);
        }
      }
      outMap.set(brushGroup[0], innerMap);
    }
    return outMap;
  }

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
    // Ignore null values. Shouldn't be y(d) && x(d) because y(d) can be 0
    fData = data.filter(
      (d) =>
        y(d) !== undefined &&
        y(d) !== null &&
        x(d) !== undefined &&
        x(d) !== null
    );
    groupedData = d3.groups(fData, id);

    // Limit the number of timelines
    if (maxTimelines) groupedData = groupedData.slice(0, maxTimelines);

    // Adjust the alpha based on the number of lines
    ts.alphaScale.domain([0, groupedData.length]);

    groupedData.map((d) => [
      d[0],
      d[1].sort((a, b) => d3.ascending(x(a), x(b))),
    ]);

    let xDataType = typeof x(fData[0]);
    if (xDataType === "object" && x(fData[0]) instanceof Date) {
      // X is Date
      hasScaleTime = true;
      overviewX = d3
        .scaleTime()
        .domain(d3.extent(fData, (d) => x(d)))
        .range([0, overviewWidth - ts.margin.right - ts.margin.left]);

      detailedX = d3
        .scaleTime()
        .domain(d3.extent(fData, (d) => x(d)))
        .range([0, detailedWidth - ts.margin.right - ts.margin.left]);
    } else if (xDataType === "number") {
      // X is number
      overviewX = d3
        .scaleLinear()
        .domain(d3.extent(fData, (d) => x(d)))
        .range([0, overviewWidth - ts.margin.right - ts.margin.left]);
      //.nice();

      detailedX = d3
        .scaleLinear()
        .domain(d3.extent(fData, (d) => x(d)))
        .range([0, detailedWidth - ts.margin.right - ts.margin.left]);
    }

    overviewY = d3
      .scaleLinear()
      .domain(d3.extent(fData, (d) => y(d)))
      .range([overviewHeight - ts.margin.top - ts.margin.bottom, 0])
      .nice();

    detailedY = d3
      .scaleLinear()
      .domain(d3.extent(fData, (d) => y(d)))
      .range([detailedHeight - ts.margin.top - ts.margin.bottom, 0])
      .nice();

    line2 = d3
      .line()
      .defined((d) => y(d) !== undefined && y(d) !== null)
      .x((d) => overviewX(x(d)))
      .y((d) => overviewY(y(d)));

    line2Detailed = d3
      .line()
      .defined((d) => y(d) !== undefined && y(d) !== null)
      .x((d) => detailedX(x(d)))
      .y((d) => detailedY(y(d)));

    BVH = makeBVH(
      groupedData,
      ts.xPartitions,
      ts.yPartitions,
      overviewWidth,
      overviewHeight
    );

    g = init();
    gBrushes = g.append("g").attr("id", "brushes");
    createBrushTooltip();

    renderObject =
      renderer === "canvas" ? renderCanvas(groupedData) : renderSVG();
    render = renderObject.render;
    if (ts.hasDetailed) {
      prerenderDetailed = renderObject.preRender;
    }

    generateDataSelectionDiv();
    generateBrushCoordinatesDiv();

    addBrushGroup();
    dataSelected.set(0, groupedData);
    newBrush();
    drawBrushes();

    triggerValueUpdate([]);
    selectBrushGroup(0);
  };

  // If we receive the data on initialization call ts.Data
  if (data) {
    ts.data(data);
  }

  // To allow a message from the outside to rerender
  ts.render = () => render(dataSelected, dataNotSelected);

  // Make the ts object accesible
  divOverview.ts = ts;
  divOverview.details = divDetailed;
  divOverview.brushesCoordinates = divBrushesCoordinates;

  if (data) triggerValueUpdate(data);
  return divOverview;
}

export default TimeSearcher;
