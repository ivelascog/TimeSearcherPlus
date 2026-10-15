import {expect, test} from "@jest/globals";
import * as d3 from "d3";
import createReferenceCurves from "../src/ReferenceCurves.js";
import {createAuxiliaryWidgets} from "../src/AuxiliaryWidgets.js";

function createControls(curves = []) {
    let scaleX = d3.scaleLinear().domain([0, 10]).range([0, 100]);
    let scaleY = d3.scaleLinear().domain([0, 10]).range([100, 0]);
    let groups = new Map([[0, {isEnable: true}]]);
    const ts = {brushesColorScale: d3.scaleOrdinal(d3.schemeTableau10)};
    const auxiliaryWidgets = createAuxiliaryWidgets({target: {}, ts});
    const controls = createReferenceCurves({
        ts,
        auxiliaryWidgets,
        referenceCurves: curves,
    });
    controls.bindBrushes({
        getBrushesGroup: () => groups,
    });
    controls.setView({scaleX, scaleY});
    return {
        controls,
        ts,
        setScales(x, y) {
            scaleX = x;
            scaleY = y;
            controls.setView({scaleX, scaleY});
        },
        setGroups(value) {
            groups = value;
        },
    };
}

test("preparing curves keeps caller data intact and restores offscreen points after zoom", () => {
    const data = Object.freeze([
        Object.freeze([10, 8]),
        Object.freeze([0, 2]),
        Object.freeze([5, 6]),
    ]);
    const curve = Object.freeze({data, isVisible: false});
    const state = createControls([curve]);
    state.controls.prepareCurves();
    expect(state.controls.referenceCurves[0].data).toEqual([
        [0, 2],
        [5, 6],
        [10, 8],
    ]);
    state.setScales(
        d3.scaleLinear().domain([3, 7]).range([0, 100]),
        d3.scaleLinear().domain([4, 7]).range([100, 0])
    );
    state.controls.prepareCurves();
    expect(state.controls.referenceCurves[0].data).toHaveLength(3);
    expect(state.controls.referenceCurves[0].isVisible).toBe(false);
    expect(data[0]).toEqual([10, 8]);
    expect(curve.id).toBeUndefined();
});

test("slider boxes follow replacement scales after widget reinitialization", () => {
    const state = createControls([
        {
            id: "line",
            isSimplePoints: false,
            data: [
                [0, 2],
                [10, 8],
            ],
        },
    ]);
    state.controls.sliders.set(1, {
        id: 1,
        rcId: "line",
        groupId: 0,
        enabled: true,
        leftX: 2,
        rightX: 8,
    });
    expect(state.ts.getActiveSliderBoxes()).toEqual([
        {
            groupId: 0,
            sliderId: 1,
            box: [
                [20, 0],
                [80, 100],
            ],
        },
    ]);
    state.setScales(
        d3.scaleLinear().domain([0, 10]).range([0, 200]),
        d3.scaleLinear().domain([0, 10]).range([300, 0])
    );
    expect(state.ts.getActiveSliderBoxes()).toEqual([
        {
            groupId: 0,
            sliderId: 1,
            box: [
                [40, 0],
                [160, 300],
            ],
        },
    ]);
});

test("widget instances keep separate sliders and reference associations", () => {
    const first = createControls();
    const second = createControls();
    first.controls.sliders.set(1, {groupId: 0, enabled: true});
    expect(first.controls.hasEnabledFilters(0)).toBe(true);
    expect(second.controls.hasEnabledFilters(0)).toBe(false);
    expect(second.controls.sliders.size).toBe(0);
});

test("removed groups prune their sliders and point associations only", () => {
    const state = createControls([
        {
            id: "points",
            isSimplePoints: true,
            associations: [
                {id: 0, enabled: true},
                {id: 1, enabled: true},
            ],
        },
    ]);
    state.controls.sliders.set(1, {groupId: 0, enabled: true});
    state.controls.sliders.set(2, {groupId: 1, enabled: true});
    state.setGroups(new Map([[1, {isEnable: true}]]));
    expect(state.controls.removeMissingGroups()).toEqual({
        slidersWereRemoved: true,
        associationsWereRemoved: true,
    });
    expect([...state.controls.sliders.keys()]).toEqual([2]);
    expect(state.controls.referenceCurves[0].associations).toEqual([
        {id: 1, enabled: true},
    ]);
    expect(state.controls.hasEnabledFilters(0)).toBe(false);
    expect(state.controls.hasEnabledFilters(1)).toBe(true);
});

test("re-enabling a group preserves each dependant's disabled preference", () => {
    const curves = [
        {
            id: "points",
            isSimplePoints: true,
            associations: [{id: 0, userEnabled: false, enabled: false}],
        },
    ];
    const state = createControls(curves);
    state.controls.sliders.set(1, {
        groupId: 0,
        userEnabled: true,
        enabled: true,
    });
    state.controls.sliders.set(2, {
        groupId: 0,
        userEnabled: false,
        enabled: false,
    });
    state.controls.updateDependentStates(0, false);
    expect(state.controls.hasEnabledFilters(0)).toBe(false);
    state.controls.updateDependentStates(0, true);
    expect(state.controls.sliders.get(1).enabled).toBe(true);
    expect(state.controls.sliders.get(2).enabled).toBe(false);
    expect(curves[0].associations[0].enabled).toBe(false);
    expect(state.controls.hasEnabledFilters(0)).toBe(true);
});

test("slider filters evaluate series geometry using the current data accessors", () => {
    const state = createControls([
        {
            id: "line",
            isSimplePoints: false,
            data: [
                [0, 5],
                [10, 5],
            ],
        },
    ]);
    const data = [
        [
            "below",
            [
                {time: 0, value: 2},
                {time: 10, value: 2},
            ],
        ],
        [
            "above",
            [
                {time: 0, value: 8},
                {time: 10, value: 8},
            ],
        ],
    ];
    state.controls.filterProvider.bindData({
        data,
        x: (d) => d.time,
        y: (d) => d.value,
        index: {intersect: () => new Set(["below", "above"]), getBvh: () => ({})},
    });
    state.controls.sliders.set(1, {
        id: 1,
        rcId: "line",
        groupId: 0,
        enabled: true,
        leftX: 2,
        rightX: 8,
        side: "above",
        mode: "intersect",
        aggregation: "and",
    });
    expect([
        ...state.controls.filterProvider.getFilters().get(0)[0].getResults(),
    ]).toEqual(["above"]);
    state.controls.sliders.get(1).side = "below";
    expect([
        ...state.controls.filterProvider.getFilters().get(0)[0].getResults(),
    ]).toEqual(["below"]);
});

test("point filters respect visibility and enabled group associations", () => {
    const curves = [
        {
            id: "points",
            isSimplePoints: true,
            associations: [
                {id: 0, enabled: true, negate: true},
                {id: 1, enabled: false},
            ],
            collisions: [{dataId: "matched"}],
        },
    ];
    const state = createControls();
    state.controls.filterProvider.bindData({
        data: [],
        x: (d) => d.x,
        y: (d) => d.y,
        index: {getBvh: () => ({referenceLines: curves})},
    });
    const filters = state.controls.filterProvider.getFilters();
    expect(filters.has(1)).toBe(false);
    expect(filters.get(0)[0].negate).toBe(true);
    expect([...filters.get(0)[0].getResults()]).toEqual(["matched"]);
    curves[0].isVisible = false;
    expect(state.controls.filterProvider.getFilters().size).toBe(0);
});
