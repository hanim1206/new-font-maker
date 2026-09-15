#!/usr/bin/env python3
"""Context-directed P0 extraction for initial component observations.

The extractor consumes the already-known medial identity and medial role
matcher output.  It never reads legacy guide values or character-specific
contour annotations.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

import initial_component_contract as contract
import medial_guide_extractor as medial


BASELINE_Y = 880.0
AXIS_TOLERANCE = 1e-6
# 확장 받침 문맥에서 첫닿자 클러스터가 홀자 기둥 하단을 넘을 수 있는 여유(1000-unit).
# ㅋ·ㅌ류 다리의 정상 하강(실측 최대 약 57)은 허용하고, 받침 획을 흡수한
# 위장 클러스터(실측 초과 127 이상)는 거부한다.
PILLAR_BOTTOM_TOLERANCE = 60.0
PROBE_OFFSET = 0.25
P0_VERIFIED_FONT_SHA256 = dict(medial.P0_VERIFIED_FONT_SHA256)
Point = Tuple[float, float]
Bounds = Tuple[float, float, float, float]
RecordingOperation = Tuple[str, Tuple[Any, ...]]


@dataclass(frozen=True)
class InitialStructureSpec:
    class_id: str
    minimum_outer_islands: int
    minimum_holes: int = 0


@dataclass(frozen=True)
class ContourRecord:
    contour_id: int
    operations: Tuple[RecordingOperation, ...]
    bounds: Bounds
    polygon: Tuple[Point, ...]
    signed_area: float

    @property
    def center_x(self) -> float:
        return (self.bounds[0] + self.bounds[2]) / 2.0

    @property
    def center_y(self) -> float:
        return (self.bounds[1] + self.bounds[3]) / 2.0


@dataclass(frozen=True)
class BoundarySegment:
    segment_id: int
    operation: str
    arguments: Tuple[Any, ...]
    start_raw: Point
    end_raw: Point
    start: Point
    end: Point


@dataclass
class ComponentSelection:
    contour_ids: List[int]
    hole_contour_ids: List[int]
    operations_by_contour: Dict[int, Tuple[RecordingOperation, ...]]
    segment_ids_by_contour: Dict[int, set[int]]
    selection_rule: str
    margin: float


INITIAL_STRUCTURE_SPECS: Dict[str, InitialStructureSpec] = {
    **{
        jamo: InitialStructureSpec("open-single", 1)
        for jamo in ("ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅅ", "ㅋ", "ㅌ")
    },
    **{
        jamo: InitialStructureSpec("open-paired-separated", 2)
        for jamo in ("ㄲ", "ㄸ")
    },
    **{
        jamo: InitialStructureSpec("open-paired-connected", 1)
        for jamo in ("ㅆ", "ㅉ")
    },
    **{
        jamo: InitialStructureSpec("counter-single", 1, 1)
        for jamo in ("ㅁ", "ㅂ", "ㅇ")
    },
    "ㅃ": InitialStructureSpec("counter-paired", 2, 2),
    "ㅈ": InitialStructureSpec("barred-diagonal", 1),
    "ㅊ": InitialStructureSpec("marked-diagonal", 2),
    "ㅍ": InitialStructureSpec("barred-frame", 1),
    "ㅎ": InitialStructureSpec("marked-counter", 3, 1),
}


def _common_evidence() -> Dict[str, str]:
    return {
        "source": "actual-glyph-outline",
        "medialAnchorExtractorVersion": contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION,
    }


def _rounded(value: float) -> float:
    return round(float(value), 3)


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _replay(operations: Sequence[RecordingOperation], pen: Any) -> None:
    for operation, arguments in operations:
        getattr(pen, operation)(*arguments)


def _path_commands(operations: Sequence[RecordingOperation]) -> str:
    pen = SVGPathPen(None)
    _replay(operations, pen)
    return pen.getCommands()


def _glyph_path_commands(font: TTFont, glyph_name: str) -> str:
    glyph_set = font.getGlyphSet()
    pen = SVGPathPen(glyph_set)
    glyph_set[glyph_name].draw(pen)
    return pen.getCommands()


def _signed_area(polygon: Sequence[Point]) -> float:
    if len(polygon) < 3:
        return 0.0
    return sum(
        start[0] * end[1] - end[0] * start[1]
        for start, end in zip(polygon, polygon[1:])
    ) / 2.0


def _contour_records(
    operations: Sequence[RecordingOperation],
    units_per_em: int,
) -> List[ContourRecord]:
    scale = 1000.0 / units_per_em
    contours = medial.split_contours(operations)
    polygons = medial._flattened_contours(  # pylint: disable=protected-access
        operations,
        scale,
        BASELINE_Y,
    )
    if len(contours) != len(polygons):
        raise ValueError("contour와 flattened polygon 수가 다릅니다.")
    return [
        ContourRecord(
            contour_id=contour_id,
            operations=tuple(contour),
            bounds=medial._contour_bounds(  # pylint: disable=protected-access
                contour,
                scale,
                BASELINE_Y,
            ),
            polygon=tuple(polygon),
            signed_area=_signed_area(polygon),
        )
        for contour_id, (contour, polygon) in enumerate(zip(contours, polygons))
    ]


def _boundary_segments(
    record: ContourRecord,
    units_per_em: int,
) -> List[BoundarySegment]:
    scale = 1000.0 / units_per_em
    segments: List[BoundarySegment] = []
    current: Optional[Point] = None
    contour_start: Optional[Point] = None
    segment_id = 0
    for operation, arguments in record.operations:
        if operation == "moveTo":
            current = tuple(map(float, arguments[0]))
            contour_start = current
            continue
        if current is None:
            continue
        if operation in {"lineTo", "curveTo", "qCurveTo"} and arguments:
            last = arguments[-1]
            end = contour_start if last is None else tuple(map(float, last))
            if end is None:
                continue
            segments.append(BoundarySegment(
                segment_id=segment_id,
                operation=operation,
                arguments=arguments,
                start_raw=current,
                end_raw=end,
                start=medial._transform(current, scale, BASELINE_Y),  # pylint: disable=protected-access
                end=medial._transform(end, scale, BASELINE_Y),  # pylint: disable=protected-access
            ))
            current = end
            segment_id += 1
            continue
        if operation == "closePath" and contour_start is not None:
            segments.append(BoundarySegment(
                segment_id=segment_id,
                operation=operation,
                arguments=arguments,
                start_raw=current,
                end_raw=contour_start,
                start=medial._transform(current, scale, BASELINE_Y),  # pylint: disable=protected-access
                end=medial._transform(contour_start, scale, BASELINE_Y),  # pylint: disable=protected-access
            ))
            current = None
            contour_start = None
            segment_id += 1
        elif operation == "endPath":
            current = None
            contour_start = None
            segment_id += 1
    return segments


def _strictly_contains_bounds(outer: Bounds, inner: Bounds) -> bool:
    return (
        outer[0] < inner[0] - AXIS_TOLERANCE
        and outer[1] < inner[1] - AXIS_TOLERANCE
        and outer[2] > inner[2] + AXIS_TOLERANCE
        and outer[3] > inner[3] + AXIS_TOLERANCE
    )


def _polygon_center(record: ContourRecord) -> Point:
    return (
        (record.bounds[0] + record.bounds[2]) / 2.0,
        (record.bounds[1] + record.bounds[3]) / 2.0,
    )


def _containment_parents(records: Sequence[ContourRecord]) -> Dict[int, int]:
    parents: Dict[int, int] = {}
    for inner in records:
        candidates = [
            outer
            for outer in records
            if outer.contour_id != inner.contour_id
            and _strictly_contains_bounds(outer.bounds, inner.bounds)
            and medial._winding_number(  # pylint: disable=protected-access
                _polygon_center(inner),
                outer.polygon,
            ) != 0
        ]
        if candidates:
            parent = min(
                candidates,
                key=lambda item: (
                    (item.bounds[2] - item.bounds[0]) * (item.bounds[3] - item.bounds[1]),
                    item.contour_id,
                ),
            )
            parents[inner.contour_id] = parent.contour_id
    return parents


def _hole_ids(
    selected_ids: Sequence[int],
    records_by_id: Dict[int, ContourRecord],
    parents: Dict[int, int],
) -> List[int]:
    selected = set(selected_ids)
    holes = []
    for contour_id in selected_ids:
        parent_id = parents.get(contour_id)
        if parent_id not in selected:
            continue
        parent = records_by_id[parent_id]
        child = records_by_id[contour_id]
        if parent.signed_area * child.signed_area < 0.0:
            holes.append(contour_id)
    return sorted(holes)


def _usable_medial_face(element: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    face = element.get("face")
    if not isinstance(face, dict) or face.get("status") != "candidate":
        return None
    evidence = face.get("evidence")
    if not isinstance(evidence, dict) or not isinstance(evidence.get("contourId"), int):
        return None
    value = face.get("value")
    if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        return None
    return face


def _medial_anchor_data(
    font: TTFont,
    character: str,
    medial_jamo: str,
    final_jamo: Optional[str],
    *,
    medial_observation: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Dict[str, Any]], set[int]]:
    if medial_observation is None:
        extracted = medial.extract_medial_character(font, character, medial_jamo, final_jamo)
    else:
        extracted = medial_observation
        # 기존 홀자 응답은 character, glyphName, elements만 가진다.
        # 요청 자모와 글자의 관계는 호출 추출기의 identity 계약에서 검증한다.
        if (
            extracted.get("character") != character
            or ("medialJamo" in extracted and extracted["medialJamo"] != medial_jamo)
            or ("finalJamo" in extracted and extracted["finalJamo"] != final_jamo)
            or extracted.get("glyphName") != (font.getBestCmap() or {}).get(ord(character))
        ):
            raise ValueError("공유 홀자 관측과 요청 글자의 identity가 다릅니다.")
    faces: Dict[str, Dict[str, Any]] = {}
    contour_ids: set[int] = set()
    for element in extracted["elements"]:
        face = _usable_medial_face(element)
        if face is None:
            continue
        anchor = dict(face)
        anchor["_componentSpans"] = list(element.get("componentSpans", ()))
        anchor["_visibleSpans"] = list(element.get("visibleSpans", {}).get("value", ()))
        faces[str(element["elementId"])] = anchor
        contour_ids.add(int(face["evidence"]["contourId"]))
    return faces, contour_ids


def _context(context_id: str) -> Dict[str, Any]:
    for value in contract.P0_CONTEXTS + contract.NO_FINAL_CONTEXTS + contract.FINAL_CONTEXTS:
        if value["id"] == context_id:
            return value
    raise ValueError("지원하지 않는 첫닿자 추출 문맥입니다.")


def _required_anchor_ids(context_id: str) -> Tuple[str, ...]:
    if context_id in contract.EXPANDED_NO_FINAL_CONTEXT_IDS:
        return tuple(spec.element_id for spec in medial.MEDIAL_ROLE_SPECS[_context(context_id)["medialJamo"]])
    if context_id in contract.EXPANDED_FINAL_CONTEXT_IDS:
        base_beam_role = _context(context_id).get("baseBeamRole")
        if base_beam_role is not None:
            # 혼합 홀자는 홀자별 실제 기준 가로획 역할로 앵커를 정한다. ㅢ는 baseStem이 없다.
            return (base_beam_role, "outerPillar")
    if context_id.startswith("right"):
        return ("outerPillar",)
    if context_id.startswith("bottom"):
        return ("primaryBeam",)
    return ("baseStem", "outerPillar")


def _anchors_ready(context_id: str, medial_faces: Dict[str, Dict[str, Any]]) -> bool:
    required = _required_anchor_ids(context_id)
    if any(anchor_id not in medial_faces for anchor_id in required):
        return False
    if context_id not in contract.EXPANDED_NO_FINAL_CONTEXT_IDS:
        return True
    for anchor_id in required:
        spans = medial_faces[anchor_id].get("_visibleSpans") or ()
        if not spans or any(
            not isinstance(span, dict)
            or not all(isinstance(span.get(side), (int, float)) and math.isfinite(span[side]) for side in ("from", "to"))
            or span["from"] >= span["to"]
            for span in spans
        ):
            return False
    return True


def _mixed_base_anchor(medial_faces: Dict[str, Dict[str, Any]], context_id: Optional[str] = None) -> Optional[float]:
    if context_id in contract.EXPANDED_NO_FINAL_CONTEXT_IDS:
        face = medial_faces.get(_context(context_id)["baseBeamRole"])
        return float(face["value"]) if face is not None else None
    if context_id is not None and context_id in contract.EXPANDED_FINAL_CONTEXT_IDS:
        base_beam_role = _context(context_id).get("baseBeamRole")
        if base_beam_role is not None:
            face = medial_faces.get(base_beam_role)
            return float(face["value"]) if face is not None else None
    lower_beam = medial_faces.get("lowerBeam")
    if lower_beam is not None:
        return float(lower_beam["value"])
    base_stem = medial_faces.get("baseStem")
    if base_stem is None:
        return None
    spans = base_stem.get("_componentSpans") or base_stem.get("_visibleSpans") or ()
    endpoints = [
        float(span["to"])
        for span in spans
        if isinstance(span, dict) and isinstance(span.get("to"), (int, float))
    ]
    return max(endpoints) if endpoints else None


def _outer_ids(
    contour_ids: Iterable[int],
    parents: Dict[int, int],
    records_by_id: Dict[int, ContourRecord],
) -> List[int]:
    selected = set(contour_ids)
    return sorted(
        contour_id
        for contour_id in selected
        if not (
            parents.get(contour_id) in selected
            and records_by_id[parents[contour_id]].signed_area
            * records_by_id[contour_id].signed_area
            < 0.0
        )
    )


def _upper_cluster_at_largest_gap(
    contour_ids: Sequence[int],
    records_by_id: Dict[int, ContourRecord],
    parents: Dict[int, int],
    structure: InitialStructureSpec,
    selected_bottom_limit: Optional[float] = None,
) -> Tuple[List[int], float]:
    outer_ids = _outer_ids(contour_ids, parents, records_by_id)
    intervals = sorted(
        (
            records_by_id[contour_id].bounds[1],
            records_by_id[contour_id].bounds[3],
            contour_id,
        )
        for contour_id in outer_ids
    )
    groups: List[Tuple[float, float, List[int]]] = []
    for top, bottom, contour_id in intervals:
        if groups and top <= groups[-1][1] + AXIS_TOLERANCE:
            groups[-1][1] = max(groups[-1][1], bottom)  # type: ignore[index]
            groups[-1][2].append(contour_id)
        else:
            groups.append([top, bottom, [contour_id]])  # type: ignore[arg-type]
    if len(groups) < 2:
        return [], 0.0
    options: List[Tuple[float, List[int]]] = []
    for split_index in range(len(groups) - 1):
        gap = float(groups[split_index + 1][0]) - float(groups[split_index][1])
        if gap <= AXIS_TOLERANCE:
            continue
        selected = {
            contour_id
            for group in groups[:split_index + 1]
            for contour_id in group[2]
        }
        changed = True
        while changed:
            changed = False
            for contour_id in contour_ids:
                if contour_id not in selected and parents.get(contour_id) in selected:
                    selected.add(contour_id)
                    changed = True
        holes = _hole_ids(sorted(selected), records_by_id, parents)
        outer = _outer_ids(sorted(selected), parents, records_by_id)
        if len(outer) < structure.minimum_outer_islands or len(holes) < structure.minimum_holes:
            continue
        if selected_bottom_limit is not None and max(
            records_by_id[contour_id].bounds[3] for contour_id in selected
        ) > selected_bottom_limit + PILLAR_BOTTOM_TOLERANCE:
            # 첫닿자 클러스터는 홀자 기둥 하단을 넘지 않는다.
            # 받침 위 획이 겹쳐 융합된 분할은 임의 절단하지 않고 포기한다.
            continue
        options.append((gap, sorted(selected)))
    if not options:
        return [], 0.0
    gap, selected_ids = max(options, key=lambda item: item[0])
    return selected_ids, gap


def _segment_orientation(a: Point, b: Point, c: Point) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _contact_point_on_segment(point: Point, start: Point, end: Point) -> bool:
    return (
        min(start[0], end[0]) - AXIS_TOLERANCE <= point[0] <= max(start[0], end[0]) + AXIS_TOLERANCE
        and min(start[1], end[1]) - AXIS_TOLERANCE <= point[1] <= max(start[1], end[1]) + AXIS_TOLERANCE
    )


def _segments_touch(a: Point, b: Point, c: Point, d: Point) -> bool:
    first = _segment_orientation(a, b, c)
    second = _segment_orientation(a, b, d)
    third = _segment_orientation(c, d, a)
    fourth = _segment_orientation(c, d, b)
    if (
        ((first > AXIS_TOLERANCE and second < -AXIS_TOLERANCE) or (first < -AXIS_TOLERANCE and second > AXIS_TOLERANCE))
        and ((third > AXIS_TOLERANCE and fourth < -AXIS_TOLERANCE) or (third < -AXIS_TOLERANCE and fourth > AXIS_TOLERANCE))
    ):
        return True
    return any(
        abs(orientation) <= AXIS_TOLERANCE and _contact_point_on_segment(point, start, end)
        for orientation, point, start, end in (
            (first, c, a, b), (second, d, a, b), (third, a, c, d), (fourth, b, c, d),
        )
    )


def _polygon_edge_pairs(polygon: Sequence[Point]) -> List[Tuple[Point, Point]]:
    points = list(polygon)
    if len(points) < 2:
        return []
    if points[0] != points[-1]:
        points.append(points[0])
    return list(zip(points, points[1:]))


def _records_contact(left: ContourRecord, right: ContourRecord) -> bool:
    """bbox 중첩은 접촉 증거가 아니다. 실제 윤곽 edge 교차·접점만 인정한다."""
    contact_tolerance = 1e-3
    if (
        left.bounds[2] < right.bounds[0] - contact_tolerance
        or right.bounds[2] < left.bounds[0] - contact_tolerance
        or left.bounds[3] < right.bounds[1] - contact_tolerance
        or right.bounds[3] < left.bounds[1] - contact_tolerance
    ):
        return False
    return any(
        _segments_touch(left_start, left_end, right_start, right_end)
        for left_start, left_end in _polygon_edge_pairs(left.polygon)
        for right_start, right_end in _polygon_edge_pairs(right.polygon)
    )


def _contact_component_fallback(
    contour_ids: Sequence[int],
    records_by_id: Dict[int, ContourRecord],
    parents: Dict[int, int],
    structure: InitialStructureSpec,
    selected_bottom_limit: Optional[float],
) -> Tuple[List[int], float]:
    """세로 구간이 겹쳐 병합된 경우의 확장 문맥 전용 fallback.

    실제 잉크 접촉으로 연결 성분을 만들고, 위에서부터 기둥 하단 한계 안에서
    구조가 증명되는 최대 성분 묶음을 첫닿자로 삼는다. 접촉으로 이어진 획은
    절단하지 않으며, 한계 안 유효 묶음이 없으면 그대로 포기한다.
    """
    if selected_bottom_limit is None:
        return [], 0.0
    outer_ids = _outer_ids(contour_ids, parents, records_by_id)
    roots = {value: value for value in outer_ids}

    def find(value: int) -> int:
        while roots[value] != value:
            roots[value] = roots[roots[value]]
            value = roots[value]
        return value

    for index, left in enumerate(outer_ids):
        for right in outer_ids[index + 1:]:
            if _records_contact(records_by_id[left], records_by_id[right]):
                roots[find(right)] = find(left)
    components: Dict[int, List[int]] = {}
    for value in outer_ids:
        components.setdefault(find(value), []).append(value)
    ordered = sorted(
        components.values(),
        key=lambda ids: min(records_by_id[contour_id].bounds[1] for contour_id in ids),
    )
    best: Tuple[List[int], float] = ([], 0.0)
    for count in range(1, len(ordered)):
        selected = {contour_id for component in ordered[:count] for contour_id in component}
        changed = True
        while changed:
            changed = False
            for contour_id in contour_ids:
                if contour_id not in selected and parents.get(contour_id) in selected:
                    selected.add(contour_id)
                    changed = True
        bottom = max(records_by_id[contour_id].bounds[3] for contour_id in selected)
        if bottom > selected_bottom_limit + PILLAR_BOTTOM_TOLERANCE:
            break
        holes = _hole_ids(sorted(selected), records_by_id, parents)
        outer = _outer_ids(sorted(selected), parents, records_by_id)
        if len(outer) < structure.minimum_outer_islands or len(holes) < structure.minimum_holes:
            continue
        leftover_top = min(
            records_by_id[contour_id].bounds[1]
            for component in ordered[count:]
            for contour_id in component
        )
        best = (sorted(selected), max(0.0, leftover_top - bottom))
    return best


def _select_component_ids(
    records: Sequence[ContourRecord],
    medial_faces: Dict[str, Dict[str, Any]],
    medial_contour_ids: set[int],
    context_id: str,
    has_final: bool,
    structure: InitialStructureSpec,
) -> Tuple[List[int], float]:
    records_by_id = {record.contour_id: record for record in records}
    parents = _containment_parents(records)
    non_medial = [
        record
        for record in records
        if record.contour_id not in medial_contour_ids
        and parents.get(record.contour_id) not in medial_contour_ids
    ]
    if context_id.startswith("right"):
        anchor = float(medial_faces["outerPillar"]["value"])
        eligible = [record.contour_id for record in non_medial if record.center_x < anchor]
        if not has_final:
            return sorted(eligible), min(
                (anchor - records_by_id[contour_id].bounds[2] for contour_id in eligible),
                default=0.0,
            )
        selected_bottom_limit = None
        if context_id in contract.EXPANDED_FINAL_CONTEXT_IDS:
            # 확장 받침 문맥은 기둥 하단 아래로 내려가는 첫닿자 후보를 거부한다.
            # 검증된 ㄱ받침 P0 경로의 선택은 바꾸지 않는다.
            spans = medial_faces["outerPillar"].get("_componentSpans") or medial_faces["outerPillar"].get("_visibleSpans") or ()
            endpoints = [
                float(span["to"])
                for span in spans
                if isinstance(span, dict) and isinstance(span.get("to"), (int, float))
            ]
            selected_bottom_limit = max(endpoints) if endpoints else None
        selected_ids, margin = _upper_cluster_at_largest_gap(
            eligible, records_by_id, parents, structure, selected_bottom_limit
        )
        if not selected_ids and selected_bottom_limit is not None:
            # 세로 구간 겹침으로 병합돼 유효 분할이 없을 때만 실제 잉크 접촉
            # 성분으로 재시도한다. 성공하던 기존 선택은 바꾸지 않는다.
            selected_ids, margin = _contact_component_fallback(
                eligible, records_by_id, parents, structure, selected_bottom_limit
            )
        return selected_ids, margin
    if context_id.startswith("bottom"):
        anchor = float(medial_faces["primaryBeam"]["value"])
        eligible = [record.contour_id for record in non_medial if record.center_y < anchor]
        return sorted(eligible), min(
            (anchor - records_by_id[contour_id].center_y for contour_id in eligible),
            default=0.0,
        )
    mixed_anchor = _mixed_base_anchor(medial_faces, context_id)
    if mixed_anchor is None:
        return [], 0.0
    base_anchor = mixed_anchor
    outer_anchor = float(medial_faces["outerPillar"]["value"])
    eligible = [
        record.contour_id
        for record in non_medial
        if record.center_y < base_anchor and record.center_x < outer_anchor
    ]
    return sorted(eligible), min(
        (
            min(base_anchor - records_by_id[contour_id].center_y, outer_anchor - records_by_id[contour_id].center_x)
            for contour_id in eligible
        ),
        default=0.0,
    )


def _same_point(left: Point, right: Point, tolerance: float = 1e-5) -> bool:
    return abs(left[0] - right[0]) <= tolerance and abs(left[1] - right[1]) <= tolerance


def _arc_between(
    segments: Sequence[BoundarySegment],
    start: Point,
    end: Point,
) -> List[BoundarySegment]:
    start_indices = [
        index for index, segment in enumerate(segments)
        if _same_point(segment.start_raw, start)
    ]
    for start_index in start_indices:
        arc: List[BoundarySegment] = []
        for offset in range(len(segments)):
            segment = segments[(start_index + offset) % len(segments)]
            arc.append(segment)
            if _same_point(segment.end_raw, end):
                return arc
    return []


def _arc_score(
    arc: Sequence[BoundarySegment],
    units_per_em: int,
    cut_y: float,
) -> Tuple[float, float]:
    scale = 1000.0 / units_per_em
    points: List[Point] = [arc[0].start] if arc else []
    for segment in arc:
        points.append(segment.end)
        points.extend(
            medial._transform(tuple(map(float, argument)), scale, BASELINE_Y)  # pylint: disable=protected-access
            for argument in segment.arguments
            if argument is not None and isinstance(argument, tuple) and len(argument) == 2
        )
    if not points:
        return 0.0, float("inf")
    upper_fraction = sum(point[1] <= cut_y + 2.0 for point in points) / len(points)
    average_y = sum(point[1] for point in points) / len(points)
    return upper_fraction, average_y


def _closed_arc_operations(arc: Sequence[BoundarySegment]) -> Tuple[RecordingOperation, ...]:
    if not arc:
        return ()
    operations: List[RecordingOperation] = [("moveTo", (arc[0].start_raw,))]
    for segment in arc:
        if segment.operation == "closePath":
            operations.append(("lineTo", (segment.end_raw,)))
        else:
            operations.append((segment.operation, segment.arguments))
    if not _same_point(arc[-1].end_raw, arc[0].start_raw):
        operations.append(("lineTo", (arc[0].start_raw,)))
    operations.append(("closePath", ()))
    return tuple(operations)


def _base_stem_initial_arc(
    record: ContourRecord,
    base_stem: Dict[str, Any],
    units_per_em: int,
) -> Optional[Tuple[Tuple[RecordingOperation, ...], set[int], float]]:
    spans = base_stem.get("_componentSpans") or base_stem.get("_visibleSpans") or ()
    ordered_spans = [
        (float(span["from"]), float(span["to"]))
        for span in spans
        if isinstance(span, dict)
        and isinstance(span.get("from"), (int, float))
        and isinstance(span.get("to"), (int, float))
    ]
    if not ordered_spans:
        return None
    cut_y = min(start for start, _ in ordered_spans)
    stem_end = max(end for _, end in ordered_spans)
    right_x = float(base_stem["value"])
    segments = _boundary_segments(record, units_per_em)
    verticals = []
    for segment in segments:
        if segment.operation != "lineTo" or abs(segment.start[0] - segment.end[0]) > AXIS_TOLERANCE:
            continue
        start_y = min(segment.start[1], segment.end[1])
        end_y = max(segment.start[1], segment.end[1])
        if abs(start_y - cut_y) <= 2.0 and end_y >= stem_end - 2.0:
            verticals.append((segment.start[0], start_y, end_y, segment))
    right_options = sorted(verticals, key=lambda item: abs(item[0] - right_x))
    if not right_options or abs(right_options[0][0] - right_x) > 2.0:
        return None
    right = right_options[0]
    left_options = [
        item
        for item in verticals
        if 20.0 <= right[0] - item[0] <= 200.0
    ]
    if not left_options:
        return None
    left = min(
        left_options,
        key=lambda item: (abs(item[2] - right[2]), right[0] - item[0]),
    )

    def upper_endpoint(segment: BoundarySegment) -> Point:
        return segment.start_raw if segment.start[1] <= segment.end[1] else segment.end_raw

    right_point = upper_endpoint(right[3])
    left_point = upper_endpoint(left[3])
    arcs = [
        _arc_between(segments, right_point, left_point),
        _arc_between(segments, left_point, right_point),
    ]
    scored = [
        (*_arc_score(arc, units_per_em, cut_y), arc)
        for arc in arcs
        if arc
    ]
    if not scored:
        return None
    upper_fraction, average_y, selected_arc = min(
        scored,
        key=lambda item: (-item[0], item[1]),
    )
    other_averages = [item[1] for item in scored if item[2] is not selected_arc]
    if upper_fraction < 0.55 or not other_averages:
        return None
    margin = max(0.0, min(other_averages) - average_y)
    return (
        _closed_arc_operations(selected_arc),
        {segment.segment_id for segment in selected_arc},
        margin,
    )


def _whole_contour_selection(
    selected_ids: Sequence[int],
    records_by_id: Dict[int, ContourRecord],
    parents: Dict[int, int],
    units_per_em: int,
    margin: float,
) -> ComponentSelection:
    contour_ids = sorted(selected_ids)
    return ComponentSelection(
        contour_ids=contour_ids,
        hole_contour_ids=_hole_ids(contour_ids, records_by_id, parents),
        operations_by_contour={
            contour_id: records_by_id[contour_id].operations
            for contour_id in contour_ids
        },
        segment_ids_by_contour={
            contour_id: {
                segment.segment_id
                for segment in _boundary_segments(records_by_id[contour_id], units_per_em)
            }
            for contour_id in contour_ids
        },
        selection_rule="context-directed-contour-islands",
        margin=margin,
    )


def _merged_boundary_selection(
    records: Sequence[ContourRecord],
    selected_ids: Sequence[int],
    medial_faces: Dict[str, Dict[str, Any]],
    structure: InitialStructureSpec,
    units_per_em: int,
    margin: float,
) -> Optional[ComponentSelection]:
    base_stem = medial_faces.get("baseStem")
    if base_stem is None:
        return None
    merged_id = int(base_stem["evidence"]["contourId"])
    records_by_id = {record.contour_id: record for record in records}
    merged = records_by_id.get(merged_id)
    if merged is None:
        return None
    cut = _base_stem_initial_arc(merged, base_stem, units_per_em)
    if cut is None:
        return None
    merged_operations, merged_segment_ids, cut_margin = cut
    parents = _containment_parents(records)
    candidate_ids = set(selected_ids)
    candidate_ids.add(merged_id)
    for record in records:
        if parents.get(record.contour_id) == merged_id:
            candidate_ids.add(record.contour_id)
    contour_ids = sorted(candidate_ids)
    holes = _hole_ids(contour_ids, records_by_id, parents)
    outer_ids = _outer_ids(contour_ids, parents, records_by_id)
    if len(outer_ids) < structure.minimum_outer_islands or len(holes) < structure.minimum_holes:
        return None
    operations = {
        contour_id: (
            merged_operations
            if contour_id == merged_id
            else records_by_id[contour_id].operations
        )
        for contour_id in contour_ids
    }
    segment_ids = {
        contour_id: (
            merged_segment_ids
            if contour_id == merged_id
            else {
                segment.segment_id
                for segment in _boundary_segments(records_by_id[contour_id], units_per_em)
            }
        )
        for contour_id in contour_ids
    }
    return ComponentSelection(
        contour_ids=contour_ids,
        hole_contour_ids=holes,
        operations_by_contour=operations,
        segment_ids_by_contour=segment_ids,
        selection_rule="context-directed-merged-boundary",
        margin=max(margin, cut_margin),
    )


def _has_structure(
    selection: ComponentSelection,
    structure: InitialStructureSpec,
    records_by_id: Dict[int, ContourRecord],
    parents: Dict[int, int],
) -> bool:
    outer_ids = _outer_ids(selection.contour_ids, parents, records_by_id)
    return (
        len(outer_ids) >= structure.minimum_outer_islands
        and len(selection.hole_contour_ids) >= structure.minimum_holes
    )


def _duplicate_medial_contours(
    records: Sequence[ContourRecord],
    medial_contour_ids: set[int],
) -> set[int]:
    """홀자 소유 윤곽과 좌표·면적이 같은 중복 윤곽도 홀자 몫으로 본다.

    Noto 껴처럼 모음 기둥이 동일한 윤곽 둘로 그려지면, 홀자 추출이 하나만
    evidence로 잡고 나머지 중복이 첫닿자로 샌다. bbox만 겹치는 다른 획을
    끌어오지 않도록 부호 있는 면적까지 같아야 중복으로 인정한다.
    """
    if not medial_contour_ids:
        return set(medial_contour_ids)
    records_by_id = {record.contour_id: record for record in records}
    medial_shapes = [
        (records_by_id[contour_id].bounds, records_by_id[contour_id].signed_area)
        for contour_id in medial_contour_ids
        if contour_id in records_by_id
    ]
    expanded = set(medial_contour_ids)
    for record in records:
        if record.contour_id in expanded:
            continue
        if any(
            abs(record.signed_area - area) <= 1.0
            and all(abs(a - b) <= 1e-3 for a, b in zip(record.bounds, bounds))
            for bounds, area in medial_shapes
        ):
            expanded.add(record.contour_id)
    return expanded


def _build_component_selection(
    records: Sequence[ContourRecord],
    medial_faces: Dict[str, Dict[str, Any]],
    medial_contour_ids: set[int],
    context_id: str,
    has_final: bool,
    structure: InitialStructureSpec,
    units_per_em: int,
) -> Optional[ComponentSelection]:
    records_by_id = {record.contour_id: record for record in records}
    parents = _containment_parents(records)
    medial_contour_ids = _duplicate_medial_contours(records, medial_contour_ids)
    selected_ids, margin = _select_component_ids(
        records,
        medial_faces,
        medial_contour_ids,
        context_id,
        has_final,
        structure,
    )
    selection = _whole_contour_selection(
        selected_ids,
        records_by_id,
        parents,
        units_per_em,
        margin,
    )
    if context_id in contract.EXPANDED_NO_FINAL_CONTEXT_IDS:
        selected = set(selection.contour_ids)
        # 확장 문맥은 모든 윤곽의 역할이 설명되는 분리형만 후보로 만든다.
        # 미배정 윤곽이나 홀자와 공유하는 윤곽을 임의 절단해 통과시키지 않는다.
        if (
            selected & medial_contour_ids
            or selected | medial_contour_ids != set(records_by_id)
            or not _has_structure(selection, structure, records_by_id, parents)
        ):
            return None
        return selection
    if context_id in contract.EXPANDED_FINAL_CONTEXT_IDS:
        selected = set(selection.contour_ids)
        leftover = set(records_by_id) - selected - medial_contour_ids
        # 확장 받침 문맥은 분리 증명이 있는 경우만 후보로 만든다.
        # 홀자와 공유하는 윤곽을 금지하고, 받침 몫 윤곽이 남아야 하며,
        # merged-boundary 절단 fallback은 검증된 ㄱ받침 P0 밖에서 쓰지 않는다.
        if (
            selected & medial_contour_ids
            or not leftover
            or not _has_structure(selection, structure, records_by_id, parents)
        ):
            return None
        return selection
    if _has_structure(selection, structure, records_by_id, parents):
        return selection
    if context_id.startswith("bottom") or context_id.startswith("mixed"):
        return _merged_boundary_selection(
            records,
            selected_ids,
            medial_faces,
            structure,
            units_per_em,
            margin,
        )
    return None


def _scaled_component_bounds(
    selection: ComponentSelection,
    units_per_em: int,
) -> Bounds:
    pen = BoundsPen(None)
    for contour_id in selection.contour_ids:
        _replay(selection.operations_by_contour[contour_id], pen)
    if pen.bounds is None:
        raise ValueError("선택된 첫닿 contour가 비었습니다.")
    x_min, y_min, x_max, y_max = pen.bounds
    scale = 1000.0 / units_per_em
    return (
        float(x_min) * scale,
        BASELINE_Y - float(y_max) * scale,
        float(x_max) * scale,
        BASELINE_Y - float(y_min) * scale,
    )


def _selected_path_sha256(
    selection: ComponentSelection,
) -> str:
    operations = [
        operation
        for contour_id in selection.contour_ids
        for operation in selection.operations_by_contour[contour_id]
    ]
    return _sha256_text(_path_commands(operations))


def selection_path_commands(selection: ComponentSelection) -> str:
    operations = [
        operation
        for contour_id in selection.contour_ids
        for operation in selection.operations_by_contour[contour_id]
    ]
    return _path_commands(operations)


def _observation_abstained(reason_code: str) -> Dict[str, Any]:
    return {
        "status": "abstained",
        "reasonCode": reason_code,
        "evidence": _common_evidence(),
    }


def _dependent_abstentions(reason_code: str) -> Dict[str, Any]:
    return {
        "componentGroup": _observation_abstained(reason_code),
        "inkBounds": {
            side: _observation_abstained(reason_code)
            for side in contract.BOUND_SIDES
        },
        "axisFaces": {
            side: _observation_abstained(reason_code)
            for side in contract.BOUND_SIDES
        },
        "roleFaces": {
            side: _observation_abstained(reason_code)
            for side in contract.BOUND_SIDES
        },
        "selectionArea": _observation_abstained(reason_code),
    }


def _probe_breakpoints(
    orientation: str,
    position: float,
    polygons: Sequence[Sequence[Point]],
) -> List[float]:
    return medial._probe_breakpoints(  # pylint: disable=protected-access
        orientation,
        position,
        polygons,
    )


def _directed_visible_spans(
    orientation: str,
    side: str,
    position: float,
    spans: Sequence[medial.Span],
    full_polygons: Sequence[Sequence[Point]],
    selected_polygons: Sequence[Sequence[Point]],
) -> List[medial.Span]:
    outside_positive = side in {"right", "bottom"}
    outside_position = position + (PROBE_OFFSET if outside_positive else -PROBE_OFFSET)
    inside_position = position - (PROBE_OFFSET if outside_positive else -PROBE_OFFSET)
    breakpoints = _probe_breakpoints(orientation, outside_position, full_polygons)
    breakpoints.extend(_probe_breakpoints(orientation, inside_position, selected_polygons))
    visible: List[medial.Span] = []
    for span in medial._merge_spans(spans):  # pylint: disable=protected-access
        cuts = [span.start, span.end]
        cuts.extend(value for value in breakpoints if span.start < value < span.end)
        ordered = sorted(set(round(value, 8) for value in cuts))
        for start, end in zip(ordered, ordered[1:]):
            along = (start + end) / 2.0
            outside = (outside_position, along) if orientation == "vertical" else (along, outside_position)
            inside = (inside_position, along) if orientation == "vertical" else (along, inside_position)
            if (
                not medial._is_filled(outside, full_polygons)  # pylint: disable=protected-access
                and medial._is_filled(inside, selected_polygons)  # pylint: disable=protected-access
            ):
                visible.append(medial.Span(start, end))
    return medial._merge_spans(  # pylint: disable=protected-access
        visible,
        tolerance=medial.FLATTEN_TOLERANCE,
    )


def _axis_faces(
    records: Sequence[ContourRecord],
    selection: ComponentSelection,
    units_per_em: int,
) -> Dict[str, Dict[str, Any]]:
    selected = set(selection.contour_ids)
    full_polygons = [record.polygon for record in records]
    scale = 1000.0 / units_per_em
    selected_operations = [
        operation
        for contour_id in selection.contour_ids
        for operation in selection.operations_by_contour[contour_id]
    ]
    selected_polygons = medial._flattened_contours(  # pylint: disable=protected-access
        selected_operations,
        scale,
        BASELINE_Y,
    )
    by_side: Dict[str, List[Dict[str, Any]]] = {side: [] for side in contract.BOUND_SIDES}
    for record in records:
        if record.contour_id not in selected:
            continue
        allowed_segment_ids = selection.segment_ids_by_contour[record.contour_id]
        groups: Dict[Tuple[str, float], List[Tuple[int, medial.Span]]] = {}
        for segment_id, start, end in medial._line_segments(  # pylint: disable=protected-access
            record.operations,
            scale,
            BASELINE_Y,
        ):
            if segment_id not in allowed_segment_ids:
                continue
            if abs(start[0] - end[0]) <= AXIS_TOLERANCE:
                key = ("vertical", round(start[0], 6))
                groups.setdefault(key, []).append((segment_id, medial.Span(start[1], end[1]).ordered()))
            elif abs(start[1] - end[1]) <= AXIS_TOLERANCE:
                key = ("horizontal", round(start[1], 6))
                groups.setdefault(key, []).append((segment_id, medial.Span(start[0], end[0]).ordered()))
        for (orientation, position), segment_spans in groups.items():
            sides = ("left", "right") if orientation == "vertical" else ("top", "bottom")
            component_spans = medial._merge_spans(  # pylint: disable=protected-access
                span for _, span in segment_spans
            )
            segment_ids = sorted(segment_id for segment_id, _ in segment_spans)
            for side in sides:
                visible = _directed_visible_spans(
                    orientation,
                    side,
                    position,
                    component_spans,
                    full_polygons,
                    selected_polygons,
                )
                if not visible:
                    continue
                by_side[side].append({
                    "orientation": orientation,
                    "side": side,
                    "value": _rounded(position),
                    "visibleSpans": [
                        {"from": _rounded(span.start), "to": _rounded(span.end)}
                        for span in visible
                    ],
                    "contourId": record.contour_id,
                    "segmentIds": segment_ids,
                })
    result: Dict[str, Dict[str, Any]] = {}
    for side in contract.BOUND_SIDES:
        values = sorted(
            by_side[side],
            key=lambda item: (item["value"], item["contourId"], item["segmentIds"]),
        )
        if not values:
            result[side] = _observation_abstained("no-axis-face")
            continue
        result[side] = {
            "status": "candidate",
            "value": values,
            "evidence": {
                **_common_evidence(),
                "method": "selected-component-axis-face-v1",
                "side": side,
            },
        }
    return result


def _role_face_candidate(
    side: str,
    value: float,
    role_class: str,
    selection_rule: str,
    source_side: str,
    source_values: Sequence[float],
    contour_ids: Sequence[int],
    segment_ids: Sequence[int],
    source_spans: Sequence[Dict[str, float]],
) -> Dict[str, Any]:
    return {
        "status": "candidate",
        "value": _rounded(value),
        "evidence": {
            **_common_evidence(),
            "method": contract.ROLE_FACE_METHOD,
            "side": side,
            "roleClass": role_class,
            "selectionRule": selection_rule,
            "sourceSide": source_side,
            "sourceValues": [_rounded(item) for item in source_values],
            "contourIds": sorted(set(contour_ids)),
            "segmentIds": sorted(set(segment_ids)),
            "sourceSpans": list(source_spans),
        },
    }


def _top_face_rows(axis_faces: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    observation = axis_faces["top"]
    if observation["status"] != "candidate":
        return []
    grouped: Dict[float, Dict[str, Any]] = {}
    for face in observation["value"]:
        value = float(face["value"])
        row = grouped.setdefault(value, {
            "value": value,
            "spans": [],
            "contourIds": [],
            "segmentIds": [],
        })
        row["spans"].extend(
            medial.Span(float(span["from"]), float(span["to"])).ordered()
            for span in face["visibleSpans"]
        )
        row["contourIds"].append(int(face["contourId"]))
        row["segmentIds"].extend(int(segment_id) for segment_id in face["segmentIds"])
    rows: List[Dict[str, Any]] = []
    for row in grouped.values():
        merged = medial._merge_spans(row["spans"])  # pylint: disable=protected-access
        rows.append({
            **row,
            "spans": merged,
            "length": sum(span.end - span.start for span in merged),
        })
    return sorted(rows, key=lambda row: row["value"])


def _role_faces(
    initial_jamo: str,
    selection: ComponentSelection,
    bounds: Dict[str, float],
    axis_faces: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    role_spec = contract.role_class_for(initial_jamo)
    role_class = str(role_spec["id"])
    horizontal_rule = str(role_spec["horizontalRule"])
    role_faces = {
        side: _role_face_candidate(
            side,
            bounds[side],
            role_class,
            "component-ink-extremum",
            side,
            [bounds[side]],
            selection.contour_ids,
            [],
            [],
        )
        for side in ("top", "bottom")
    }
    if horizontal_rule == "component-ink-extremum":
        for side in ("left", "right"):
            role_faces[side] = _role_face_candidate(
                side,
                bounds[side],
                role_class,
                horizontal_rule,
                side,
                [bounds[side]],
                selection.contour_ids,
                [],
                [],
            )
        return role_faces

    rows = _top_face_rows(axis_faces)
    if not rows:
        for side in ("left", "right"):
            role_faces[side] = _observation_abstained("role-face-unavailable")
        return role_faces
    if horizontal_rule == "first-main-horizontal-endpoint":
        selected_rows = [rows[0]]
    elif horizontal_rule == "paired-first-main-horizontal-endpoint":
        alignment_tolerance = max(2.0, (bounds["bottom"] - bounds["top"]) * 0.01)
        selected_rows = [
            candidate
            for candidate in rows
            if candidate["value"] - rows[0]["value"] <= alignment_tolerance
        ]
    elif horizontal_rule == "body-main-horizontal-endpoint":
        selected_rows = [max(rows, key=lambda item: (item["length"], -item["value"]))]
    else:
        raise ValueError("지원하지 않는 첫닿 역할 단면 규칙입니다.")

    source_values = [row["value"] for row in selected_rows]
    source_contour_ids = [
        contour_id
        for row in selected_rows
        for contour_id in row["contourIds"]
    ]
    source_segment_ids = [
        segment_id
        for row in selected_rows
        for segment_id in row["segmentIds"]
    ]
    selected_spans = [
        span
        for row in selected_rows
        for span in row["spans"]
    ]
    source_spans = [
        {"from": _rounded(span.start), "to": _rounded(span.end)}
        for span in selected_spans
    ]
    left = min(span.start for span in selected_spans)
    right = max(span.end for span in selected_spans)
    for side, value in (("left", left), ("right", right)):
        role_faces[side] = _role_face_candidate(
            side,
            value,
            role_class,
            horizontal_rule,
            "top",
            source_values,
            source_contour_ids,
            source_segment_ids,
            source_spans,
        )
    return role_faces


def _validate_identity(
    character: str,
    initial_jamo: str,
    medial_jamo: str,
    final_jamo: Optional[str],
    context_id: str,
) -> Dict[str, Any]:
    context_value = _context(context_id)
    composed = (
        contract.compose_no_final_syllable(initial_jamo, medial_jamo)
        if context_id in contract.EXPANDED_NO_FINAL_CONTEXT_IDS
        else contract.compose_syllable(initial_jamo, medial_jamo, final_jamo)
    )
    if (
        context_value["medialJamo"] != medial_jamo
        or context_value["finalJamo"] != final_jamo
        or composed != character
    ):
        raise ValueError("글자와 첫닿·홀자·받침·문맥 identity가 다릅니다.")
    return context_value


def resolve_component_selection(
    font: TTFont,
    character: str,
    initial_jamo: str,
    medial_jamo: str,
    final_jamo: Optional[str],
    context_id: str,
) -> Optional[ComponentSelection]:
    """Resolve diagnostic selected path without serializing glyph path data."""
    _validate_identity(character, initial_jamo, medial_jamo, final_jamo, context_id)
    glyph_name = (font.getBestCmap() or {}).get(ord(character))
    if glyph_name is None:
        return None
    glyph_set = font.getGlyphSet()
    recorder = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(recorder)
    units_per_em = int(font["head"].unitsPerEm)
    records = _contour_records(recorder.value, units_per_em)
    medial_faces, medial_contour_ids = _medial_anchor_data(
        font,
        character,
        medial_jamo,
        final_jamo,
    )
    if not _anchors_ready(context_id, medial_faces):
        return None
    return _build_component_selection(
        records,
        medial_faces,
        medial_contour_ids,
        context_id,
        final_jamo is not None,
        INITIAL_STRUCTURE_SPECS[initial_jamo],
        units_per_em,
    )


def extract_initial_character(
    font: TTFont,
    character: str,
    initial_jamo: str,
    medial_jamo: str,
    final_jamo: Optional[str],
    context_id: str,
    *,
    medial_observation: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Extract one P0 initial group from medial-bound glyph geometry."""
    context_value = _validate_identity(
        character,
        initial_jamo,
        medial_jamo,
        final_jamo,
        context_id,
    )
    structure = INITIAL_STRUCTURE_SPECS[initial_jamo]
    cmap = font.getBestCmap() or {}
    glyph_name = cmap.get(ord(character))
    shared = {
        "character": character,
        "initialJamo": initial_jamo,
        "medialJamo": medial_jamo,
        "finalJamo": final_jamo,
        "contextId": context_id,
    }
    if glyph_name is None:
        return {
            **shared,
            "status": "abstained",
            "reasonCode": "glyph-missing",
        }

    glyph_set = font.getGlyphSet()
    recorder = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(recorder)
    units_per_em = int(font["head"].unitsPerEm)
    if units_per_em <= 0:
        raise ValueError("font unitsPerEm이 양수가 아닙니다.")
    records = _contour_records(recorder.value, units_per_em)
    glyph_path = _glyph_path_commands(font, glyph_name)
    base = {
        **shared,
        "status": "candidate",
        "glyphName": glyph_name,
        "pathSha256": _sha256_text(glyph_path),
    }
    if context_id in contract.EXPANDED_NO_FINAL_CONTEXT_IDS:
        base["contextContractVersion"] = contract.NO_FINAL_CONTRACT_VERSION
        base["medialAnchorExtractorVersion"] = medial.API_EXTRACTOR_VERSION
    elif context_id in contract.EXPANDED_FINAL_CONTEXT_IDS:
        base["contextContractVersion"] = contract.FINAL_CONTEXT_CONTRACT_VERSION
        base["medialAnchorExtractorVersion"] = medial.API_EXTRACTOR_VERSION

    medial_faces, medial_contour_ids = _medial_anchor_data(
        font,
        character,
        medial_jamo,
        final_jamo,
        medial_observation=medial_observation,
    )
    if not _anchors_ready(context_id, medial_faces):
        return {**base, **_dependent_abstentions("medial-anchor-unavailable")}

    selection = _build_component_selection(
        records,
        medial_faces,
        medial_contour_ids,
        context_id,
        final_jamo is not None,
        structure,
        units_per_em,
    )
    if selection is None:
        reason = (
            "medial-anchor-role-conflict" if context_id in contract.EXPANDED_NO_FINAL_CONTEXT_IDS
            else "final-separation-unproven" if context_id in contract.EXPANDED_FINAL_CONTEXT_IDS
            else "merged-jamo-boundary" if medial_contour_ids else "ambiguous-component-group"
        )
        return {**base, **_dependent_abstentions(reason)}

    try:
        x_min, y_min, x_max, y_max = _scaled_component_bounds(
            selection,
            units_per_em,
        )
    except ValueError:
        return {**base, **_dependent_abstentions("invalid-component-bounds")}
    if not all(math.isfinite(value) for value in (x_min, y_min, x_max, y_max)) or not (
        x_min < x_max and y_min < y_max
    ):
        return {**base, **_dependent_abstentions("invalid-component-bounds")}

    bounds = {
        "top": _rounded(y_min),
        "bottom": _rounded(y_max),
        "left": _rounded(x_min),
        "right": _rounded(x_max),
    }
    contour_ids = selection.contour_ids
    score = max(0.0, min(1.0, 0.8 + max(0.0, selection.margin) / 1000.0))
    component_group = {
        "status": "candidate",
        "value": {
            "contourIds": contour_ids,
            "holeContourIds": selection.hole_contour_ids,
            "selectedPathSha256": _selected_path_sha256(selection),
        },
        "evidence": {
            **_common_evidence(),
            "method": contract.GROUPING_METHOD,
            "scanOrigin": context_value["scanOrigin"],
            "scanDirection": context_value["scanDirection"],
            "selectionRule": selection.selection_rule,
            "score": _rounded(score),
            "margin": _rounded(max(0.0, selection.margin)),
        },
    }
    ink_bounds = {
        side: {
            "status": "candidate",
            "value": value,
            "evidence": {
                **_common_evidence(),
                "method": contract.BOUND_METHOD,
                "side": side,
                "contourIds": contour_ids,
            },
        }
        for side, value in bounds.items()
    }
    axis_faces = _axis_faces(records, selection, units_per_em)
    role_faces = _role_faces(initial_jamo, selection, bounds, axis_faces)
    if any(role_faces[side]["status"] != "candidate" for side in contract.BOUND_SIDES):
        selection_area_observation = _observation_abstained("role-face-unavailable")
    else:
        role_values = {
            side: float(role_faces[side]["value"])
            for side in contract.BOUND_SIDES
        }
        selection_area = contract.selection_area_from_role_faces(role_values)
        selection_area_observation = {
            "status": "candidate",
            "value": {
                key: _rounded(value)
                for key, value in selection_area.items()
            },
            "evidence": {
                **_common_evidence(),
                "method": contract.SELECTION_AREA_METHOD,
                "derivedFrom": list(contract.BOUND_SIDES),
            },
        }
    return {
        **base,
        "componentGroup": component_group,
        "inkBounds": ink_bounds,
        "axisFaces": axis_faces,
        "roleFaces": role_faces,
        "selectionArea": selection_area_observation,
    }


