#!/usr/bin/env python3
"""Pure geometry and role matching for finite medial outer-face observations.

G0 annotations remain only as approved-gold construction input. Runtime role
matching scores contour geometry without reading character-specific IDs.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen, RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


BASELINE_Y = 880.0
FLATTEN_TOLERANCE = 0.5
OUTSIDE_PROBE_OFFSET = 0.25
LOCAL_TANGENT_FLATTEN_TOLERANCE = 0.02
LOCAL_TANGENT_MAX_DEVIATION = 0.2
LOCAL_TANGENT_START_SLOPE_TOLERANCE = 0.05
AXIS_TOLERANCE = 1e-6
G0_FONT_ID = "noto-sans-kr"
G0_FONT_SHA256 = "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252"
G4_FONT_ID = "nanum-gothic"
G4_FONT_SHA256 = "76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31"
DOTUM_FONT_ID = "dotum"
DOTUM_FONT_SHA256 = "12f749ac462e547e3f4073227bb3b2b4c116062fc7546fbdadaa04e5e9f88b12"
P0_VERIFIED_FONT_SHA256 = {
    G0_FONT_ID: G0_FONT_SHA256,
    G4_FONT_ID: G4_FONT_SHA256,
    DOTUM_FONT_ID: DOTUM_FONT_SHA256,
}
G0_TUNING_CHARACTERS = frozenset(("가", "각", "거", "걱", "기", "긱", "고", "곡", "구", "국", "그", "극", "과", "곽"))
P0_MEDIAL_JAMOS = frozenset(("ㅏ", "ㅓ", "ㅣ", "ㅗ", "ㅜ", "ㅡ", "ㅘ"))
P1_MEDIAL_JAMOS = frozenset((
    "ㅐ", "ㅑ", "ㅒ", "ㅔ", "ㅕ", "ㅖ", "ㅙ", "ㅚ", "ㅛ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅢ",
))
P0_FINAL_JAMOS = frozenset((None, "ㄱ"))
LOCAL_TANGENT_REFERENCE_SIDES = {("ㅘ", "lowerBeam"): "left"}
ANNOTATED_EXTRACTOR_VERSION = "annotated-contour-finite-face-v2"
EXTRACTOR_VERSION = "geometric-role-matcher-v4"
P1_EXTRACTOR_VERSION = "geometric-role-matcher-v11"
P1_ROLE_CONTRACT_VERSION = "medial-guide-role-v4"
MIN_TWIN_STEM_DIRECTIONAL_REACH = 75.0
MIN_BASE_STEM_BEAM_INTERIOR_RATIO = 0.08
EXPANDED_FINAL_EXTRACTOR_VERSION = "geometric-role-matcher-v13"
API_EXTRACTOR_VERSION = EXPANDED_FINAL_EXTRACTOR_VERSION
API_ROLE_CONTRACT_VERSION = P1_ROLE_CONTRACT_VERSION
SUPPORTED_MEDIAL_JAMOS = P0_MEDIAL_JAMOS | P1_MEDIAL_JAMOS

Point = Tuple[float, float]
RecordingOperation = Tuple[str, Tuple[Any, ...]]


@dataclass(frozen=True)
class FaceAnnotation:
    element_id: str
    contour_id: int
    orientation: str
    side: str
    legacy_face_role: str
    legacy_tip_role: Optional[str] = None
    local_reference_side: Optional[str] = None
    local_segment_id: Optional[int] = None


@dataclass(frozen=True)
class Span:
    start: float
    end: float

    def ordered(self) -> "Span":
        return Span(min(self.start, self.end), max(self.start, self.end))


@dataclass(frozen=True)
class RoleSpec:
    element_id: str
    orientation: str
    side: str
    legacy_face_role: str
    legacy_tip_role: Optional[str] = None


@dataclass(frozen=True)
class ContourFeatures:
    contour_id: int
    bounds: Tuple[float, float, float, float]
    width: float
    height: float
    center_x: float
    center_y: float
    right_coverage: float
    top_coverage: float
    roi_coverage: float


@dataclass(frozen=True)
class FaceHypothesis:
    contour_id: int
    segment_ids: Tuple[int, ...]
    orientation: str
    side: str
    position: float
    component_spans: Tuple[Span, ...]
    visible_spans: Tuple[Span, ...]
    visible_length: float
    start: float
    end: float
    center: float
    roi_coverage: float


MEDIAL_ROLE_SPECS: Dict[str, Tuple[RoleSpec, ...]] = {
    "ㅏ": (
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅐ": (
        RoleSpec("innerPillar", "vertical", "right", "innerPillarFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅑ": (
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("upperBeam", "horizontal", "top", "upperBeamFace"),
        RoleSpec("lowerBeam", "horizontal", "top", "lowerBeamFace"),
    ),
    "ㅒ": (
        RoleSpec("innerPillar", "vertical", "right", "innerPillarFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("upperBeam", "horizontal", "top", "upperBeamFace"),
        RoleSpec("lowerBeam", "horizontal", "top", "lowerBeamFace"),
    ),
    "ㅓ": (
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅔ": (
        RoleSpec("innerPillar", "vertical", "right", "innerPillarFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅕ": (
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("upperBeam", "horizontal", "top", "upperBeamFace"),
        RoleSpec("lowerBeam", "horizontal", "top", "lowerBeamFace"),
    ),
    "ㅖ": (
        RoleSpec("innerPillar", "vertical", "right", "innerPillarFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("upperBeam", "horizontal", "top", "upperBeamFace"),
        RoleSpec("lowerBeam", "horizontal", "top", "lowerBeamFace"),
    ),
    "ㅣ": (RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),),
    "ㅗ": (
        RoleSpec("baseStem", "vertical", "right", "basePillarFace", "baseStemTipFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅜ": (
        RoleSpec("baseStem", "vertical", "right", "basePillarFace", "baseStemTipFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅡ": (RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),),
    "ㅘ": (
        RoleSpec("baseStem", "vertical", "right", "basePillarFace", "baseStemTipFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("upperBeam", "horizontal", "top", "upperBeamFace"),
        RoleSpec("lowerBeam", "horizontal", "top", "lowerBeamFace"),
    ),
    "ㅙ": (
        RoleSpec("baseStem", "vertical", "right", "basePillarFace", "baseStemTipFace"),
        RoleSpec("innerPillar", "vertical", "right", "innerPillarFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("upperBeam", "horizontal", "top", "upperBeamFace"),
        RoleSpec("lowerBeam", "horizontal", "top", "lowerBeamFace"),
    ),
    "ㅚ": (
        RoleSpec("baseStem", "vertical", "right", "basePillarFace", "baseStemTipFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅛ": (
        RoleSpec("leftStem", "vertical", "right", "leftStemFace", "leftStemTipFace"),
        RoleSpec("rightStem", "vertical", "right", "rightStemFace", "rightStemTipFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅝ": (
        RoleSpec("baseStem", "vertical", "right", "basePillarFace", "baseStemTipFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("upperBeam", "horizontal", "top", "upperBeamFace"),
        RoleSpec("lowerBeam", "horizontal", "top", "lowerBeamFace"),
    ),
    "ㅞ": (
        RoleSpec("baseStem", "vertical", "right", "basePillarFace", "baseStemTipFace"),
        RoleSpec("innerPillar", "vertical", "right", "innerPillarFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("upperBeam", "horizontal", "top", "upperBeamFace"),
        RoleSpec("lowerBeam", "horizontal", "top", "lowerBeamFace"),
    ),
    "ㅟ": (
        RoleSpec("baseStem", "vertical", "right", "basePillarFace", "baseStemTipFace"),
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅠ": (
        RoleSpec("leftStem", "vertical", "right", "leftStemFace", "leftStemTipFace"),
        RoleSpec("rightStem", "vertical", "right", "rightStemFace", "rightStemTipFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
    "ㅢ": (
        RoleSpec("outerPillar", "vertical", "right", "outerPillarFace"),
        RoleSpec("primaryBeam", "horizontal", "top", "primaryBeamFace"),
    ),
}


MATCHING_ROIS: Dict[Tuple[str, bool], Tuple[Tuple[float, float, float, float], ...]] = {
    ("right", False): ((500.0, 75.0, 925.0, 925.0),),
    ("right", True): ((500.0, 75.0, 925.0, 650.0),),
    ("bottom", False): ((75.0, 465.0, 925.0, 925.0),),
    ("bottom", True): ((75.0, 390.0, 925.0, 650.0),),
    ("mixed", False): ((75.0, 420.0, 675.0, 925.0), (455.0, 75.0, 925.0, 925.0)),
    ("mixed", True): ((75.0, 300.0, 675.0, 650.0), (455.0, 75.0, 925.0, 650.0)),
}


G0_ANNOTATIONS: Dict[str, Tuple[FaceAnnotation, ...]] = {
    "가": (
        FaceAnnotation("outerPillar", 0, "vertical", "right", "outerPillarFace"),
        FaceAnnotation("primaryBeam", 1, "horizontal", "top", "primaryBeamFace"),
    ),
    "각": (
        FaceAnnotation("outerPillar", 0, "vertical", "right", "outerPillarFace"),
        FaceAnnotation("primaryBeam", 1, "horizontal", "top", "primaryBeamFace"),
    ),
    "거": (
        FaceAnnotation("outerPillar", 0, "vertical", "right", "outerPillarFace"),
        FaceAnnotation("primaryBeam", 1, "horizontal", "top", "primaryBeamFace"),
    ),
    "걱": (
        FaceAnnotation("outerPillar", 3, "vertical", "right", "outerPillarFace"),
        FaceAnnotation("primaryBeam", 4, "horizontal", "top", "primaryBeamFace"),
    ),
    "기": (FaceAnnotation("outerPillar", 0, "vertical", "right", "outerPillarFace"),),
    "긱": (FaceAnnotation("outerPillar", 3, "vertical", "right", "outerPillarFace"),),
    "고": (
        FaceAnnotation("baseStem", 2, "vertical", "right", "basePillarFace", "baseStemTipFace"),
        FaceAnnotation("primaryBeam", 1, "horizontal", "top", "primaryBeamFace"),
    ),
    "곡": (
        FaceAnnotation("baseStem", 3, "vertical", "right", "basePillarFace", "baseStemTipFace"),
        FaceAnnotation("primaryBeam", 0, "horizontal", "top", "primaryBeamFace"),
    ),
    "구": (
        FaceAnnotation("baseStem", 2, "vertical", "right", "basePillarFace", "baseStemTipFace"),
        FaceAnnotation("primaryBeam", 1, "horizontal", "top", "primaryBeamFace"),
    ),
    "국": (
        FaceAnnotation("baseStem", 2, "vertical", "right", "basePillarFace", "baseStemTipFace"),
        FaceAnnotation("primaryBeam", 1, "horizontal", "top", "primaryBeamFace"),
    ),
    "그": (FaceAnnotation("primaryBeam", 1, "horizontal", "top", "primaryBeamFace"),),
    "극": (FaceAnnotation("primaryBeam", 1, "horizontal", "top", "primaryBeamFace"),),
    "과": (
        FaceAnnotation("baseStem", 1, "vertical", "right", "basePillarFace", "baseStemTipFace"),
        FaceAnnotation("outerPillar", 3, "vertical", "right", "outerPillarFace"),
        FaceAnnotation("upperBeam", 4, "horizontal", "top", "upperBeamFace"),
        FaceAnnotation(
            "lowerBeam",
            5,
            "horizontal",
            "top",
            "lowerBeamFace",
            local_reference_side="left",
            local_segment_id=1,
        ),
    ),
    "곽": (
        FaceAnnotation("baseStem", 1, "vertical", "right", "basePillarFace", "baseStemTipFace"),
        FaceAnnotation("outerPillar", 3, "vertical", "right", "outerPillarFace"),
        FaceAnnotation("upperBeam", 4, "horizontal", "top", "upperBeamFace"),
        FaceAnnotation(
            "lowerBeam",
            5,
            "horizontal",
            "top",
            "lowerBeamFace",
            local_reference_side="left",
            local_segment_id=1,
        ),
    ),
}


def _midpoint(left: Point, right: Point) -> Point:
    return ((left[0] + right[0]) / 2.0, (left[1] + right[1]) / 2.0)


def _point_line_distance(point: Point, start: Point, end: Point) -> float:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if abs(dx) <= AXIS_TOLERANCE and abs(dy) <= AXIS_TOLERANCE:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    numerator = abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0])
    return numerator / math.hypot(dx, dy)


class _FlattenPen(BasePen):
    def __init__(self, tolerance: float) -> None:
        super().__init__(None)
        self.tolerance = tolerance
        self.contours: List[List[Point]] = []
        self._points: List[Point] = []

    def _moveTo(self, point: Point) -> None:
        self._finish(False)
        self._points = [tuple(map(float, point))]

    def _lineTo(self, point: Point) -> None:
        self._points.append(tuple(map(float, point)))

    def _qCurveToOne(self, control: Point, end: Point) -> None:
        start = self._points[-1]
        self._flatten_quadratic(start, control, end)

    def _curveToOne(self, control1: Point, control2: Point, end: Point) -> None:
        start = self._points[-1]
        self._flatten_cubic(start, control1, control2, end)

    def _closePath(self) -> None:
        self._finish(True)

    def _endPath(self) -> None:
        self._finish(False)

    def finish(self) -> None:
        self._finish(False)

    def _finish(self, closed: bool) -> None:
        if not self._points:
            return
        if closed and self._points[0] != self._points[-1]:
            self._points.append(self._points[0])
        if len(self._points) >= 3:
            self.contours.append(self._points)
        self._points = []

    def _flatten_quadratic(self, start: Point, control: Point, end: Point) -> None:
        if _point_line_distance(control, start, end) <= self.tolerance:
            self._points.append(tuple(map(float, end)))
            return
        start_control = _midpoint(start, control)
        control_end = _midpoint(control, end)
        middle = _midpoint(start_control, control_end)
        self._flatten_quadratic(start, start_control, middle)
        self._flatten_quadratic(middle, control_end, end)

    def _flatten_cubic(self, start: Point, control1: Point, control2: Point, end: Point) -> None:
        flatness = max(
            _point_line_distance(control1, start, end),
            _point_line_distance(control2, start, end),
        )
        if flatness <= self.tolerance:
            self._points.append(tuple(map(float, end)))
            return
        p01 = _midpoint(start, control1)
        p12 = _midpoint(control1, control2)
        p23 = _midpoint(control2, end)
        p012 = _midpoint(p01, p12)
        p123 = _midpoint(p12, p23)
        middle = _midpoint(p012, p123)
        self._flatten_cubic(start, p01, p012, middle)
        self._flatten_cubic(middle, p123, p23, end)


def split_contours(operations: Sequence[RecordingOperation]) -> List[List[RecordingOperation]]:
    contours: List[List[RecordingOperation]] = []
    current: List[RecordingOperation] = []
    for operation, arguments in operations:
        if operation == "moveTo" and current:
            contours.append(current)
            current = []
        current.append((operation, arguments))
        if operation in {"closePath", "endPath"}:
            contours.append(current)
            current = []
    if current:
        contours.append(current)
    return contours


def _transform(point: Point, scale: float, baseline_y: float) -> Point:
    return (float(point[0]) * scale, baseline_y - float(point[1]) * scale)


def _replay(operations: Sequence[RecordingOperation], pen: Any) -> None:
    for operation, arguments in operations:
        getattr(pen, operation)(*arguments)


def _flattened_contours(
    operations: Sequence[RecordingOperation],
    scale: float,
    baseline_y: float,
    tolerance: float = FLATTEN_TOLERANCE,
) -> List[List[Point]]:
    pen = _FlattenPen(tolerance / scale)
    _replay(operations, pen)
    pen.finish()
    return [[_transform(point, scale, baseline_y) for point in contour] for contour in pen.contours]


def _start_side_local_tangent(
    operations: Sequence[RecordingOperation],
    annotation: FaceAnnotation,
    scale: float,
    baseline_y: float,
) -> Optional[Tuple[float, Span, Point]]:
    """Approximate only explicitly annotated horizontal start-side tangent support."""
    if annotation.orientation != "horizontal" or annotation.local_reference_side not in {"left", "right"}:
        return None
    contours = _flattened_contours(
        operations,
        scale,
        baseline_y,
        tolerance=LOCAL_TANGENT_FLATTEN_TOLERANCE,
    )
    if len(contours) != 1:
        return None
    points = contours[0]
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    if len(points) < 3:
        return None

    if annotation.local_reference_side == "left":
        anchor_index = min(range(len(points)), key=lambda index: (points[index][0], points[index][1]))
        advances = lambda current, following: following[0] > current[0] + AXIS_TOLERANCE
    else:
        anchor_index = max(range(len(points)), key=lambda index: (points[index][0], -points[index][1]))
        advances = lambda current, following: following[0] < current[0] - AXIS_TOLERANCE
    extreme_anchor = points[anchor_index]
    neighbor_options = []
    for step in (-1, 1):
        neighbor = points[(anchor_index + step) % len(points)]
        if advances(extreme_anchor, neighbor):
            neighbor_options.append((step, neighbor))
    if not neighbor_options:
        return None
    if annotation.side == "top":
        step, _ = min(neighbor_options, key=lambda option: option[1][1])
    elif annotation.side == "bottom":
        step, _ = max(neighbor_options, key=lambda option: option[1][1])
    else:
        return None

    # Rounded caps expose their left/right extreme at stroke mid-height. Walk
    # only along the selected face until its first near-horizontal edge, then
    # use that edge start as the structural beam start. Sharp caps and curves
    # without a local horizontal transition retain the true extreme anchor.
    axis_extent = max(point[0] for point in points) - min(point[0] for point in points)
    search_distance = max(40.0, min(100.0, axis_extent * 0.2))
    for offset in range(1, len(points)):
        current_index = (anchor_index + step * (offset - 1)) % len(points)
        following_index = (anchor_index + step * offset) % len(points)
        current = points[current_index]
        following = points[following_index]
        if not advances(current, following):
            break
        if abs(current[0] - extreme_anchor[0]) > search_distance:
            break
        axis_delta = abs(following[0] - current[0])
        if axis_delta <= AXIS_TOLERANCE:
            continue
        slope = abs(following[1] - current[1]) / axis_delta
        if slope <= LOCAL_TANGENT_START_SLOPE_TOLERANCE:
            anchor_index = current_index
            break

    anchor = points[anchor_index]

    face_position = anchor[1]
    previous = anchor
    previous_deviation = 0.0
    support_end: Optional[Point] = None
    for offset in range(1, len(points)):
        following = points[(anchor_index + step * offset) % len(points)]
        if not advances(previous, following):
            break
        deviation = abs(following[1] - face_position)
        if deviation <= LOCAL_TANGENT_MAX_DEVIATION:
            support_end = following
            previous = following
            previous_deviation = deviation
            continue
        if deviation > previous_deviation and previous_deviation < LOCAL_TANGENT_MAX_DEVIATION:
            ratio = (LOCAL_TANGENT_MAX_DEVIATION - previous_deviation) / (deviation - previous_deviation)
            support_end = (
                previous[0] + (following[0] - previous[0]) * ratio,
                previous[1] + (following[1] - previous[1]) * ratio,
            )
        break
    if support_end is None or abs(support_end[0] - anchor[0]) <= AXIS_TOLERANCE:
        return None
    return face_position, Span(anchor[0], support_end[0]).ordered(), anchor


def _contour_bounds(
    operations: Sequence[RecordingOperation],
    scale: float,
    baseline_y: float,
) -> Tuple[float, float, float, float]:
    pen = BoundsPen(None)
    _replay(operations, pen)
    if pen.bounds is None:
        raise ValueError("empty contour")
    x_min, y_min, x_max, y_max = pen.bounds
    return (
        x_min * scale,
        baseline_y - y_max * scale,
        x_max * scale,
        baseline_y - y_min * scale,
    )


def _line_segments(
    operations: Sequence[RecordingOperation],
    scale: float,
    baseline_y: float,
) -> List[Tuple[int, Point, Point]]:
    segments: List[Tuple[int, Point, Point]] = []
    current: Optional[Point] = None
    contour_start: Optional[Point] = None
    segment_id = 0
    for operation, arguments in operations:
        if operation == "moveTo":
            current = tuple(map(float, arguments[0]))
            contour_start = current
            continue
        if operation == "lineTo" and current is not None:
            end = tuple(map(float, arguments[0]))
            segments.append((segment_id, _transform(current, scale, baseline_y), _transform(end, scale, baseline_y)))
            segment_id += 1
            current = end
            continue
        if operation == "closePath" and current is not None and contour_start is not None:
            segments.append((segment_id, _transform(current, scale, baseline_y), _transform(contour_start, scale, baseline_y)))
            segment_id += 1
            current = None
            contour_start = None
            continue
        if operation == "endPath":
            current = None
            contour_start = None
            continue
        if operation in {"qCurveTo", "curveTo"} and arguments:
            last = arguments[-1]
            current = contour_start if last is None else tuple(map(float, last))
            segment_id += 1
    return segments


def _merge_spans(spans: Iterable[Span], tolerance: float = 1e-4) -> List[Span]:
    ordered = sorted((span.ordered() for span in spans), key=lambda span: (span.start, span.end))
    merged: List[Span] = []
    for span in ordered:
        if span.end - span.start <= tolerance:
            continue
        if merged and span.start <= merged[-1].end + tolerance:
            merged[-1] = Span(merged[-1].start, max(merged[-1].end, span.end))
        else:
            merged.append(span)
    return merged


def _winding_number(point: Point, polygon: Sequence[Point]) -> int:
    x, y = point
    winding = 0
    for start, end in zip(polygon, polygon[1:]):
        if start[1] <= y < end[1]:
            cross = (end[0] - start[0]) * (y - start[1]) - (x - start[0]) * (end[1] - start[1])
            if cross > 0:
                winding += 1
        elif end[1] <= y < start[1]:
            cross = (end[0] - start[0]) * (y - start[1]) - (x - start[0]) * (end[1] - start[1])
            if cross < 0:
                winding -= 1
    return winding


def _is_filled(point: Point, polygons: Sequence[Sequence[Point]]) -> bool:
    return sum(_winding_number(point, polygon) for polygon in polygons) != 0


def _probe_breakpoints(
    orientation: str,
    probe_position: float,
    polygons: Sequence[Sequence[Point]],
) -> List[float]:
    intersections: List[float] = []
    for polygon in polygons:
        for start, end in zip(polygon, polygon[1:]):
            if orientation == "vertical":
                if (start[0] <= probe_position < end[0]) or (end[0] <= probe_position < start[0]):
                    ratio = (probe_position - start[0]) / (end[0] - start[0])
                    intersections.append(start[1] + ratio * (end[1] - start[1]))
            else:
                if (start[1] <= probe_position < end[1]) or (end[1] <= probe_position < start[1]):
                    ratio = (probe_position - start[1]) / (end[1] - start[1])
                    intersections.append(start[0] + ratio * (end[0] - start[0]))
    return intersections


def _visible_spans(
    orientation: str,
    side: str,
    face_position: float,
    component_spans: Sequence[Span],
    polygons: Sequence[Sequence[Point]],
) -> List[Span]:
    positive_side = side in {"right", "bottom"}
    probe_position = face_position + (OUTSIDE_PROBE_OFFSET if positive_side else -OUTSIDE_PROBE_OFFSET)
    intersections = _probe_breakpoints(orientation, probe_position, polygons)
    visible: List[Span] = []
    for component in component_spans:
        breakpoints = [component.start, component.end]
        breakpoints.extend(value for value in intersections if component.start < value < component.end)
        ordered = sorted(set(round(value, 8) for value in breakpoints))
        for start, end in zip(ordered, ordered[1:]):
            along = (start + end) / 2.0
            point = (probe_position, along) if orientation == "vertical" else (along, probe_position)
            if not _is_filled(point, polygons):
                visible.append(Span(start, end))
    return _merge_spans(visible, tolerance=FLATTEN_TOLERANCE)


def _span_length(spans: Sequence[Span]) -> float:
    return sum(span.end - span.start for span in _merge_spans(spans))


def _line_roi_coverage(
    orientation: str,
    position: float,
    spans: Sequence[Span],
    regions: Sequence[Tuple[float, float, float, float]],
) -> float:
    covered: List[Span] = []
    for span in spans:
        for x_min, y_min, x_max, y_max in regions:
            if orientation == "vertical" and x_min <= position <= x_max:
                covered.append(Span(max(span.start, y_min), min(span.end, y_max)))
            elif orientation == "horizontal" and y_min <= position <= y_max:
                covered.append(Span(max(span.start, x_min), min(span.end, x_max)))
    total = _span_length(spans)
    if total <= AXIS_TOLERANCE:
        return 0.0
    return min(1.0, _span_length(covered) / total)


def _axis_face_hypotheses(
    operations: Sequence[RecordingOperation],
    units_per_em: int,
    regions: Sequence[Tuple[float, float, float, float]],
    baseline_y: float,
) -> List[FaceHypothesis]:
    """Find visible axis-aligned face groups, including groups inside merged contours."""
    scale = 1000.0 / units_per_em
    contours = split_contours(operations)
    polygons = _flattened_contours(operations, scale, baseline_y)
    hypotheses: List[FaceHypothesis] = []
    for contour_id, contour in enumerate(contours):
        groups: Dict[Tuple[str, str, float], List[Tuple[int, Span]]] = defaultdict(list)
        for segment_id, start, end in _line_segments(contour, scale, baseline_y):
            if abs(start[0] - end[0]) <= AXIS_TOLERANCE:
                groups[("vertical", "right", round(start[0], 6))].append(
                    (segment_id, Span(start[1], end[1]).ordered())
                )
            if abs(start[1] - end[1]) <= AXIS_TOLERANCE:
                groups[("horizontal", "top", round(start[1], 6))].append(
                    (segment_id, Span(start[0], end[0]).ordered())
                )
        for (orientation, side, position), segment_spans in groups.items():
            component_spans = _merge_spans(span for _, span in segment_spans)
            visible_spans = _visible_spans(
                orientation,
                side,
                position,
                component_spans,
                polygons,
            )
            if not visible_spans:
                continue
            start = min(span.start for span in visible_spans)
            end = max(span.end for span in visible_spans)
            hypotheses.append(FaceHypothesis(
                contour_id=contour_id,
                segment_ids=tuple(segment_id for segment_id, _ in segment_spans),
                orientation=orientation,
                side=side,
                position=position,
                component_spans=tuple(component_spans),
                visible_spans=tuple(visible_spans),
                visible_length=_span_length(visible_spans),
                start=start,
                end=end,
                center=(start + end) / 2.0,
                roi_coverage=_line_roi_coverage(orientation, position, visible_spans, regions),
            ))
    return hypotheses


def _rounded(value: float) -> float:
    return round(value, 3)


def _span_values(spans: Sequence[Span]) -> List[Dict[str, float]]:
    return [{"from": _rounded(span.start), "to": _rounded(span.end)} for span in spans]


def extract_annotated_face(
    operations: Sequence[RecordingOperation],
    annotation: FaceAnnotation,
    units_per_em: int,
    baseline_y: float = BASELINE_Y,
) -> Dict[str, Any]:
    scale = 1000.0 / units_per_em
    contours = split_contours(operations)
    hypothesis_id = "{}:contour-{}:{}".format(
        annotation.element_id,
        annotation.contour_id,
        annotation.side,
    )
    evidence = {
        "hypothesisId": hypothesis_id,
        "contourId": annotation.contour_id,
        "segmentIds": [],
        "method": ANNOTATED_EXTRACTOR_VERSION,
        "referenceMode": "axis-aligned-face",
        "flattenTolerance": FLATTEN_TOLERANCE,
        "outsideProbeOffset": OUTSIDE_PROBE_OFFSET,
    }
    if annotation.contour_id < 0 or annotation.contour_id >= len(contours):
        abstained = {
            "status": "abstained",
            "reasonCode": "no-role-match",
            "evidence": evidence,
        }
        return {
            "elementId": annotation.element_id,
            "orientation": annotation.orientation,
            "faceSide": annotation.side,
            "legacyFaceRole": annotation.legacy_face_role,
            "legacyTipRole": annotation.legacy_tip_role,
            "face": abstained,
            "visibleSpans": abstained,
        }

    target = contours[annotation.contour_id]
    x_min, y_min, x_max, y_max = _contour_bounds(target, scale, baseline_y)
    if annotation.orientation == "vertical":
        face_position = x_max if annotation.side == "right" else x_min
    else:
        face_position = y_min if annotation.side == "top" else y_max

    face_segments: List[Tuple[int, Span]] = []
    for segment_id, start, end in _line_segments(target, scale, baseline_y):
        if annotation.orientation == "vertical":
            is_axis_aligned = abs(start[0] - end[0]) <= AXIS_TOLERANCE
            on_face = abs(start[0] - face_position) <= AXIS_TOLERANCE
            span = Span(start[1], end[1])
        else:
            is_axis_aligned = abs(start[1] - end[1]) <= AXIS_TOLERANCE
            on_face = abs(start[1] - face_position) <= AXIS_TOLERANCE
            span = Span(start[0], end[0])
        if is_axis_aligned and on_face:
            face_segments.append((segment_id, span.ordered()))

    component_spans = _merge_spans(span for _, span in face_segments)
    evidence["segmentIds"] = [segment_id for segment_id, _ in face_segments]
    local_tangent = None
    if annotation.local_reference_side is not None:
        local_tangent = _start_side_local_tangent(target, annotation, scale, baseline_y)
        if local_tangent is None:
            abstained = {
                "status": "abstained",
                "reasonCode": "non-scalar-face",
                "evidence": evidence,
            }
            return {
                "elementId": annotation.element_id,
                "orientation": annotation.orientation,
                "faceSide": annotation.side,
                "legacyFaceRole": annotation.legacy_face_role,
                "legacyTipRole": annotation.legacy_tip_role,
                "face": abstained,
                "visibleSpans": abstained,
            }
        face_position, local_span, anchor = local_tangent
        component_spans = [local_span]
        evidence.update({
            "segmentIds": [] if annotation.local_segment_id is None else [annotation.local_segment_id],
            "referenceMode": "start-side-local-tangent",
            "referenceSide": annotation.local_reference_side,
            "anchor": {"x": _rounded(anchor[0]), "y": _rounded(anchor[1])},
            "maximumDeviation": LOCAL_TANGENT_MAX_DEVIATION,
            "startSlopeTolerance": LOCAL_TANGENT_START_SLOPE_TOLERANCE,
            "flattenTolerance": LOCAL_TANGENT_FLATTEN_TOLERANCE,
        })
    elif not component_spans:
        abstained = {
            "status": "abstained",
            "reasonCode": "non-scalar-face",
            "evidence": evidence,
        }
        return {
            "elementId": annotation.element_id,
            "orientation": annotation.orientation,
            "faceSide": annotation.side,
            "legacyFaceRole": annotation.legacy_face_role,
            "legacyTipRole": annotation.legacy_tip_role,
            "face": abstained,
            "visibleSpans": abstained,
        }

    polygons = _flattened_contours(
        operations,
        scale,
        baseline_y,
        tolerance=LOCAL_TANGENT_FLATTEN_TOLERANCE if local_tangent is not None else FLATTEN_TOLERANCE,
    )
    visible_spans = _visible_spans(
        annotation.orientation,
        annotation.side,
        face_position,
        component_spans,
        polygons,
    )
    face = {
        "status": "candidate",
        "value": _rounded(face_position),
        "evidence": evidence,
    }
    if visible_spans:
        support: Dict[str, Any] = {
            "status": "candidate",
            "value": _span_values(visible_spans),
            "evidence": evidence,
        }
    else:
        support = {
            "status": "abstained",
            "reasonCode": "occluded-by-neighbor-overlap",
            "evidence": evidence,
        }

    extent = visible_spans[-1].end - visible_spans[0].start if visible_spans else None
    visible_length = sum(span.end - span.start for span in visible_spans)
    return {
        "elementId": annotation.element_id,
        "orientation": annotation.orientation,
        "faceSide": annotation.side,
        "legacyFaceRole": annotation.legacy_face_role,
        "legacyTipRole": annotation.legacy_tip_role,
        "face": face,
        "visibleSpans": support,
        "componentSpans": _span_values(component_spans),
        "derived": {
            "extent": None if extent is None else _rounded(extent),
            "visibleLength": _rounded(visible_length),
        },
    }


def _intersection_area(
    bounds: Tuple[float, float, float, float],
    region: Tuple[float, float, float, float],
) -> float:
    x_min, y_min, x_max, y_max = bounds
    region_x_min, region_y_min, region_x_max, region_y_max = region
    width = max(0.0, min(x_max, region_x_max) - max(x_min, region_x_min))
    height = max(0.0, min(y_max, region_y_max) - max(y_min, region_y_min))
    return width * height


def _axis_face_coverage(
    operations: Sequence[RecordingOperation],
    bounds: Tuple[float, float, float, float],
    orientation: str,
    side: str,
    scale: float,
    baseline_y: float,
) -> float:
    x_min, y_min, x_max, y_max = bounds
    face_position = x_max if side == "right" else x_min if side == "left" else y_min if side == "top" else y_max
    spans: List[Span] = []
    for _, start, end in _line_segments(operations, scale, baseline_y):
        if orientation == "vertical":
            if abs(start[0] - end[0]) <= AXIS_TOLERANCE and abs(start[0] - face_position) <= AXIS_TOLERANCE:
                spans.append(Span(start[1], end[1]))
        elif abs(start[1] - end[1]) <= AXIS_TOLERANCE and abs(start[1] - face_position) <= AXIS_TOLERANCE:
            spans.append(Span(start[0], end[0]))
    extent = (y_max - y_min) if orientation == "vertical" else (x_max - x_min)
    if extent <= AXIS_TOLERANCE:
        return 0.0
    return min(1.0, sum(span.end - span.start for span in _merge_spans(spans)) / extent)


def _contour_features(
    contours: Sequence[Sequence[RecordingOperation]],
    units_per_em: int,
    regions: Sequence[Tuple[float, float, float, float]],
    baseline_y: float,
) -> List[ContourFeatures]:
    scale = 1000.0 / units_per_em
    features: List[ContourFeatures] = []
    for contour_id, contour in enumerate(contours):
        bounds = _contour_bounds(contour, scale, baseline_y)
        x_min, y_min, x_max, y_max = bounds
        width = x_max - x_min
        height = y_max - y_min
        bounds_area = width * height
        roi_coverage = 0.0 if bounds_area <= AXIS_TOLERANCE else min(
            1.0,
            sum(_intersection_area(bounds, region) for region in regions) / bounds_area,
        )
        features.append(ContourFeatures(
            contour_id=contour_id,
            bounds=bounds,
            width=width,
            height=height,
            center_x=(x_min + x_max) / 2.0,
            center_y=(y_min + y_max) / 2.0,
            right_coverage=_axis_face_coverage(contour, bounds, "vertical", "right", scale, baseline_y),
            top_coverage=_axis_face_coverage(contour, bounds, "horizontal", "top", scale, baseline_y),
            roi_coverage=roi_coverage,
        ))
    return features


def _range_score(value: float, lower: float, upper: float, softness: float) -> float:
    if lower <= value <= upper:
        return 1.0
    distance = lower - value if value < lower else value - upper
    return max(0.0, 1.0 - distance / softness)


def _proximity_score(value: float, target: float, radius: float) -> float:
    return max(0.0, 1.0 - abs(value - target) / radius)


def _left_beam_attached_to_pillar(
    feature: ContourFeatures,
    pillar: Optional[ContourFeatures],
) -> bool:
    if pillar is None:
        return False
    left, top, right, bottom = pillar.bounds
    x_min, y_min, x_max, y_max = feature.bounds
    return (
        x_min < left - AXIS_TOLERANCE
        and left - AXIS_TOLERANCE <= x_max <= right + AXIS_TOLERANCE
        and top + AXIS_TOLERANCE < y_min
        and y_max < bottom - AXIS_TOLERANCE
    )


def _score_role(
    feature: ContourFeatures,
    role: RoleSpec,
    layout: str,
    *,
    left_beam_pillar: Optional[ContourFeatures] = None,
) -> Optional[float]:
    x_min, _, x_max, _ = feature.bounds
    if role.element_id == "outerPillar":
        if feature.right_coverage < 0.65 or feature.height < 350.0 or not 45.0 <= feature.width <= 150.0 or x_max < 600.0 or feature.roi_coverage < 0.25:
            return None
        return (
            0.28 * feature.right_coverage
            + 0.22 * _range_score(feature.height, 500.0, 950.0, 250.0)
            + 0.20 * _range_score(x_max, 680.0, 900.0, 180.0)
            + 0.15 * _proximity_score(feature.width, 83.0, 80.0)
            + 0.15 * feature.roi_coverage
        )
    if role.element_id == "baseStem":
        if feature.right_coverage < 0.65 or not 140.0 <= feature.height <= 550.0 or not 45.0 <= feature.width <= 145.0 or not 220.0 <= x_max <= 620.0 or feature.roi_coverage < 0.25:
            return None
        return (
            0.30 * feature.right_coverage
            + 0.20 * _range_score(feature.height, 180.0, 430.0, 180.0)
            + 0.20 * _range_score(x_max, 280.0, 540.0, 180.0)
            + 0.15 * _proximity_score(feature.width, 83.0, 70.0)
            + 0.15 * feature.roi_coverage
        )
    if role.element_id in {"primaryBeam", "upperBeam"}:
        if feature.top_coverage < 0.65 or feature.height > 140.0 or feature.roi_coverage < 0.25:
            return None
        if layout == "bottom":
            if feature.width < 650.0:
                return None
            return (
                0.30 * feature.top_coverage
                + 0.30 * _range_score(feature.width, 740.0, 900.0, 180.0)
                + 0.20 * _proximity_score(feature.height, 69.0, 90.0)
                + 0.20 * feature.roi_coverage
            )
        minimum_x = 650.0 if role.element_id == "upperBeam" else 450.0
        attached_left_beam = (
            layout == "right"
            and role.element_id == "primaryBeam"
            and _left_beam_attached_to_pillar(feature, left_beam_pillar)
        )
        if not 100.0 <= feature.width <= 350.0 or (x_min < minimum_x and not attached_left_beam) or x_max < 650.0:
            return None
        return (
            0.30 * feature.top_coverage
            + 0.25 * _range_score(feature.width, 130.0, 270.0, 130.0)
            + 0.20 * _proximity_score(feature.height, 69.0, 90.0)
            + 0.10 * _range_score(feature.center_x, 650.0, 850.0, 180.0)
            + 0.15 * feature.roi_coverage
        )
    if role.element_id == "lowerBeam":
        if feature.width < 450.0 or feature.height > 180.0 or x_max > 680.0 or feature.center_y < 400.0 or feature.roi_coverage < 0.35:
            return None
        return (
            0.30 * _range_score(feature.width, 520.0, 700.0, 180.0)
            + 0.20 * _proximity_score(feature.height, 100.0, 100.0)
            + 0.20 * _range_score(feature.center_y, 450.0, 780.0, 200.0)
            + 0.15 * _range_score(x_max, 520.0, 680.0, 180.0)
            + 0.15 * feature.roi_coverage
        )
    return None


def _score_face_hypothesis(
    hypothesis: FaceHypothesis,
    role: RoleSpec,
    layout: str,
    base_stem_endpoint: Optional[float],
) -> Optional[float]:
    if hypothesis.orientation != role.orientation or hypothesis.side != role.side:
        return None
    position = hypothesis.position
    length = hypothesis.visible_length
    roi_coverage = hypothesis.roi_coverage
    if role.element_id == "outerPillar":
        if position < 600.0 or length < 100.0 or roi_coverage < 0.35:
            return None
        return (
            0.35 * roi_coverage
            + 0.30 * _range_score(position, 680.0, 900.0, 180.0)
            + 0.35 * _range_score(length, 300.0, 900.0, 250.0)
        )
    if role.element_id == "baseStem":
        if not 180.0 <= position <= 650.0 or length < 60.0 or roi_coverage < 0.35:
            return None
        return (
            0.35 * roi_coverage
            + 0.25 * _range_score(position, 280.0, 540.0, 180.0)
            + 0.20 * _range_score(length, 100.0, 430.0, 180.0)
            + 0.20 * _range_score(hypothesis.center, 400.0, 760.0, 220.0)
        )
    if role.element_id in {"primaryBeam", "upperBeam"}:
        minimum_length = 300.0 if layout == "bottom" else 60.0
        if length < minimum_length or roi_coverage < 0.45:
            return None
        if layout != "bottom" and hypothesis.start < 600.0:
            return None
        target_length = (600.0, 900.0) if layout == "bottom" else (100.0, 260.0)
        return (
            0.50 * roi_coverage
            + 0.30 * _range_score(length, target_length[0], target_length[1], 220.0)
            + 0.20 * _range_score(position, 150.0, 800.0, 250.0)
        )
    if role.element_id == "lowerBeam":
        if (
            length < 60.0
            or roi_coverage < 0.45
            or hypothesis.end > 680.0
            or position < 400.0
            or base_stem_endpoint is None
            or abs(position - base_stem_endpoint) > 20.0
        ):
            return None
        return (
            0.40 * roi_coverage
            + 0.25 * _range_score(length, 100.0, 650.0, 200.0)
            + 0.35 * _range_score(position, 500.0, 800.0, 180.0)
        )
    return None


def _hypothesis_key(hypothesis: FaceHypothesis) -> Tuple[int, str, float, Tuple[int, ...]]:
    return (
        hypothesis.contour_id,
        hypothesis.orientation,
        hypothesis.position,
        hypothesis.segment_ids,
    )


def _face_hypothesis_element(
    role: RoleSpec,
    hypothesis: FaceHypothesis,
    score: float,
    margin: float,
    alternatives: Sequence[Dict[str, Any]],
    local_reference_side: Optional[str],
) -> Dict[str, Any]:
    reference_mode = "start-side-local-tangent" if local_reference_side is not None else "axis-aligned-face"
    hypothesis_id = "{}:contour-{}:segments-{}:{}".format(
        role.element_id,
        hypothesis.contour_id,
        "-".join(str(segment_id) for segment_id in hypothesis.segment_ids),
        role.side,
    )
    evidence: Dict[str, Any] = {
        "hypothesisId": hypothesis_id,
        "contourId": hypothesis.contour_id,
        "segmentIds": list(hypothesis.segment_ids),
        "method": EXTRACTOR_VERSION,
        "referenceMode": reference_mode,
        "flattenTolerance": FLATTEN_TOLERANCE,
        "outsideProbeOffset": OUTSIDE_PROBE_OFFSET,
        "matchingUnit": "axis-face-segment-group",
        "matchScore": _rounded(score),
        "matchMargin": _rounded(margin),
        "roiCoverage": _rounded(hypothesis.roi_coverage),
    }
    if reference_mode == "start-side-local-tangent":
        anchor_position = hypothesis.start if local_reference_side == "left" else hypothesis.end
        evidence.update({
            "referenceSide": local_reference_side,
            "anchor": {"x": _rounded(anchor_position), "y": _rounded(hypothesis.position)},
            "maximumDeviation": LOCAL_TANGENT_MAX_DEVIATION,
        })
    face = {
        "status": "candidate",
        "value": _rounded(hypothesis.position),
        "evidence": evidence,
    }
    visible_spans = {
        "status": "candidate",
        "value": _span_values(hypothesis.visible_spans),
        "evidence": evidence,
    }
    extent = hypothesis.visible_spans[-1].end - hypothesis.visible_spans[0].start
    return {
        "elementId": role.element_id,
        "orientation": role.orientation,
        "faceSide": role.side,
        "legacyFaceRole": role.legacy_face_role,
        "legacyTipRole": role.legacy_tip_role,
        "face": face,
        "visibleSpans": visible_spans,
        "componentSpans": _span_values(hypothesis.component_spans),
        "derived": {
            "extent": _rounded(extent),
            "visibleLength": _rounded(hypothesis.visible_length),
        },
        "match": {
            "status": "matched",
            "score": _rounded(score),
            "confidence": "medium",
            "margin": _rounded(margin),
            "alternatives": list(alternatives),
        },
    }


def _abstained_role(role: RoleSpec, reason_code: str, alternatives: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    evidence = {
        "hypothesisId": "{}:unmatched:{}".format(role.element_id, role.side),
        "contourId": -1,
        "segmentIds": [],
        "method": EXTRACTOR_VERSION,
        "referenceMode": "axis-aligned-face",
        "flattenTolerance": FLATTEN_TOLERANCE,
        "outsideProbeOffset": OUTSIDE_PROBE_OFFSET,
    }
    abstained = {"status": "abstained", "reasonCode": reason_code, "evidence": evidence}
    return {
        "elementId": role.element_id,
        "orientation": role.orientation,
        "faceSide": role.side,
        "legacyFaceRole": role.legacy_face_role,
        "legacyTipRole": role.legacy_tip_role,
        "face": abstained,
        "visibleSpans": abstained,
        "match": {
            "status": "abstained",
            "score": None,
            "confidence": "abstained",
            "margin": None,
            "alternatives": list(alternatives),
        },
    }


def _medial_layout(medial_jamo: str) -> str:
    if medial_jamo in {"ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅣ"}:
        return "right"
    if medial_jamo in {"ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ"}:
        return "bottom"
    if medial_jamo in {"ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"}:
        return "mixed"
    raise ValueError("unsupported medial role definition: {}".format(medial_jamo))


def _usable_element(element: Dict[str, Any]) -> bool:
    return element["face"]["status"] == "candidate" and element["visibleSpans"]["status"] == "candidate"


def _component_span_endpoint(element: Dict[str, Any]) -> Optional[float]:
    spans = element.get("componentSpans")
    if not spans:
        return None
    return max(float(span["to"]) for span in spans)


def _hypothesis_extent(hypothesis: FaceHypothesis) -> float:
    if not hypothesis.component_spans:
        return 0.0
    return max(span.end for span in hypothesis.component_spans) - min(
        span.start for span in hypothesis.component_spans
    )


def _hypothesis_component_bounds(hypothesis: FaceHypothesis) -> Tuple[float, float]:
    return (
        min(span.start for span in hypothesis.component_spans),
        max(span.end for span in hypothesis.component_spans),
    )


def _dedupe_axis_positions(
    hypotheses: Iterable[FaceHypothesis],
    tolerance: float = 3.0,
) -> List[FaceHypothesis]:
    """Collapse duplicate faces at same coordinate without joining their geometry."""
    selected: List[FaceHypothesis] = []
    for hypothesis in sorted(hypotheses, key=lambda item: item.position):
        if selected and abs(selected[-1].position - hypothesis.position) <= tolerance:
            previous = selected[-1]
            previous_rank = (previous.visible_length, _hypothesis_extent(previous), previous.roi_coverage)
            current_rank = (hypothesis.visible_length, _hypothesis_extent(hypothesis), hypothesis.roi_coverage)
            if current_rank > previous_rank:
                selected[-1] = hypothesis
            continue
        selected.append(hypothesis)
    return selected


def _p1_alternatives(scored: Sequence[Tuple[float, FaceHypothesis]]) -> List[Dict[str, Any]]:
    return [
        {"contourId": hypothesis.contour_id, "score": _rounded(score)}
        for score, hypothesis in scored[:3]
    ]


def _p1_axis_element(
    role: RoleSpec,
    selected: FaceHypothesis,
    scored: Sequence[Tuple[float, FaceHypothesis]],
    strategy: str,
) -> Dict[str, Any]:
    selected_score = next(
        (score for score, hypothesis in scored if _hypothesis_key(hypothesis) == _hypothesis_key(selected)),
        0.7,
    )
    other_scores = [
        score for score, hypothesis in scored
        if _hypothesis_key(hypothesis) != _hypothesis_key(selected)
    ]
    margin = selected_score - max(other_scores) if other_scores else selected_score
    element = _face_hypothesis_element(
        role,
        selected,
        selected_score,
        max(0.0, margin),
        _p1_alternatives(scored),
        None,
    )
    element["face"]["evidence"]["method"] = P1_EXTRACTOR_VERSION
    element["visibleSpans"]["evidence"]["method"] = P1_EXTRACTOR_VERSION
    element["face"]["evidence"]["roleStrategy"] = strategy
    element["visibleSpans"]["evidence"]["roleStrategy"] = strategy
    return element


def _with_p1_scan_evidence(
    element: Dict[str, Any],
    origin: str,
    direction: str,
) -> Dict[str, Any]:
    for component_name in ("face", "visibleSpans"):
        element[component_name]["evidence"].update({
            "scanOrigin": origin,
            "scanDirection": direction,
        })
    return element


def _p1_abstained_element(
    role: RoleSpec,
    reason_code: str,
    strategy: str,
    scored: Sequence[Tuple[float, FaceHypothesis]] = (),
) -> Dict[str, Any]:
    element = _abstained_role(role, reason_code, _p1_alternatives(scored))
    element["face"]["evidence"]["method"] = P1_EXTRACTOR_VERSION
    element["visibleSpans"]["evidence"]["method"] = P1_EXTRACTOR_VERSION
    element["face"]["evidence"]["roleStrategy"] = strategy
    element["visibleSpans"]["evidence"]["roleStrategy"] = strategy
    return element


def _p1_long_pillars(face_hypotheses: Sequence[FaceHypothesis]) -> List[FaceHypothesis]:
    candidates = _dedupe_axis_positions(
        hypothesis
        for hypothesis in face_hypotheses
        if hypothesis.orientation == "vertical"
        and hypothesis.side == "right"
        and hypothesis.position >= 550.0
        and _hypothesis_component_bounds(hypothesis)[0] < 220.0
        and _hypothesis_extent(hypothesis) >= 300.0
        and hypothesis.visible_length >= 100.0
        and hypothesis.roi_coverage >= 0.3
    )
    return sorted(candidates, key=lambda hypothesis: hypothesis.position)


def _p1_base_stem_options(
    face_hypotheses: Sequence[FaceHypothesis],
    medial_jamo: str,
    beam_position: float,
    beam_contour_id: int,
    beam_bounds: Tuple[float, float, float, float],
) -> List[Tuple[float, FaceHypothesis]]:
    """Find directional base stems attached inside, never at the beam end cap."""
    beam_x_min, _, beam_x_max, _ = beam_bounds
    minimum_interior_inset = (beam_x_max - beam_x_min) * MIN_BASE_STEM_BEAM_INTERIOR_RATIO
    stem_above_beam = medial_jamo in {"ㅙ", "ㅚ"}
    scored: List[Tuple[float, FaceHypothesis]] = []
    for hypothesis in face_hypotheses:
        if hypothesis.orientation != "vertical" or hypothesis.side != "right":
            continue
        start, end = _hypothesis_component_bounds(hypothesis)
        extent = end - start
        attachment = end if stem_above_beam else start
        attachment_distance = abs(attachment - beam_position)
        interior_inset = min(
            hypothesis.position - beam_x_min,
            beam_x_max - hypothesis.position,
        )
        points_toward_beam = (
            start < beam_position and end <= beam_position + 80.0
            if stem_above_beam
            else start >= beam_position - 40.0 and end > beam_position
        )
        if (
            not beam_x_min - 20.0 <= hypothesis.position <= beam_x_max + 20.0
            or not 45.0 <= extent <= 520.0
            or hypothesis.visible_length < 25.0
            or attachment_distance > 150.0
            or not points_toward_beam
            or hypothesis.roi_coverage < 0.08
            or interior_inset < minimum_interior_inset
        ):
            continue
        same_contour = hypothesis.contour_id == beam_contour_id
        score = (
            0.35
            + 0.25 * _proximity_score(attachment_distance, 0.0, 150.0)
            + 0.15 * hypothesis.roi_coverage
            + 0.1 * _range_score(extent, 70.0, 300.0, 150.0)
            + 0.15 * float(same_contour)
        )
        scored.append((score, hypothesis))

    deduped: List[Tuple[float, FaceHypothesis]] = []
    for score, hypothesis in sorted(
        scored,
        key=lambda item: (-item[0], item[1].contour_id, item[1].position),
    ):
        if any(abs(existing.position - hypothesis.position) <= 3.0 for _, existing in deduped):
            continue
        deduped.append((score, hypothesis))
    return deduped


def _p1_beam_contacts_pillar(
    beam: FaceHypothesis,
    pillar: FaceHypothesis,
    pillar_polygons: Sequence[Sequence[Point]],
) -> bool:
    """보 높이에서 선택 기둥의 실제 잉크 구간과 접하는 면만 허용한다."""
    probe_y = beam.position + OUTSIDE_PROBE_OFFSET
    probe_x = pillar.position - OUTSIDE_PROBE_OFFSET
    if not _is_filled((probe_x, probe_y), pillar_polygons):
        return False
    crossings = sorted(set(_probe_breakpoints("horizontal", probe_y, pillar_polygons)))
    for left, right in zip(crossings, crossings[1:]):
        if left <= probe_x <= right and _is_filled(((left + right) / 2, probe_y), pillar_polygons):
            return any(
                max(left, span.start) <= min(right, span.end) + AXIS_TOLERANCE
                for span in beam.component_spans
            )
    return False


def _p1_attached_beam_options(
    face_hypotheses: Sequence[FaceHypothesis],
    pillar: FaceHypothesis,
    medial_jamo: Optional[str] = None,
    *,
    pillar_polygons: Sequence[Sequence[Point]],
) -> List[Tuple[float, FaceHypothesis]]:
    pillar_start, pillar_end = _hypothesis_component_bounds(pillar)
    right_facing = medial_jamo in {"ㅐ", "ㅑ", "ㅒ", "ㅙ"}
    left_facing = medial_jamo in {"ㅔ", "ㅕ", "ㅖ", "ㅝ", "ㅞ"}
    scored: List[Tuple[float, FaceHypothesis]] = []
    for hypothesis in face_hypotheses:
        if hypothesis.orientation != "horizontal" or hypothesis.side != "top":
            continue
        extent = _hypothesis_extent(hypothesis)
        component_start, component_end = _hypothesis_component_bounds(hypothesis)
        attachment_distance = min(
            abs(component_start - pillar.position),
            abs(component_end - pillar.position),
        )
        if (
            not 40.0 <= extent <= 360.0
            or not 100.0 <= hypothesis.position <= 800.0
            or not pillar_start - 20.0 <= hypothesis.position <= pillar_end + 20.0
            or attachment_distance > 170.0
            or hypothesis.visible_length < 30.0
            or hypothesis.roi_coverage < 0.2
            or (right_facing and component_end <= pillar.position + 30.0)
            or (left_facing and component_start >= pillar.position - 30.0)
            or not _p1_beam_contacts_pillar(hypothesis, pillar, pillar_polygons)
        ):
            continue
        score = (
            0.5
            + 0.2 * hypothesis.roi_coverage
            + 0.2 * _proximity_score(attachment_distance, 0.0, 170.0)
            + 0.1 * _range_score(extent, 70.0, 300.0, 100.0)
        )
        scored.append((score, hypothesis))

    deduped: List[Tuple[float, FaceHypothesis]] = []
    for score, hypothesis in sorted(
        scored,
        key=lambda item: (-item[0], item[1].position, item[1].contour_id),
    ):
        if any(abs(existing.position - hypothesis.position) <= 3.0 for _, existing in deduped):
            continue
        deduped.append((score, hypothesis))
    return deduped


def _p1_main_beam_options(face_hypotheses: Sequence[FaceHypothesis]) -> List[Tuple[float, FaceHypothesis]]:
    candidates = _dedupe_axis_positions(
        hypothesis
        for hypothesis in face_hypotheses
        if hypothesis.orientation == "horizontal"
        and hypothesis.side == "top"
        and 250.0 <= hypothesis.position <= BASELINE_Y + 30.0
        and _hypothesis_extent(hypothesis) >= 250.0
        and hypothesis.visible_length >= 100.0
        and hypothesis.roi_coverage >= 0.2
    )
    return sorted(
        (
            (
                0.45
                + 0.25 * hypothesis.roi_coverage
                + 0.2 * _range_score(_hypothesis_extent(hypothesis), 550.0, 900.0, 200.0)
                + 0.1 * _range_score(hypothesis.visible_length, 300.0, 900.0, 180.0),
                hypothesis,
            )
            for hypothesis in candidates
        ),
        key=lambda item: (-item[0], item[1].contour_id, item[1].position),
    )


def _p1_twin_stem_options(
    face_hypotheses: Sequence[FaceHypothesis],
    main_beam: FaceHypothesis,
    medial_jamo: str,
) -> List[Tuple[float, FaceHypothesis]]:
    scored: List[Tuple[float, FaceHypothesis]] = []
    beam_start, beam_end = _hypothesis_component_bounds(main_beam)
    for hypothesis in face_hypotheses:
        if hypothesis.orientation != "vertical" or hypothesis.side != "right":
            continue
        start, end = _hypothesis_component_bounds(hypothesis)
        extent = end - start
        attachment_distance = abs((end if medial_jamo == "ㅛ" else start) - main_beam.position)
        directional_reach = (
            main_beam.position - start
            if medial_jamo == "ㅛ"
            else end - main_beam.position
        )
        maximum_distance = 100.0 if medial_jamo == "ㅛ" else 140.0
        if (
            not 80.0 <= hypothesis.position <= 920.0
            or not 60.0 <= extent <= 450.0
            or hypothesis.visible_length < 40.0
            or attachment_distance > maximum_distance
            or not beam_start - 20.0 <= hypothesis.position <= beam_end + 20.0
            or hypothesis.roi_coverage < 0.15
            or directional_reach < MIN_TWIN_STEM_DIRECTIONAL_REACH
        ):
            continue
        score = (
            0.5
            + 0.2 * hypothesis.roi_coverage
            + 0.2 * _proximity_score(attachment_distance, 0.0, maximum_distance)
            + 0.1 * _range_score(extent, 140.0, 330.0, 130.0)
        )
        scored.append((score, hypothesis))

    deduped: List[Tuple[float, FaceHypothesis]] = []
    for score, hypothesis in sorted(
        scored,
        key=lambda item: (-item[0], item[1].position, item[1].contour_id),
    ):
        if any(abs(existing.position - hypothesis.position) <= 3.0 for _, existing in deduped):
            continue
        deduped.append((score, hypothesis))
    return deduped


def _p1_directional_twin_structures(
    face_hypotheses: Sequence[FaceHypothesis],
    medial_jamo: str,
    contour_bounds: Optional[Dict[int, Tuple[float, float, float, float]]] = None,
) -> List[Tuple[float, FaceHypothesis, List[Tuple[float, FaceHypothesis]]]]:
    """Keep only bottom-layout beams proved by two stems on expected side.

    받침 문맥(contour_bounds 지정)에서는 두 가지를 추가로 요구한다.
    줄기 contour는 보 contour와 세로 잉크 구간이 실제로 겹쳐야 하고,
    받침이 더 아래에 있으므로 최하단 우선 대신 구조 증거 점수로 고른다.
    받침 몸체(ㅂ 등)의 좁은 윗면은 전폭 보 대비 낮은 점수로 밀려난다.
    counter 유무는 판별 기준이 아니다. 나눔처럼 홀자와 받침이 한 윤곽으로
    융합되면 정상 구조에도 counter가 생긴다.
    """
    structures: List[Tuple[float, FaceHypothesis, List[Tuple[float, FaceHypothesis]]]] = []
    for beam_score, beam in _p1_main_beam_options(face_hypotheses):
        stem_options = _p1_twin_stem_options(face_hypotheses, beam, medial_jamo)
        if contour_bounds is not None:
            beam_box = contour_bounds.get(beam.contour_id)
            filtered: List[Tuple[float, FaceHypothesis]] = []
            for score, stem in stem_options:
                stem_box = contour_bounds.get(stem.contour_id)
                if stem.contour_id == beam.contour_id:
                    filtered.append((score, stem))
                    continue
                # 곡선 접합의 bbox 오차만 허용한다. ㅂ 윗면과 실제 줄기의
                # 79unit 간극 같은 비접합은 계속 거부한다.
                contact_tolerance = 20.0
                if (
                    beam_box is not None and stem_box is not None
                    and stem_box[1] <= beam_box[3] + contact_tolerance
                    and beam_box[1] <= stem_box[3] + contact_tolerance
                ):
                    filtered.append((score, stem))
            stem_options = filtered
        stems = sorted((hypothesis for _, hypothesis in stem_options), key=lambda item: item.position)
        beam_extent = _hypothesis_extent(beam)
        minimum_separation = max(60.0, min(120.0, beam_extent * 0.15))
        if len(stems) < 2 or stems[-1].position - stems[0].position < minimum_separation:
            continue
        support_score = sum(score for score, _ in stem_options[:2]) / 2.0
        lower_position_score = _range_score(beam.position, 420.0, 800.0, 180.0)
        score = 0.55 * beam_score + 0.35 * support_score + 0.1 * lower_position_score
        structures.append((score, beam, stem_options))
    if contour_bounds is not None:
        return sorted(
            structures,
            key=lambda item: (-item[0], -item[1].position, item[1].contour_id),
        )
    return sorted(
        structures,
        key=lambda item: (-item[1].position, -item[0], item[1].contour_id),
    )


def _p1_local_base_beam_candidates(
    operations: Sequence[RecordingOperation],
    features: Sequence[ContourFeatures],
    units_per_em: int,
    role: RoleSpec,
    vertical_limit: Optional[float],
) -> Tuple[List[Tuple[float, Dict[str, Any], ContourFeatures]], str]:
    strategy = "mixed-base-beam-left-local-tangent"
    qualifying_contour_count = 0
    candidates: List[Tuple[float, Dict[str, Any], ContourFeatures]] = []
    for feature in features:
        x_min, _, x_max, _ = feature.bounds
        if feature.width < 300.0 or x_min > 300.0 or not 380.0 <= x_max <= 780.0:
            continue
        qualifying_contour_count += 1
        annotation = FaceAnnotation(
            role.element_id,
            feature.contour_id,
            role.orientation,
            role.side,
            role.legacy_face_role,
            role.legacy_tip_role,
            local_reference_side="left",
        )
        element = extract_annotated_face(operations, annotation, units_per_em)
        visible_length = float(element.get("derived", {}).get("visibleLength", 0.0))
        minimum_support = max(3.0, min(6.0, feature.width * 0.004))
        if not _usable_element(element) or visible_length < minimum_support:
            continue
        position = float(element["face"]["value"])
        if not 300.0 <= position <= 850.0:
            continue
        if vertical_limit is not None and position > vertical_limit:
            continue
        score = (
            0.45
            + 0.2 * feature.roi_coverage
            + 0.15 * _range_score(feature.width, 430.0, 720.0, 180.0)
            + 0.1 * _range_score(visible_length, minimum_support, 100.0, 40.0)
            + 0.1 * _range_score(position, 430.0, 820.0, 180.0)
        )
        element["face"]["evidence"]["minimumLocalSupport"] = _rounded(minimum_support)
        element["visibleSpans"]["evidence"]["minimumLocalSupport"] = _rounded(minimum_support)
        candidates.append((score, element, feature))
    if not candidates:
        return [], "non-scalar-face" if qualifying_contour_count else "no-role-match"

    candidates.sort(
        key=lambda item: (
            -item[0],
            item[1]["face"]["evidence"]["contourId"],
        )
    )
    for score, element, _ in candidates:
        evidence = element["face"]["evidence"]
        evidence.update({
            "method": P1_EXTRACTOR_VERSION,
            "matchingUnit": "structure-linked-local-tangent",
            "matchScore": _rounded(score),
            "roleStrategy": strategy,
            "scanOrigin": "below-initial-left-edge",
            "scanDirection": "left-to-right",
        })
        element["visibleSpans"]["evidence"].update(evidence)
    return candidates, ""


def _finalize_p1_local_base_beam(
    candidates: Sequence[Tuple[float, Dict[str, Any], ContourFeatures]],
    selected_index: int,
    selected_score: float,
) -> Dict[str, Any]:
    _, element, _ = candidates[selected_index]
    other_scores = [score for index, (score, _, _) in enumerate(candidates) if index != selected_index]
    margin = selected_score - max(other_scores) if other_scores else selected_score
    evidence = element["face"]["evidence"]
    evidence.update({
        "matchScore": _rounded(selected_score),
        "matchMargin": _rounded(max(0.0, margin)),
    })
    element["visibleSpans"]["evidence"].update(evidence)
    element["match"] = {
        "status": "matched",
        "score": _rounded(selected_score),
        "confidence": "medium",
        "margin": _rounded(max(0.0, margin)),
        "alternatives": [
            {
                "contourId": candidate["face"]["evidence"]["contourId"],
                "score": _rounded(candidate_score),
            }
            for candidate_score, candidate, _ in candidates[:3]
        ],
    }
    return element


def _p1_local_base_beam(
    operations: Sequence[RecordingOperation],
    features: Sequence[ContourFeatures],
    units_per_em: int,
    role: RoleSpec,
    medial_jamo: str,
    base_stem: Optional[FaceHypothesis],
) -> Tuple[Optional[Dict[str, Any]], str]:
    """Compatibility wrapper for diagnostics; production uses joint base graph."""
    candidates, reason = _p1_local_base_beam_candidates(
        operations,
        features,
        units_per_em,
        role,
        None,
    )
    if base_stem is not None:
        stem_start, stem_end = _hypothesis_component_bounds(base_stem)
        attachment = stem_end if medial_jamo in {"ㅙ", "ㅚ"} else stem_start
        candidates = [
            candidate
            for candidate in candidates
            if abs(float(candidate[1]["face"]["value"]) - attachment) <= 150.0
        ]
    if not candidates:
        return None, reason
    return _finalize_p1_local_base_beam(candidates, 0, candidates[0][0]), ""


def _extract_p1_elements(
    operations: Sequence[RecordingOperation],
    features: Sequence[ContourFeatures],
    face_hypotheses: Sequence[FaceHypothesis],
    units_per_em: int,
    medial_jamo: str,
    final_jamo: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Select visible P1 structures by family; never infer hidden joints."""
    roles = {role.element_id: role for role in MEDIAL_ROLE_SPECS[medial_jamo]}
    selected: Dict[str, Dict[str, Any]] = {}
    abstained: Dict[str, Tuple[str, str, Sequence[Tuple[float, FaceHypothesis]]]] = {}

    long_pillars = _p1_long_pillars(face_hypotheses)
    if "outerPillar" in roles:
        scored = [
            (0.65 + 0.2 * pillar.roi_coverage + 0.15 * _range_score(_hypothesis_extent(pillar), 400.0, 900.0, 250.0), pillar)
            for pillar in reversed(long_pillars)
        ]
        if long_pillars:
            selected["outerPillar"] = _with_p1_scan_evidence(
                _p1_axis_element(
                    roles["outerPillar"], long_pillars[-1], scored, "rightmost-long-pillar"
                ),
                "glyph-right-edge",
                "right-to-left",
            )
        else:
            abstained["outerPillar"] = ("no-role-match", "rightmost-long-pillar", scored)
    if "innerPillar" in roles:
        inner_candidates = long_pillars[:-1]
        scored = [
            (0.65 + 0.2 * pillar.roi_coverage + 0.15 * _range_score(_hypothesis_extent(pillar), 400.0, 900.0, 250.0), pillar)
            for pillar in reversed(inner_candidates)
        ]
        if inner_candidates:
            selected["innerPillar"] = _with_p1_scan_evidence(
                _p1_axis_element(
                    roles["innerPillar"], inner_candidates[-1], scored, "second-rightmost-long-pillar"
                ),
                "outer-pillar",
                "right-to-left",
            )
        else:
            abstained["innerPillar"] = ("no-role-match", "second-rightmost-long-pillar", scored)

    base_beam_role = {
        "ㅙ": "lowerBeam",
        "ㅚ": "primaryBeam",
        "ㅝ": "upperBeam",
        "ㅞ": "upperBeam",
        "ㅟ": "primaryBeam",
        "ㅢ": "primaryBeam",
    }.get(medial_jamo)
    if base_beam_role is not None:
        vertical_limit = None
        if long_pillars:
            _, pillar_end = _hypothesis_component_bounds(long_pillars[-1])
            vertical_limit = pillar_end + 30.0
        beam_candidates, beam_reason = _p1_local_base_beam_candidates(
            operations,
            features,
            units_per_em,
            roles[base_beam_role],
            vertical_limit,
        )
        selected_beam_index = (
            0
            if beam_candidates and "baseStem" not in roles
            else None
        )
        selected_beam_score = beam_candidates[0][0] if beam_candidates else 0.0
        selected_stem_options: List[Tuple[float, FaceHypothesis]] = []
        selected_stem: Optional[FaceHypothesis] = None

        if "baseStem" in roles and beam_candidates:
            structures: List[
                Tuple[
                    float,
                    int,
                    List[Tuple[float, FaceHypothesis]],
                    FaceHypothesis,
                ]
            ] = []
            for index, (beam_score, beam_element, beam_feature) in enumerate(beam_candidates):
                stem_options = _p1_base_stem_options(
                    face_hypotheses,
                    medial_jamo,
                    float(beam_element["face"]["value"]),
                    beam_feature.contour_id,
                    beam_feature.bounds,
                )
                if not stem_options:
                    continue
                stem_score, stem = stem_options[0]
                structures.append((
                    0.55 * beam_score + 0.45 * stem_score,
                    index,
                    stem_options,
                    stem,
                ))
            structures.sort(
                key=lambda item: (
                    -item[0],
                    -float(beam_candidates[item[1]][1]["face"]["value"]),
                    item[3].contour_id,
                )
            )
            if structures:
                structure_score, selected_beam_index, selected_stem_options, selected_stem = structures[0]
                selected_beam_score = structure_score
                selected["baseStem"] = _with_p1_scan_evidence(
                    _p1_axis_element(
                        roles["baseStem"],
                        selected_stem,
                        selected_stem_options,
                        "below-initial-base-beam-directional-interior-stem",
                    ),
                    "below-initial-base-beam",
                    "beam-to-attached-stem",
                )
                selected_beam_feature = beam_candidates[selected_beam_index][2]
                beam_left, _, beam_right, _ = selected_beam_feature.bounds
                beam_width = beam_right - beam_left
                interior_inset = min(
                    selected_stem.position - beam_left,
                    beam_right - selected_stem.position,
                )
                minimum_interior_inset = beam_width * MIN_BASE_STEM_BEAM_INTERIOR_RATIO
                for component_name in ("face", "visibleSpans"):
                    selected["baseStem"][component_name]["evidence"].update({
                        "attachedBeamElementId": base_beam_role,
                        "attachedBeamContourId": selected_beam_feature.contour_id,
                        "attachedBeamWidth": _rounded(beam_width),
                        "beamInteriorInset": _rounded(interior_inset),
                        "minimumBeamInteriorInset": _rounded(minimum_interior_inset),
                    })
            else:
                abstained["baseStem"] = (
                    "no-role-match",
                    "below-initial-base-beam-directional-interior-stem",
                    (),
                )

        if selected_beam_index is not None:
            selected[base_beam_role] = _finalize_p1_local_base_beam(
                beam_candidates,
                selected_beam_index,
                selected_beam_score,
            )
        else:
            abstained[base_beam_role] = (
                beam_reason or "no-role-match",
                "mixed-base-beam-left-local-tangent",
                (),
            )

    if medial_jamo in {"ㅛ", "ㅠ"}:
        beam_options = _p1_main_beam_options(face_hypotheses)
        contour_bounds: Optional[Dict[int, Tuple[float, float, float, float]]] = None
        if final_jamo is not None:
            # 받침 문맥: 받침 몸체가 보·줄기 구조를 위장할 수 있으므로
            # 실제 구조 증거를 추가로 요구한다. 무받침 경로는 바꾸지 않는다.
            contour_bounds = {feature.contour_id: feature.bounds for feature in features}
        structures = _p1_directional_twin_structures(
            face_hypotheses, medial_jamo, contour_bounds
        )
        if not structures:
            abstained["primaryBeam"] = (
                "no-role-match",
                "main-beam-with-directional-paired-stems",
                beam_options,
            )
            for role_id in ("leftStem", "rightStem"):
                abstained[role_id] = (
                    "no-role-match",
                    "paired-stems-attached-to-verified-main-beam",
                    (),
                )
        else:
            _, main_beam, stem_options = structures[0]
            verified_beam_options = [(score, beam) for score, beam, _ in structures]
            selected["primaryBeam"] = _with_p1_scan_evidence(
                _p1_axis_element(
                    roles["primaryBeam"],
                    main_beam,
                    verified_beam_options,
                    "lower-main-beam-with-directional-paired-stems",
                ),
                "below-initial-wide-beam",
                "beam-to-directional-stems",
            )
            stem_hypotheses = sorted((hypothesis for _, hypothesis in stem_options), key=lambda item: item.position)
            selected["leftStem"] = _with_p1_scan_evidence(
                _p1_axis_element(
                    roles["leftStem"],
                    stem_hypotheses[0],
                    stem_options,
                    "left-of-directional-paired-attached-stems",
                ),
                "verified-main-beam",
                "left-to-right",
            )
            selected["rightStem"] = _with_p1_scan_evidence(
                _p1_axis_element(
                    roles["rightStem"],
                    stem_hypotheses[-1],
                    stem_options,
                    "right-of-directional-paired-attached-stems",
                ),
                "verified-main-beam",
                "right-to-left",
            )
    else:
        side_beam_roles: Tuple[str, ...] = ()
        if medial_jamo in {"ㅑ", "ㅒ", "ㅕ", "ㅖ"}:
            side_beam_roles = ("upperBeam", "lowerBeam")
        elif medial_jamo in {"ㅐ", "ㅔ"}:
            side_beam_roles = ("primaryBeam",)
        elif medial_jamo == "ㅙ":
            side_beam_roles = ("upperBeam",)
        elif medial_jamo in {"ㅝ", "ㅞ"}:
            side_beam_roles = ("lowerBeam",)

        if side_beam_roles:
            anchor_id = "innerPillar" if "innerPillar" in roles else "outerPillar"
            anchor_index = -2 if anchor_id == "innerPillar" else -1
            anchor = long_pillars[anchor_index] if len(long_pillars) >= abs(anchor_index) else None
            pillar_polygons = (
                _flattened_contours(
                    split_contours(operations)[anchor.contour_id],
                    1000.0 / units_per_em,
                    BASELINE_Y,
                    tolerance=LOCAL_TANGENT_FLATTEN_TOLERANCE,
                )
                if anchor is not None
                else []
            )
            beam_options = (
                _p1_attached_beam_options(
                    face_hypotheses, anchor, medial_jamo, pillar_polygons=pillar_polygons
                )
                if anchor is not None
                else []
            )
            if base_beam_role in selected:
                base_beam_position = float(selected[base_beam_role]["face"]["value"])
                if medial_jamo == "ㅙ":
                    beam_options = [
                        option for option in beam_options
                        if option[1].position < base_beam_position
                    ]
                elif medial_jamo in {"ㅝ", "ㅞ"}:
                    beam_options = [
                        option for option in beam_options
                        if option[1].position > base_beam_position
                    ]
            beam_hypotheses = sorted((hypothesis for _, hypothesis in beam_options), key=lambda item: item.position)
            if len(side_beam_roles) == 2 and len(beam_hypotheses) >= 2:
                selected["upperBeam"] = _p1_axis_element(
                    roles["upperBeam"], beam_hypotheses[0], beam_options, "upper-of-attached-beam-pair"
                )
                selected["lowerBeam"] = _p1_axis_element(
                    roles["lowerBeam"], beam_hypotheses[-1], beam_options, "lower-of-attached-beam-pair"
                )
            elif len(side_beam_roles) == 1 and beam_options:
                role_id = side_beam_roles[0]
                selected[role_id] = _p1_axis_element(
                    roles[role_id], beam_options[0][1], beam_options, "single-beam-attached-to-inner-pillar"
                )
            else:
                reason = "ambiguous-role-match" if beam_options else "no-role-match"
                for role_id in side_beam_roles:
                    abstained[role_id] = (reason, "attached-side-beam-family", beam_options)

            beam_scan_direction = (
                "pillar-to-right"
                if medial_jamo in {"ㅐ", "ㅑ", "ㅒ", "ㅙ"}
                else "pillar-to-left"
            )
            for role_id in side_beam_roles:
                if role_id in selected:
                    selected[role_id] = _with_p1_scan_evidence(
                        selected[role_id],
                        "selected-medial-pillar",
                        beam_scan_direction,
                    )

    elements: List[Dict[str, Any]] = []
    for role in MEDIAL_ROLE_SPECS[medial_jamo]:
        if role.element_id in selected:
            elements.append(selected[role.element_id])
            continue
        reason, strategy, options = abstained.get(
            role.element_id,
            ("no-role-match", "family-role-not-observed", ()),
        )
        elements.append(_p1_abstained_element(role, reason, strategy, options))
    return elements


