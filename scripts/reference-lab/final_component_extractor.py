#!/usr/bin/env python3
"""Context-directed candidate extraction for modern Hangul final components.

Medial v9 anchors and initial v3 grouping are read-only dependencies. Legacy
guide values never enter grouping, role faces, response data, or color areas.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.basePen import decomposeQuadraticSegment, decomposeSuperBezierSegment
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

import final_component_contract as contract
import initial_component_contract as initial_contract
import initial_component_extractor as initial
import medial_guide_extractor as medial


Point = Tuple[float, float]
Bounds = Tuple[float, float, float, float]
BoundaryRef = Dict[str, Any]
AXIS_TOLERANCE = 1e-6
CONTACT_TOLERANCE = 1e-3
VERTICAL_PARTITION_VERSION = "contact-linked-y-clusters-v1"
FIXED_FONT_AXES: Dict[str, Dict[str, float]] = {
    medial.G0_FONT_ID: {"wght": 400.0},
    medial.G4_FONT_ID: {},
    medial.DOTUM_FONT_ID: {},
}


def _common_evidence() -> Dict[str, str]:
    return {
        "source": "actual-glyph-outline",
        "medialAnchorExtractorVersion": contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION,
    }


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _rounded(value: float) -> float:
    return round(float(value), 3)


def _context(context_id: str) -> Dict[str, Any]:
    matches = [
        value
        for value in contract.P0_CONTEXTS + contract.MEDIAL_CONTEXTS
        if value["id"] == context_id
    ]
    if len(matches) != 1:
        raise ValueError("지원하지 않는 받침 P0 문맥입니다.")
    return matches[0]


def _required_anchor_ids(context_id: str) -> Tuple[str, ...]:
    """확장 홀자 문맥은 홀자별 실제 역할로 앵커를 정한다. P0 문맥은 기존 규칙을 쓴다."""
    if context_id not in contract.EXPANDED_MEDIAL_CONTEXT_IDS:
        return initial._required_anchor_ids(context_id)  # pylint: disable=protected-access
    medial_jamo = str(_context(context_id)["medialJamo"])
    if context_id.startswith("right"):
        return ("outerPillar",)
    if context_id.startswith("bottom"):
        return ("primaryBeam",)
    return (initial_contract.MIXED_BASE_BEAM_ROLES[medial_jamo], "outerPillar")


def _validate_identity(
    character: str,
    initial_jamo: str,
    medial_jamo: str,
    final_jamo: str,
    context_id: str,
) -> Dict[str, Any]:
    context_value = _context(context_id)
    if (
        context_value["medialJamo"] != medial_jamo
        or contract.compose_syllable(initial_jamo, medial_jamo, final_jamo) != character
    ):
        raise ValueError("글자와 첫닿·홀자·받침·문맥 identity가 다릅니다.")
    return context_value


def _identity(
    font_sha256: str,
    axes: Dict[str, float],
    character: str,
    glyph_name: Optional[str],
    path_sha256: Optional[str],
    initial_jamo: str,
    medial_jamo: str,
    final_jamo: str,
    context_id: str,
) -> Dict[str, Any]:
    return {
        "fontSha256": font_sha256,
        "axes": dict(axes),
        "character": character,
        "codepoint": ord(character),
        "glyphName": glyph_name,
        "pathSha256": path_sha256,
        "initialJamo": initial_jamo,
        "medialJamo": medial_jamo,
        "finalJamo": final_jamo,
        "contextId": context_id,
        "schemaVersion": contract.SCHEMA,
        "extractorVersion": contract.EXTRACTOR_VERSION,
        "roleDefinitionVersion": contract.ROLE_DEFINITION_VERSION,
    }


def _abstained_case(identity: Dict[str, Any], reason_code: str) -> Dict[str, Any]:
    if reason_code not in contract.REASON_CODES:
        raise ValueError("지원하지 않는 받침 자동 포기 사유입니다.")
    return {
        "identity": identity,
        "state": "abstained",
        "reasonCode": reason_code,
    }


def _observation_abstained(reason_code: str) -> Dict[str, Any]:
    return {
        "status": "abstained",
        "reasonCode": reason_code,
        "evidence": _common_evidence(),
    }


def _selection_for_ids(
    contour_ids: Sequence[int],
    records: Sequence[initial.ContourRecord],
    units_per_em: int,
    margin: float = 0.0,
) -> initial.ComponentSelection:
    records_by_id = {record.contour_id: record for record in records}
    parents = initial._containment_parents(records)  # pylint: disable=protected-access
    return initial._whole_contour_selection(  # pylint: disable=protected-access
        sorted(contour_ids),
        records_by_id,
        parents,
        units_per_em,
        margin,
    )


def _contact_linked_vertical_clusters(
    outer_ids: Sequence[int],
    records_by_id: Dict[int, initial.ContourRecord],
) -> Optional[Tuple[set[int], set[int]]]:
    """실제로 연결된 획은 분할하지 않는다. 단순 y 범위 중첩은 연결이 아니다."""
    roots = {value: value for value in outer_ids}

    def root(value: int) -> int:
        while roots[value] != value:
            roots[value] = roots[roots[value]]
            value = roots[value]
        return value

    for index, left in enumerate(outer_ids):
        for right in outer_ids[index + 1:]:
            if _contours_contact(records_by_id[left], records_by_id[right]):
                roots[root(right)] = root(left)
    groups: Dict[int, set[int]] = {}
    for value in outer_ids:
        groups.setdefault(root(value), set()).add(value)
    clusters = _two_means_ids({
        group_id: sum(records_by_id[value].center_y for value in ids) / len(ids)
        for group_id, ids in groups.items()
    })
    if clusters is None:
        return None
    return tuple(set().union(*(groups[group_id] for group_id in cluster)) for cluster in clusters)


def _final_selection(
    records: Sequence[initial.ContourRecord],
    medial_contour_ids: set[int],
    units_per_em: int,
) -> Optional[Tuple[initial.ComponentSelection, initial.ComponentSelection]]:
    records_by_id = {record.contour_id: record for record in records}
    parents = initial._containment_parents(records)  # pylint: disable=protected-access
    remaining_ids = sorted(
        record.contour_id
        for record in records
        if record.contour_id not in medial_contour_ids
    )
    outer_ids = initial._outer_ids(  # pylint: disable=protected-access
        remaining_ids,
        parents,
        records_by_id,
    )
    clusters = _contact_linked_vertical_clusters(outer_ids, records_by_id)
    if clusters is None:
        return None
    upper_outer, lower_outer = clusters
    if sum(records_by_id[value].center_y for value in upper_outer) / len(upper_outer) > sum(
        records_by_id[value].center_y for value in lower_outer
    ) / len(lower_outer):
        upper_outer, lower_outer = lower_outer, upper_outer
    remaining = set(remaining_ids)
    upper_ids: List[int] = []
    lower_ids: List[int] = []
    for contour_id in remaining_ids:
        ancestor = _outer_ancestor(contour_id, remaining, parents)
        if ancestor in upper_outer:
            upper_ids.append(contour_id)
        elif ancestor in lower_outer:
            lower_ids.append(contour_id)
        else:
            return None
    if not upper_ids or not lower_ids:
        return None
    return (
        _selection_for_ids(lower_ids, records, units_per_em),
        _selection_for_ids(upper_ids, records, units_per_em),
    )


def _required_medial_contour_ids(
    medial_faces: Dict[str, Dict[str, Any]],
    context_id: str,
) -> set[int]:
    return {
        int(medial_faces[anchor_id]["evidence"]["contourId"])
        for anchor_id in _required_anchor_ids(context_id)
        if anchor_id in medial_faces
    }


def _polygon_edges(polygon: Sequence[Point]) -> List[Tuple[Point, Point]]:
    points = list(polygon)
    if len(points) < 2:
        return []
    if points[0] != points[-1]:
        points.append(points[0])
    return list(zip(points, points[1:]))


def _contours_contact(
    left: initial.ContourRecord,
    right: initial.ContourRecord,
) -> bool:
    left_x_min, left_y_min, left_x_max, left_y_max = left.bounds
    right_x_min, right_y_min, right_x_max, right_y_max = right.bounds
    if (
        left_x_max < right_x_min - CONTACT_TOLERANCE
        or right_x_max < left_x_min - CONTACT_TOLERANCE
        or left_y_max < right_y_min - CONTACT_TOLERANCE
        or right_y_max < left_y_min - CONTACT_TOLERANCE
    ):
        return False
    return any(
        _segments_intersection_kind(left_start, left_end, right_start, right_end) is not None
        for left_start, left_end in _polygon_edges(left.polygon)
        for right_start, right_end in _polygon_edges(right.polygon)
    )


def _validated_medial_contour_ids(
    medial_faces: Dict[str, Dict[str, Any]],
    context_id: str,
    records: Sequence[initial.ContourRecord],
) -> set[int]:
    """Close required medial anchors over physically contacting medial contours."""
    records_by_id = {record.contour_id: record for record in records}
    required = _required_medial_contour_ids(medial_faces, context_id)
    if not required.issubset(records_by_id):
        return set()
    candidates = {
        int(face["evidence"]["contourId"])
        for face in medial_faces.values()
        if int(face["evidence"]["contourId"]) in records_by_id
    }
    selected = set(required)
    changed = True
    while changed:
        changed = False
        for contour_id in sorted(candidates - selected):
            if any(
                _contours_contact(records_by_id[contour_id], records_by_id[selected_id])
                for selected_id in selected
            ):
                selected.add(contour_id)
                changed = True

    parents = initial._containment_parents(records)  # pylint: disable=protected-access
    changed = True
    while changed:
        changed = False
        for contour_id, parent_id in parents.items():
            if parent_id in selected and contour_id not in selected:
                selected.add(contour_id)
                changed = True
    return selected


def _outer_ancestor(
    contour_id: int,
    selected: set[int],
    parents: Dict[int, int],
) -> int:
    current = contour_id
    seen: set[int] = set()
    while current in parents and parents[current] in selected and current not in seen:
        seen.add(current)
        current = parents[current]
    return current


def _two_means_ids(values: Dict[int, float]) -> Optional[Tuple[set[int], set[int]]]:
    if len(values) < 2:
        return None
    left_center = min(values.values())
    right_center = max(values.values())
    if right_center - left_center <= AXIS_TOLERANCE:
        return None
    left_ids: set[int] = set()
    right_ids: set[int] = set()
    for _ in range(16):
        left_ids = {
            contour_id
            for contour_id, center in values.items()
            if abs(center - left_center) <= abs(center - right_center)
        }
        right_ids = set(values) - left_ids
        if not left_ids or not right_ids:
            return None
        next_left = sum(values[contour_id] for contour_id in left_ids) / len(left_ids)
        next_right = sum(values[contour_id] for contour_id in right_ids) / len(right_ids)
        if abs(next_left - left_center) <= AXIS_TOLERANCE and abs(next_right - right_center) <= AXIS_TOLERANCE:
            break
        left_center, right_center = next_left, next_right
    if left_center > right_center:
        left_ids, right_ids = right_ids, left_ids
    return left_ids, right_ids


def _two_means_outer_ids(
    outer_ids: Sequence[int],
    records_by_id: Dict[int, initial.ContourRecord],
) -> Optional[Tuple[set[int], set[int]]]:
    return _two_means_ids({
        contour_id: records_by_id[contour_id].center_x
        for contour_id in outer_ids
    })


def _partition_members(
    final_jamo: str,
    selection: initial.ComponentSelection,
    records: Sequence[initial.ContourRecord],
    units_per_em: int,
) -> Optional[List[Tuple[Dict[str, Any], initial.ComponentSelection]]]:
    spec = contract.member_spec_for(final_jamo)
    if spec["structureKind"] == "single":
        return [(dict(spec["members"][0]), selection)]

    records_by_id = {record.contour_id: record for record in records}
    parents = initial._containment_parents(records)  # pylint: disable=protected-access
    outer_ids = initial._outer_ids(  # pylint: disable=protected-access
        selection.contour_ids,
        parents,
        records_by_id,
    )
    clusters = _two_means_outer_ids(outer_ids, records_by_id)
    if clusters is None:
        return None
    left_outer, right_outer = clusters
    selected = set(selection.contour_ids)
    left_ids: List[int] = []
    right_ids: List[int] = []
    for contour_id in selection.contour_ids:
        ancestor = _outer_ancestor(contour_id, selected, parents)
        if ancestor in left_outer:
            left_ids.append(contour_id)
        elif ancestor in right_outer:
            right_ids.append(contour_id)
        else:
            return None
    if not left_ids or not right_ids:
        return None
    return [
        (dict(spec["members"][0]), _selection_for_ids(left_ids, records, units_per_em)),
        (dict(spec["members"][1]), _selection_for_ids(right_ids, records, units_per_em)),
    ]


def _boundary_fragments(
    selection: initial.ComponentSelection,
    records_by_id: Dict[int, initial.ContourRecord],
    units_per_em: int,
) -> List[Dict[str, Any]]:
    fragments: List[Dict[str, Any]] = []
    for contour_id in selection.contour_ids:
        segment_ids = sorted(selection.segment_ids_by_contour[contour_id])
        if not segment_ids:
            continue
        available = {
            segment.segment_id
            for segment in initial._boundary_segments(  # pylint: disable=protected-access
                records_by_id[contour_id],
                units_per_em,
            )
        }
        segment_ids = [segment_id for segment_id in segment_ids if segment_id in available]
        if not segment_ids:
            continue
        fragments.append({
            "contourId": contour_id,
            "segmentIds": segment_ids,
            "ranges": [
                {"segmentId": segment_id, "from": 0.0, "to": 1.0}
                for segment_id in segment_ids
            ],
        })
    return fragments


def _segment_bounds(
    segment: initial.BoundarySegment,
    units_per_em: int,
) -> Bounds:
    pen = BoundsPen(None)
    pen.moveTo(segment.start_raw)
    if segment.operation == "closePath":
        pen.lineTo(segment.end_raw)
    else:
        arguments = list(segment.arguments)
        if arguments and arguments[-1] is None:
            arguments[-1] = segment.end_raw
        getattr(pen, segment.operation)(*arguments)
    if pen.bounds is None:
        point = segment.start
        return point[0], point[1], point[0], point[1]
    x_min, y_min, x_max, y_max = pen.bounds
    scale = 1000.0 / units_per_em
    return (
        float(x_min) * scale,
        initial.BASELINE_Y - float(y_max) * scale,
        float(x_max) * scale,
        initial.BASELINE_Y - float(y_min) * scale,
    )


def _support_refs(
    selection: initial.ComponentSelection,
    records_by_id: Dict[int, initial.ContourRecord],
    units_per_em: int,
    side: str,
    value: float,
    member_by_contour: Dict[int, str],
) -> List[BoundaryRef]:
    refs: List[BoundaryRef] = []
    bound_index = {"left": 0, "top": 1, "right": 2, "bottom": 3}[side]
    for contour_id in selection.contour_ids:
        for segment in initial._boundary_segments(  # pylint: disable=protected-access
            records_by_id[contour_id],
            units_per_em,
        ):
            if segment.segment_id not in selection.segment_ids_by_contour[contour_id]:
                continue
            segment_bound = _segment_bounds(segment, units_per_em)[bound_index]
            if abs(segment_bound - value) <= 0.002:
                refs.append({
                    "memberId": member_by_contour[contour_id],
                    "contourId": contour_id,
                    "segmentId": segment.segment_id,
                    "from": 0.0,
                    "to": 1.0,
                })
    return refs


def _bounds_dict(selection: initial.ComponentSelection, units_per_em: int) -> Dict[str, float]:
    x_min, y_min, x_max, y_max = initial._scaled_component_bounds(  # pylint: disable=protected-access
        selection,
        units_per_em,
    )
    return {
        "top": _rounded(y_min),
        "bottom": _rounded(y_max),
        "left": _rounded(x_min),
        "right": _rounded(x_max),
    }


def _bound_observations(
    selection: initial.ComponentSelection,
    bounds: Dict[str, float],
    records_by_id: Dict[int, initial.ContourRecord],
    units_per_em: int,
    member_by_contour: Dict[int, str],
) -> Optional[Dict[str, Dict[str, Any]]]:
    observations: Dict[str, Dict[str, Any]] = {}
    for side in contract.BOUND_SIDES:
        refs = _support_refs(
            selection,
            records_by_id,
            units_per_em,
            side,
            bounds[side],
            member_by_contour,
        )
        if not refs:
            return None
        observations[side] = {
            "status": "candidate",
            "value": bounds[side],
            "evidence": {
                **_common_evidence(),
                "method": contract.BOUND_METHOD,
                "side": side,
                "boundaryRefs": refs,
            },
        }
    return observations


def _axis_face_observations(
    records: Sequence[initial.ContourRecord],
    selection: initial.ComponentSelection,
    units_per_em: int,
    member_by_contour: Dict[int, str],
) -> Dict[str, Dict[str, Any]]:
    source = initial._axis_faces(  # pylint: disable=protected-access
        records,
        selection,
        units_per_em,
    )
    result: Dict[str, Dict[str, Any]] = {}
    for side in contract.BOUND_SIDES:
        observation = source[side]
        if observation["status"] != "candidate":
            result[side] = _observation_abstained("no-axis-face")
            continue
        faces: List[Dict[str, Any]] = []
        for face in observation["value"]:
            contour_id = int(face["contourId"])
            member_id = member_by_contour.get(contour_id)
            if member_id is None:
                continue
            faces.append({
                "orientation": face["orientation"],
                "side": side,
                "value": face["value"],
                "visibleSpans": list(face["visibleSpans"]),
                "boundaryRefs": [
                    {
                        "memberId": member_id,
                        "contourId": contour_id,
                        "segmentId": int(segment_id),
                        "from": 0.0,
                        "to": 1.0,
                    }
                    for segment_id in face["segmentIds"]
                ],
            })
        if not faces:
            result[side] = _observation_abstained("no-axis-face")
            continue
        result[side] = {
            "status": "candidate",
            "value": faces,
            "evidence": {
                **_common_evidence(),
                "method": contract.AXIS_FACE_METHOD,
                "side": side,
            },
        }
    return result


def _member_observation(
    spec: Dict[str, Any],
    logical_order: int,
    selection: initial.ComponentSelection,
    records: Sequence[initial.ContourRecord],
    units_per_em: int,
) -> Optional[Dict[str, Any]]:
    records_by_id = {record.contour_id: record for record in records}
    member_id = str(spec["id"])
    member_by_contour = {contour_id: member_id for contour_id in selection.contour_ids}
    bounds = _bounds_dict(selection, units_per_em)
    ink_bounds = _bound_observations(
        selection,
        bounds,
        records_by_id,
        units_per_em,
        member_by_contour,
    )
    fragments = _boundary_fragments(selection, records_by_id, units_per_em)
    if ink_bounds is None or not fragments:
        return None
    return {
        "id": member_id,
        "jamo": spec["jamo"],
        "role": spec["role"],
        "partitionEvidence": {
            **_common_evidence(),
            "method": contract.MEMBER_PARTITION_METHOD,
            "memberId": member_id,
            "logicalOrder": logical_order,
        },
        "boundaryFragments": fragments,
        "inkBounds": ink_bounds,
        "axisFaces": _axis_face_observations(
            records,
            selection,
            units_per_em,
            member_by_contour,
        ),
    }


def _orientation(a: Point, b: Point, c: Point) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _point_on_segment(point: Point, start: Point, end: Point) -> bool:
    return (
        min(start[0], end[0]) - AXIS_TOLERANCE <= point[0] <= max(start[0], end[0]) + AXIS_TOLERANCE
        and min(start[1], end[1]) - AXIS_TOLERANCE <= point[1] <= max(start[1], end[1]) + AXIS_TOLERANCE
    )


def _segments_intersection_kind(a: Point, b: Point, c: Point, d: Point) -> Optional[str]:
    first = _orientation(a, b, c)
    second = _orientation(a, b, d)
    third = _orientation(c, d, a)
    fourth = _orientation(c, d, b)
    if (
        ((first > AXIS_TOLERANCE and second < -AXIS_TOLERANCE) or (first < -AXIS_TOLERANCE and second > AXIS_TOLERANCE))
        and ((third > AXIS_TOLERANCE and fourth < -AXIS_TOLERANCE) or (third < -AXIS_TOLERANCE and fourth > AXIS_TOLERANCE))
    ):
        return "overlapping"
    contacts = [
        point
        for orientation, point, start, end in (
            (first, c, a, b),
            (second, d, a, b),
            (third, a, c, d),
            (fourth, b, c, d),
        )
        if abs(orientation) <= AXIS_TOLERANCE and _point_on_segment(point, start, end)
    ]
    if not contacts:
        return None
    unique_contacts = {
        (round(point[0], 6), round(point[1], 6))
        for point in contacts
    }
    return "overlapping" if len(unique_contacts) > 1 else "touching"


def _point_segment_distance(point: Point, start: Point, end: Point) -> float:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length_squared = dx * dx + dy * dy
    if length_squared <= AXIS_TOLERANCE:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    position = max(0.0, min(1.0, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length_squared))
    projection = (start[0] + position * dx, start[1] + position * dy)
    return math.hypot(point[0] - projection[0], point[1] - projection[1])


def _raw_point_to_screen(point: Point, units_per_em: int) -> Point:
    return medial._transform(  # pylint: disable=protected-access
        point,
        1000.0 / units_per_em,
        initial.BASELINE_Y,
    )


def _quadratic_point(start: Point, control: Point, end: Point, position: float) -> Point:
    inverse = 1.0 - position
    return (
        inverse * inverse * start[0] + 2.0 * inverse * position * control[0] + position * position * end[0],
        inverse * inverse * start[1] + 2.0 * inverse * position * control[1] + position * position * end[1],
    )


def _cubic_point(start: Point, first: Point, second: Point, end: Point, position: float) -> Point:
    inverse = 1.0 - position
    return (
        inverse ** 3 * start[0]
        + 3.0 * inverse * inverse * position * first[0]
        + 3.0 * inverse * position * position * second[0]
        + position ** 3 * end[0],
        inverse ** 3 * start[1]
        + 3.0 * inverse * inverse * position * first[1]
        + 3.0 * inverse * position * position * second[1]
        + position ** 3 * end[1],
    )


def _segment_polyline(
    segment: initial.BoundarySegment,
    units_per_em: int,
    steps: int = 24,
) -> List[Point]:
    if segment.operation in {"lineTo", "closePath"}:
        return [segment.start, segment.end]
    raw_arguments = list(segment.arguments)
    if raw_arguments and raw_arguments[-1] is None:
        raw_arguments[-1] = segment.end_raw
    points = [
        _raw_point_to_screen(tuple(map(float, point)), units_per_em)
        for point in raw_arguments
    ]
    result = [segment.start]
    current = segment.start
    if segment.operation == "curveTo":
        for first, second, end in decomposeSuperBezierSegment(points):
            result.extend(
                _cubic_point(current, first, second, end, position / steps)
                for position in range(1, steps + 1)
            )
            current = end
        return result
    if segment.operation == "qCurveTo":
        for control, end in decomposeQuadraticSegment(points):
            result.extend(
                _quadratic_point(current, control, end, position / steps)
                for position in range(1, steps + 1)
            )
            current = end
        return result
    raise ValueError("지원하지 않는 받침 경계 segment입니다.")


def _segment_distance(
    left: initial.BoundarySegment,
    right: initial.BoundarySegment,
    units_per_em: int,
) -> Tuple[float, Optional[str]]:
    left_points = _segment_polyline(left, units_per_em)
    right_points = _segment_polyline(right, units_per_em)
    distance = math.inf
    relation: Optional[str] = None
    for left_start, left_end in zip(left_points, left_points[1:]):
        for right_start, right_end in zip(right_points, right_points[1:]):
            intersection = _segments_intersection_kind(left_start, left_end, right_start, right_end)
            if intersection == "overlapping":
                return 0.0, intersection
            if intersection == "touching":
                distance = 0.0
                relation = "touching"
                continue
            if relation is None:
                distance = min(
                    distance,
                    _point_segment_distance(left_start, right_start, right_end),
                    _point_segment_distance(left_end, right_start, right_end),
                    _point_segment_distance(right_start, left_start, left_end),
                    _point_segment_distance(right_end, left_start, left_end),
                )
    return distance, relation


def _member_relation(
    members: Sequence[Tuple[Dict[str, Any], initial.ComponentSelection]],
    records_by_id: Dict[int, initial.ContourRecord],
    units_per_em: int,
) -> Optional[Dict[str, Any]]:
    if len(members) == 1:
        return None
    left_selection = members[0][1]
    right_selection = members[1][1]
    left_bounds = _bounds_dict(left_selection, units_per_em)
    right_bounds = _bounds_dict(right_selection, units_per_em)
    left_segments = [
        (contour_id, segment)
        for contour_id in left_selection.contour_ids
        for segment in initial._boundary_segments(records_by_id[contour_id], units_per_em)  # pylint: disable=protected-access
        if segment.segment_id in left_selection.segment_ids_by_contour[contour_id]
    ]
    right_segments = [
        (contour_id, segment)
        for contour_id in right_selection.contour_ids
        for segment in initial._boundary_segments(records_by_id[contour_id], units_per_em)  # pylint: disable=protected-access
        if segment.segment_id in right_selection.segment_ids_by_contour[contour_id]
    ]
    if not left_segments or not right_segments:
        return None
    distance, contact_kind, left_contour_id, left_segment, right_contour_id, right_segment = min(
        (
            (*_segment_distance(left_segment, right_segment, units_per_em), left_contour_id, left_segment, right_contour_id, right_segment)
            for left_contour_id, left_segment in left_segments
            for right_contour_id, right_segment in right_segments
        ),
        key=lambda item: (
            item[0],
            {"overlapping": 0, "touching": 1, None: 2}[item[1]],
            item[2],
            item[3].segment_id,
            item[4],
            item[5].segment_id,
        ),
    )
    relation = contact_kind or ("touching" if distance <= CONTACT_TOLERANCE else "disjoint")
    return {
        "method": contract.MEMBER_RELATION_METHOD,
        "direction": "left-to-right",
        "relation": relation,
        "leftMemberId": "left",
        "rightMemberId": "right",
        "leftAnchorX": _rounded((left_bounds["left"] + left_bounds["right"]) / 2.0),
        "rightAnchorX": _rounded((right_bounds["left"] + right_bounds["right"]) / 2.0),
        "boundaryPairs": [{
            "left": {
                "memberId": "left",
                "contourId": left_contour_id,
                "segmentId": left_segment.segment_id,
                "from": 0.0,
                "to": 1.0,
            },
            "right": {
                "memberId": "right",
                "contourId": right_contour_id,
                "segmentId": right_segment.segment_id,
                "from": 0.0,
                "to": 1.0,
            },
            "distance": _rounded(max(distance, 0.001 if relation == "disjoint" else 0.0)),
            "intersects": contact_kind is not None,
        }],
    }


def _role_faces(
    bounds: Dict[str, float],
    ink_bounds: Dict[str, Dict[str, Any]],
    axis_faces: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    role_faces: Dict[str, Dict[str, Any]] = {}
    for side in contract.BOUND_SIDES:
        refs = list(ink_bounds[side]["evidence"]["boundaryRefs"])
        axis = axis_faces[side]
        support_kind = "bezier-extremum"
        if axis["status"] == "candidate" and any(
            abs(float(face["value"]) - bounds[side]) <= 0.002
            for face in axis["value"]
        ):
            support_kind = "axis-face"
        role_faces[side] = {
            "status": "candidate",
            "value": bounds[side],
            "evidence": {
                **_common_evidence(),
                "method": contract.ROLE_FACE_METHOD,
                "side": side,
                "selectionRule": contract.ROLE_FACE_SELECTION_RULE,
                "supportKind": support_kind,
                "boundaryRefs": refs,
            },
        }
    return role_faces


def _selected_below_initial(
    final_selection: initial.ComponentSelection,
    initial_selection: initial.ComponentSelection,
    units_per_em: int,
) -> bool:
    final_bounds = _bounds_dict(final_selection, units_per_em)
    initial_bounds = _bounds_dict(initial_selection, units_per_em)
    final_center = (final_bounds["top"] + final_bounds["bottom"]) / 2.0
    initial_center = (initial_bounds["top"] + initial_bounds["bottom"]) / 2.0
    return (
        final_center > initial_center
        and final_bounds["bottom"] > initial_bounds["bottom"]
    )


def extract_final_character(
    font: TTFont,
    font_sha256: str,
    axes: Dict[str, float],
    character: str,
    initial_jamo: str,
    medial_jamo: str,
    final_jamo: str,
    context_id: str,
    *,
    medial_observation: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Extract one candidate final group without legacy values or ID exceptions."""
    context_value = _validate_identity(character, initial_jamo, medial_jamo, final_jamo, context_id)
    cmap = font.getBestCmap() or {}
    glyph_name = cmap.get(ord(character))
    if glyph_name is None:
        return _abstained_case(
            _identity(font_sha256, axes, character, None, None, initial_jamo, medial_jamo, final_jamo, context_id),
            "glyph-missing",
        )

    glyph_set = font.getGlyphSet()
    recorder = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(recorder)
    units_per_em = int(font["head"].unitsPerEm)
    if units_per_em <= 0:
        raise ValueError("font unitsPerEm이 양수가 아닙니다.")
    records = initial._contour_records(recorder.value, units_per_em)  # pylint: disable=protected-access
    glyph_path = initial._glyph_path_commands(font, glyph_name)  # pylint: disable=protected-access
    identity = _identity(
        font_sha256,
        axes,
        character,
        glyph_name,
        initial._sha256_text(glyph_path),  # pylint: disable=protected-access
        initial_jamo,
        medial_jamo,
        final_jamo,
        context_id,
    )

    medial_faces, _ = initial._medial_anchor_data(  # pylint: disable=protected-access
        font,
        character,
        medial_jamo,
        final_jamo,
        medial_observation=medial_observation,
    )
    if any(
        anchor_id not in medial_faces
        for anchor_id in _required_anchor_ids(context_id)
    ):
        return _abstained_case(identity, "medial-anchor-unavailable")
    medial_contour_ids = _validated_medial_contour_ids(
        medial_faces,
        context_id,
        records,
    )

    selections = _final_selection(
        records,
        medial_contour_ids,
        units_per_em,
    )
    if selections is None:
        return _abstained_case(identity, "ambiguous-final-group")
    final_selection, initial_selection = selections
    if not _selected_below_initial(final_selection, initial_selection, units_per_em):
        return _abstained_case(identity, "foreign-role-contamination")

    partitioned = _partition_members(final_jamo, final_selection, records, units_per_em)
    if partitioned is None:
        reason = "merged-boundary-unresolved" if contract.structure_kind_for(final_jamo)["id"] != "single" else "ambiguous-final-group"
        return _abstained_case(identity, reason)

    members: List[Dict[str, Any]] = []
    member_by_contour: Dict[int, str] = {}
    for logical_order, (member_spec, member_selection) in enumerate(partitioned):
        observation = _member_observation(
            member_spec,
            logical_order,
            member_selection,
            records,
            units_per_em,
        )
        if observation is None:
            return _abstained_case(identity, "provenance-missing")
        members.append(observation)
        for contour_id in member_selection.contour_ids:
            if contour_id in member_by_contour:
                return _abstained_case(identity, "ambiguous-member-order")
            member_by_contour[contour_id] = str(member_spec["id"])
    if set(member_by_contour) != set(final_selection.contour_ids):
        return _abstained_case(identity, "member-count-mismatch")

    records_by_id = {record.contour_id: record for record in records}
    bounds = _bounds_dict(final_selection, units_per_em)
    ink_bounds = _bound_observations(
        final_selection,
        bounds,
        records_by_id,
        units_per_em,
        member_by_contour,
    )
    if ink_bounds is None:
        return _abstained_case(identity, "provenance-missing")
    axis_faces = _axis_face_observations(
        records,
        final_selection,
        units_per_em,
        member_by_contour,
    )
    role_faces = _role_faces(bounds, ink_bounds, axis_faces)
    selection_area = contract.selection_area_from_role_faces(bounds)
    relation = _member_relation(partitioned, records_by_id, units_per_em)
    if len(partitioned) == 2 and relation is None:
        return _abstained_case(identity, "provenance-missing")
    if relation is not None and relation["leftAnchorX"] >= relation["rightAnchorX"]:
        return _abstained_case(identity, "ambiguous-member-order")

    return {
        "identity": identity,
        "state": "candidate",
        "structureKind": contract.member_spec_for(final_jamo)["structureKind"],
        "members": members,
        "componentGroup": {
            "status": "candidate",
            "value": {
                "contourIds": list(final_selection.contour_ids),
                "holeContourIds": list(final_selection.hole_contour_ids),
                "memberIds": [member["id"] for member in members],
                "selectedPathSha256": initial._selected_path_sha256(final_selection),  # pylint: disable=protected-access
            },
            "evidence": {
                **_common_evidence(),
                "method": contract.GROUPING_METHOD,
                "verticalPartitionVersion": VERTICAL_PARTITION_VERSION,
                "scanOrigin": context_value["scanOrigin"],
                "scanDirection": context_value["scanDirection"],
                "selectionRule": final_selection.selection_rule,
                "score": 0.0,
                "margin": _rounded(max(0.0, final_selection.margin)),
            },
        },
        "memberRelation": relation,
        "inkBounds": ink_bounds,
        "axisFaces": axis_faces,
        "roleFaces": role_faces,
        "selectionArea": {
            "status": "candidate",
            "value": {key: _rounded(value) for key, value in selection_area.items()},
            "evidence": {
                **_common_evidence(),
                "method": contract.SELECTION_AREA_METHOD,
                "derivedFrom": list(contract.BOUND_SIDES),
            },
        },
    }