def response_envelope(
    font_id: str,
    file_sha256: str,
    axes: Dict[str, float],
    cases: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "schema": contract.RESPONSE_SCHEMA,
        "apiVersion": "reference.v1",
        "extractorVersion": contract.EXTRACTOR_VERSION,
        "roleDefinitionVersion": contract.ROLE_DEFINITION_VERSION,
        "medialAnchorExtractorVersion": contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION,
        "coordinateFrame": contract.COORDINATE_FRAME,
        "matching": "medial-anchored-component-grouping",
        "font": {
            "id": font_id,
            "fileSha256": file_sha256,
            "axes": dict(axes),
        },
        "cases": list(cases),
    }


def response_for_cases(
    font: TTFont,
    font_id: str,
    file_sha256: str,
    axes: Dict[str, float],
    request_cases: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    cases = [
        extract_initial_character(
            font,
            str(case["character"]),
            str(case["initialJamo"]),
            str(case["medialJamo"]),
            case["finalJamo"],
            str(case["contextId"]),
        )
        for case in request_cases
    ]
    return response_envelope(font_id, file_sha256, axes, cases)


def generate_p0_response(
    font: TTFont,
    font_id: str,
    file_sha256: str,
    axes: Dict[str, float],
) -> Dict[str, Any]:
    return response_for_cases(
        font,
        font_id,
        file_sha256,
        axes,
        contract.p0_cases(),
    )


def generate_p0_response_from_path(
    font_path: Path,
    font_id: str,
    axes: Dict[str, float],
) -> Dict[str, Any]:
    actual_hash = _sha256_file(font_path)
    font = medial.load_font(font_path)
    try:
        return generate_p0_response(font, font_id, actual_hash, axes)
    finally:
        font.close()