def _upward_stem_contacts_beam(
    stem: FaceHypothesis,
    beam: ContourFeatures,
    beam_polygons: Sequence[Sequence[Point]],
) -> bool:
    """바탕보 내부에 위쪽에서 닿는 실제 노출 세로면만 인정한다."""
    if stem.orientation != "vertical" or stem.side != "right" or stem.visible_length < 25.0:
        return False
    left, top, right, bottom = beam.bounds
    inset = (right - left) * MIN_BASE_STEM_BEAM_INTERIOR_RATIO
    if min(stem.position - left, right - stem.position) < inset:
        return False
    join_y = stem.end
    if stem.start >= top or not top - FLATTEN_TOLERANCE <= join_y <= bottom + FLATTEN_TOLERANCE:
        return False
    # 같은 contour ID나 bbox 중첩은 접합 증거가 아니다. 가시 면의 끝에서
    # 오른쪽 바깥이 빈 공간 -> 선택한 보의 실제 잉크로 바뀌어야 한다.
    probe_x = stem.position + OUTSIDE_PROBE_OFFSET
    return (
        not _is_filled((probe_x, join_y - OUTSIDE_PROBE_OFFSET), beam_polygons)
        and _is_filled((probe_x, join_y + OUTSIDE_PROBE_OFFSET), beam_polygons)
    )


