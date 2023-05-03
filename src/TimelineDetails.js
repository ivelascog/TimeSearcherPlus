import * as d3 from "d3";

// import { log } from "./utils.js";

import Timeline from "./Timeline.js";

function TimelineDetails({
  ts,
  detailsElement,
  detailsContainerHeight,
  detailsWidth,
  maxDetailsRecords,
  detailsHeight,
  x,
  y,
  margin = { left: 20, top: 10, bottom: 20, right: 0 },
} = {}) {
  const me = {};
  let prerenderDetails = new Map();

  const divDetails = d3
    .select(detailsElement)
    .attr("id", "detail")
    .style("height", `${detailsContainerHeight}px`)
    .style("width", `${detailsWidth}px`)
    .style("overflow-y", "scroll")
    .node();

  const line = d3.line().defined((d) => y(d) !== undefined && y(d) !== null);    

  let detailsX, detailsY;

  me.setScales = function ({ fData, xDataType }) {
    if (xDataType === "object" && x(fData[0]) instanceof Date) {
      detailsX = d3
        .scaleTime()
        .domain(d3.extent(fData, x))
        .range([0, detailsWidth - margin.right - margin.left]);
    } else {
      detailsX = d3
        .scaleLinear()
        .domain(d3.extent(fData, x))
        .range([0, detailsWidth - margin.right - margin.left]);
    }

    detailsY = ts
      .yScale()
      .domain(d3.extent(fData, y))
      .range([detailsHeight - margin.top - margin.bottom, 0]);

    line.x((d) => detailsX(+x(d))).y((d) => detailsY(y(d)));
  };

  

  // ts.observer = new IntersectionObserver(onDetailsScrolled, {
  //   root: divDetails,
  //   threshold: 0.1,
  // });

  me.generatePrerenderDetails = function (data) {
    prerenderDetails = new Map();
    // log("Prerendering Details:...");
    // data.forEach((d) => {
    //   const div = Timeline({
    //     width: detailsWidth,
    //     height: detailsHeight,
    //     margin: margin,
    //     yScale: detailsY,
    //     xScale: detailsX,
    //     title: d[0],
    //     points: d[1],
    //     line: line,
    //   });

    //   prerenderDetails.set(d[0], div);
    // });

    // log("Prerendering Details: done", prerenderDetails);
    return prerenderDetails;
  };

  // function onDetailsScrolled(entries) {
  //   log("onDetailsScrolled ", entries);
  //   entries.forEach((entry) => {
  //     if (entry.isIntersecting) {
  //       let div = entry.target;
  //       let group = div.getAttribute("group");
  //       // group = typeof groupedData[0][0] === "number" ? +group : group;
  //       const prerenderDetailsEle = prerenderDetails.get(group);
  //       if (!prerenderDetailsEle) {
  //         console.log(
  //           "Error onDetailsScrolled couldn't find ",
  //           group,
  //           " on ",
  //           prerenderDetails
  //         );
  //         return;
  //       }
  //       div.appendChild(prerenderDetailsEle.node());
  //     } else {
  //       entry.target.innerHTML = "";
  //     }
  //   });
  // }

  function renderDetailsCanvas({ data, brushGroupSelected }) {
    // let frag = document.createDocumentFragment();

    let slicedData = maxDetailsRecords
      ? data.get(brushGroupSelected).slice(0, maxDetailsRecords)
      : data.get(brushGroupSelected);

    // log("renderDetailsCanvas", brushGroupSelected, data, slicedData);

    divDetails.innerHTML = "";
    d3.select(divDetails)
      .selectAll("div.detailsContainer")
      .data(slicedData, (d) => d[0])
      .join("div")
      .attr("class", "detailsContainer")
      .attr("group", (d) => d[0])
      .each(function (d) {
        Timeline({
          target: this,
          width: detailsWidth,
          height: detailsHeight,
          margin,
          yScale: detailsY,
          xScale: detailsX,
          title: d[0],
          points: d[1],
          line: line,
        });
      });

    // for (let d of slicedData) {
    //   // let div = document.createElement("div");
    //   div.node().className = "detailsContainer";
    //   div.node().setAttribute("group", d[0]);
    //   // div.style.height = `${detailsHeight}px`;
    //   // frag.appendChild(div);

    //   divDetails.appendChild(div.node());
    // }

    // removed to reduce flickering
    // divDetails.innerHTML = "";

    // Observer API To only show in the details view the divs that are visible
    // window.requestIdleCallback(() => {
    //   divDetails.replaceChildren(frag);
    //   divDetails.querySelectorAll(".detailsContainer").forEach((d) => {
    //     ts.observer.observe(d);
    //   });
    // });
  }

  function createDetailsChart(d) {
    let g = d3
      .select(this)
      .append("svg")
      .attr("class", "details")
      .attr("viewBox", [0, 0, detailsWidth, detailsHeight])
      .attr("height", detailsHeight)
      .attr("width", detailsWidth)
      .append("g");
    g.attr("transform", `translate(${margin.left}, ${margin.top})`);

    g.append("g")
      .attr("class", "mainYAxis")
      .call(d3.axisLeft(detailsY).ticks(Math.floor(detailsHeight / 20)));

    g.append("g")
      .attr("class", "mainXAxis")
      .call(d3.axisBottom(detailsX))
      .attr(
        "transform",
        `translate(0, ${detailsHeight - margin.top - margin.bottom})`
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
      .attr("cy", (d) => detailsY(y(d)))
      .attr("cx", (d) => detailsX(x(d)))
      .attr("fill", "black")
      .attr("r", 2);

    g.selectAll(".lines") //TODO add to the new G
      .data([d])
      .join("path")
      .attr("class", "line")
      .attr("d", (g) => line(g[1]))
      .style("fill", "none")
      .style("stroke", "black");
  }

  me.renderDetailsSVG = function (data) {
    const div = d3.select(divDetails);

    let slicedData = maxDetailsRecords
      ? data.slice(0, maxDetailsRecords)
      : data;

    div
      .selectAll(".details")
      .data(slicedData, (d) => d[0])
      .join("div")
      .each(createDetailsChart);
  };

  me.render = ({ data, brushGroupSelected }) =>
    renderDetailsCanvas({ data, brushGroupSelected });

  return me;
}

export default TimelineDetails;
