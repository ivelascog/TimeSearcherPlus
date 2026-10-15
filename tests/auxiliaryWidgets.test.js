import {expect, jest, test} from "@jest/globals";
import {createAuxiliaryWidgets} from "../src/AuxiliaryWidgets.js";

test("each widget owns its selected data groups and preserves them across controller replacements", () => {
    const first = createAuxiliaryWidgets({target: {}, ts: {}});
    const second = createAuxiliaryWidgets({target: {}, ts: {}});
    first.addDataGroups(["A", "B", "A"]);
    first.selectedDataGroups.delete("B");
    first.bindControllers({}, {});
    expect([...first.selectedDataGroups]).toEqual(["A"]);
    expect(second.selectedDataGroups.size).toBe(0);
    expect(first.showNonSelected).toBe(true);
});

test("group actions use the latest controller after widget reinitialization", () => {
    const widgets = createAuxiliaryWidgets({target: {}, ts: {}});
    const oldBrushes = {addBrushGroup: jest.fn()};
    const newBrushes = {addBrushGroup: jest.fn()};
    widgets.bindControllers(oldBrushes, {});
    widgets.addBrushGroup();
    widgets.bindControllers(newBrushes, {});
    widgets.addBrushGroup();
    expect(oldBrushes.addBrushGroup).toHaveBeenCalledTimes(1);
    expect(newBrushes.addBrushGroup).toHaveBeenCalledTimes(1);
});

test("group colors follow changes to widget configuration without rebuilding its panels", () => {
    const ts = {brushesColorScale: () => "red"};
    const widgets = createAuxiliaryWidgets({target: {}, ts});
    expect(widgets.computeBrushColor(1)).toBe("red");
    ts.brushesColorScale = () => "blue";
    expect(widgets.computeBrushColor(1)).toBe("blue");
});
