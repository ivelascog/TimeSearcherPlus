import * as d3 from "d3"
import "d3-array";

function TimeSearcher(selectionOverview,
                      selectionDetailed,
                      _xAttr,
                      _yAttr,
                      _groupAttr,
                      _renderer = "canvas",
                      _overviewWidth = 600,
                      _detailedWidth = 580 - 20,
                      _overviewHeight = 400,
                      _detailedHeight = _overviewHeight / 2,
                      _detailedContainerHeight = 400) {
    let ts = this || {},
        data,
        groupedData,
        xAttr = _xAttr,
        yAttr = _yAttr,
        groupAttr = _groupAttr,
        renderer = _renderer,
        overviewWidth = _overviewWidth,
        detailedWidth = _detailedWidth,
        overviewHeight = _overviewHeight,
        detailedHeight = _detailedHeight,
        detailedContainerHeight = _detailedContainerHeight,
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
        divDetailed,
        g,
        gBrushes,
        brushes,
        brushCount,
        BVH



    ts.xPartitions = 10;
    ts.yPartitions = 10;

    ts.wait = false;
    ts.margin = { left: 60, top: 20, bottom: 50, right: 20 };
    divOverview = selectionOverview.style("position","relative").node();
    divDetailed = selectionDetailed
    divDetailed = divDetailed
        .attr("id","detail")
        .style("height",`${detailedContainerHeight}px`)
        .style("width",`${overviewWidth+40}px`)
        .style("overflow-y","scroll")
        .node()
    brushes = new Map();
    brushCount = 0;



    ts.observer = new IntersectionObserver(onDetailedScrolled, {
        root: divDetailed,
        threshold: 0.1
    });

    function init() {
        //CreateOverView
        const svg = d3
            .select(divOverview)
            .append("svg")
            .attr("viewBox", [0, 0, overviewWidth, overviewHeight])
            .attr("height", overviewHeight)
            .attr("width", overviewWidth);

        const g = svg
            .append("g")
            .attr("class", "gDrawing")
            .attr("transform", `translate(${ts.margin.left}, ${ts.margin.top})`)
            .attr("tab-index",0)
            .style("pointer-events", "all")
            .on("keydown", ({ keyCode, key }) => {
                console.log("keyPress")
            });

        g.append("g")
            .attr("class", "mainYAxis")
            .call(d3.axisLeft(overviewY))
            .style("pointer-events", "none");

        g.append("g")
            .attr("class", "mainXAxis")
            .call(d3.axisBottom(overviewX))

            .attr(
                "transform",
                `translate(0, ${overviewHeight - ts.margin.top - ts.margin.bottom})`
            )
            .call((axis) =>
                axis
                    .append("text")
                    .text(xAttr)
                    .attr(
                        "transform",
                        `translate(${overviewWidth - ts.margin.right - ts.margin.left}, -10 )`
                    )
                    .style("fill", "black")
                    .style("text-anchor", "end")
                    .style("pointer-events", "none")
            )
            .style("pointer-events", "none");

        return g;
    }

      ts.Data = function (_data) {
        data = _data;
        groupedData = d3.group(data, (d) => d[groupAttr]);
        groupedData = Array.from(groupedData);

        data.forEach((d, i) => {
            d["__id__"] = i;
        });

        overviewX = d3
            .scaleTime()
            .domain(d3.extent(data, (d) => d[xAttr]))
            .range([0, overviewWidth - ts.margin.right - ts.margin.left]);

       overviewY = d3
            .scaleLinear()
            .domain(d3.extent(data, (d) => d[yAttr]))
            .range([overviewHeight - ts.margin.top - ts.margin.bottom, 0])
            .nice();

        detailedX = d3
            .scaleTime()
            .domain(d3.extent(data, (d) => d[xAttr]))
            .range([0, detailedWidth - ts.margin.right - ts.margin.left]);

        detailedY = d3
            .scaleLinear()
            .domain(d3.extent(data, (d) => d[yAttr]))
            .range([detailedHeight - ts.margin.top - ts.margin.bottom, 0])
            .nice();

        line2 = d3
            .line()
            .x((d) => overviewX(d[xAttr]))
            .y((d) => overviewY(d[yAttr]));

        line2Detailed = d3
            .line()
            .x((d) => detailedX(d[xAttr]))
            .y((d) => detailedY(d[yAttr]));

        BVH = makeBVH(
            groupedData,
            ts.xPartitions,
            ts.yPartitions,
            overviewWidth,
            overviewHeight
        );

        g = init();
        gBrushes = g.append("g").attr("id", "brushes");

        newBrush();
        drawBrushes();

        renderObject =
            renderer === "canvas" ? renderCanvas(groupedData) : renderSVG();
        render = renderObject.render;
        prerenderDetailed = renderObject.preRender;

        render(groupedData, []);

        divOverview.value = groupedData;
        divOverview.dispatchEvent(new Event("input", { bubbles: true }));

    }

    function onDetailedScrolled(entries, observer) {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                let div = entry.target;
                let group = div.getAttribute("group");
                div.appendChild(prerenderDetailed.get(group).node());
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
                            .attr("cy", (d) => overviewY(d[yAttr]))
                            .attr("cx", (d) => overviewX(d[xAttr]))
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

            div
                .selectAll(".detailed")
                .data(data, (d) => d[0])
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
                            g.attr("transform", `translate(${ts.margin.left}, ${ts.margin.top})`);

                            g.append("g")
                                .attr("class", "mainYAxis")
                                .call(d3.axisLeft(detailedY));

                            g.append("g")
                                .attr("class", "mainXAxis")
                                .call(d3.axisBottom(detailedX))
                                .attr(
                                    "transform",
                                    `translate(0, ${detailedHeight - ts.margin.top - ts.margin.bottom})`
                                );

                            g.append("text")
                                .text(d[0])
                                .attr("transform", `translate(10, 0)`)
                                .style("fill", "black")
                                .style("font-size", "0.7em");

                            g.selectAll(".point") //.select("#points") //TODO make new G with id for this cricles
                                .data(d[1])
                                .join("circle")
                                .attr("class", "point")
                                .attr("cy", (d) => detailedY(d[yAttr]))
                                .attr("cx", (d) => detailedX(d[xAttr]))
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
        const canvas = d3
            .select(divOverview)
            .append("canvas")
            .attr("height", overviewHeight * window.devicePixelRatio)
            .attr("width", overviewWidth * window.devicePixelRatio)
            .style("position", "absolute")
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
            paths.set(d[0], new Path2D(line2(d[1])));
        });

        let prerenderDetailed = generatePrerenderDetailed(data);

        function render(data) {
            renderOverviewCanvas(data);
            window.requestAnimationFrame(() => renderDetailedCanvas(data));
        }

        function renderOverviewCanvas(data) {
            let namesSelected = data.map((d) => d[0]);
            context.clearRect(0, 0, canvas.node().width, canvas.node().height);

            paths.forEach((d, name) => {
                if (namesSelected.includes(name)) {
                    context.globalAlpha = 1.0;
                    context.styleStroke = "black";
                } else {
                    context.globalAlpha = 0.1;
                    context.styleStroke = "gray";
                }
                context.stroke(d);
            });
        }

        function renderDetailedCanvas(data) {
            let frag = document.createDocumentFragment();

            data.forEach((d) => {
                let div = document.createElement("div");
                div.className = "detailedContainer";
                div.setAttribute("group", d[0]);
                div.style.height = `${detailedHeight}px`;
                frag.appendChild(div);
            });

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
                    .attr("transform", `translate(10, 0)`)
                    .style("fill", "black")
                    .style("font-size", "0.7em");

                let canvas = div
                    .append("canvas")
                    .attr("height", detailedHeight)
                    .attr("width", detailedWidth)
                    .style("position", "absolute")
                    .style("top", `${ts.margin.top}px`)
                    .style("left", `${ts.margin.left}px`)
                    .style("pointer-events", "none");

                let context = canvas.node().getContext("2d");
                let path = new Path2D(line2Detailed(d[1]));
                context.stroke(path);

                prerenderDetailed.set(d[0], div);
            });
            return prerenderDetailed;
        }

        return { render: render, preRender: prerenderDetailed };
    }

    //------------- Brush section ---------- //

    function brushed({ selection, sourceEvent }, brush) {
        if (sourceEvent === undefined) return; // dont execute this method when move brushes programatically

        let [[x0, y0], [x1, y1]] = selection;
        if (brush[1].isSelected) {
            let distX = x0 - brush[1].selection[0][0];
            let distY = y0 - brush[1].selection[0][1];
            moveSelectedBrushes(distX, distY, brush);
        } else {
            if (ts.wait) return; // control the update of view and intesesctions

            ts.wait = true;
            if (updateBrush(brush, groupedData, x0, y0, x1, y1)) {
                //Update intersections with modified brush
                brushFilterRender();
            }

            setTimeout(() => (ts.wait = false), 100);
        }

        brush[1].selection = selection;
    }

    function endBrush({ selection }) {
        const selectedBrush = parseInt(d3.select(this).attr("id").substring(6));
        if (selection) {
            let [[x0, y0], [x1, y1]] = selection;
            if (Math.abs(x0 - x1) < 20 && Math.abs(y0 - y1) < 20) {
                removeBrush(selectedBrush);
            }
        } else {
            removeBrush(selectedBrush);
        }
        if (selectedBrush === brushCount - 1) newBrush();

        drawBrushes();
    }

    function newBrush() {
        let brush = d3.brush().on("start brush", brushed).on("end", endBrush);
        brushes.set(brushCount, {
            brush: brush,
            intersections: new Map(),
            isSelected: false,
            currentSelection: undefined
        });
        brushCount++;
    }

    function drawBrushes() {
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
                        .each(function (d) {
                            return d3
                                .select(this)
                                .selectAll(".selection")
                                .style("outline", "-webkit-focus-ring-color solid 2px")
                                .attr("tabindex", 0)
                                .on("keydown", ({ keyCode, key }) => {
                                    if (key === "r" || key === "Backspace") removeBrush(d[0]);
                                })
                                .on("mousedown", ({ shiftKey }) => {
                                    if (shiftKey) {
                                        selectBrush(d);
                                    }
                                });
                        });
                },
                (update) =>
                    update.each(function (d) {
                        d3.select(this)
                            .selectAll(".selection")
                            .attr("fill", d[1].isSelected ? "#99f" : "#777");
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
        let dataSelected = [];
        let dataNotSelected = [];
        if (brushes.size > 0) {
            groupedData.forEach((d) => {
                (allIntersect(d) ? dataSelected : dataNotSelected).push(d);
            });

            divOverview.value = dataSelected;
            divOverview.dispatchEvent(new Event("input", { bubbles: true }));

            render(dataSelected);
        } else {
            divOverview.value = groupedData;
            divOverview.dispatchEvent(new Event("input", { bubbles: true }));
            render(groupedData);
        }

        return [dataSelected, dataNotSelected];
    }

    function removeBrush(id) {
        brushes.delete(id);
        drawBrushes();
        brushFilterRender();
    }

    function updateBrush(brush, data, x0, y0, x1, y1) {
        let newIntersections = inteserctBVH(BVH, x0, y0, x1, y1);
        let updated = !compareMaps(newIntersections, brush[1].intersections);
        brush[1].intersections = newIntersections;
        return updated;
    }

    function allIntersect(data) {
        let intersect = true;
        for (const brush of brushes.values()) {
            intersect =
                intersect &&
                (brush.intersections.get(data[0]) || brush.intersections.size === 0);
        }
        return intersect;
    }

    function selectBrush(brush) {
        brush[1].isSelected = !brush[1].isSelected;
    }

    function moveSelectedBrushes(distX, distY, triggerBrush) {
        for (const brush of brushes) {
            if (brush[1].isSelected && !(triggerBrush[0] === brush[0])) {
                let [[x0, y0], [x1, y1]] = brush[1].selection;
                x0 += distX;
                x1 += distX;
                y0 += distY;
                y1 += distY;
                gBrushes.select("#brush-" + brush[0]).call(brush[1].brush.move, [
                    [x0, y0],
                    [x1, y1]
                ]);
                brush[1].selection = [
                    [x0, y0],
                    [x1, y1]
                ];
            }
        }

        if (ts.wait) return; //Controls the update frequency of intersections and drawing
        ts.wait = true;

        let update = false;
        for (const brush of brushes) {
            if (brush[1].isSelected) {
                let [[x0, y0], [x1, y1]] = brush[1].selection;
                update = update || updateBrush(brush, groupedData, x0, y0, x1, y1);
            }
        }
        if (update) {
            brushFilterRender();
        }
        setTimeout(() => (ts.wait = false), 100);
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
            BVH: []
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
                    data: new Map()
                };
            }
        }

        data.forEach((d) => {
            let key = d[0];
            let lastXindex = -1;
            let lastYindex = -1;
            for (let i = 0; i < d[1].length; ++i) {
                let current = d[1][i];
                let xCoor = overviewX(current[xAttr]);
                let yCoor = overviewY(current[yAttr]);
                let xIndex = Math.floor(xCoor / xinc);
                let yIndex = Math.floor(yCoor / yinc);

                if (xIndex === lastXindex && yIndex === lastYindex) {
                    BVH.BVH[xIndex][yIndex].data.get(key).at(-1).push(current);
                }
                // The operator ?. is there for posible null fields

                if (i > 0) {
                    if (xIndex !== lastXindex || yIndex !== lastYindex) {
                        BVH.BVH[lastXindex][lastYindex].data.get(key).at(-1).push(current);
                        let previous = d[1][i - 1];
                        if (BVH.BVH[xIndex][yIndex].data.has(key)) {
                            BVH.BVH[xIndex][yIndex].data.get(key).push([previous]);
                            BVH.BVH[xIndex][yIndex].data.get(key).at(-1).push(current);
                        } else {
                            BVH.BVH[xIndex][yIndex].data.set(key, [[previous]]);
                            BVH.BVH[xIndex][yIndex].data.get(key).at(-1).push(current);
                        }
                    }
                } else {
                    BVH.BVH[xIndex][yIndex].data.set(key, [[current]]);
                }
                lastXindex = xIndex;
                lastYindex = yIndex;
            }
        });
        return BVH;
    }

    function inteserctBVH(BVH, x0, y0, x1, y1) {
        //avoid overflow when brush are in the limits
        x1 = x1 === BVH.widht ? x1 - 1 : x1;
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
        line = line.map((d) => [overviewX(d[xAttr]), overviewY(d[yAttr])]);
        let initPoint = line[0];

        for (let index = 1; index < line.length; ++index) {
            let finalPoint = line[index];
            let intersectX0 = initPoint[0] <= x0 && finalPoint[0] >= x0;
            if (intersectX0) {
                let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
                let y = m * (x0 - initPoint[0]) + initPoint[1];
                let intersect = y >= y0 && y <= y1;
                if (intersect) return true;
            }

            let intersectX1 = initPoint[0] <= x1 && finalPoint[0] >= x1;
            if (intersectX1) {
                let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
                let y = m * (x1 - initPoint[0]) + initPoint[1];
                let intersect = y >= y0 && y <= y1;
                if (intersect) return true;
            }

            let intersectY0 = initPoint[1] <= y0 && finalPoint[1] >= y0;
            if (intersectY0) {
                let m = (finalPoint[1] - initPoint[1]) / (finalPoint[0] - initPoint[0]);
                let x = (y0 - initPoint[1]) / m + initPoint[0];
                let intersect = x >= x0 && x <= x1;
                if (intersect) return true;
            }

            let intersectY1 = initPoint[1] >= y1 && finalPoint[1] <= y1;
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

    divOverview.details = divDetailed;
    return ts;
}

export default TimeSearcher