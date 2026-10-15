import * as d3 from "d3";
import {BrushAggregation, BrushModes, log} from "./utils.js";
import {add, sub} from "date-fns";
import {throttle} from "throttle-debounce";

// Auxiliary panels own their containers and UI state. The widget supplies
// configuration and a change callback; controllers are rebound after init().
export function createAuxiliaryWidgets({
                                           target,
                                           ts,
                                           showBrushesControls = true,
                                           showDataGroups = true,
                                           onChange = () => {
                                           },
                                           coordinates = true,
                                       }) {
    let divControls, brushesCoordinates, groupsElement, divData;
    let brushes, referenceControls;
    let chartGroupControls;
    const dataGroupCounts = new Map();
    let renderSelected = new Map();
    let nonSelectedCount = 0;
    let showNonSelected = true;
    const selectedDataGroups = new Set();

    function initBrushesControls() {
        groupsElement.innerHTML = `
        <h3>Groups</h3>
        <div id="brushesList" style="margin-bottom: 8px;"></div>
        <button id="btnAddBrushGroup">Add Group</button>
        <button id="btnDuplicateBrushGroup">Duplicate Group</button>
    `;
        groupsElement
            .querySelector("button#btnAddBrushGroup")
            .addEventListener("click", onAddBrushGroup);

        groupsElement
            .querySelector("#btnDuplicateBrushGroup")
            .addEventListener("click", duplicateGroup);
        referenceControls.initControls();

        if (showBrushesControls) {
            divControls.appendChild(groupsElement);
        }
    }

    function renderGroupsWidget() {
        const brushesList = d3.select(groupsElement).select("#brushesList");

        const brushGroups = Array.from(brushes.getBrushesGroup()).filter(
            ([id, group]) => !group.name.startsWith("RC ")
        );

        brushesList
            .selectAll(".brushControl")
            .data(brushGroups, (d) => d[0])
            .join("div")
            .attr("class", "brushControl")
            .each(function (d) {
                const div = d3.select(this);
                const groupName = d[1].name;
                const groupCount = renderSelected.has(d[0])
                    ? renderSelected.get(d[0]).length
                    : 0;

                div.node().innerHTML = `<div style="display: flex; align-items: center; flex-wrap: nowrap; margin-bottom: 2px;">
            <input type="checkbox" id="checkBoxShowBrushGroup" ${
                    d[1].isEnable ? "checked" : ""
                }></input>
            <div id="groupColor" style="
              min-width: ${ts.brushGroupSize}px; height: ${ts.brushGroupSize}px;
              background-color: ${computeBrushColor(d[0])};
              border: ${
                    d[0] === brushes.getBrushGroupSelected()
                        ? "2px solid black"
                        : "1px solid #ccc"
                };
              margin: 0 5px; cursor: pointer;
            "></div>
            <input id="groupName" style="border: none; outline: none; width: ${
                    groupName.length + 1
                }ch;" value="${groupName}"></input>
            <span id="groupSize" style="margin-right: 5px; cursor: pointer;">(${groupCount})</span>
            <button style="color: red; font-weight: bold; border:none; background:none; display:${
                    brushes.getBrushesGroupSize() > 1 ? "block" : "none"
                }" id="btnRemoveBrushGroup">&cross;</button>
          </div>
        `;

                div.select("input#groupName").on("input", function () {
                    this.style.width = this.value.length + 1 + "ch";
                });
                div.select("input#groupName").on("change", (evt) => {
                    brushes.updateBrushGroupName(d[0], evt.target.value);
                    onChange();
                });
                div.select("#btnRemoveBrushGroup").on("click", (e) => {
                    e.stopPropagation();
                    referenceControls.onRemoveBrushGroup(d[0]);
                });
                div
                    .select("#checkBoxShowBrushGroup")
                    .on("click", (e) => e.stopPropagation())
                    .on("change", (e) => {
                        e.stopPropagation();
                        onChangeBrushGroupState(d[0], e.target.checked);
                    });
                div
                    .selectAll("div#groupColor, span#groupSize")
                    .on("click", () => onSelectBrushGroup(d[0]));
            });

        const nonSelectedContainer = d3
            .select(groupsElement)
            .selectAll(".nonSelectedControl")
            .data([1]);
        nonSelectedContainer
            .enter()
            .append("div")
            .attr("class", "nonSelectedControl")
            .merge(nonSelectedContainer)
            .each(function () {
                this.innerHTML = `<div style="display: flex; align-items: center; margin-top: 5px;">
                <input type="checkbox" id="checkBoxShowNonSelected" ${
                    showNonSelected ? "checked" : ""
                }></input>
                <span>Non selected (<span id="nonSelectedCount">${nonSelectedCount}</span>)</span>
            </div>`;
                d3.select(this)
                    .select("#checkBoxShowNonSelected")
                    .on("change", (e) => {
                        onChangeNonSelected(e.target.checked);
                    });
            });
        d3.select(groupsElement).select("#nonSelectedCount").text(nonSelectedCount);
    }

    function duplicateGroup() {
        brushes.duplicateBrushGroup();
    }

    function generateDataSelectionDiv() {
        divData.node().innerHTML = "";
        if (showDataGroups) divData.append("h3").text("Data Groups:");

        let divButtons = divData
            .selectAll(".groupData")
            .data(selectedDataGroups)
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
                if (selectedDataGroups.has(d)) {
                    selectedDataGroups.delete(d);
                    d3.select(this).style("border", "solid transparent");
                } else {
                    selectedDataGroups.add(d);
                    d3.select(this).style("border", "solid black");
                }

                onChange();
            });
        divButtons
            .append("span")
            .text((d) => d + " (" + (dataGroupCounts.get(d) || 0) + ")");
        if (showDataGroups) divControls.appendChild(divData.node());
    }

    function createContainers() {
        const findOrCreate = (id) =>
            d3
                .select(target)
                .select("#" + id)
                .node() || d3.create("div").attr("id", id).node();
        divControls = divControls || findOrCreate("control");
        brushesCoordinates =
            brushesCoordinates || findOrCreate("brushesCoordinates");
        groupsElement = groupsElement || findOrCreate("brushesGroups");
        return {divControls, brushesCoordinates, groupsElement};
    }

    function initDataGroupsContainer() {
        if (divData) return divData;
        divData = d3.select(
            d3.select(target).select("#dataGroups").node() ||
            d3.create("div").attr("id", "dataGroups").node()
        );
        return divData;
    }

    function renderGroupShortcut(gGroupBrushes) {
        chartGroupControls = gGroupBrushes;
        gGroupBrushes
            .selectAll("text")
            .data([1])
            .join("text")
            .attr("x", 0)
            .attr("y", ts.brushGroupSize / 2 + 2)
            .text("Groups + : ")
            .style("cursor", "pointer")
            .on("click", onAddBrushGroup);
    }

    function computeBrushColor(groupId) {
        return ts.brushesColorScale(groupId);
    }

    function onAddBrushGroup() {
        brushes.addBrushGroup();
    }

    function onChangeNonSelected(newState) {
        showNonSelected = newState;
        onChange();
    }

    function onChangeBrushGroupState(id, newState) {
        brushes.changeBrushGroupState(id, newState);
        referenceControls.updateDependentStates(id, newState);
        brushes.recomputeSelection();
        ts.printSliders();
        render();
    }

    function onSelectBrushGroup(id) {
        const oldSelectedId = brushes.getBrushGroupSelected();
        brushes.selectBrushGroup(id);
        if (oldSelectedId !== undefined && oldSelectedId !== id) {
            const oldGroup = brushes.getBrushesGroup().get(oldSelectedId);
            if (oldGroup) {
                referenceControls.updateDependentStates(
                    oldSelectedId,
                    oldGroup.isEnable
                );
            }
        }

        referenceControls.updateDependentStates(id, true);

        brushes.recomputeSelection();
    }

    function createReferencePanel(state, actions) {
        return createReferenceWidgets(
            {
                ts,
                target,
                showBrushesControls,
                coordinates,
                getContainers: createContainers,
                onControlsChange: render,
            },
            state,
            actions
        );
    }

    function bindControllers(nextBrushes, nextReferenceControls) {
        brushes = nextBrushes;
        referenceControls = nextReferenceControls;
    }

    function addDataGroups(groups) {
        dataGroupCounts.clear();
        groups.forEach((group) => {
            selectedDataGroups.add(group);
            dataGroupCounts.set(group, (dataGroupCounts.get(group) || 0) + 1);
        });
    }

    function render(selected = renderSelected, count = nonSelectedCount) {
        renderSelected = selected;
        nonSelectedCount = count;
        renderGroupsWidget();
        if (chartGroupControls)
            chartGroupControls
                .selectAll("rect.colorBrushes")
                .data(
                    Array.from(brushes.getBrushesGroup()).filter(
                        ([, group]) => !group.name.startsWith("RC ")
                    ),
                    (d) => d[0]
                )
                .join("rect")
                .attr("class", "colorBrushes")
                .attr("id", (d) => "colorBrush-" + d[0])
                .attr("height", ts.brushGroupSize)
                .attr("width", ts.brushGroupSize)
                .attr(
                    "transform",
                    (d, i) => "translate(" + (90 + i * (ts.brushGroupSize + 5)) + ", -2)"
                )
                .style("stroke-width", (d) =>
                    d[0] === brushes.getBrushGroupSelected() ? 2 : 0
                )
                .style("stroke", "black")
                .style("fill", (d) => computeBrushColor(d[0]))
                .on("click", (event, d) => onSelectBrushGroup(d[0]));
        referenceControls.renderReferenceCurvesWidget();
    }

    return {
        createReferencePanel,
        createContainers,
        initDataGroupsContainer,
        bindControllers,
        addDataGroups,
        initBrushesControls,
        render,
        generateDataSelectionDiv,
        renderGroupShortcut,
        duplicateGroup,
        addBrushGroup: onAddBrushGroup,
        computeBrushColor,
        get selectedDataGroups() {
            return selectedDataGroups;
        },
        get showNonSelected() {
            return showNonSelected;
        },
    };
}