def _downward_stem_contacts_beam(
    stem: FaceHypothesis,
    beam: ContourFeatures,
    beam_polygons: Sequence[Sequence[Point]],
) -> bool:
    """ㅜ: 바탕보 내부에 아래쪽으로 이어지는 실제 노출 세로면만 인정한다."""
    if stem.orientation != "vertical" or stem.side != "right" or stem.visible_length < 25.0:
        return False
    left, top, right, bottom = beam.bounds
    inset = (right - left) * MIN_BASE_STEM_BEAM_INTERIOR_RATIO
    if min(stem.position - left, right - stem.position) < inset:
        return False
    join_y = stem.start
    if stem.end <= bottom or not top - FLATTEN_TOLERANCE <= join_y <= bottom + FLATTEN_TOLERANCE:
        return False
    # 접합점 위(보 내부)는 실제 잉크, 접합점 아래(줄기 옆 바깥)는 빈 공간이어야 한다.
    probe_x = stem.position + OUTSIDE_PROBE_OFFSET
    return (
        not _is_filled((probe_x, join_y + OUTSIDE_PROBE_OFFSET), beam_polygons)
        and _is_filled((probe_x, join_y - OUTSIDE_PROBE_OFFSET), beam_polygons)
    )


def _expanded_upward_base(
    operations: Sequence[RecordingOperation],
    features: Sequence[ContourFeatures],
    hypotheses: Sequence[FaceHypothesis],
    units_per_em: int,
    medial_jamo: str,
) -> Tuple[Optional[ContourFeatures], List[FaceHypothesis], Optional[FaceHypothesis]]:
    """확장 받침 문맥의 ㅗ·ㅘ·ㅜ: 보를 먼저 찾고 유한 접합면으로 줄기를 묶는다."""
    beam_role_id = "lowerBeam" if medial_jamo == "ㅘ" else "primaryBeam"
    stem_contacts_beam = (
        _downward_stem_contacts_beam if medial_jamo == "ㅜ" else _upward_stem_contacts_beam
    )
    stem_join = (lambda stem: stem.start) if medial_jamo == "ㅜ" else (lambda stem: stem.end)
    role = next(value for value in MEDIAL_ROLE_SPECS[medial_jamo] if value.element_id == beam_role_id)
    contours = split_contours(operations)
    structures: List[Tuple[float, ContourFeatures, List[FaceHypothesis], Optional[FaceHypothesis]]] = []
    whole_beam_ids = set()
    for beam in features:
        score = _score_role(beam, role, _medial_layout(medial_jamo))
        if score is None:
            continue
        whole_beam_ids.add(beam.contour_id)
        polygons = _flattened_contours(
            contours[beam.contour_id], 1000.0 / units_per_em, BASELINE_Y,
        )
        stems = [stem for stem in hypotheses if stem_contacts_beam(stem, beam, polygons)]
        if stems:
            structures.append((score, beam, stems, None))
    # 합쳐진 윤곽은 bbox 전체를 보로 삼지 않는다. 실제 수평 segment 묶음의
    # 유한 범위를 사용하고, 그 면 높이에서 위쪽 줄기가 접합하는지 증명한다.
    local_hypotheses = [] if structures else hypotheses
    for face in local_hypotheses:
        if face.contour_id in whole_beam_ids:
            continue
        score = _score_face_hypothesis(face, role, _medial_layout(medial_jamo), face.position)
        if score is None:
            continue
        left, right = _hypothesis_component_bounds(face)
        bottom = features[face.contour_id].bounds[3]
        local_beam = ContourFeatures(face.contour_id, (left, face.position, right, bottom),
                                     right - left, bottom - face.position, (left + right) / 2,
                                     (face.position + bottom) / 2, 0.0, 1.0, face.roi_coverage)
        polygons = _flattened_contours(contours[face.contour_id], 1000.0 / units_per_em, BASELINE_Y)
        stems = [stem for stem in hypotheses
                 if abs(stem_join(stem) - face.position) <= FLATTEN_TOLERANCE
                 and stem_contacts_beam(stem, local_beam, polygons)]
        if stems:
            structures.append((score, local_beam, stems, face))
    structures.sort(key=lambda item: (-item[0], item[1].contour_id))
    if not structures or (len(structures) > 1 and structures[0][0] - structures[1][0] < 0.05):
        return None, [], None
    return structures[0][1], structures[0][2], structures[0][3]


