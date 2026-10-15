import {expect, test} from "@jest/globals";
import * as d3 from "d3";
import {cloneBrushGroupPayload} from "../src/BrushInteraction.js";
import {isInsideDomain} from "../src/utils.js";

function sourceGroup() {
    return {
        name: "Source",
        brushes: new Map([
            [
                0,
                {
                    mode: "intersect",
                    aggregation: "and",
                    selection: [
                        [0, 0],
                        [10, 10],
                    ],
                    selectionDomain: [
                        [2, 70],
                        [8, 20],
                    ],
                },
            ],
            [1, {selection: null, selectionDomain: null}],
        ]),
    };
}

test("duplicating a group copies only its committed brushes", () => {
    const copy = cloneBrushGroupPayload(sourceGroup());
    expect(copy.brushes).toEqual([
        {
            mode: "intersect",
            aggregation: "and",
            selectionDomain: [
                [2, 70],
                [8, 20],
            ],
        },
    ]);
});

test("the duplicate gets an independent enabled group name", () => {
    const copy = cloneBrushGroupPayload(sourceGroup());
    expect(copy.name).toBe("Source (copy)");
    expect(copy.isEnable).toBe(true);
    expect(copy.isActive).toBe(false);
});

test("an empty source produces no committed brush copies", () => {
    expect(
        cloneBrushGroupPayload({brushes: new Map([[0, {selection: null}]])})
            .brushes
    ).toEqual([]);
});

test("duplicating preserves the PR's NOT filters without sharing coordinates", () => {
    const source = sourceGroup();
    source.brushes.get(0).negate = true;
    const copy = cloneBrushGroupPayload(source);
    expect(copy.brushes[0].negate).toBe(true);
    copy.brushes[0].selectionDomain[0][0] = 4;
    expect(source.brushes.get(0).selectionDomain[0][0]).toBe(2);
});

test("date coordinates in a duplicate keep their type and are independent", () => {
    const source = sourceGroup();
    source.brushes.get(0).selectionDomain = [
        [new Date(2025, 0, 1), 70],
        [new Date(2025, 0, 10), 20],
    ];
    const copy = cloneBrushGroupPayload(source);
    const date = copy.brushes[0].selectionDomain[0][0];
    expect(date).toBeInstanceOf(Date);
    date.setDate(3);
    expect(source.brushes.get(0).selectionDomain[0][0].getDate()).toBe(1);
});

test("a brush on the axis edges remains valid when duplicated or restored", () => {
    expect(
        isInsideDomain(
            [
                [0, 100],
                [10, 0],
            ],
            d3.scaleLinear().domain([0, 10]),
            d3.scaleLinear().domain([0, 100])
        )
    ).toBe(true);
});
