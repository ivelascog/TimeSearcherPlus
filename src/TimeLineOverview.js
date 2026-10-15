import * as d3 from "d3";
import {darken} from "./utils.js";
import WebGPURenderer from "./WebGPURenderer.js";

function TimeLineOverview({
  ts,
  element,
  width = 800,
  height = 600,
  x,
  y,
  groupAttr,
  renderer = "canvas",
}) {
  const dpr = window.devicePixelRatio || 1;
  let me = {};
  let paths, overviewX, overviewY;

  const divOverview = d3
    .select(element)
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("position", "relative")
    .style("top", "0px")
    .style("left", "0px")
    .style("background-color", ts.backgroundColor);

  let line = d3.line()
    .defined((d) => y(d) !== undefined && y(d) !== null);
  
  let linem = d3.line();

  const innerWidth = width - ts.margin.left - ts.margin.right;
  const innerHeight = height - ts.margin.top - ts.margin.bottom;

  const canvas = divOverview
    .selectAll("canvas")
    .data([1])
    .join("canvas")
    .attr("height", innerHeight * dpr)
    .attr("width", innerWidth * dpr)
    .style("position", "absolute")
    .style("z-index", "-1")
    .style("top", `${ts.margin.top}px`)
    .style("left", `${ts.margin.left}px`)
    .style("width", `${innerWidth}px`)
    .style("height", `${innerHeight}px`)
    .style("pointer-events", "none");

  let context = null;

  function initCanvas2D() {
    if (context) return;
    context = canvas.node().getContext("2d");
    context.scale(dpr, dpr);
    console.log("%c[TimeWidget] Canvas 2D Renderer Active", "color: #ffaa00; font-weight: bold;");
  }

  let gpuRenderer = null;
  let isGpuReady = false;
  let pendingRender = null;
  let pendingData = null;

  if (renderer === "webgpu") {
    gpuRenderer = new WebGPURenderer();
    gpuRenderer.init(canvas.node()).then((ok) => {
      if (ok) {
        console.log("%c[TimeWidget] WebGPU Renderer Active", "color: #00ff00; font-weight: bold;");
        isGpuReady = true;
        
        if (pendingData) {
          me.data(pendingData);
          pendingData = null;
        }
        
        if (pendingRender) {
          pendingRender();
          pendingRender = null;
        }
      } else {
        console.warn("[TimeWidget] WebGPU initialization failed, falling back to Canvas 2D");
        gpuRenderer = null;
        initCanvas2D();
      }
    });
  } else {
    initCanvas2D();
  }

  me.data = function (data) {
    paths = new Map();
    data.forEach((d) => {
      let group = groupAttr ? groupAttr(d[1][0]) : null;
      let pathObject = { path: new Path2D(line(d[1])), group: group };
      paths.set(d[0], pathObject);
    });

    if (gpuRenderer) {
      if (!isGpuReady) {
        pendingData = data;
        return;
      }
      const formattedData = data.map(([id, points]) => ({
        id,
        points: points
          .map((p) => [+x(p), +y(p)])
          .filter((p) => !isNaN(p[0]) && !isNaN(p[1])),
      }));

      gpuRenderer.uploadData(formattedData);
      // Ajustar MSAA sin omitir líneas ni puntos del dataset.
      gpuRenderer.setAdaptiveSampleCount(formattedData.length);
      // Invalidar cache de estilos al cargar nuevos datos
      _gpuLastDataSelected = _gpuLastDataNotSelected = _gpuLastMedians = null;
    }
  };

  me.setScales = function ({ scaleX, scaleY }) {
    overviewX = scaleX;
    overviewY = scaleY;

    line = line.x((d) => overviewX(+x(d))).y((d) => overviewY(y(d)));
    linem = linem.x((d) => overviewX(d[0])).y((d) => overviewY(d[1]));
  };

  function renderOvwerview(
    dataSelected,
    groupSelected,
    dataNotSelected,
    medians,
    hasSelection
  ) {
    dataNotSelected = dataNotSelected ? dataNotSelected : [];
    context.clearRect(0, 0, canvas.node().width, canvas.node().height);

    if (!hasSelection) {
      // Render all
      renderOverviewCanvasSubset(
        dataNotSelected,
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

      dataSelected.forEach((data, group) => {
        if (group !== groupSelected) {
          let selectedColor = computeColor(group);
          // console.log(
          //   "Render selected selectedColor",
          //   selectedColor,
          //   group
          // );

          // Render selected
          const groupColor = selectedColor || ts.brushesColorScale(0) || "#4682b4";
          renderOverviewCanvasSubset(
            data,
            ts.selectedAlpha,
            groupColor.toString(),
            group
          );
        }
      });

      const selectedColor = computeColor(groupSelected);
      const groupColor = selectedColor || ts.brushesColorScale(0) || "#4682b4";
      renderOverviewCanvasSubset(
        dataSelected.get(groupSelected),
        ts.selectedAlpha,
        groupColor.toString(),
        groupSelected
      );

      // TODO configs for this
      /*childSelections.forEach((selection, childIx) => {
      if (childPosition !== childIx) {
        let selection = childSelections[childIx];
        selection.forEach((group, id) => {
          let color = d3.hsl(ts.brushesColorScale(id));
          color.s = 1;
          color.l = lums[childIx]; //initLum + LStep * (childSelections.length - 1 - childIx);
          renderOverviewCanvasSubset(group, ts.selectedAlpha, color);
        });
      }
    }); */

      context.save();
      // Render group Medians
      if (medians) {
        context.lineWidth = ts.medianLineWidth;
        context.globalAlpha = ts.medianLineAlpha;

        medians.forEach((d) => {
          if (!d[1]) {
            console.log("Error drawing medians, empty data", d);
            return;
          }
          let path = new Path2D(linem(d[1]));
          context.setLineDash(ts.medianLineDash);
          context.strokeStyle = darken(computeColor(d[0]));
          context.stroke(path);
        });
      }
      context.restore();
    }
  }

  function computeColor(groupId) {
    const color = ts.brushesColorScale(groupId);
    return color || ts.brushesColorScale(0) || "#4682b4";
  }

  // Pass a groupId when rendering a highlighted selection for a group
  function renderOverviewCanvasSubset(
    dataSubset,
    alpha,
    color,
    groupId = null
  ) {
    if (!dataSubset) {
      console.log("🚫 Error renderOverviewCanvasSubset called with no dataSubset", dataSubset);
      return;
    }

    //context.save();
    // Compute the transparency with respect to the number of lines drawn
    // Min 0.05, then adjust by the expected alpha divided by 10% of the number of lines
    // context.globalAlpha = 0.05 + alpha / (dataSubset.length * 0.1);
    context.globalAlpha = alpha * ts.alphaScale(dataSubset.length);

    

    for (let d of dataSubset) {
      let path = paths.get(d[0]);
      if (!path) continue;
      let strokeColor = color;
      if (groupAttr) {
        const baseGroupColor = ts.colorScale(path.group);
        strokeColor = ts.selectedColorTransform(baseGroupColor, groupId);

        // const { h, c, l, opacity } = d3.lch(baseGroupColor);
        // strokeColor = d3.lch(l + ts.brushesColorScale(groupId), c, h, opacity);
        // console.log(
        //   "group",
        //   groupId,

        //   "baseGroupColor",
        //   baseGroupColor,
        //   h,
        //   s,
        //   l,
        //   o,

        //   "after",
        //   strokeColor
        // );
      }
      // context.strokeStyle = groupAttr ? ts.colorScale(path.group) : color;
      context.strokeStyle = "" + strokeColor;
      context.stroke(path.path);
    }
  }

  // Cache para evitar re-uploads GPU innecesarios cuando el estado no cambia entre frames.
  // updateStyles() y uploadMedians() son O(N) y escriben MBs de datos; saltarlos cuando
  // dataSelected/dataNotSelected/medians son los mismos objetos es la optimización más impactante.
  let _gpuLastDataSelected    = null;
  let _gpuLastDataNotSelected = null;
  let _gpuLastHasSelection    = undefined;
  let _gpuLastColorKey        = null;
  let _gpuLastMedians         = null;
  let _gpuLastMedianStyleKey  = null;

  me.render = function (
    dataSelected,
    groupSelected,
    dataNotSelected,
    medians,
    hasSelection
  ) {
    if (gpuRenderer) {
      if (!isGpuReady) {
        pendingRender = () =>
          me.render(
            dataSelected,
            groupSelected,
            dataNotSelected,
            medians,
            hasSelection
          );
        return;
      }

      // ── Styles: re-upload solo si la selección o los colores cambiaron ────────
      const colorKey = `${ts.defaultColor}|${ts.defaultAlpha}|${ts.selectedAlpha}`;
      const stylesDirty =
        dataSelected    !== _gpuLastDataSelected    ||
        dataNotSelected !== _gpuLastDataNotSelected ||
        hasSelection    !== _gpuLastHasSelection    ||
        colorKey        !== _gpuLastColorKey;

      if (stylesDirty) {
        const stylesMap = new Map();
        const defaultColorRGB = d3.rgb(ts.defaultColor);
        const notSelAlpha = hasSelection ? ts.noSelectedAlpha : ts.defaultAlpha;
        const defaultColorVec = [
          defaultColorRGB.r / 255,
          defaultColorRGB.g / 255,
          defaultColorRGB.b / 255,
          notSelAlpha,
        ];

        dataNotSelected.forEach((d) => {
          let colorVec = defaultColorVec;
          if (groupAttr) {
            const pathObj = paths.get(d[0]);
            if (pathObj) {
              const gc = d3.rgb(ts.colorScale(pathObj.group));
              colorVec = [gc.r / 255, gc.g / 255, gc.b / 255, notSelAlpha];
            }
          }
          stylesMap.set(d[0], { color: colorVec, selectionFlag: 0.0 });
        });

        let groupIdx = 0;
        dataSelected.forEach((groupData, groupId) => {
          const brushColor = d3.rgb(computeColor(groupId));
          const flag = groupIdx + 1.0;
          groupData.forEach((d) => {
            let colorVec;
            if (groupAttr) {
              const pathObj = paths.get(d[0]);
              if (pathObj) {
                const transformed = d3.rgb(ts.selectedColorTransform(ts.colorScale(pathObj.group), groupId));
                colorVec = [transformed.r / 255, transformed.g / 255, transformed.b / 255, ts.selectedAlpha];
              } else {
                colorVec = [brushColor.r / 255, brushColor.g / 255, brushColor.b / 255, ts.selectedAlpha];
              }
            } else {
              colorVec = [brushColor.r / 255, brushColor.g / 255, brushColor.b / 255, ts.selectedAlpha];
            }
            stylesMap.set(d[0], { color: colorVec, selectionFlag: flag });
          });
          groupIdx++;
        });

        const transparentColor = [0, 0, 0, 0];
        gpuRenderer.updateStyles(stylesMap, transparentColor);

        _gpuLastDataSelected    = dataSelected;
        _gpuLastDataNotSelected = dataNotSelected;
        _gpuLastHasSelection    = hasSelection;
        _gpuLastColorKey        = colorKey;
      }

      gpuRenderer.updateUniforms(
        {
          x: overviewX.domain().map((d) => +d),
          y: overviewY.domain().map((d) => +d),
        },
        innerWidth  * dpr,
        innerHeight * dpr,
        { top: 0, left: 0, right: 0, bottom: 0 }
      );

      // ── Medians: re-upload solo si cambian ───────────────────────────────────
      const medianStyleKey = medians && medians.length > 0
        ? `${ts.medianLineWidth}|${ts.medianLineAlpha}|${ts.medianLineDash}`
        : null;
      const mediansDirty =
        medians         !== _gpuLastMedians        ||
        medianStyleKey  !== _gpuLastMedianStyleKey;

      if (mediansDirty) {
        const medianStyles = new Map();
        if (medians && medians.length > 0) {
          medians.forEach(([groupId]) => {
            const color = d3.rgb(computeColor(groupId));
            medianStyles.set(groupId, {
              color: [color.r / 255, color.g / 255, color.b / 255, ts.medianLineAlpha],
              lineWidth: ts.medianLineWidth,
              dashOn: ts.medianLineDash[0] || 0,
              dashOff: ts.medianLineDash[0] || 0,
            });
          });
        }
        gpuRenderer.uploadMedians(medians || [], medianStyles);
        _gpuLastMedians        = medians;
        _gpuLastMedianStyleKey = medianStyleKey;
      }

      gpuRenderer.draw(hasSelection, dataSelected.size);
    } else {
      renderOvwerview(
        dataSelected,
        groupSelected,
        dataNotSelected,
        medians,
        hasSelection
      );
    }
  };

  // Espera a que la GPU termine todos los comandos enviados (WebGPU async sync).
  // Canvas 2D resuelve inmediatamente.
  me.syncGPU = function() {
    if (gpuRenderer && typeof gpuRenderer.syncGPU === 'function') {
      return gpuRenderer.syncGPU();
    }
    return Promise.resolve();
  };

  me.syncRenderer = function() {
    if (gpuRenderer && typeof gpuRenderer.syncGPU === 'function') {
      return gpuRenderer.syncGPU();
    }
    if (context) {
      context.getImageData(0, 0, 1, 1);
    }
    return Promise.resolve();
  };

  return me;
}

export default TimeLineOverview;