def extract_medial_character(
    font: TTFont,
    character: str,
    medial_jamo: str,
    final_jamo: Optional[str],
) -> Dict[str, Any]:
    """Match medial roles from contour geometry without character-specific contour IDs."""
    role_specs = MEDIAL_ROLE_SPECS.get(medial_jamo)
    if role_specs is None:
        raise ValueError("unsupported medial role definition: {}".format(medial_jamo))
    cmap = font.getBestCmap() or {}
    glyph_name = cmap.get(ord(character))
    if glyph_name is None:
        raise ValueError("missing glyph: {}".format(character))
    glyph_set = font.getGlyphSet()
    recorder = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(recorder)
    contours = split_contours(recorder.value)
    units_per_em = int(font["head"].unitsPerEm)
    layout = _medial_layout(medial_jamo)
    regions = MATCHING_ROIS[(layout, final_jamo is not None)]
    features = _contour_features(contours, units_per_em, regions, BASELINE_Y)
    face_hypotheses = _axis_face_hypotheses(recorder.value, units_per_em, regions, BASELINE_Y)

    if medial_jamo in P1_MEDIAL_JAMOS:
        return {
            "character": character,
            "glyphName": glyph_name,
            "elements": _extract_p1_elements(
                recorder.value,
                features,
                face_hypotheses,
                units_per_em,
                medial_jamo,
                final_jamo,
            ),
        }

    used_contours = set()
    used_hypotheses = set()
    elements: List[Dict[str, Any]] = []
    base_stem_endpoint: Optional[float] = None
    base_stem_matching_unit: Optional[str] = None
    left_beam_pillar: Optional[ContourFeatures] = None
    # 승인 당시 P0의 무받침/ㄱ 계약은 그대로 둔다. 다른 받침 문맥에는
    # 위치 점수만 상속하지 않고 실제 보-줄기 연결을 추가로 증명한다.
    expanded_upward = medial_jamo in {"ㅗ", "ㅘ", "ㅜ"} and final_jamo not in P0_FINAL_JAMOS
    bound_beam, bound_stems, bound_beam_face = _expanded_upward_base(
        recorder.value, features, face_hypotheses, units_per_em, medial_jamo,
    ) if expanded_upward else (None, [], None)
    bound_stem_keys = {_hypothesis_key(stem) for stem in bound_stems}
    bound_stem_contours = {
        stem.contour_id for stem in bound_stems
        if abs(features[stem.contour_id].bounds[2] - stem.position) <= AXIS_TOLERANCE
    }
    base_beam_role_id = "lowerBeam" if medial_jamo == "ㅘ" else "primaryBeam"
    for role in role_specs:
        contour_scored = sorted(
            (
                (score, feature)
                for feature in features
                if feature.contour_id not in used_contours
                if not expanded_upward or role.element_id != "baseStem" or feature.contour_id in bound_stem_contours
                if not expanded_upward or role.element_id != base_beam_role_id or (bound_beam is not None and feature.contour_id == bound_beam.contour_id)
                if not expanded_upward or role.element_id != base_beam_role_id or bound_beam_face is None
                for score in [_score_role(feature, role, layout, left_beam_pillar=left_beam_pillar)]
                if score is not None
            ),
            key=lambda item: (-item[0], item[1].contour_id),
        )
        contour_alternatives = [
            {"contourId": feature.contour_id, "score": _rounded(score)}
            for score, feature in contour_scored[:3]
        ]
        contour_element: Optional[Dict[str, Any]] = None
        contour_confidence: Optional[str] = None
        if contour_scored:
            best_score, best_feature = contour_scored[0]
            margin = best_score - contour_scored[1][0] if len(contour_scored) > 1 else best_score
            if best_score >= 0.58 and margin >= 0.05:
                contour_confidence = "high" if best_score >= 0.78 and margin >= 0.12 else "medium"
                local_reference_side = LOCAL_TANGENT_REFERENCE_SIDES.get((medial_jamo, role.element_id))
                annotation = FaceAnnotation(
                    role.element_id,
                    best_feature.contour_id,
                    role.orientation,
                    role.side,
                    role.legacy_face_role,
                    role.legacy_tip_role,
                    local_reference_side=local_reference_side,
                )
                contour_element = extract_annotated_face(recorder.value, annotation, units_per_em)
                for component_name in ("face", "visibleSpans"):
                    contour_element[component_name]["evidence"]["method"] = EXTRACTOR_VERSION
                    contour_element[component_name]["evidence"].update({
                        "matchingUnit": "whole-contour",
                        "matchScore": _rounded(best_score),
                        "matchMargin": _rounded(margin),
                        "roiCoverage": _rounded(best_feature.roi_coverage),
                    })
                    if left_beam_pillar is not None and _left_beam_attached_to_pillar(best_feature, left_beam_pillar):
                        contour_element[component_name]["evidence"].update({
                            "roleStrategy": "left-beam-attached-to-selected-pillar",
                            "anchorContourId": left_beam_pillar.contour_id,
                        })
                contour_element["match"] = {
                    "status": "matched",
                    "score": _rounded(best_score),
                    "confidence": contour_confidence,
                    "margin": _rounded(margin),
                    "alternatives": contour_alternatives,
                }

        segment_scored = sorted(
            (
                (score, hypothesis)
                for hypothesis in face_hypotheses
                if _hypothesis_key(hypothesis) not in used_hypotheses
                if not expanded_upward or role.element_id != "baseStem" or _hypothesis_key(hypothesis) in bound_stem_keys
                if not expanded_upward or role.element_id != base_beam_role_id or (bound_beam is not None and hypothesis.contour_id == bound_beam.contour_id)
                if not expanded_upward or role.element_id != base_beam_role_id or bound_beam_face is None or _hypothesis_key(hypothesis) == _hypothesis_key(bound_beam_face)
                for score in [
                    0.65 + 0.2 * hypothesis.roi_coverage + 0.15 * _range_score(hypothesis.visible_length, 70.0, 430.0, 180.0)
                    if expanded_upward and role.element_id == "baseStem"
                    else _score_face_hypothesis(hypothesis, role, layout, base_stem_endpoint)
                ]
                if score is not None
            ),
            key=lambda item: (-item[0], item[1].contour_id, item[1].position, item[1].segment_ids),
        )
        segment_alternatives = [
            {"contourId": hypothesis.contour_id, "score": _rounded(score)}
            for score, hypothesis in segment_scored[:3]
        ]
        segment_element: Optional[Dict[str, Any]] = None
        selected_hypothesis: Optional[FaceHypothesis] = None
        if segment_scored:
            segment_score, best_hypothesis = segment_scored[0]
            segment_margin = segment_score - segment_scored[1][0] if len(segment_scored) > 1 else segment_score
            if segment_score >= 0.58 and segment_margin >= 0.05:
                selected_hypothesis = best_hypothesis
                segment_element = _face_hypothesis_element(
                    role,
                    best_hypothesis,
                    segment_score,
                    segment_margin,
                    segment_alternatives,
                    LOCAL_TANGENT_REFERENCE_SIDES.get((medial_jamo, role.element_id)),
                )

        base_fallback_lower = role.element_id == "lowerBeam" and base_stem_matching_unit == "axis-face-segment-group" and not expanded_upward
        require_segment = base_fallback_lower and segment_element is not None
        prefer_segment = (
            require_segment
            or contour_element is None
            or not _usable_element(contour_element)
            or (role.element_id == "baseStem" and contour_confidence == "medium")
        )
        matching_unit: Optional[str]
        if prefer_segment and segment_element is not None and selected_hypothesis is not None:
            element = segment_element
            matching_unit = "axis-face-segment-group"
            used_hypotheses.add(_hypothesis_key(selected_hypothesis))
        elif base_fallback_lower and segment_scored:
            reason_code = "ambiguous-role-match" if segment_scored else "no-role-match"
            element = _abstained_role(role, reason_code, segment_alternatives or contour_alternatives)
            matching_unit = None
        elif contour_element is not None:
            element = contour_element
            matching_unit = "whole-contour"
            used_contours.add(contour_element["face"]["evidence"]["contourId"])
        elif segment_element is not None and selected_hypothesis is not None:
            element = segment_element
            matching_unit = "axis-face-segment-group"
            used_hypotheses.add(_hypothesis_key(selected_hypothesis))
        else:
            has_ambiguous_candidates = bool(contour_scored or segment_scored)
            element = _abstained_role(
                role,
                "ambiguous-role-match" if has_ambiguous_candidates else "no-role-match",
                segment_alternatives or contour_alternatives,
            )
            matching_unit = None

        if (
            medial_jamo == "ㅓ"
            and role.element_id == "outerPillar"
            and matching_unit == "whole-contour"
            and _usable_element(element)
        ):
            pillar_feature = features[element["face"]["evidence"]["contourId"]]
            # 선택한 기둥의 왼쪽 면 전체가 실제 수직 윤곽일 때만 접합 근거로 쓴다.
            left_coverage = _axis_face_coverage(
                contours[pillar_feature.contour_id],
                pillar_feature.bounds,
                "vertical",
                "left",
                1000.0 / units_per_em,
                BASELINE_Y,
            )
            if left_coverage >= 1.0 - AXIS_TOLERANCE:
                left_beam_pillar = pillar_feature

        if role.element_id == "baseStem":
            base_stem_endpoint = _component_span_endpoint(element)
            base_stem_matching_unit = matching_unit
        if expanded_upward and role.element_id in {"baseStem", base_beam_role_id}:
            for component_name in ("face", "visibleSpans"):
                element[component_name].setdefault("evidence", {}).update({
                    "method": EXPANDED_FINAL_EXTRACTOR_VERSION,
                    "roleStrategy": "beam-first-visible-upward-stem-contact",
                    "attachedBeamContourId": bound_beam.contour_id if bound_beam is not None else None,
                })
        elements.append(element)
    return {
        "character": character,
        "glyphName": glyph_name,
        "elements": elements,
    }