def response_for_cases(
    font: TTFont,
    font_id: str,
    file_sha256: str,
    axes: Dict[str, float],
    request_cases: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    cases = [
        extract_final_character(
            font,
            file_sha256,
            axes,
            str(case["character"]),
            str(case["initialJamo"]),
            str(case["medialJamo"]),
            str(case["finalJamo"]),
            str(case["contextId"]),
        )
        for case in request_cases
    ]
    return {
        "schema": contract.RESPONSE_SCHEMA,
        "apiVersion": "reference.v1",
        "lifecycle": contract.CANDIDATE_LIFECYCLE,
        "extractorVersion": contract.EXTRACTOR_VERSION,
        "roleDefinitionVersion": contract.ROLE_DEFINITION_VERSION,
        "medialAnchorExtractorVersion": contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION,
        "coordinateFrame": contract.COORDINATE_FRAME,
        "font": {
            "id": font_id,
            "fileSha256": file_sha256,
            "axes": dict(axes),
        },
        "cases": cases,
    }


def generate_p0_response_from_path(
    font_path: Path,
    font_id: str,
    request_cases: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    actual_hash = _sha256_file(font_path)
    expected_hash = medial.P0_VERIFIED_FONT_SHA256.get(font_id)
    if expected_hash is None or font_id not in FIXED_FONT_AXES:
        raise ValueError("받침 P0 고정 font ID가 아닙니다.")
    if actual_hash != expected_hash:
        raise ValueError("받침 P0 고정 font SHA가 다릅니다.")
    font = medial.load_font(font_path)
    try:
        return response_for_cases(
            font,
            font_id,
            actual_hash,
            FIXED_FONT_AXES[font_id],
            request_cases if request_cases is not None else contract.g0_cases(),
        )
    finally:
        font.close()


def generate_g0_response_from_path(font_path: Path) -> Dict[str, Any]:
    return generate_p0_response_from_path(font_path, medial.G0_FONT_ID)


def generate_g1_response_from_path(font_path: Path) -> Dict[str, Any]:
    return generate_p0_response_from_path(font_path, medial.G4_FONT_ID)


def generate_g2_response_from_path(font_path: Path, font_id: str) -> Dict[str, Any]:
    return generate_p0_response_from_path(font_path, font_id, contract.g2_cases())


def write_g0_fixture(font_path: Path, output_path: Path) -> None:
    response = generate_g0_response_from_path(font_path)
    output_path.write_text(
        json.dumps(response, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate fixed-font final-component P0 candidates")
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--font-id", choices=tuple(FIXED_FONT_AXES), default=medial.G0_FONT_ID)
    parser.add_argument("--case-set", choices=("g0", "g2"), default="g0")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    request_cases = contract.g2_cases() if args.case_set == "g2" else contract.g0_cases()
    response = generate_p0_response_from_path(args.font, args.font_id, request_cases)
    args.output.write_text(
        json.dumps(response, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
