import * as d3 from "d3";

// import {log} from "./utils.js";

function Timeline({
  points = [],
  width = 600,
  height = 300,
  margin = { top: 10, left: 40, right: 10, bottom: 10 },
  xScale = d3.scaleLinear().range([0, width]),
  yScale = d3.scaleLinear().range([height, 0]),
  x = (d) => d[0],
  y = (d) => d[1],
  line = d3.line(),
  title = "",
  target = null, // where to draw it
  renderer = "canvas",
  pointRadius = 1.5,
  strokeColor = "#777",
} = {}) {
  let div = (target ? d3.select(target) : d3.create("div"))
    .attr("class", "details")
    .style("position", "relative");

  // cleanup
  div.selectAll("*").remove();

  let canvas = div
    .append("canvas")
    .style("position", "absolute")
    .style("top", `${margin.top}px`)
    .style("left", `${margin.left}px`)
    .style("height", height + "px")
    .style("width", width + "px")
    .style("pointer-events", "none");
  let context = canvas.node().getContext("2d");

  // https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
  const scale = window.devicePixelRatio || 1;
  canvas
    .attr("height", Math.floor(height * scale))
    .attr("width", Math.floor(width * scale));
  // Normalize coordinate system to use CSS pixels.
  context.scale(scale, scale);

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
    .style("fill", strokeColor)
    .style("font-size", "0.7em");

  if (renderer.toUpperCase() == "SVG") {
    g.append("path")
      .attr("d", line(points))
      .style("fill", "none")
      .style("stroke", strokeColor);

    g.append("points")
      .selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (d) => xScale(x(d)))
      .attr("cx", (d) => xScale(x(d)))
      .attr("r", pointRadius)
      .attr("stroke", strokeColor);
  } else {
    let path = new Path2D(line(points));
    context.strokeStyle = strokeColor;
    context.stroke(path);

    context.beginPath();
    for (let p of points) {
      context.moveTo(xScale(x(p))+ pointRadius, yScale(y(p)) + pointRadius);
      context.arc(xScale(x(p)), yScale(y(p)), pointRadius, 0, 2 * Math.PI);
    }

    context.stroke();
  }

  return div;
}

export default Timeline;
