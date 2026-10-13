import * as d3 from "d3";
import { add, sub } from "date-fns";
import { throttle } from "throttle-debounce";
import { log, BrushAggregation, BrushModes } from "./utils.js";

// Owns reference curves, their group associations, sliders, and the shared
// coordinate panel. Context getters always expose the widget's current state.
export default function createReferenceControls(context, initialCurves) {
  let referenceCurves = initialCurves;
  let sliders = new Map();
  let sliderSeq = 0;
  let gReferences, gProbes;
  let brushSpinBoxes = null;
  let _coordsActiveSlider = null;

  function getRefCurveById(refId) {
    if (!Array.isArray(referenceCurves)) return null;
    return (
      referenceCurves.find((c) => c.id === refId && c.isVisible !== false) ||
      null
    );
  }

  function isGroupEnabled(groupId) {
    // Evitar optional chaining para compatibilidad
    let groups = null;
    if (
      context.brushes &&
      typeof context.brushes.getBrushesGroup === "function"
    ) {
      groups = context.brushes.getBrushesGroup();
    }
    const g =
      groups && typeof groups.get === "function" ? groups.get(groupId) : null;
    return !!(g && g.isEnable);
  }

  function isRefPolylineSelected() {
    const gid = context.brushes.getBrushGroupSelected();
    if (gid == null) return { ok: false };

    const g = context.brushes.getBrushesGroup().get(gid);
    if (!g) return { ok: false };

    const name = (g.name || "").trim();
    if (!name.startsWith("RC ")) return { ok: false };

    // Heurística: el id de la curva suele ir tras "RC "
    const refIdGuess = name.slice(3).trim();

    // Intentos razonables de emparejar grupo ↔ curva
    let ref =
      (Array.isArray(referenceCurves) &&
        (referenceCurves.find((r) => String(r.id).trim() === refIdGuess) ||
          referenceCurves.find((r) => String(r.id).trim() === name) ||
          referenceCurves.find(
            (r) => String(r.name || "").trim() === refIdGuess
          ))) ||
      null;

    if (!ref) return { ok: false };
    if (ref.isSimplePoints) return { ok: false }; // solo polilínea

    return { ok: true, groupId: gid, ref };
  }

  function domainDxFromPixels(px = 6) {
    // convierte 0px y px a dominio (soporta Date y número)
    const d0 = +context.overviewX.invert(0);
    const d1 = +context.overviewX.invert(px);
    return Math.abs(d1 - d0) || 0;
  }

  function getFirstVisibleRef() {
    return Array.isArray(referenceCurves)
      ? referenceCurves.find((c) => c.isVisible !== false && !c.isSimplePoints)
      : null;
  }

  function getYAtX(curve, x) {
    if (!curve || !Array.isArray(curve.data) || !curve.data.length) return null;
    const data = curve.data;
    let lo = 0,
      hi = data.length - 1;

    if (x <= data[0][0]) return data[0][1];
    if (x >= data[hi][0]) return data[hi][1];

    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (data[mid][0] <= x) lo = mid;
      else hi = mid;
    }
    const [x0, y0] = data[lo],
      [x1, y1] = data[hi];
    const t = (x - x0) / (x1 - x0);
    return y0 * (1 - t) + y1 * t;
  }

  function onEpsilonChange(rcId, newValue) {
    const curve = referenceCurves.find((c) => c.id === rcId);
    if (curve) {
      curve.epsilon = newValue;

      const bvh = context.brushes.getBvh();
      if (bvh) {
        bvh.removeReferenceCurves([rcId]);
        context.ts.addReferenceCurve([curve]);
      }
    }
  }

  function onRemoveBrushGroup(id) {
    const affectedCurves = [];
    if (Array.isArray(referenceCurves)) {
      referenceCurves.forEach((curve) => {
        if (curve.isSimplePoints && Array.isArray(curve.associations)) {
          const originalCount = curve.associations.length;
          curve.associations = curve.associations.filter(
            (assoc) => assoc.id !== id
          );
          if (curve.associations.length < originalCount) {
            affectedCurves.push(curve);
          }
        }
      });
    }
    if (affectedCurves.length > 0) {
      context.ts.addReferenceCurve(affectedCurves);
    }
    context.brushes.removeBrushGroup(id);
  }

  function renderReferenceCurvesWidget() {
    const rcWidget = d3.select(context.target).select("#rcWidget");
    const rcList = rcWidget.select("#rcList");
    if (!referenceCurves || referenceCurves.length === 0) {
      rcWidget.style("display", "none");
      return;
    }
    rcWidget.style("display", "block");

    rcList
      .selectAll(".rcControl")
      .data(referenceCurves, (d) => d.id)
      .join("div")
      .attr("class", "rcControl")
      .style("margin-bottom", "10px")
      .each(function (rc) {
        const div = d3.select(this);

        const actionButtonHTML = rc.isSimplePoints
          ? `<button class="add-association-btn" style="margin-left: 8px; font-size: 0.8em; cursor: pointer;">Add Association</button>`
          : `<button class="add-slider-btn" style="margin-left: 8px; font-size: 0.8em; cursor: pointer;">Add Slider</button>`;

        const hexColor = d3.color(rc.color || "#000000").formatHex();
        div.node().innerHTML = `
            <div style="display: flex; align-items: center; font-weight: bold;">
                <input type="checkbox" class="rc-visible-toggle" ${
                  rc.isVisible !== false ? "checked" : ""
                }></input>
                
                <input type="color" class="rc-color-picker" value="${hexColor}" title="Change Curve Color" style="
                  width: 20px; height: 20px; 
                  border: none; padding: 0; background: none;
                  margin: 0 5px; cursor: pointer;
                  flex-shrink: 0;">
                </input>

                <input class="rc-name" style="border: none; outline: none; font-weight: bold; width: ${
                  String(rc.name || rc.id).length + 1
                }ch;" value="${rc.name || rc.id}"></input>
                ${actionButtonHTML} 
            </div>
            <div class="associations-list" style="margin-left: 20px; margin-top: 4px;"></div>
            <div class="sliders-list" style="margin-left: 20px; margin-top: 4px;"></div>
          `;

        div.select(".rc-color-picker").on("input", (e) => {
          rc.color = e.target.value;
          context.ts.printReferenceCurves(referenceCurves);
          context.ts.printSliders();
        });

        div
          .select("input.rc-name")
          .on("input", function () {
            this.style.width = this.value.length + 1 + "ch";
          })
          .on("change", (evt) => {
            rc.name = evt.target.value;
          });

        div.select(".rc-visible-toggle").on("change", (e) => {
          rc.isVisible = e.target.checked;
          context.ts.printReferenceCurves(referenceCurves);
          context.ts.printSliders();
          context.brushes.recomputeSelection();
          context.renderBrushesControls();
        });

        div.select(".add-slider-btn").on("click", () => onAddSlider(rc.id));
        div
          .select(".add-association-btn")
          .on("click", () => onUpdatePointCurveAssociation(rc.id, null, "add"));

        // Render Sliders
        const associatedSliders = Array.from(sliders.values()).filter(
          (s) => s.rcId === rc.id
        );
        const slidersList = div.select(".sliders-list");
        slidersList
          .selectAll(".slider-control")
          .data(associatedSliders, (d) => d.id)
          .join("div")
          .attr("class", "slider-control")
          .each(function (slider) {
            const group = context.brushes.getBrushesGroup().get(slider.groupId);
            const groupName = group ? group.name : "...";

            d3.select(this).node().innerHTML = `
                  <div style="display: flex; align-items: center; margin-bottom: 2px; font-size: 0.9em;">
                      <input type="checkbox" class="slider-enabled-toggle" title="Enable/Disable Slider" ${
                        slider.userEnabled ? "checked" : ""
                      } style="margin-right: 5px;"></input>
                      
                      <input class="slider-name" style="border: none; outline: none; width: ${
                        String(slider.name).length + 1
                      }ch;" value="${slider.name}"></input>
                      <span style="margin-left: 2px;">(${groupName})</span>
                      <div title="Associated Group Color" style="width: 12px; height: 12px; background-color: ${context.computeBrushColor(
                        slider.groupId
                      )}; margin: 0 5px; border: 1px solid #ccc;"></div>
                      <button class="toggle-side-btn" title="Toggle position (above/below)" style="border: none; background: none; cursor: pointer; font-size: 1.1em; padding: 0 5px;">
                          ${slider.side === "above" ? "↓" : "↑"}
                      </button>
                      
                      <button class="remove-slider-btn" title="Remove Slider" style="color: red; border:none; background:none; font-weight: bold; cursor: pointer;">&cross;</button>
                  </div>
                `;

            d3.select(this)
              .select("input.slider-name")
              .on("input", function () {
                this.style.width = this.value.length + 1 + "ch";
              })
              .on("change", (evt) => {
                slider.name = evt.target.value;
              });

            d3.select(this)
              .select(".toggle-side-btn")
              .on("click", () => {
                slider.side = slider.side === "above" ? "below" : "above";
                context.ts.printSliders();
                context.brushes.recomputeSelection();
                renderReferenceCurvesWidget();
              });
            d3.select(this)
              .select(".slider-enabled-toggle")
              .on("change", (e) => onToggleSlider(slider.id, e.target.checked));
            d3.select(this)
              .select(".remove-slider-btn")
              .on("click", () => onRemoveSlider(slider.id));
          });

        // Render Point Associations
        const pointAssociations =
          rc.isSimplePoints && Array.isArray(rc.associations)
            ? rc.associations
            : [];
        const associationsList = div.select(".associations-list");
        associationsList
          .selectAll(".association-control")
          .data(pointAssociations, (d) => d.id)
          .join("div")
          .attr("class", "association-control")
          .style("display", rc.isVisible !== false ? "block" : "none")
          .each(function (assoc) {
            if (assoc.userEnabled === undefined) {
              assoc.userEnabled = assoc.enabled;
            }
            if (assoc.aggregation === undefined) {
              assoc.aggregation = BrushAggregation.And;
            }
            if (assoc.negate === undefined) {
              assoc.negate = false;
            }

            const group = context.brushes.getBrushesGroup().get(assoc.id);
            const groupName = group ? group.name : "...";
            const uniqueId = `rc-${rc.id}-assoc-${assoc.id}`;

            d3.select(this).node().innerHTML = `
                  <div style="display: flex; align-items: center; margin-bottom: 2px; font-size: 0.9em;">
                      <input type="checkbox" class="assoc-enabled-toggle" title="Enable/Disable Association" ${
                        assoc.userEnabled ? "checked" : ""
                      } style="margin-right: 5px;"></input>

                      <span>(${groupName})</span>
                      <div title="Associated Group Color" style="width: 12px; height: 12px; background-color: ${context.computeBrushColor(
                        assoc.id
                      )}; margin: 0 5px; border: 1px solid #ccc;"></div>
                      
                      <div style="font-size: 0.9em; margin-right: 5px;">
                        <input type="radio" id="${uniqueId}-and" name="${uniqueId}-agg" value="and" 
                          ${
                            assoc.aggregation === BrushAggregation.And
                              ? "checked"
                              : ""
                          }>
                        <label for="${uniqueId}-and" style="cursor: pointer;">AND</label>
                        
                        <input type="radio" id="${uniqueId}-or" name="${uniqueId}-agg" value="or" 
                          ${
                            assoc.aggregation === BrushAggregation.Or
                              ? "checked"
                              : ""
                          }>
                        <label for="${uniqueId}-or" style="cursor: pointer;">OR</label>
                      </div>

                      <div style="font-size: 0.9em; margin-right: 5px; padding-left: 5px; border-left: 1px solid #ccc;">
                        <input type="checkbox" id="${uniqueId}-not" name="${uniqueId}-not" 
                          ${assoc.negate ? "checked" : ""}>
                        <label for="${uniqueId}-not" style="cursor: pointer;">NOT</label>
                      </div>
                      
                      <button class="remove-assoc-btn" title="Remove Association" style="color: red; border:none; background:none; font-weight: bold; cursor: pointer;">&cross;</button>
                  </div>
                `;

            d3.select(this)
              .select(`#${uniqueId}-and`)
              .on("change", () => {
                assoc.aggregation = BrushAggregation.And;
                context.brushes.recomputeSelection();
              });
            d3.select(this)
              .select(`#${uniqueId}-or`)
              .on("change", () => {
                assoc.aggregation = BrushAggregation.Or;
                context.brushes.recomputeSelection();
              });

            d3.select(this)
              .select(`#${uniqueId}-not`)
              .on("change", (e) => {
                assoc.negate = e.target.checked;
                context.brushes.recomputeSelection();
              });

            d3.select(this)
              .select(".assoc-enabled-toggle")
              .on("change", (e) => {
                onUpdatePointCurveAssociation(
                  rc.id,
                  assoc.id,
                  "toggle",
                  e.target.checked
                );
              });
            d3.select(this)
              .select(".remove-assoc-btn")
              .on("click", () => {
                onUpdatePointCurveAssociation(rc.id, assoc.id, "remove");
              });
          });

        if (rc.isSimplePoints) {
          const epsilonControl = div
            .selectAll(".epsilon-control")
            .data([rc])
            .join("div")
            .attr("class", "epsilon-control")
            .style("margin-left", "20px")
            .style("font-size", "0.9em")
            .style("margin-bottom", "5px")
            .style("display", rc.isVisible !== false ? "flex" : "none")
            .style("align-items", "center").html(`
            <label style="margin-right: 5px;">Collision Tolerance:</label>
            <input type="number" class="epsilon-input"
                   value="${rc.epsilon}" min="0" step="0.1"
                   style="width: 5ch;">
        `);

          const epsilonInput = epsilonControl.select(".epsilon-input");

          epsilonInput.on("change", (event) => {
            const newValue = +event.target.value;
            if (!isNaN(newValue) && newValue >= 0) {
              onEpsilonChange(rc.id, newValue);
            }
          });

          epsilonInput.on("input", function () {
            this.style.width = Math.max(5, this.value.length + 2) + "ch";
          });
          epsilonInput.dispatch("input");
        }
      });
  }

  function onUpdatePointCurveAssociation(rcId, groupId, action, newState) {
    const ref = referenceCurves.find((c) => c.id === rcId);
    if (!ref) return;

    if (!Array.isArray(ref.associations)) {
      ref.associations = [];
    }

    if (action === "add") {
      const selectedGroupId = context.brushes.getBrushGroupSelected();
      if (selectedGroupId === undefined || selectedGroupId === null) {
        alert("Please select a Group before adding an association.");
        return;
      }
      if (!ref.associations.some((a) => a.id === selectedGroupId)) {
        ref.associations.push({
          id: selectedGroupId,
          enabled: true,
          userEnabled: true,
        });
      }
    } else if (action === "remove" && groupId !== null) {
      ref.associations = ref.associations.filter((a) => a.id !== groupId);
    } else if (action === "toggle" && groupId !== null) {
      const assoc = ref.associations.find((a) => a.id === groupId);
      if (assoc) {
        assoc.userEnabled = newState;
        const group = context.brushes.getBrushesGroup().get(assoc.id);
        const groupIsEnabled = group ? group.isEnable : false;
        assoc.enabled = groupIsEnabled && assoc.userEnabled;
      }
    }
    context.ts.addReferenceCurve([ref]);
    renderReferenceCurvesWidget();
  }

  function updateDependentStates(groupId, groupIsEnabled) {
    for (const slider of sliders.values()) {
      if (slider.groupId === groupId) {
        slider.enabled = groupIsEnabled && slider.userEnabled;
      }
    }

    (referenceCurves || []).forEach((curve) => {
      if (curve.isSimplePoints && Array.isArray(curve.associations)) {
        const assoc = curve.associations.find((a) => a.id === groupId);
        if (assoc) {
          assoc.enabled = groupIsEnabled && assoc.userEnabled;
        }
      }
    });

    context.brushes.updateReferenceCurves(referenceCurves);
  }

  function onAddSlider(rcId) {
    // Primero, encontramos la curva por su ID, sin importar si está visible o no.
    const ref = Array.isArray(referenceCurves)
      ? referenceCurves.find((c) => c.id === rcId)
      : null;

    if (!ref) {
      // Este es un caso de seguridad, es poco probable que ocurra.
      alert(`Error: No se encontró la curva de referencia con ID "${rcId}".`);
      return;
    }

    if (ref.isVisible === false) {
      alert(
        "You can't add a slider to a reference curve that isn't visible. Please activate it first."
      );
      return; // Detenemos la ejecución aquí.
    }

    if (!ref.data || ref.data.length < 2 || ref.isSimplePoints) {
      console.warn(
        "Cannot add slider to this reference curve (no data, not a polyline, or not found)."
      );
      alert(
        "You can't add a slider to this reference curve. It may not be a polyline or may not have enough data."
      );
      return;
    }

    const groupId = context.brushes.getBrushGroupSelected();
    if (groupId === undefined || groupId === null) {
      alert("Please select a Group before adding a slider.");
      return;
    }

    const curveDomain = d3.extent(ref.data, (d) => d[0]);
    const domainStart =
      curveDomain[0] instanceof Date
        ? curveDomain[0].getTime()
        : curveDomain[0];
    const domainEnd =
      curveDomain[1] instanceof Date
        ? curveDomain[1].getTime()
        : curveDomain[1];
    const domainWidth = domainEnd - domainStart;

    let leftX = domainStart + domainWidth * 0.25;
    let rightX = domainStart + domainWidth * 0.75;

    if (curveDomain[0] instanceof Date) {
      leftX = new Date(leftX);
      rightX = new Date(rightX);
    }

    const sliderId = ++sliderSeq;
    sliders.set(sliderId, {
      id: sliderId,
      name: `Slider ${sliderId}`,
      rcId: rcId,
      groupId: groupId,
      side: "above",
      enabled: true,
      userEnabled: true,
      leftX: leftX,
      rightX: rightX,
      mode: BrushModes.Intersect,
      aggregation: BrushAggregation.And,
      negate: false,
    });

    context.brushes.recomputeSelection();
    context.ts.printSliders();
    renderReferenceCurvesWidget();
  }

  function onRemoveSlider(sliderId) {
    sliders.delete(sliderId);
    context.brushes.recomputeSelection();
    context.ts.printSliders();
    renderReferenceCurvesWidget();
  }

  function onToggleSlider(sliderId, isEnabled) {
    if (sliders.has(sliderId)) {
      const slider = sliders.get(sliderId);
      slider.userEnabled = isEnabled;
      const group = context.brushes.getBrushesGroup().get(slider.groupId);
      const groupIsEnabled = group ? group.isEnable : false;
      slider.enabled = groupIsEnabled && slider.userEnabled;
      context.brushes.recomputeSelection();
      context.ts.printSliders();
    }
  }

  function onBrushCoordinatesChange(selection) {
    _setCoordsMode("timebox");
    updateBrushSpinBox(selection);
    context.updateStatus();
  }

  function updateBrushSpinBox(selection) {
    if (selection) {
      let [[x0, y0], [x1, y1]] = selection;

      // When initializing the brushes the spinbox is not ready
      if (brushSpinBoxes) {
        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        sx0.node().value = context.fmtX(x0);
        sx1.node().value = context.fmtX(x1);
        sy0.node().value = context.fmtY(y1).replace("\u2212", "-"); // Change D3 minus sign to parseable minus
        sy1.node().value = context.fmtY(y0).replace("\u2212", "-");
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

  function initBrushCoordinates() {
    context.brushesCoordinates.innerHTML = "";
    let selection = d3.select(context.brushesCoordinates);
    let divX = selection.append("div");

    divX.append("span").text(context.xLabel ? context.xLabel : "X Axis:");

    let divInputX = divX.append("div");

    let domainX = context.overviewX.domain();
    let x0 = divInputX
      .append("div")
      .append("input")
      .attr("type", context.hasScaleTime ? "Date" : "number")
      .attr("min", context.hasScaleTime ? context.fmtX(domainX[0]) : domainX[0])
      .attr("max", context.hasScaleTime ? context.fmtX(domainX[1]) : domainX[1])
      .attr("step", context.ts.stepX)
      .attr("width", "50%")
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    let x1 = divInputX
      .append("div")
      .append("input")
      .attr("type", context.hasScaleTime ? "Date" : "number")
      .attr("min", context.hasScaleTime ? context.fmtX(domainX[0]) : domainX[0])
      .attr("max", context.hasScaleTime ? context.fmtX(domainX[1]) : domainX[1])
      .attr("width", "50%")
      .attr("step", context.ts.stepX)
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    let divY = selection.append("div").attr("id", "coordsYRow");

    divY.append("span").text(context.yLabel ? context.yLabel : "Y Axis:");

    let divInputY = divY.append("div");

    let domainY = context.overviewY.domain();

    let y0 = divInputY
      .append("div")
      .append("input")
      .attr("type", "number")
      .attr("min", domainY[0])
      .attr("max", domainY[1])
      .attr("width", "50%")
      .attr("step", context.ts.stepY)
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    let y1 = divInputY
      .append("div")
      .append("input")
      .attr("type", "number")
      .attr("min", domainY[0])
      .attr("max", domainY[1])
      .attr("width", "50%")
      .attr("step", context.ts.stepY)
      // .style("background-color", ts.backgroundColor)
      .on("change", onSpinboxChange);

    brushSpinBoxes = [
      [x0, y0],
      [x1, y1],
    ];

    if (context.showBrushesCoordinates) {
      selection
        .insert("h3", ":first-child")
        .attr("id", "coordsTitle")
        .text("Current TimeBox Coordinates:");
      context.divControls.appendChild(context.brushesCoordinates);
    }
  }

  function _setCoordsMode(mode) {
    const titleEl = context.brushesCoordinates
      ? context.brushesCoordinates.querySelector("#coordsTitle")
      : null;
    const yRow = context.brushesCoordinates
      ? context.brushesCoordinates.querySelector("#coordsYRow")
      : null;
    if (mode === "slider") {
      if (titleEl) titleEl.textContent = "Current Slider Coordinates:";
      if (yRow) yRow.style.display = "none";
    } else {
      _coordsActiveSlider = null;
      if (titleEl) titleEl.textContent = "Current TimeBox Coordinates:";
      if (yRow) yRow.style.display = "";
    }
  }

  function updateSliderSpinBox(slider) {
    if (!brushSpinBoxes) return;
    let [[sx0], [sx1]] = brushSpinBoxes;
    _coordsActiveSlider = slider;
    _setCoordsMode("slider");
    sx0.node().value = context.fmtX(slider.leftX);
    sx1.node().value = context.fmtX(slider.rightX);
  }

  function onSpinboxChange(sourceEvent) {
    // ── Modo Slider: actualizar leftX / rightX del slider activo ──
    if (_coordsActiveSlider) {
      const slider = _coordsActiveSlider;
      let [[sx0], [sx1]] = brushSpinBoxes;
      let newLeft, newRight;
      if (context.hasScaleTime) {
        newLeft = new Date(sx0.node().value);
        newRight = new Date(sx1.node().value);
      } else {
        newLeft = +sx0.node().value;
        newRight = +sx1.node().value;
      }
      // Garantizar orden y separación mínima
      if (newLeft >= newRight) {
        if (sourceEvent.target === sx0.node()) {
          newRight = newLeft + context.ts.stepX;
          sx1.node().value = context.fmtX(newRight);
        } else {
          newLeft = newRight - context.ts.stepX;
          sx0.node().value = context.fmtX(newLeft);
        }
      }
      slider.leftX = newLeft;
      slider.rightX = newRight;
      context.ts.printSliders();
      context.brushes.recomputeSelection();
      return;
    }

    // ── Modo TimeBox (comportamiento original) ────────────────────
    let selectedBrush = context.brushes.getSelectedBrush();
    if (selectedBrush === null) return;

    let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

    let domainX = context.overviewX.domain();

    let x0;
    let x1;
    let y0 = +sy1.node().value;
    let y1 = +sy0.node().value;

    if (context.hasScaleTime) {
      x0 = new Date(sx0.node().value);
      x1 = new Date(sx1.node().value);
      if (x0 >= x1) {
        if (sourceEvent.target === sx0.node()) {
          x1 = add(x0, context.ts.stepX);
          x1 = Math.min(x1, domainX[1]);
          sx1.node().value = context.fmtX(x1);
        } else {
          x0 = sub(x1, context.ts.stepX);
          x0 = Math.max(x0, domainX[0]);
          sx0.node().value = context.fmtX(x0);
        }
      }
    } else {
      x0 = +sx0.node().value;
      x1 = +sx1.node().value;

      if (x0 >= x1) {
        if (sourceEvent.target === sx0.node()) {
          x1 = x0 + context.ts.stepX;
          sx1.node().value = x1;
        } else {
          x0 = x1 - context.ts.stepX;
          sx0.node().value = x0;
        }
      }
    }

    if (y1 >= y0) {
      if (sourceEvent.target === sy0.node()) {
        y0 = y1 + context.ts.stepY;
        sy1.node().value = y0;
      } else {
        y1 = y0 - context.ts.stepY;
        sy0.node().value = y1;
      }
    }

    context.brushes.moveSelectedBrush([
      [x0, y0],
      [x1, y1],
    ]);
  }

  function updateSliderVisuals(gSlider, slider) {
    if (gSlider.empty()) return;

    const ref = getRefCurveById(slider.rcId);
    if (!ref) return;

    const groupColor = context.computeBrushColor(slider.groupId);
    const isOrAggregation = slider.aggregation === BrushAggregation.Or;

    const mainStrokeColor = groupColor;
    const mainStrokeDash = slider.mode === BrushModes.Intersect ? "4" : null;

    const notShadowColor = slider.negate ? "red" : "#333";
    const notShadowWidth = slider.negate ? 8 : 4; // Exagerado si es NOT
    const notShadowOpacity = slider.negate ? 0.6 : 0.5; // Más opaco si es NOT

    const drawHandle = (which) => {
      const xDom = which === "left" ? slider.leftX : slider.rightX;
      const xPx = context.overviewX(xDom);
      const yCurve = getYAtX(ref, +xDom);
      if (yCurve === null) return;

      const yCurvePx = context.overviewY(yCurve);
      const [yMin, yMax] = context.overviewY.domain();
      const yEndPx =
        slider.side === "above"
          ? context.overviewY(yMax)
          : context.overviewY(yMin);

      const gHandle = gSlider.select(`.handle-${which}`);

      gHandle
        .select(".slider-line-main")
        .attr("x1", xPx)
        .attr("y1", yCurvePx)
        .attr("x2", xPx)
        .attr("y2", yEndPx)
        .attr("stroke", mainStrokeColor)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", mainStrokeDash);
      gHandle
        .select(".slider-line-border")
        .attr("x1", xPx)
        .attr("y1", yCurvePx)
        .attr("x2", xPx)
        .attr("y2", yEndPx)
        .attr("stroke", isOrAggregation ? groupColor : "#333")
        .attr("stroke-width", isOrAggregation ? 8 : 4)
        .attr("stroke-opacity", isOrAggregation ? 0.6 : 0.5);

      gHandle
        .select(".slider-hit-area")
        .attr("x1", xPx)
        .attr("y1", yCurvePx)
        .attr("x2", xPx)
        .attr("y2", yEndPx);
    };

    drawHandle("left");
    drawHandle("right");

    const xStart = +slider.leftX;
    const xEnd = +slider.rightX;

    const curveSegment = ref.data.filter(
      (d) => +d[0] >= xStart && +d[0] <= xEnd
    );

    const startPoint = [xStart, getYAtX(ref, xStart)];
    const endPoint = [xEnd, getYAtX(ref, xEnd)];
    if (curveSegment.length === 0 || +curveSegment[0][0] > xStart) {
      curveSegment.unshift(startPoint);
    }
    if (
      curveSegment.length === 0 ||
      +curveSegment[curveSegment.length - 1][0] < xEnd
    ) {
      curveSegment.push(endPoint);
    }

    const lineGenerator = d3
      .line()
      .x((d) => context.overviewX(d[0]))
      .y((d) => context.overviewY(d[1]));

    const curvePathData = lineGenerator(curveSegment);

    const [yMin, yMax] = context.overviewY.domain();
    const topPx = context.overviewY(yMax);
    const bottomPx = context.overviewY(yMin);
    const x0p = context.overviewX(slider.leftX);
    const x1p = context.overviewX(slider.rightX);
    const yHorizontal = slider.side === "above" ? topPx : bottomPx;

    gSlider
      .select(".slider-horizontal-border")
      .attr("x1", x0p)
      .attr("y1", yHorizontal)
      .attr("x2", x1p)
      .attr("y2", yHorizontal)
      .attr("stroke", notShadowColor)
      .attr("stroke-width", notShadowWidth)
      .attr("stroke-opacity", notShadowOpacity);

    gSlider
      .select(".slider-horizontal-main")
      .attr("x1", x0p)
      .attr("y1", yHorizontal)
      .attr("x2", x1p)
      .attr("y2", yHorizontal)
      .attr("stroke", mainStrokeColor)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", mainStrokeDash);

    gSlider
      .select(".slider-curve-border")
      .attr("d", curvePathData)
      .attr("stroke", notShadowColor)
      .attr("stroke-width", notShadowWidth)
      .attr("stroke-opacity", notShadowOpacity);

    gSlider
      .select(".slider-curve-main")
      .attr("d", curvePathData)
      .attr("stroke", mainStrokeColor)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", mainStrokeDash);
    let pathString;
    if (slider.side === "above") {
      pathString = `M ${x0p},${topPx} L ${x0p},${context.overviewY(
        startPoint[1]
      )} ${curvePathData.slice(1)} L ${x1p},${topPx} Z`;
    } else {
      pathString = `M ${x0p},${context.overviewY(
        startPoint[1]
      )} ${curvePathData.slice(1)} L ${x1p},${bottomPx} L ${x0p},${bottomPx} Z`;
    }

    gSlider
      .select(".slider-background")
      .attr("d", pathString)
      .attr("fill", groupColor)
      .attr("opacity", slider.negate ? 0.25 : 0.15);
  }

  context.ts.printSliders = function () {
    if (!context.overviewX || !context.overviewY || !gProbes) return;

    const sliderData = Array.from(sliders.values()).filter((s) => {
      if (!s.enabled) return false;
      const ref = getRefCurveById(s.rcId);
      return ref && ref.isVisible !== false && !ref.isSimplePoints;
    });

    const sel = gProbes
      .selectAll("g.slider-group")
      .data(sliderData, (d) => d.id);

    sel.exit().remove();

    const enter = sel.enter().append("g").attr("class", "slider-group");

    enter
      .append("path")
      .attr("class", "slider-background")
      .attr("opacity", 0.15)
      .style("cursor", "grab");

    enter
      .append("line")
      .attr("class", "slider-horizontal-border")
      .attr("stroke", "#333")
      .attr("stroke-width", "4px")
      .attr("stroke-opacity", 0.5)
      .style("pointer-events", "none");
    enter
      .append("line")
      .attr("class", "slider-horizontal-main")
      .attr("stroke-width", "2px")
      .style("pointer-events", "none");

    enter
      .append("path")
      .attr("class", "slider-curve-border")
      .attr("stroke", "#333")
      .attr("stroke-width", "4px")
      .attr("stroke-opacity", 0.5)
      .style("fill", "none")
      .style("pointer-events", "none");
    enter
      .append("path")
      .attr("class", "slider-curve-main")
      .attr("stroke-width", "2px")
      .style("fill", "none")
      .style("pointer-events", "none");
    ["left", "right"].forEach((which) => {
      const gSide = enter.append("g").attr("class", `handle-${which}`);
      gSide
        .append("line")
        .attr("class", "slider-line-border")
        .attr("stroke", "#333")
        .attr("stroke-width", "4px")
        .attr("stroke-opacity", 0.5)
        .style("pointer-events", "none");

      gSide
        .append("line")
        .attr("class", "slider-line-main")
        .attr("stroke-width", "2px");

      gSide
        .append("line")
        .attr("class", "slider-hit-area")
        .style("stroke", "transparent")
        .style("stroke-width", 12)
        .style("cursor", "ew-resize");
      gSide
        .append("title")
        .text("Drag to move edge. Double-click to toggle side (above/below).");
    });

    const all = enter.merge(sel);

    const totalLines = context.groupedData ? context.groupedData.length : 0;
    const calculatedDelay = Math.min(300, 30 + Math.floor(totalLines / 20));
    context.ts.moveSelectedBrush = (selection) => {
      context.brushes.moveSelectedBrush(selection);
    };

    context.ts.selectBrush = (groupId, brushId) => {
      context.brushes.selectBrush(groupId, brushId);
    };

    context.ts.getBrushesGroup = () => {
      return context.brushes.getBrushesGroup();
    };

    context.ts.getBrushesColorScale = () => {
      return context.brushes.colorScale;
    };

    context.ts.recomputeSelection = () => {
      context.brushes.recomputeSelection();
    };
    const throttledRecompute = throttle(calculatedDelay, () => {
      context.brushes.recomputeSelection();
    });

    const handleDragComputation = () => {
      if (context.ts.autoUpdate) {
        throttledRecompute();
      }
    };

    all.each(function (slider) {
      const gSlider = d3.select(this);
      const ref = getRefCurveById(slider.rcId);
      gSlider
        .select(".slider-background")
        .style("pointer-events", "all")
        .on("contextmenu", (sourceEvent) => {
          sourceEvent.preventDefault();
          const contextMenu = context.brushes.contextMenu;
          if (!contextMenu) return;
          const [px, py] = d3.pointer(sourceEvent);
          contextMenu.__show(
            slider.mode,
            slider.aggregation,
            slider.negate,
            px,
            py,
            slider
          );
        })
        .on("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          slider.side = slider.side === "above" ? "below" : "above";
          updateSliderVisuals(gSlider, slider);
          context.brushes.recomputeSelection();
        })
        .call(
          d3
            .drag()
            .on("start", function () {
              d3.select(this).style("cursor", "grabbing");
            })
            .on("drag", (e) => {
              if (!ref) return;
              const dx = e.dx;
              const currentLeftPx = context.overviewX(slider.leftX);
              const currentRightPx = context.overviewX(slider.rightX);
              const newLeftDomain = context.overviewX.invert(
                currentLeftPx + dx
              );
              const newRightDomain = context.overviewX.invert(
                currentRightPx + dx
              );

              const [minRefX, maxRefX] = d3.extent(ref.data, (d) => +d[0]);

              if (+newLeftDomain >= minRefX && +newRightDomain <= maxRefX) {
                slider.leftX = newLeftDomain;
                slider.rightX = newRightDomain;

                updateSliderVisuals(gSlider, slider);
                updateSliderSpinBox(slider);
                handleDragComputation();
              }
            })
            .on("end", function () {
              d3.select(this).style("cursor", "grab");
              context.brushes.recomputeSelection();
            })
        );

      const minGap = domainDxFromPixels(5);

      const updateSingleEdge = (which, newXPixel) => {
        const xDom = context.overviewX.invert(newXPixel);
        if (!ref) return;

        const [minRefX, maxRefX] = d3.extent(ref.data, (d) => +d[0]);
        let clampedX = Math.max(minRefX, Math.min(maxRefX, +xDom));
        const isDate = ref.data[0][0] instanceof Date;

        if (which === "left") {
          const newLeftX = Math.min(clampedX, +slider.rightX - minGap);
          slider.leftX = isDate ? new Date(newLeftX) : newLeftX;
        } else {
          const newRightX = Math.max(clampedX, +slider.leftX + minGap);
          slider.rightX = isDate ? new Date(newRightX) : newRightX;
        }
        updateSliderVisuals(gSlider, slider);
      };

      ["left", "right"].forEach((which) => {
        gSlider
          .select(`.handle-${which} .slider-hit-area`)
          .call(
            d3
              .drag()
              .on("drag", (e) => {
                updateSingleEdge(which, e.x);
                updateSliderSpinBox(slider);
                handleDragComputation();
              })
              .on("end", (e) => {
                updateSingleEdge(which, e.x);
                updateSliderSpinBox(slider);
                context.brushes.recomputeSelection();
              })
          )
          .on("dblclick", (e) => {
            e.preventDefault();
            e.stopPropagation();
            slider.side = slider.side === "above" ? "below" : "above";
            updateSliderVisuals(gSlider, slider);
            context.brushes.recomputeSelection();
          })
          .on("contextmenu", (sourceEvent) => {
            sourceEvent.preventDefault();
            sourceEvent.stopPropagation();
            const contextMenu = context.brushes.contextMenu;
            if (!contextMenu) return;
            const xDom = which === "left" ? slider.leftX : slider.rightX;
            const px = context.overviewX(xDom);
            const ref = getRefCurveById(slider.rcId);
            const yCurve = getYAtX(ref, +xDom);
            const py =
              yCurve !== null ? context.overviewY(yCurve) : sourceEvent.pageY;

            contextMenu.__show(
              slider.mode,
              slider.aggregation,
              slider.negate,
              px,
              py,
              slider
            );
          });
      });

      updateSliderVisuals(gSlider, slider);
    });
  };

  context.ts.getActiveSliderBoxes = function () {
    if (!context.overviewX || !context.overviewY) return [];
    const out = [];

    const activeSliders = Array.from(sliders.values()).filter((s) => s.enabled);

    for (const slider of activeSliders) {
      const ref = getRefCurveById(slider.rcId);
      if (!ref || ref.isVisible === false) continue;

      const [yMin, yMax] = context.overviewY.domain();
      const topPx = context.overviewY(yMax);
      const bottomPx = context.overviewY(yMin);

      const x0p = context.overviewX(slider.leftX);
      const x1p = context.overviewX(slider.rightX);

      let y0p = topPx; // Desde la parte superior del gráfico
      let y1p = bottomPx; // Hasta la parte inferior del gráfico

      out.push({
        groupId: slider.groupId,
        box: [
          [Math.min(x0p, x1p), Math.min(y0p, y1p)],
          [Math.max(x0p, x1p), Math.max(y0p, y1p)],
        ],
        sliderId: slider.id,
      });
    }
    return out;
  };

  context.ts.addReferenceCurve = function (newCurves) {
    if (!newCurves || !Array.isArray(newCurves) || newCurves.length === 0)
      return;

    const processedNewCurves = generateCurvePoints(
      newCurves,
      context.overviewX.domain(),
      context.overviewY.domain()
    );

    const curvesForBVH = processedNewCurves.map((ref) => {
      const scaledData = ref.data.map((point) => [
        context.overviewX(point[0]),
        context.overviewY(point[1]),
      ]);
      return Object.assign({}, ref, { data: scaledData });
    });

    const bvh = context.brushes.getBvh();
    let collisionResults = [];
    if (bvh && typeof bvh.addReferenceCurves === "function") {
      collisionResults = bvh.addReferenceCurves(curvesForBVH) || [];
    } else {
      console.error(
        "BVH o la función addReferenceCurves no están disponibles."
      );
      return;
    }

    processedNewCurves.forEach((newCurve) => {
      const existingIndex = referenceCurves.findIndex(
        (c) => c.id === newCurve.id
      );
      const collisionData = collisionResults.find(
        (res) => res.refId === newCurve.id
      );

      if (collisionData) {
        newCurve.collisions = collisionData.collisions;
      }

      if (existingIndex !== -1) {
        referenceCurves[existingIndex] = newCurve;
      } else {
        referenceCurves.push(newCurve);
      }
    });

    context.brushes.recomputeSelection();

    context.renderBrushesControls();
    context.ts.printReferenceCurves(referenceCurves);
    context.ts.printSliders();
  };

  function generateCurvePoints(curves, domainX, domainY) {
    if (!Array.isArray(curves)) {
      throw new Error("The reference curves must be an array of Objects");
    }

    let unnamedCount = 1;
    curves.forEach((curve) => {
      if (!curve.id) {
        curve.id = `Reference Curve ${unnamedCount++}`;
      }
    });

    if (curves.length === 0) return []; // Nothing to process

    const isValidNumber = (n) => isFinite(n) && !isNaN(n);

    const processors = {
      function: (curve, numPoints) => {
        const xMin =
          curve.domain && curve.domain[0] !== undefined
            ? curve.domain[0]
            : domainX[0];
        const xMax =
          curve.domain && curve.domain[1] !== undefined
            ? curve.domain[1]
            : domainX[1];
        const step = (xMax - xMin) / numPoints;

        const points = [];
        for (let x = xMin; x <= xMax; x += step) {
          try {
            const y = curve.func(x);
            if (isValidNumber(y)) {
              points.push([x, y]);
            }
          } catch (_e) {
            /* noop */
          }
        }
        return points;
      },

      parametric: (curve, numPoints) => {
        const tMin =
          curve.tRange && curve.tRange[0] !== undefined ? curve.tRange[0] : 0;
        const tMax =
          curve.tRange && curve.tRange[1] !== undefined
            ? curve.tRange[1]
            : 2 * Math.PI;
        const step = (tMax - tMin) / numPoints;

        const points = [];
        for (let t = tMin; t <= tMax; t += step) {
          try {
            const x = curve.xFunc(t);
            const y = curve.yFunc(t);
            if (isValidNumber(x) && isValidNumber(y)) {
              points.push([x, y]);
            }
          } catch (_e) {
            /* noop */
          }
        }
        return points;
      },

      polynomial: (curve, numPoints) => {
        const xMin =
          curve.domain && curve.domain[0] !== undefined
            ? curve.domain[0]
            : domainX[0];
        const xMax =
          curve.domain && curve.domain[1] !== undefined
            ? curve.domain[1]
            : domainX[1];
        const step = (xMax - xMin) / numPoints;
        const coefficients = curve.coefficients;

        const points = [];
        for (let x = xMin; x <= xMax; x += step) {
          let y = 0;
          for (let i = coefficients.length - 1; i >= 0; i--) {
            y = y * x + coefficients[i];
          }
          if (isValidNumber(y)) {
            points.push([x, y]);
          }
        }
        return points;
      },
    };

    const processedCurves = curves
      .map((curve) => {
        // Usa curve.numPoints si existe y es válido, si no usa 10000 por defecto
        let numPoints =
          curve.numPoints && isFinite(curve.numPoints)
            ? curve.numPoints
            : 10000;
        curve.isVisible = true; // Add isVisible property to each curve
        const processedCurve = Object.assign({}, curve);
        processedCurve.collisionActive =
          typeof curve.collisionActive !== "undefined"
            ? curve.collisionActive
            : false;
        processedCurve.isSimplePoints =
          typeof curve.isSimplePoints !== "undefined"
            ? curve.isSimplePoints
            : true;
        processedCurve.epsilon =
          typeof curve.epsilon !== "undefined" ? curve.epsilon : 0;
        if (
          (processedCurve.color == null || processedCurve.color === "") &&
          context.ts &&
          typeof context.ts.brushesColorScale === "function"
        ) {
          processedCurve.color = context.ts.brushesColorScale(
            processedCurve.id
          );
        }
        if (typeof curve.collisions === "undefined") {
          processedCurve.collisions = null;
        }

        // Prioriza data existente (puntos simples o polilíneas) sobre generación de funciones
        if (curve.data && Array.isArray(curve.data) && curve.data.length > 0) {
          // Usa data existente sin generar nuevos puntosç
          processedCurve.data = curve.data;
        } else if (curve.func && typeof curve.func === "function") {
          processedCurve.data = processors.function(curve, numPoints);
        } else if (
          curve.xFunc &&
          curve.yFunc &&
          typeof curve.xFunc === "function" &&
          typeof curve.yFunc === "function"
        ) {
          processedCurve.data = processors.parametric(curve, numPoints);
        } else if (curve.coefficients && Array.isArray(curve.coefficients)) {
          processedCurve.data = processors.polynomial(curve, numPoints);
        } else {
          console.warn(
            "Curve without data or valid functions. Skipping.",
            curve
          );
          return null;
        }

        if (processedCurve.data && processedCurve.data.length === 1) {
          processedCurve.isSimplePoints = true;
        }

        return processedCurve;
      })
      .filter(Boolean);

    // Filtrar puntos por dominio (aplica a todos, ya sean generados o existentes)
    processedCurves.forEach((curve) => {
      if (
        !curve.data ||
        !Array.isArray(curve.data) ||
        curve.data.length === 0
      ) {
        curve.data = [];
        return;
      }
      curve.data = curve.data.filter((point) => {
        const [xVal, yVal] = point;
        return (
          xVal >= domainX[0] &&
          xVal <= domainX[1] &&
          yVal >= domainY[0] &&
          yVal <= domainY[1] &&
          isValidNumber(xVal) &&
          isValidNumber(yVal)
        );
      });

      curve.data.sort((a, b) => a[0] - b[0]);
    });

    return processedCurves;
  }

  context.ts.printReferenceCurves = function (curves) {
    if (!context.overviewX) return;
    if (!Array.isArray(curves))
      throw new Error("The reference curves must be an array of Objects");

    // --- INICIO CÓDIGO NUEVO (1/2) ---
    // Creamos una copia de la escala Y pero sin la propiedad clamp.
    const unclampedY = context.overviewY.copy().clamp(false);
    // --- FIN CÓDIGO NUEVO (1/2) ---

    const visible = curves.filter((c) => c.isVisible !== false);

    const domainX = context.overviewX.domain();
    const domainY = context.overviewY.domain();
    visible.forEach((c) => {
      c.data.sort((a, b) => d3.ascending(a[0], b[0]));
      c.data = c.data.filter(
        (p) =>
          p[0] >= domainX[0] &&
          p[0] <= domainX[1] &&
          p[1] >= domainY[0] &&
          p[1] <= domainY[1]
      );
    });

    const lineCurves = visible.filter((c) => !c.isSimplePoints);
    const pointCurves = visible.filter((c) => c.isSimplePoints);

    const line2 = d3
      .line()
      .defined((d) => d[1] !== undefined && d[1] !== null)
      .x((d) => context.overviewX(d[0]))
      .y((d) => context.overviewY(d[1]));

    const lineSel = gReferences
      .selectAll("path.referenceCurve")
      .data(lineCurves, (d) => d.id);

    lineSel.exit().remove();

    lineSel
      .enter()
      .append("path")
      .attr("class", "referenceCurve")
      .merge(lineSel)
      .attr("d", (c) => line2(c.data))
      .attr("stroke-width", (c) => c.strokeWidth || 2)
      .style("fill", "none")
      .style("stroke", (c) => c.color)
      .style("opacity", (c) =>
        c.opacity !== undefined && c.opacity !== null ? c.opacity : 1
      );

    // --- LÓGICA PARA DIBUJAR PUNTOS Y SUS RADIOS DE TOLERANCIA ---
    const allPoints = [];
    pointCurves.forEach((c) => {
      c.data.forEach((p) => {
        allPoints.push({
          curveId: c.id,
          x: p[0],
          y: p[1],
          color: c.color,
          radius: c.pointRadius || 4,
          opacity:
            c.opacity !== undefined && c.opacity !== null ? c.opacity : 1,
          strokeColor: c.strokeColor || "#ffffff",
          strokeWidth: c.strokeWidth || 1,
          epsilon: c.epsilon || 0,
        });
      });
    });

    // Dibuja los círculos de tolerancia (el área de influencia)
    const toleranceSel = gReferences
      .selectAll("circle.referenceTolerance")
      .data(
        allPoints.filter((d) => d.epsilon > 0),
        (d) => `${d.curveId}:${d.x},${d.y}`
      );

    toleranceSel.exit().remove();

    toleranceSel
      .enter()
      .append("circle")
      .attr("class", "referenceTolerance")
      .merge(toleranceSel)
      .attr("cx", (d) => context.overviewX(d.x))
      .attr("cy", (d) => context.overviewY(d.y))
      // --- INICIO CÓDIGO MODIFICADO (2/2) ---
      // Usamos la nueva escala "unclampedY" para que el radio pueda crecer fuera de los límites.
      .attr("r", (d) => Math.abs(unclampedY(0) - unclampedY(d.epsilon)))
      // --- FIN CÓDIGO MODIFICADO (2/2) ---
      .style("fill", (d) => d.color)
      .style("stroke", (d) => d3.color(d.color).darker(0.5))
      .style("stroke-width", 1)
      .style("opacity", 0.2)
      .style("pointer-events", "none");

    // Dibuja los puntos de referencia (código original)
    const ptSel = gReferences
      .selectAll("circle.referencePoint")
      .data(allPoints, (d) => `${d.curveId}:${d.x},${d.y}`);

    ptSel.exit().remove();

    ptSel
      .enter()
      .append("circle")
      .attr("class", "referencePoint")
      .merge(ptSel)
      .attr("cx", (d) => context.overviewX(d.x))
      .attr("cy", (d) => context.overviewY(d.y))
      .attr("r", (d) => d.radius)
      .style("fill", (d) => d.color)
      .style("opacity", (d) => d.opacity)
      .style("stroke", (d) => d.strokeColor)
      .style("stroke-width", (d) => d.strokeWidth)
      .select(function () {
        return this;
      })
      .append("title")
      .text((d) => `${d.curveId}: (${d.x}, ${d.y})`);
  };

  function initReferenceLayer(g) {
    gReferences = g
      .selectAll("g.gReferences")
      .data([1])
      .join("g")
      .attr("class", "gReferences")
      .style("pointer-events", "none");
  }

  function initSliderLayer(g) {
    gProbes = g
      .selectAll("g.gProbes")
      .data([1])
      .join("g")
      .attr("class", "gProbes");
  }

  function initControls() {
    const rcWidgetElement = d3
      .select(context.target)
      .selectAll("#rcWidget")
      .data([1])
      .join("div")
      .attr("id", "rcWidget")
      .style("margin-top", "15px")
      .node();

    rcWidgetElement.innerHTML = `
        <h3>Reference Curves</h3>
        <div id="rcList"></div>
    `;

    if (context.showBrushesControls)
      context.divControls.appendChild(rcWidgetElement);
  }

  function removeMissingGroups() {
    const existingGroupIds = new Set(
      Array.from(context.brushes.getBrushesGroup().keys())
    );
    let slidersWereRemoved = false;
    for (const [sliderId, slider] of sliders.entries()) {
      if (!existingGroupIds.has(slider.groupId)) {
        sliders.delete(sliderId);
        slidersWereRemoved = true;
      }
    }

    let associationsWereRemoved = false;
    if (Array.isArray(referenceCurves)) {
      referenceCurves.forEach((curve) => {
        if (curve.isSimplePoints && Array.isArray(curve.associations)) {
          const originalCount = curve.associations.length;
          curve.associations = curve.associations.filter((assoc) =>
            existingGroupIds.has(assoc.id)
          );

          if (curve.associations.length < originalCount) {
            associationsWereRemoved = true;
          }
        }
      });
    }

    return { slidersWereRemoved, associationsWereRemoved };
  }

  function hasEnabledFilters(groupId) {
    const hasPointAssoc = (referenceCurves || []).some(
      (rc) =>
        rc.isSimplePoints &&
        Array.isArray(rc.associations) &&
        rc.associations.some((assoc) => assoc.id === groupId && assoc.enabled)
    );
    const hasActiveSlider = Array.from(sliders.values()).some(
      (s) => s.groupId === groupId && s.enabled
    );
    return hasPointAssoc || hasActiveSlider;
  }

  function prepareCurves() {
    referenceCurves = referenceCurves || [];
    referenceCurves = generateCurvePoints(
      referenceCurves,
      context.overviewX.domain(),
      context.overviewY.domain()
    );
  }

  return {
    prepareCurves,
    hasEnabledFilters,
    get referenceCurves() {
      return referenceCurves;
    },
    set referenceCurves(curves) {
      referenceCurves = curves;
    },
    get sliders() {
      return sliders;
    },
    getYAtX,
    onRemoveBrushGroup,
    renderReferenceCurvesWidget,
    updateDependentStates,
    onBrushCoordinatesChange,
    initBrushCoordinates,
    generateCurvePoints,
    initReferenceLayer,
    initSliderLayer,
    initControls,
    removeMissingGroups,
  };
}