def extract_g0_character(font: TTFont, character: str) -> Dict[str, Any]:
    annotations = G0_ANNOTATIONS.get(character)
    if annotations is None:
        raise ValueError("unsupported G0 character: {}".format(character))
    cmap = font.getBestCmap() or {}
    glyph_name = cmap.get(ord(character))
    if glyph_name is None:
        raise ValueError("missing glyph: {}".format(character))
    glyph_set = font.getGlyphSet()
    recorder = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(recorder)
    units_per_em = int(font["head"].unitsPerEm)
    return {
        "character": character,
        "glyphName": glyph_name,
        "elements": [
            extract_annotated_face(recorder.value, annotation, units_per_em)
            for annotation in annotations
        ],
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_font(path: Path) -> TTFont:
    font = TTFont(path, lazy=False)
    if "fvar" in font:
        axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
        if "wght" in axes:
            axes["wght"] = 400
        font = instantiateVariableFont(font, axes, inplace=True)
    return font


def generate_g0_fixture(font_path: Path) -> Dict[str, Any]:
    actual_hash = _sha256(font_path)
    if actual_hash != G0_FONT_SHA256:
        raise ValueError("G0 contour annotations require Noto Sans KR {}".format(G0_FONT_SHA256))
    font = load_font(font_path)
    try:
        return {
            "schema": "medial-face-segment-g0-candidates-v1",
            "version": 1,
            "roleDefinitionVersion": "medial-guide-role-v3",
            "coordinateFrame": "shared-baseline",
            "fontFileSha256": actual_hash,
            "method": ANNOTATED_EXTRACTOR_VERSION,
            "review": {"approved": False, "gold": False},
            "cases": [extract_g0_character(font, character) for character in G0_ANNOTATIONS],
        }
    finally:
        font.close()


def g0_contact_sheet_html(font_path: Path) -> str:
    actual_hash = _sha256(font_path)
    if actual_hash != G0_FONT_SHA256:
        raise ValueError("G0 contour annotations require Noto Sans KR {}".format(G0_FONT_SHA256))
    font = load_font(font_path)
    try:
        fixture = {
            character: extract_g0_character(font, character)
            for character in G0_ANNOTATIONS
        }
        glyph_set = font.getGlyphSet()
        cmap = font.getBestCmap() or {}
        cards: List[str] = []
        for character, case in fixture.items():
            glyph_name = cmap[ord(character)]
            path_pen = SVGPathPen(glyph_set)
            glyph_set[glyph_name].draw(path_pen)
            lines: List[str] = []
            labels: List[str] = []
            for element in case["elements"]:
                face = element["face"]
                support = element["visibleSpans"]
                if face["status"] == "candidate" and support["status"] == "candidate":
                    position = face["value"]
                    for index, span in enumerate(support["value"]):
                        if element["orientation"] == "vertical":
                            coordinates = 'x1="{0}" x2="{0}" y1="{1}" y2="{2}"'.format(position, span["from"], span["to"])
                        else:
                            coordinates = 'x1="{1}" x2="{2}" y1="{0}" y2="{0}"'.format(position, span["from"], span["to"])
                        lines.append('<line class="face" data-element="{}" data-span="{}" {} />'.format(element["elementId"], index, coordinates))
                    ranges = " · ".join("{}–{}".format(round(span["from"]), round(span["to"])) for span in support["value"])
                    axis = "y" if element["orientation"] == "vertical" else "x"
                    labels.append("<li><b>{}</b> {}={} · {} {}</li>".format(element["elementId"], element["faceSide"], round(position), axis, ranges))
                else:
                    labels.append("<li class=\"abstained\"><b>{}</b> · {}</li>".format(element["elementId"], face["reasonCode"]))
            cards.append("""
              <article>
                <h2>{character}</h2>
                <svg viewBox="-120 -120 1240 1240" aria-label="{character} finite face candidates">
                  <rect class="em" x="0" y="0" width="1000" height="1000" />
                  {lines}
                  <g transform="matrix(1 0 0 -1 0 880)"><path d="{path}" /></g>
                </svg>
                <ul>{labels}</ul>
              </article>
            """.format(
                character=html.escape(character),
                lines="".join(lines),
                path=html.escape(path_pen.getCommands(), quote=True),
                labels="".join(labels),
            ))
        return """<!doctype html>
<html lang="ko"><meta charset="utf-8"><title>Medial finite face G0</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;padding:24px;background:#eef2f7;color:#172033;font:13px system-ui,sans-serif}}
header{{max-width:1480px;margin:0 auto 18px}}h1{{margin:0 0 6px;font-size:28px}}header p{{margin:0;color:#526176}}
main{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;max-width:1480px;margin:auto}}
article{{overflow:hidden;padding:12px;border:1px solid #d9e0ea;border-radius:12px;background:#fff}}h2{{margin:0 0 6px;font-size:22px}}
svg{{display:block;width:100%;background:#fbfcfe;border:1px solid #e4e8ee}}.em{{fill:none;stroke:#dfe5ed;stroke-width:2}}path{{fill:#171717}}.face{{stroke:#e37700;stroke-width:5;stroke-linecap:round;vector-effect:non-scaling-stroke}}
ul{{display:grid;gap:3px;margin:8px 0 0;padding:0;list-style:none;font-size:11px;line-height:1.35}}li{{overflow-wrap:anywhere}}li b{{color:#a35200}}li.abstained{{color:#9b2c2c}}
</style><header><h1>G0 유한 구조면 자동 기하 후보</h1><p>주황선: 실제 외곽으로 보이는 구간 · contour 역할은 G0 주석 · gold 아님</p></header><main>{cards}</main></html>""".format(cards="".join(cards))
    finally:
        font.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate finite G0 medial face candidates")
    parser.add_argument("font", type=Path)
    parser.add_argument("--html", type=Path)
    args = parser.parse_args()
    font_path = args.font.resolve()
    if args.html:
        output_path = args.html.resolve()
        output_path.write_text(g0_contact_sheet_html(font_path), encoding="utf-8")
        print(output_path)
    else:
        result = generate_g0_fixture(font_path)
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