function createReferenceWidgets(
    {
        ts,
        target,
        showBrushesControls,
        coordinates,
        getContainers,
        onControlsChange,
    },
    state,
    actions
) {
    let view = {};
    let gReferences, gProbes;
    let _coordsActiveSlider = null;
    const {getRefCurveById, getYAtX} = actions;

    let brushSpinBoxes = null;

    function renderReferenceCurvesWidget() {
        if (_coordsActiveSlider && !state.sliders.has(_coordsActiveSlider.id)) {
            onSelectedBrushChange(state.brushes.getSelectedBrush());
        }
        const rcWidget = d3.select(target).select("#rcWidget");
        const rcList = rcWidget.select("#rcList");
        if (!state.referenceCurves || state.referenceCurves.length === 0) {
            rcWidget.style("display", "none");
            return;
        }
        rcWidget.style("display", "block");

        rcList
            .selectAll(".rcControl")
            .data(state.referenceCurves, (d) => d.id)
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
                    ts.printReferenceCurves(state.referenceCurves);
                    ts.printSliders();
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
                    ts.printReferenceCurves(state.referenceCurves);
                    ts.printSliders();
                    state.brushes.recomputeSelection();
                    onControlsChange();
                });

                div
                    .select(".add-slider-btn")
                    .on("click", () => actions.onAddSlider(rc.id));
                div
                    .select(".add-association-btn")
                    .on("click", () =>
                        actions.onUpdatePointCurveAssociation(rc.id, null, "add")
                    );

                // Render Sliders
                const associatedSliders = Array.from(state.sliders.values()).filter(
                    (s) => s.rcId === rc.id
                );
                const slidersList = div.select(".sliders-list");
                slidersList
                    .selectAll(".slider-control")
                    .data(associatedSliders, (d) => d.id)
                    .join("div")
                    .attr("class", "slider-control")
                    .each(function (slider) {
                        const group = state.brushes.getBrushesGroup().get(slider.groupId);
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
                      <div title="Associated Group Color" style="width: 12px; height: 12px; background-color: ${ts.brushesColorScale(
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
                                ts.printSliders();
                                state.brushes.recomputeSelection();
                                renderReferenceCurvesWidget();
                            });
                        d3.select(this)
                            .select(".slider-enabled-toggle")
                            .on("change", (e) =>
                                actions.onToggleSlider(slider.id, e.target.checked)
                            );
                        d3.select(this)
                            .select(".remove-slider-btn")
                            .on("click", () => actions.onRemoveSlider(slider.id));
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

                        const group = state.brushes.getBrushesGroup().get(assoc.id);
                        const groupName = group ? group.name : "...";
                        const uniqueId = `rc-${rc.id}-assoc-${assoc.id}`;

                        d3.select(this).node().innerHTML = `
                  <div style="display: flex; align-items: center; margin-bottom: 2px; font-size: 0.9em;">
                      <input type="checkbox" class="assoc-enabled-toggle" title="Enable/Disable Association" ${
                            assoc.userEnabled ? "checked" : ""
                        } style="margin-right: 5px;"></input>

                      <span>(${groupName})</span>
                      <div title="Associated Group Color" style="width: 12px; height: 12px; background-color: ${ts.brushesColorScale(
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
                                state.brushes.recomputeSelection();
                            });
                        d3.select(this)
                            .select(`#${uniqueId}-or`)
                            .on("change", () => {
                                assoc.aggregation = BrushAggregation.Or;
                                state.brushes.recomputeSelection();
                            });

                        d3.select(this)
                            .select(`#${uniqueId}-not`)
                            .on("change", (e) => {
                                assoc.negate = e.target.checked;
                                state.brushes.recomputeSelection();
                            });

                        d3.select(this)
                            .select(".assoc-enabled-toggle")
                            .on("change", (e) => {
                                actions.onUpdatePointCurveAssociation(
                                    rc.id,
                                    assoc.id,
                                    "toggle",
                                    e.target.checked
                                );
                            });
                        d3.select(this)
                            .select(".remove-assoc-btn")
                            .on("click", () => {
                                actions.onUpdatePointCurveAssociation(
                                    rc.id,
                                    assoc.id,
                                    "remove"
                                );
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
                            actions.onEpsilonChange(rc.id, newValue);
                        }
                    });

                    epsilonInput.on("input", function () {
                        this.style.width = Math.max(5, this.value.length + 2) + "ch";
                    });
                    epsilonInput.dispatch("input");
                }
            });
    }

    function initControls() {
        const rcWidgetElement = d3
            .select(target)
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

        if (showBrushesControls)
            getContainers().divControls.appendChild(rcWidgetElement);
    }

    function initBrushCoordinates() {
        getContainers().brushesCoordinates.innerHTML = "";
        let selection = d3.select(getContainers().brushesCoordinates);
        let divX = selection.append("div");

        divX.append("span").text(view.xLabel ? view.xLabel : "X Axis:");

        let divInputX = divX.append("div");

        let domainX = view.scaleX.domain();
        let x0 = divInputX
            .append("div")
            .append("input")
            .attr("type", view.hasScaleTime ? "Date" : "number")
            .attr("min", view.hasScaleTime ? view.formatX(domainX[0]) : domainX[0])
            .attr("max", view.hasScaleTime ? view.formatX(domainX[1]) : domainX[1])
            .attr("step", ts.stepX)
            .style("width", "100%")
            // .style("background-color", ts.backgroundColor)
            .on("change", onSpinboxChange);

        let x1 = divInputX
            .append("div")
            .append("input")
            .attr("type", view.hasScaleTime ? "Date" : "number")
            .attr("min", view.hasScaleTime ? view.formatX(domainX[0]) : domainX[0])
            .attr("max", view.hasScaleTime ? view.formatX(domainX[1]) : domainX[1])
            .style("width", "100%")
            .attr("step", ts.stepX)
            // .style("background-color", ts.backgroundColor)
            .on("change", onSpinboxChange);

        let divY = selection.append("div").attr("id", "coordsYRow");

        divY.append("span").text(view.yLabel ? view.yLabel : "Y Axis:");

        let divInputY = divY.append("div");

        let domainY = view.scaleY.domain();

        let y0 = divInputY
            .append("div")
            .append("input")
            .attr("type", "number")
            .attr("min", domainY[0])
            .attr("max", domainY[1])
            .style("width", "100%")
            .attr("step", ts.stepY)
            // .style("background-color", ts.backgroundColor)
            .on("change", onSpinboxChange);

        let y1 = divInputY
            .append("div")
            .append("input")
            .attr("type", "number")
            .attr("min", domainY[0])
            .attr("max", domainY[1])
            .style("width", "100%")
            .attr("step", ts.stepY)
            // .style("background-color", ts.backgroundColor)
            .on("change", onSpinboxChange);

        brushSpinBoxes = [
            [x0, y0],
            [x1, y1],
        ];

        if (coordinates) {
            selection
                .insert("h3", ":first-child")
                .attr("id", "coordsTitle")
                .text("Current TimeBox Coordinates:");
            getContainers().divControls.appendChild(
                getContainers().brushesCoordinates
            );
        }
        onSelectedBrushChange(null);
        return brushSpinBoxes;
    }

    function updateBrushSpinBox(selection) {
        if (selection) {
            let [[x0, y0], [x1, y1]] = selection;

            // When initializing the brushes the spinbox is not ready
            if (brushSpinBoxes) {
                let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

                sx0.node().value = view.formatX(x0);
                sx1.node().value = view.formatX(x1);
                sy0.node().value = view.formatY(y1).replace("\u2212", "-"); // Change D3 minus sign to parseable minus
                sy1.node().value = view.formatY(y0).replace("\u2212", "-");
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
        if (!brushSpinBoxes) return;
        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        sx0.node().value = "";
        sx1.node().value = "";
        sy0.node().value = "";
        sy1.node().value = "";
    }

    function setCoordinatesMode(mode) {
        const titleEl = getContainers().brushesCoordinates
            ? getContainers().brushesCoordinates.querySelector("#coordsTitle")
            : null;
        const yRow = getContainers().brushesCoordinates
            ? getContainers().brushesCoordinates.querySelector("#coordsYRow")
            : null;
        if (yRow) {
            yRow.style.display = "";
            yRow.style.opacity = mode === "slider" ? "0.5" : "";
        }
        if (mode === "slider") {
            if (titleEl) titleEl.textContent = "Current Slider Coordinates:";
        } else {
            _coordsActiveSlider = null;
            if (titleEl) titleEl.textContent = "Current TimeBox Coordinates:";
        }
        updateSliderSelection();
    }

    function updateSliderCoordinates(slider) {
        setBrushSpinBoxesEnabled(true);
        if (!brushSpinBoxes) return;
        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;
        sx0.node().value = view.formatX(slider.leftX);
        sx1.node().value = view.formatX(slider.rightX);
        sy0.node().value = "";
        sy1.node().value = "";
    }

    function domainDxFromPixels(px = 6) {
        // convierte 0px y px a dominio (soporta Date y número)
        const d0 = +view.scaleX.invert(0);
        const d1 = +view.scaleX.invert(px);
        return Math.abs(d1 - d0) || 0;
    }

    function onSpinboxChange(sourceEvent) {
        // ── Modo Slider: actualizar leftX / rightX del slider activo ──
        if (_coordsActiveSlider) {
            const slider = _coordsActiveSlider;
            let [[sx0], [sx1]] = brushSpinBoxes;
            let newLeft, newRight;
            if (view.hasScaleTime) {
                newLeft = new Date(sx0.node().value);
                newRight = new Date(sx1.node().value);
                if (
                    Number.isNaN(+newLeft) ||
                    Number.isNaN(+newRight) ||
                    !sx0.node().checkValidity() ||
                    !sx1.node().checkValidity()
                )
                    return;
            } else {
                newLeft = +sx0.node().value;
                newRight = +sx1.node().value;
            }
            // Garantizar orden y separación mínima
            if (newLeft >= newRight) {
                if (sourceEvent.target === sx0.node()) {
                    newRight = view.hasScaleTime
                        ? new Date(
                            Math.min(+add(newLeft, ts.stepX), +view.scaleX.domain()[1])
                        )
                        : newLeft + ts.stepX;
                    sx1.node().value = view.formatX(newRight);
                } else {
                    newLeft = view.hasScaleTime
                        ? new Date(
                            Math.max(+sub(newRight, ts.stepX), +view.scaleX.domain()[0])
                        )
                        : newRight - ts.stepX;
                    sx0.node().value = view.formatX(newLeft);
                }
            }
            if (
                newLeft >= newRight ||
                (view.hasScaleTime &&
                    (!sx0.node().checkValidity() || !sx1.node().checkValidity()))
            )
                return;
            slider.leftX = newLeft;
            slider.rightX = newRight;
            ts.printSliders();
            state.brushes.recomputeSelection();
            return;
        }

        // ── Modo TimeBox (comportamiento original) ────────────────────
        let selectedBrush = state.brushes.getSelectedBrush();
        if (selectedBrush === null || selectedBrush === undefined) return;

        let [[sx0, sy0], [sx1, sy1]] = brushSpinBoxes;

        let domainX = view.scaleX.domain();

        let x0;
        let x1;
        let y0 = +sy1.node().value;
        let y1 = +sy0.node().value;

        if (view.hasScaleTime) {
            x0 = new Date(sx0.node().value);
            x1 = new Date(sx1.node().value);
            if (
                Number.isNaN(+x0) ||
                Number.isNaN(+x1) ||
                !sx0.node().checkValidity() ||
                !sx1.node().checkValidity()
            )
                return;
            if (x0 >= x1) {
                if (sourceEvent.target === sx0.node()) {
                    x1 = add(x0, ts.stepX);
                    x1 = Math.min(x1, domainX[1]);
                    sx1.node().value = view.formatX(x1);
                } else {
                    x0 = sub(x1, ts.stepX);
                    x0 = Math.max(x0, domainX[0]);
                    sx0.node().value = view.formatX(x0);
                }
            }
            if (
                x0 >= x1 ||
                !sx0.node().checkValidity() ||
                !sx1.node().checkValidity()
            )
                return;
        } else {
            x0 = +sx0.node().value;
            x1 = +sx1.node().value;

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

        state.brushes.moveSelectedBrush([
            [x0, y0],
            [x1, y1],
        ]);
    }

    function updateSliderVisuals(gSlider, slider) {
        if (gSlider.empty()) return;

        const ref = getRefCurveById(slider.rcId);
        if (!ref) return;

        const groupColor = ts.brushesColorScale(slider.groupId);
        const isOrAggregation = slider.aggregation === BrushAggregation.Or;

        const mainStrokeColor = groupColor;
        const mainStrokeDash = slider.mode === BrushModes.Intersect ? "4" : null;

        const notShadowColor = slider.negate ? "red" : "#333";
        const notShadowWidth = slider.negate ? 8 : 4; // Exagerado si es NOT
        const notShadowOpacity = slider.negate ? 0.6 : 0.5; // Más opaco si es NOT

        const drawHandle = (which) => {
            const xDom = which === "left" ? slider.leftX : slider.rightX;
            const xPx = view.scaleX(xDom);
            const yCurve = getYAtX(ref, +xDom);
            if (yCurve === null) return;

            const yCurvePx = view.scaleY(yCurve);
            const [yMin, yMax] = view.scaleY.domain();
            const yEndPx =
                slider.side === "above" ? view.scaleY(yMax) : view.scaleY(yMin);

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
            .x((d) => view.scaleX(d[0]))
            .y((d) => view.scaleY(d[1]));

        const curvePathData = lineGenerator(curveSegment);

        const [yMin, yMax] = view.scaleY.domain();
        const topPx = view.scaleY(yMax);
        const bottomPx = view.scaleY(yMin);
        const x0p = view.scaleX(slider.leftX);
        const x1p = view.scaleX(slider.rightX);
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
            pathString = `M ${x0p},${topPx} L ${x0p},${view.scaleY(
                startPoint[1]
            )} ${curvePathData.slice(1)} L ${x1p},${topPx} Z`;
        } else {
            pathString = `M ${x0p},${view.scaleY(
                startPoint[1]
            )} ${curvePathData.slice(1)} L ${x1p},${bottomPx} L ${x0p},${bottomPx} Z`;
        }

        gSlider
            .select(".slider-background")
            .attr("d", pathString)
            .attr("fill", groupColor)
            .attr("opacity", sliderOpacity(slider));
    }

    function sliderOpacity(slider) {
        const selected = _coordsActiveSlider && _coordsActiveSlider.id === slider.id;
        return (slider.negate ? 0.25 : 0.15) + (selected ? 0.1 : 0);
    }

    function updateSliderSelection() {
        if (!gProbes) return;
        gProbes.selectAll("g.slider-group")
            .classed("selected", slider => Boolean(_coordsActiveSlider && _coordsActiveSlider.id === slider.id))
            .select(".slider-background")
            .attr("opacity", sliderOpacity);
    }

    function selectSlider(slider) {
        state.brushes.deselectBrush();
        updateSliderSpinBox(slider);
    }

    function initReferenceLayer(g) {
        gReferences = g
            .selectAll("g.gReferences")
            .data([1])
            .join("g")
            .attr("class", "gReferences")
            .attr("clip-path", `url(#${view.clipId})`)
            .style("pointer-events", "none");
    }

    function initSliderLayer(g) {
        gProbes = g
            .selectAll("g.gProbes")
            .data([1])
            .join("g")
            .attr("class", "gProbes")
            .attr("clip-path", `url(#${view.clipId})`);
    }

    ts.printSliders = function () {
        if (!view.scaleX || !view.scaleY || !gProbes) return;

        const sliderData = Array.from(state.sliders.values()).filter((s) => {
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

        const totalLines = view.lineCount || 0;
        const calculatedDelay = Math.min(300, 30 + Math.floor(totalLines / 20));
        ts.moveSelectedBrush = (selection) => {
            state.brushes.moveSelectedBrush(selection);
        };

        ts.selectBrush = (groupId, brushId) => {
            state.brushes.selectBrush(groupId, brushId);
        };

        ts.getBrushesGroup = () => {
            return state.brushes.getBrushesGroup();
        };

        ts.getBrushesColorScale = () => {
            return state.brushes.colorScale;
        };

        ts.recomputeSelection = () => {
            state.brushes.recomputeSelection();
        };
        const throttledRecompute = throttle(calculatedDelay, () => {
            state.brushes.recomputeSelection();
        });

        const handleDragComputation = () => {
            if (ts.autoUpdate) {
                throttledRecompute();
            }
        };

        all.each(function (slider) {
            const gSlider = d3.select(this);
            const ref = getRefCurveById(slider.rcId);
            gSlider.on("click.select", event => {
                if (event.button !== 0) return;
                event.stopPropagation();
                selectSlider(slider);
            });
            gSlider
                .select(".slider-background")
                .style("pointer-events", "all")
                .on("contextmenu", (sourceEvent) => {
                    sourceEvent.preventDefault();
                    const contextMenu = state.brushes.contextMenu;
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
                    state.brushes.recomputeSelection();
                })
                .call(
                    d3
                        .drag()
                        .on("start", function () {
                            selectSlider(slider);
                            d3.select(this).style("cursor", "grabbing");
                        })
                        .on("drag", (e) => {
                            if (!ref) return;
                            const dx = e.dx;
                            const currentLeftPx = view.scaleX(slider.leftX);
                            const currentRightPx = view.scaleX(slider.rightX);
                            const newLeftDomain = view.scaleX.invert(currentLeftPx + dx);
                            const newRightDomain = view.scaleX.invert(currentRightPx + dx);

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
                            state.brushes.recomputeSelection();
                        })
                );

            const minGap = domainDxFromPixels(5);

            const updateSingleEdge = (which, newXPixel) => {
                const xDom = view.scaleX.invert(newXPixel);
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
                let edgeWasDragged = false;
                gSlider
                    .select(`.handle-${which} .slider-hit-area`)
                    .call(
                        d3
                            .drag()
                            .on("start", () => {
                                edgeWasDragged = false;
                                selectSlider(slider);
                            })
                            .on("drag", (e) => {
                                edgeWasDragged = true;
                                updateSingleEdge(which, e.x);
                                updateSliderSpinBox(slider);
                                handleDragComputation();
                            })
                            .on("end", (e) => {
                                if (!edgeWasDragged) return;
                                updateSingleEdge(which, e.x);
                                updateSliderSpinBox(slider);
                                state.brushes.recomputeSelection();
                            })
                    )
                    .on("dblclick", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        slider.side = slider.side === "above" ? "below" : "above";
                        updateSliderVisuals(gSlider, slider);
                        state.brushes.recomputeSelection();
                    })
                    .on("contextmenu", (sourceEvent) => {
                        sourceEvent.preventDefault();
                        sourceEvent.stopPropagation();
                        const contextMenu = state.brushes.contextMenu;
                        if (!contextMenu) return;
                        const xDom = which === "left" ? slider.leftX : slider.rightX;
                        const px = view.scaleX(xDom);
                        const ref = getRefCurveById(slider.rcId);
                        const yCurve = getYAtX(ref, +xDom);
                        const py =
                            yCurve !== null ? view.scaleY(yCurve) : sourceEvent.pageY;

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

    ts.printReferenceCurves = function (curves) {
        if (!view.scaleX) return;
        if (!Array.isArray(curves))
            throw new Error("The reference curves must be an array of Objects");

        // --- INICIO CÓDIGO NUEVO (1/2) ---
        // Creamos una copia de la escala Y pero sin la propiedad clamp.
        const unclampedY = view.scaleY.copy().clamp(false);
        // --- FIN CÓDIGO NUEVO (1/2) ---

        const visible = curves.filter((c) => c.isVisible !== false);

        const lineCurves = visible.filter((c) => !c.isSimplePoints);
        const pointCurves = visible.filter((c) => c.isSimplePoints);

        const line2 = d3
            .line()
            .defined((d) => d[1] !== undefined && d[1] !== null)
            .x((d) => view.scaleX(d[0]))
            .y((d) => view.scaleY(d[1]));

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
            .attr("cx", (d) => view.scaleX(d.x))
            .attr("cy", (d) => view.scaleY(d.y))
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
            .attr("cx", (d) => view.scaleX(d.x))
            .attr("cy", (d) => view.scaleY(d.y))
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

    function setBrushSpinBoxesEnabled(enabled) {
        if (brushSpinBoxes)
            brushSpinBoxes.forEach(([inputX, inputY]) => {
                inputX.property("disabled", !enabled);
                inputY.property("disabled", !enabled || Boolean(_coordsActiveSlider));
            });
    }

    function onSelectedBrushChange(selectedBrush) {
        setCoordinatesMode("timebox");
        const selection = selectedBrush && selectedBrush[1].selectionDomain;
        setBrushSpinBoxesEnabled(Boolean(selection));
        updateBrushSpinBox(selection);
    }

    function onBrushCoordinatesChange(selection) {
        setCoordinatesMode("timebox");
        const hasSelectedBrush = Boolean(
            state.brushes.getSelectedBrush() && selection
        );
        setBrushSpinBoxesEnabled(hasSelectedBrush);
        updateBrushSpinBox(hasSelectedBrush ? selection : null);
        actions.onCoordinatesChange();
    }

    function updateSliderSpinBox(slider) {
        if (!brushSpinBoxes) return;
        _coordsActiveSlider = slider;
        setCoordinatesMode("slider");
        updateSliderCoordinates(slider);
    }

    function notify(message) {
        alert(message);
    }

    function setView(nextView) {
        view = nextView;
    }

    return {
        renderReferenceCurvesWidget,
        initControls,
        initBrushCoordinates,
        notify,
        onSelectedBrushChange,
        onBrushCoordinatesChange,
        initReferenceLayer,
        initSliderLayer,
        setView,
    };
}
