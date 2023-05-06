import * as d3 from "d3";
import { log } from "./utils.js";
import TimelineDetails from "./TimelineDetails.js";
function TimeLineOverview({
  ts,
  element,
  width = 800,
  height = 600,
  x,
  y,
  overviewY,
  overviewX,
}) {
  let me = {};
  let paths;

  const divOverview = d3
    .select(element)
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("position", "relative")
    .style("top", "0px")
    .style("left", "0px")
    .style("background-color", ts.backgroundColor);

  let line = d3
    .line()
    .defined((d) => y(d) !== undefined && y(d) !== null)
    .x((d) => overviewX(x(d)))
    .y((d) => overviewY(+y(d)));

  let linem = d3.line();

  const canvas = divOverview
    .append("canvas")
    .attr("height", height * window.devicePixelRatio)
    .attr("width", width * window.devicePixelRatio)
    .style("position", "absolute")
    .style("z-index", "-1")
    .style("top", `${ts.margin.top}px`)
    .style("left", `${ts.margin.left}px`)
    .style("width", `${width}px`)
    .style("height", `${height}px`)
    .style("pointer-events", "none");

  const context = canvas.node().getContext("2d");
  context.scale(window.devicePixelRatio, window.devicePixelRatio);

  me.data = function (data) {
    paths = new Map();
    data.forEach((d) => {
      let group = ts.groupAttr ? d[1][0][ts.groupAttr] : null;
      let pathObject = { path: new Path2D(line(d[1])), group: group };
      paths.set(d[0], pathObject);
    });
  };

  me.setScales = function ({ data, xDataType }) {
    if (xDataType === "object" && x(data[0]) instanceof Date) {
      overviewX = d3
        .scaleTime()
        .domain(d3.extent(data, x))
        .range([0, width - ts.margin.right - ts.margin.left]);
      log("Using date scale for x", overviewX.domain(), overviewX.range());
    } else {
      overviewX = d3
        .scaleLinear()
        .domain(d3.extent(data, x))
        .range([0, width - ts.margin.right - ts.margin.left]);
      log("Using linear scale for x", overviewX.domain(), overviewX.range());
    }

    overviewY = ts
      .yScale()
      .domain(d3.extent(data, y))
      .range([height - ts.margin.top - ts.margin.bottom, 0]);

    line = line.x((d) => overviewX(+x(d))).y((d) => overviewY(y(d)));
    linem = linem.x((d) => overviewX(d[0])).y((d) => overviewY(d[1]));
  };

  function renderOvwerview(
    dataSelected,
    dataNotSelected,
    medians,
    hasSelection
  ) {
    dataNotSelected = dataNotSelected ? dataNotSelected : [];
    context.clearRect(0, 0, canvas.node().width, canvas.node().height);
    if (!hasSelection) {
      // Render all
      renderOverviewCanvasSubset(
        dataSelected,
        ts.defaultAlpha,
        ts.defaultColor
      );
    } else {
      context.lineWidth = 1;

      // Render Non selected
      renderOverviewCanvasSubset(
        dataNotSelected,
        ts.noSelectedAlpha,
        ts.noSelectedColor
      );

      // Render selected
      renderOverviewCanvasSubset(
        dataSelected,
        ts.selectedAlpha,
        ts.selectedColor
      );

      context.save();
      // Render Group Median

      if (medians) {
        context.lineWidth = ts.medianLineWidth;
        context.globalAlpha = ts.medianLineAlpha;

        medians.forEach((d) => {
          let path = new Path2D(linem(d[1]));
          context.setLineDash(ts.medianLineDash);
          context.strokeStyle = ts.brushesColorScale(d[0]);
          context.stroke(path);
        });
      }
      context.restore();
    }
  }

  function renderOverviewCanvasSubset(dataSubset, alpha, color) {
    context.save();
    // Compute the transparency with respect to the number of lines drawn
    // Min 0.05, then adjust by the expected alpha divided by 10% of the number of lines
    // context.globalAlpha = 0.05 + alpha / (dataSubset.length * 0.1);
    context.globalAlpha = alpha * ts.alphaScale(dataSubset.length);

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

  me.render = function (dataSelected, dataNotSelected, medians, hasSelection) {
    renderOvwerview(dataSelected, dataNotSelected, medians, hasSelection);
  };

  return me;
}

export default TimeLineOverview;
