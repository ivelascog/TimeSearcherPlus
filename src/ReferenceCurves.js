import * as d3 from "d3";
import {BrushAggregation, BrushModes} from "./utils.js";

// Reference data, slider state and filtering geometry. DOM, SVG and pointer
// interactions are owned by the auxiliary widgets.
export default function createReferenceCurves({
                                                  ts,
                                                  auxiliaryWidgets,
                                                  referenceCurves: initialCurves,
                                                  onCoordinatesChange = () => {
                                                  },
                                              }) {
    let brushes;
    let view = {};
    let referenceCurves = initialCurves;
    let sliders = new Map();
    let sliderSeq = 0;
    let dataMap = new Map();
    let x, y, filterIndex;

    const widgets = auxiliaryWidgets.createReferencePanel(
        {
            get referenceCurves() {
                return referenceCurves;
            },
            get sliders() {
                return sliders;
            },
            get brushes() {
                return brushes;
            },
        },
        {
            onAddSlider,
            onUpdatePointCurveAssociation,
            onToggleSlider,
            onRemoveSlider,
            onEpsilonChange,
            getRefCurveById,
            getYAtX,
            onCoordinatesChange,
        }
    );

    // Extra-filter provider consumed by BrushInteraction. All reference-specific
    // geometry and state stay here; the brush controller only combines results.
    function getIndexOptions() {
        return {
            referenceLines: (referenceCurves || []).map((curve) =>
                Object.assign({}, curve, {
                    data: curve.data.map((point) => [
                        view.scaleX(point[0]),
                        view.scaleY(point[1]),
                    ]),
                })
            ),
            scaleY: view.scaleY.copy().clamp(false),
        };
    }

    function bindData({data, x: nextX, y: nextY, index}) {
        dataMap = new Map(data.map((timeline) => [timeline[0], timeline]));
        x = nextX;
        y = nextY;
        filterIndex = index;
    }

    function getFilters() {
        const filters = new Map();
        const addFilter = (groupId, filter) => {
            if (!filters.has(groupId)) filters.set(groupId, []);
            filters.get(groupId).push(filter);
        };
        for (const sliderInfo of ts.getActiveSliderBoxes()) {
            const slider = sliders.get(sliderInfo.sliderId);
            if (!slider) continue;
            addFilter(sliderInfo.groupId, {
                aggregation: slider.aggregation,
                negate: slider.negate,
                getResults: () => {
                    const curve = getRefCurveById(slider.rcId);
                    if (!curve) return new Set();
                    const [[x0, y0], [x1, y1]] = sliderInfo.box;
                    const candidates =
                        slider.mode === BrushModes.Contains
                            ? dataMap.keys()
                            : filterIndex.intersect(x0, y0, x1, y1);
                    const results = new Set();
                    for (const id of candidates) {
                        const timeline = dataMap.get(id);
                        if (!timeline || !timeline[1]) continue;
                        const matches =
                            slider.mode === BrushModes.Contains
                                ? isTimelineFullyInSliderCurtain(timeline[1], slider, curve)
                                : isTimelineInSliderCurtain(timeline[1], slider, curve);
                        if (matches) results.add(id);
                    }
                    return results;
                },
            });
        }
        const bvh = filterIndex.getBvh();
        for (const curve of bvh.referenceLines || []) {
            if (
                !curve.isSimplePoints ||
                curve.isVisible === false ||
                !Array.isArray(curve.associations) ||
                !Array.isArray(curve.collisions)
            )
                continue;
            for (const association of curve.associations) {
                if (!association.enabled) continue;
                addFilter(association.id, {
                    aggregation: association.aggregation || BrushAggregation.Or,
                    negate: association.negate || false,
                    getResults: () =>
                        new Set(curve.collisions.map((collision) => collision.dataId)),
                });
            }
        }
        return filters;
    }

    function onContextMenuChange(mode, aggregation, negate, entity) {
        if (!entity || entity.rcId === undefined) return;
        entity.mode = mode;
        entity.aggregation = aggregation;
        entity.negate = negate;
        brushes.recomputeSelection();
        ts.printSliders();
    }

    function onGroupRemoved(id) {
        for (const [sliderId, slider] of sliders) {
            if (slider.groupId === id) sliders.delete(sliderId);
        }
        const affected = [];
        for (const curve of referenceCurves || []) {
            if (!curve.isSimplePoints || !Array.isArray(curve.associations)) continue;
            const associations = curve.associations.filter(
                (association) => association.id !== id
            );
            if (associations.length !== curve.associations.length) {
                curve.associations = associations;
                affected.push(curve);
            }
        }
        if (filterIndex && affected.length) {
            filterIndex.removeReferenceCurves(affected.map((curve) => curve.id));
            filterIndex.addReferenceCurves(
                getIndexOptions().referenceLines.filter((curve) =>
                    affected.some((item) => item.id === curve.id)
                )
            );
        }
        ts.printSliders();
    }

    function onGroupStateChange(id, enabled, group) {
        if (typeof group.name !== "string" || !group.name.startsWith("RC ")) return;
        const curve = (referenceCurves || []).find((item) => item.id === id);
        if (curve) {
            curve.isVisible = enabled;
            ts.printReferenceCurves(referenceCurves);
        }
    }

    function hasSelection(groups) {
        const bvh = filterIndex.getBvh();
        for (const [groupId, group] of groups) {
            if (!group.name || !group.name.startsWith("RC ")) continue;
            const curve = (bvh.referenceLines || []).find(
                (item) => item.id === groupId
            );
            if (curve && Array.isArray(curve.collisions) && curve.collisions.length)
                return true;
        }
        return false;
    }

    function isTimelineInSliderCurtain(timelinePolyline, slider, refCurve) {
        const sliderMinX = +slider.leftX;
        const sliderMaxX = +slider.rightX;

        const yDomain = view.scaleY.domain();
        const yBoundary = slider.side === "above" ? yDomain[1] : yDomain[0];

        const yRefLeft = getYAtX(refCurve, sliderMinX);
        const yRefRight = getYAtX(refCurve, sliderMaxX);

        if (yRefLeft === null || yRefRight === null) return false;

        const refSegment = refCurve.data.filter(
            (p) => +p[0] >= sliderMinX && +p[0] <= sliderMaxX
        );

        const curtainPolygon = [];
        curtainPolygon.push([sliderMinX, yRefLeft]);
        refSegment.forEach((p) => curtainPolygon.push([+p[0], p[1]]));
        curtainPolygon.push([sliderMaxX, yRefRight]);
        curtainPolygon.push([sliderMaxX, yBoundary]);
        curtainPolygon.push([sliderMinX, yBoundary]);

        for (let i = 0; i < timelinePolyline.length; i++) {
            const p = timelinePolyline[i];
            const pointCoords = [+x(p), y(p)];
            if (d3.polygonContains(curtainPolygon, pointCoords)) {
                return true;
            }
        }

        for (let i = 0; i < timelinePolyline.length - 1; i++) {
            const p1 = [+x(timelinePolyline[i]), y(timelinePolyline[i])];
            const p2 = [+x(timelinePolyline[i + 1]), y(timelinePolyline[i + 1])];

            for (let j = 0; j < curtainPolygon.length; j++) {
                const polyP1 = curtainPolygon[j];
                const polyP2 = curtainPolygon[(j + 1) % curtainPolygon.length];
                if (segmentIntersect(p1, p2, polyP1, polyP2).hit) {
                    return true;
                }
            }
        }

        return false;
    }

    function isTimelineFullyInSliderCurtain(timelinePolyline, slider, refCurve) {
        const sliderMinX = +slider.leftX;
        const sliderMaxX = +slider.rightX;

        const yDomain = view.scaleY.domain();
        const yBoundary = slider.side === "above" ? yDomain[1] : yDomain[0];
        const yRefLeft = getYAtX(refCurve, sliderMinX);
        const yRefRight = getYAtX(refCurve, sliderMaxX);

        if (yRefLeft === null || yRefRight === null) return false;

        const refSegmentPoints = refCurve.data.filter(
            (p) => +p[0] >= sliderMinX && +p[0] <= sliderMaxX
        );

        const curtainPolygon = [];
        const refCurveBoundary = []; // Store just the ref-curve part

        const startPt = [sliderMinX, yRefLeft];
        curtainPolygon.push(startPt);
        refCurveBoundary.push(startPt);

        refSegmentPoints.forEach((p) => {
            const pt = [+p[0], p[1]];
            curtainPolygon.push(pt);
            refCurveBoundary.push(pt);
        });

        const endPt = [sliderMaxX, yRefRight];
        curtainPolygon.push(endPt);
        refCurveBoundary.push(endPt);

        // These are the top/bottom boundary points
        const boundaryPt1 = [sliderMaxX, yBoundary];
        const boundaryPt2 = [sliderMinX, yBoundary];
        curtainPolygon.push(boundaryPt1);
        curtainPolygon.push(boundaryPt2);

        // This is the top/bottom "horizontal" boundary segment
        const horizontalBoundary = [boundaryPt1, boundaryPt2];

        // --- Logic Check ---
        let hasLeftPoint = false;
        let hasRightPoint = false;

        for (const p of timelinePolyline) {
            const px = +x(p);
            const py = y(p);

            if (px <= sliderMinX) {
                hasLeftPoint = true;
            } else if (px >= sliderMaxX) {
                hasRightPoint = true;
            } else {
                // Point is within slider's X-range.
                // Check if it's outside the curtain (crosses horizontal boundary)
                if (!d3.polygonContains(curtainPolygon, [px, py])) {
                    return false; // Fails Rule 2 (point check)
                }
            }
        }

        // If it doesn't even span across, it's not "contained"
        if (!hasLeftPoint || !hasRightPoint) {
            return false;
        }

        let yAtMinX = null;
        for (let i = 0; i < timelinePolyline.length - 1; i++) {
            const p1 = timelinePolyline[i];
            const p2 = timelinePolyline[i + 1];
            const x1 = +x(p1),
                x2 = +x(p2);
            if (
                (x1 <= sliderMinX && x2 >= sliderMinX) ||
                (x2 <= sliderMinX && x1 >= sliderMinX)
            ) {
                if (Math.abs(x1 - x2) < 1e-10) {
                    yAtMinX = y(p1);
                } else {
                    const t = (sliderMinX - x1) / (x2 - x1);
                    yAtMinX = y(p1) * (1 - t) + y(p2) * t;
                }
                break;
            }
        }
        if (
            yAtMinX !== null &&
            d3.polygonContains(curtainPolygon, [sliderMinX, yAtMinX])
        ) {
            return false;
        }

        // Check segments for horizontal crossings
        for (let i = 0; i < timelinePolyline.length - 1; i++) {
            const p1 = [+x(timelinePolyline[i]), y(timelinePolyline[i])];
            const p2 = [+x(timelinePolyline[i + 1]), y(timelinePolyline[i + 1])];

            // We only care about segments that are at least partially inside the slider's X-range
            const p1_x = p1[0];
            const p2_x = p2[0];

            // Check if segment is at least partially inside the X range
            const segmentInRange =
                (p1_x >= sliderMinX && p1_x <= sliderMaxX) || // p1 is inside
                (p2_x >= sliderMinX && p2_x <= sliderMaxX) || // p2 is inside
                (p1_x < sliderMinX && p2_x > sliderMinX) || // crosses left boundary
                (p1_x > sliderMaxX && p2_x < sliderMaxX) || // crosses right boundary
                (p1_x < sliderMaxX && p2_x > sliderMaxX) || // crosses right boundary
                (p1_x > sliderMinX && p2_x < sliderMinX); // crosses left boundary

            if (!segmentInRange) {
                continue; // This segment is entirely outside the X-range, skip it
            }

            // Check intersection with top/bottom boundary
            const topIntersectData = segmentIntersect(
                p1,
                p2,
                horizontalBoundary[0],
                horizontalBoundary[1]
            );
            if (topIntersectData.hit) {
                // Check if the intersection point is within the slider's X-range
                const intersectionPoint = topIntersectData.point;
                if (
                    intersectionPoint[0] >= sliderMinX &&
                    intersectionPoint[0] <= sliderMaxX
                ) {
                    return false; // Fails Rule 2 (segment check on top/bottom)
                }
            }

            // Check intersection with ref-curve boundary
            for (let j = 0; j < refCurveBoundary.length - 1; j++) {
                const ref_p1 = refCurveBoundary[j];
                const ref_p2 = refCurveBoundary[j + 1];

                // We only check for intersection if the timeline segment is not identical
                // to the ref_curve segment (which would be a 'touch' not a 'cross')
                if (
                    p1[0] === ref_p1[0] &&
                    p1[1] === ref_p1[1] &&
                    p2[0] === ref_p2[0] &&
                    p2[1] === ref_p2[1]
                ) {
                    continue;
                }

                if (segmentIntersect(p1, p2, ref_p1, ref_p2).hit) {
                    return false; // Fails Rule 2 (segment check on ref curve)
                }
            }
        }

        // If all checks passed (spans across, no points or segments crossed horizontal boundaries)
        return true;
    }

    function segmentIntersect(a, b, c, d) {
        const r = [b[0] - a[0], b[1] - a[1]];
        const s = [d[0] - c[0], d[1] - c[1]];
        const rxs = r[0] * s[1] - r[1] * s[0];
        const qpxr = (c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0];
        if (rxs === 0) return {hit: false};
        const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / rxs;
        const u = qpxr / rxs;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {hit: true, t, u, point: [a[0] + t * r[0], a[1] + t * r[1]]};
        }
        return {hit: false};
    }

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
        if (brushes && typeof brushes.getBrushesGroup === "function") {
            groups = brushes.getBrushesGroup();
        }
        const g =
            groups && typeof groups.get === "function" ? groups.get(groupId) : null;
        return !!(g && g.isEnable);
    }

    function isRefPolylineSelected() {
        const gid = brushes.getBrushGroupSelected();
        if (gid == null) return {ok: false};

        const g = brushes.getBrushesGroup().get(gid);
        if (!g) return {ok: false};

        const name = (g.name || "").trim();
        if (!name.startsWith("RC ")) return {ok: false};

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

        if (!ref) return {ok: false};
        if (ref.isSimplePoints) return {ok: false}; // solo polilínea

        return {ok: true, groupId: gid, ref};
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

            const bvh = brushes.getBvh();
            if (bvh) {
                bvh.removeReferenceCurves([rcId]);
                ts.addReferenceCurve([curve]);
            }
        }
    }

    function onRemoveBrushGroup(id) {
        brushes.removeBrushGroup(id);
    }

    function renderReferenceCurvesWidget() {
        widgets.renderReferenceCurvesWidget();
    }

    function onUpdatePointCurveAssociation(rcId, groupId, action, newState) {
        const ref = referenceCurves.find((c) => c.id === rcId);
        if (!ref) return;

        if (!Array.isArray(ref.associations)) {
            ref.associations = [];
        }

        if (action === "add") {
            const selectedGroupId = brushes.getBrushGroupSelected();
            if (selectedGroupId === undefined || selectedGroupId === null) {
                widgets.notify("Please select a Group before adding an association.");
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
                const group = brushes.getBrushesGroup().get(assoc.id);
                const groupIsEnabled = group ? group.isEnable : false;
                assoc.enabled = groupIsEnabled && assoc.userEnabled;
            }
        }
        ts.addReferenceCurve([ref]);
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
    }

    function onAddSlider(rcId) {
        // Primero, encontramos la curva por su ID, sin importar si está visible o no.
        const ref = Array.isArray(referenceCurves)
            ? referenceCurves.find((c) => c.id === rcId)
            : null;

        if (!ref) {
            // Este es un caso de seguridad, es poco probable que ocurra.
            widgets.notify(
                `Error: No se encontró la curva de referencia con ID "${rcId}".`
            );
            return;
        }

        if (ref.isVisible === false) {
            widgets.notify(
                "You can't add a slider to a reference curve that isn't visible. Please activate it first."
            );
            return; // Detenemos la ejecución aquí.
        }

        if (!ref.data || ref.data.length < 2 || ref.isSimplePoints) {
            console.warn(
                "Cannot add slider to this reference curve (no data, not a polyline, or not found)."
            );
            widgets.notify(
                "You can't add a slider to this reference curve. It may not be a polyline or may not have enough data."
            );
            return;
        }

        const groupId = brushes.getBrushGroupSelected();
        if (groupId === undefined || groupId === null) {
            widgets.notify("Please select a Group before adding a slider.");
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

        brushes.recomputeSelection();
        ts.printSliders();
        renderReferenceCurvesWidget();
    }

    function onRemoveSlider(sliderId) {
        sliders.delete(sliderId);
        brushes.recomputeSelection();
        ts.printSliders();
        renderReferenceCurvesWidget();
    }

    function onToggleSlider(sliderId, isEnabled) {
        if (sliders.has(sliderId)) {
            const slider = sliders.get(sliderId);
            slider.userEnabled = isEnabled;
            const group = brushes.getBrushesGroup().get(slider.groupId);
            const groupIsEnabled = group ? group.isEnable : false;
            slider.enabled = groupIsEnabled && slider.userEnabled;
            brushes.recomputeSelection();
            ts.printSliders();
        }
    }

    function onBrushCoordinatesChange(selection) {
        widgets.onBrushCoordinatesChange(selection);
    }

    function onSelectedBrushChange(selectedBrush) {
        widgets.onSelectedBrushChange(selectedBrush);
    }

    function initBrushCoordinates() {
        widgets.initBrushCoordinates();
    }

    ts.getActiveSliderBoxes = function () {
        if (!view.scaleX || !view.scaleY) return [];
        const out = [];

        const activeSliders = Array.from(sliders.values()).filter((s) => s.enabled);

        for (const slider of activeSliders) {
            const ref = getRefCurveById(slider.rcId);
            if (!ref || ref.isVisible === false) continue;

            const [yMin, yMax] = view.scaleY.domain();
            const topPx = view.scaleY(yMax);
            const bottomPx = view.scaleY(yMin);

            const x0p = view.scaleX(slider.leftX);
            const x1p = view.scaleX(slider.rightX);

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

    ts.addReferenceCurve = function (newCurves) {
        if (!newCurves || !Array.isArray(newCurves) || newCurves.length === 0)
            return;

        const processedNewCurves = generateCurvePoints(
            newCurves,
            view.scaleX.domain(),
            view.scaleY.domain()
        );

        const curvesForBVH = processedNewCurves.map((ref) => {
            const scaledData = ref.data.map((point) => [
                view.scaleX(point[0]),
                view.scaleY(point[1]),
            ]);
            return Object.assign({}, ref, {data: scaledData});
        });

        const bvh = brushes.getBvh();
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

        brushes.recomputeSelection();

        auxiliaryWidgets.render();
        ts.printReferenceCurves(referenceCurves);
        ts.printSliders();
    };

    ts.addReferenceCurves = function (curves) {
        const previousIds = (referenceCurves || []).map((curve) => curve.id);
        referenceCurves = generateCurvePoints(
            curves,
            view.scaleX.domain(),
            view.scaleY.domain()
        );
        ts._referenceCurves = referenceCurves;
        if (brushes) {
            const bvh = brushes.getBvh();
            if (bvh && typeof bvh.addReferenceCurves === "function") {
                bvh.removeReferenceCurves(previousIds);
                bvh.addReferenceCurves(
                    referenceCurves.map((curve) =>
                        Object.assign({}, curve, {
                            data: curve.data.map((point) => [
                                view.scaleX(point[0]),
                                view.scaleY(point[1]),
                            ]),
                        })
                    )
                );
            }
            brushes.recomputeSelection();
        }
        auxiliaryWidgets.render();
        ts.printReferenceCurves(referenceCurves);
        ts.printSliders();
        return ts;
    };

    function generateCurvePoints(curves, domainX, domainY) {
        if (!Array.isArray(curves)) {
            throw new Error("The reference curves must be an array of Objects");
        }

        curves = curves.map((curve) => Object.assign({}, curve));
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
                if (curve.isVisible === undefined) curve.isVisible = true;
                const processedCurve = Object.assign({}, curve);
                processedCurve.collisionActive =
                    typeof curve.collisionActive !== "undefined"
                        ? curve.collisionActive
                        : false;
                processedCurve.isSimplePoints =
                    typeof curve.isSimplePoints !== "undefined"
                        ? curve.isSimplePoints
                        : false;
                processedCurve.epsilon =
                    typeof curve.epsilon !== "undefined" ? curve.epsilon : 0;
                if (
                    (processedCurve.color == null || processedCurve.color === "") &&
                    ts &&
                    typeof ts.brushesColorScale === "function"
                ) {
                    processedCurve.color = ts.brushesColorScale(processedCurve.id);
                }
                if (typeof curve.collisions === "undefined") {
                    processedCurve.collisions = null;
                }

                // Prioriza data existente (puntos simples o polilíneas) sobre generación de funciones
                if (curve.data && Array.isArray(curve.data) && curve.data.length > 0) {
                    // Usa data existente sin generar nuevos puntosç
                    processedCurve.data = curve.data.map((point) => point.slice());
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
                return isValidNumber(xVal) && isValidNumber(yVal);
            });

            curve.data.sort((a, b) => a[0] - b[0]);
        });

        return processedCurves;
    }

    function initReferenceLayer(g) {
        widgets.initReferenceLayer(g);
    }

    function initSliderLayer(g) {
        widgets.initSliderLayer(g);
    }

    function initControls() {
        widgets.initControls();
    }

    function removeMissingGroups() {
        const existingGroupIds = new Set(
            Array.from(brushes.getBrushesGroup().keys())
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

        return {slidersWereRemoved, associationsWereRemoved};
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
            view.scaleX.domain(),
            view.scaleY.domain()
        );
        ts._referenceCurves = referenceCurves;
    }

    function bindBrushes(nextBrushes) {
        brushes = nextBrushes;
    }

    function setView(nextView) {
        view = nextView;
        widgets.setView(nextView);
    }

    return {
        filterProvider: {
            getIndexOptions,
            bindData,
            getFilters,
            onContextMenuChange,
            onGroupRemoved,
            onGroupStateChange,
            hasSelection,
        },
        bindBrushes,
        setView,
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
        onSelectedBrushChange,
        onBrushCoordinatesChange,
        initBrushCoordinates,
        generateCurvePoints,
        initReferenceLayer,
        initSliderLayer,
        initControls,
        removeMissingGroups,
    };
}
