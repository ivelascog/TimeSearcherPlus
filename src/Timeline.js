import * as d3 from "d3";

// import {log} from "./utils.js";

function Timeline({
  points = [],
  width = 600,
  height = 300,
  margin = { top: 10, left: 40, right: 10, bottom: 10 },
  xScale = d3.scaleLinear().range([0, width]),
  yScale = d3.scaleLinear().range([height, 0]),
  line = d3.line(),
  title = "",
  target = null, // where to draw it
} = {}) {
  let div = (target ? d3.select(target) : d3.create("div"))
    .attr("class", "details")
    .style("position", "relative");

  // cleanup
  div.selectAll("*").remove();

  let g = div
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("height", height)
    .attr("width", width)
    .append("g")
    .attr("class", "gDrawing")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  g.append("g")
    .attr("class", "detailsYAxis")
    .call(d3.axisLeft(yScale).ticks(Math.floor(height / 30)));

  g.append("g")
    .attr("class", "detailsXAxis")
    .call(d3.axisBottom(xScale))
    .attr("transform", `translate(0, ${height - margin.top - margin.bottom})`);

  g.append("text")
    .text(title)
    .attr("transform", "translate(10, 0)")
    .style("fill", "black")
    .style("font-size", "0.7em");

  g.append("path")
    .attr("d", line(points))
    .style("fill", "none")
    .style("stroke", "black");

  return div;

  /*  let canvas = div
            .append("canvas")
            .attr("height", height)
            .attr("width", width)
            .style("position", "absolute")
            .style("top", `${margin.top}px`)
            .style("left", `${margin.left}px`)
            .style("pointer-events", "none");

          let context = canvas.node().getContext("2d");
          let path = new Path2D(line2Details(d[1]));
          context.stroke(path); */
}

export default Timeline;
