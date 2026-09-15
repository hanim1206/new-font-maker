#!/usr/bin/env python3
"""Evaluate Noto final-component G0 candidates and write visual review sheets."""

from __future__ import annotations

import argparse
import html
import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fontTools.pens.recordingPen import DecomposingRecordingPen

import final_component_contract as contract
import final_component_extractor as extractor
import initial_component_extractor as initial
import medial_guide_extractor as medial


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/noto-sans-kr.final-component-g0.v1.json"
ROLE_COLORS = {
    "top": "#dc2626",
    "bottom": "#ea580c",
    "left": "#2563eb",
    "right": "#7c3aed",
}
MEMBER_COLORS = {
    "only": "#111827",
    "left": "#0369a1",
    "right": "#c2410c",
}
TOLERANCE = 0.002


def _close(left: float, right: float) -> bool:
    return abs(float(left) - float(right)) <= TOLERANCE


def _forbidden_paths(value: Any, path: str = "$") -> Iterable[str]:
    if isinstance(value, dict):
        for key, item in value.items():
            child = "{}.{}".format(path, key)
            if key in contract.FORBIDDEN_CANDIDATE_KEYS:
                yield child
            yield from _forbidden_paths(item, child)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _forbidden_paths(item, "{}[{}]".format(path, index))


def _finite_numbers(value: Any) -> Iterable[float]:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield float(value)
    elif isinstance(value, dict):
        for item in value.values():
            yield from _finite_numbers(item)
    elif isinstance(value, list):
        for item in value:
            yield from _finite_numbers(item)


def _family(case: Dict[str, Any], role: str) -> Dict[str, str]:
    return {
        "role": role,
        "structureKind": str(case.get("structureKind") or contract.member_spec_for(case["identity"]["finalJamo"])["structureKind"]),
        "contextId": str(case["identity"]["contextId"]),
        "extractorVersion": contract.EXTRACTOR_VERSION,
    }


def _issue(case: Dict[str, Any], role: str, code: str) -> Dict[str, Any]:
    return {
        "character": case["identity"]["character"],
        "finalJamo": case["identity"]["finalJamo"],
        "code": code,
        "invalidationFamily": _family(case, role),
    }


def _outline_geometry(
    font: Any,
    case: Dict[str, Any],
) -> Tuple[int, Sequence[initial.ContourRecord], Dict[int, initial.ContourRecord]]:
    identity = case["identity"]
    glyph_name = (font.getBestCmap() or {}).get(identity["codepoint"])
    if glyph_name is None:
        raise ValueError("fixture candidate 글리프를 font에서 찾지 못했습니다.")
    glyph_set = font.getGlyphSet()
    recorder = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(recorder)
    units_per_em = int(font["head"].unitsPerEm)
    records = initial._contour_records(recorder.value, units_per_em)  # pylint: disable=protected-access
    return units_per_em, records, {record.contour_id: record for record in records}


def _geometry(font: Any, case: Dict[str, Any]) -> Tuple[int, Sequence[initial.ContourRecord], Dict[int, initial.ContourRecord], Dict[str, Dict[str, Any]], set[int]]:
    identity = case["identity"]
    units_per_em, records, records_by_id = _outline_geometry(font, case)
    medial_faces, medial_ids = initial._medial_anchor_data(  # pylint: disable=protected-access
        font,
        identity["character"],
        identity["medialJamo"],
        identity["finalJamo"],
    )
    return units_per_em, records, records_by_id, medial_faces, medial_ids


def _fragment_ids(member: Dict[str, Any]) -> set[int]:
    return {int(fragment["contourId"]) for fragment in member["boundaryFragments"]}


def _validate_refs(
    case: Dict[str, Any],
    refs: Sequence[Dict[str, Any]],
    ownership: Dict[int, str],
    segments: Dict[int, set[int]],
) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    for ref in refs:
        contour_id = int(ref["contourId"])
        if ownership.get(contour_id) != ref["memberId"]:
            issues.append(_issue(case, "provenance", "member-contour-ownership"))
        if int(ref["segmentId"]) not in segments.get(contour_id, set()):
            issues.append(_issue(case, "provenance", "segment-provenance"))
        if not 0.0 <= float(ref["from"]) < float(ref["to"]) <= 1.0:
            issues.append(_issue(case, "provenance", "segment-range"))
    return issues


def _validate_candidate(font: Any, case: Dict[str, Any]) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    identity = case["identity"]
    spec = contract.member_spec_for(identity["finalJamo"])
    units_per_em, records, records_by_id, medial_faces, _ = _geometry(font, case)
    medial_ids = extractor._validated_medial_contour_ids(  # pylint: disable=protected-access
        medial_faces,
        identity["contextId"],
        records,
    )
    selected = extractor._final_selection(  # pylint: disable=protected-access
        records,
        medial_ids,
        units_per_em,
    )
    if selected is None:
        return [_issue(case, "componentGroup", "group-not-reproducible")]
    expected_final, expected_initial = selected
    group_ids = set(case["componentGroup"]["value"]["contourIds"])
    if group_ids != set(expected_final.contour_ids):
        issues.append(_issue(case, "componentGroup", "group-contour-mismatch"))
    if group_ids & medial_ids:
        issues.append(_issue(case, "componentGroup", "medial-contamination"))
    if group_ids & set(expected_initial.contour_ids):
        issues.append(_issue(case, "componentGroup", "initial-contamination"))
    if not extractor._selected_below_initial(expected_final, expected_initial, units_per_em):  # pylint: disable=protected-access
        issues.append(_issue(case, "componentGroup", "role-order"))

    members = list(case["members"])
    expected_members = list(spec["members"])
    if [(member["id"], member["jamo"], member["role"]) for member in members] != [
        (member["id"], member["jamo"], member["role"])
        for member in expected_members
    ]:
        issues.append(_issue(case, "memberOrder", "member-order"))
        return issues

    ownership: Dict[int, str] = {}
    selections: List[Tuple[Dict[str, Any], initial.ComponentSelection]] = []
    for member_spec, member in zip(expected_members, members):
        contour_ids = _fragment_ids(member)
        if not contour_ids:
            issues.append(_issue(case, "provenance", "empty-member"))
            continue
        if any(contour_id in ownership for contour_id in contour_ids):
            issues.append(_issue(case, "provenance", "member-overlap"))
        ownership.update({contour_id: str(member["id"]) for contour_id in contour_ids})
        selections.append((member_spec, extractor._selection_for_ids(sorted(contour_ids), records, units_per_em)))  # pylint: disable=protected-access
    if set(ownership) != group_ids:
        issues.append(_issue(case, "provenance", "member-partition-incomplete"))

    available_segments = {
        contour_id: {
            segment.segment_id
            for segment in initial._boundary_segments(records_by_id[contour_id], units_per_em)  # pylint: disable=protected-access
        }
        for contour_id in group_ids
        if contour_id in records_by_id
    }
    for member in members:
        member_id = str(member["id"])
        for fragment in member["boundaryFragments"]:
            contour_id = int(fragment["contourId"])
            if ownership.get(contour_id) != member_id:
                issues.append(_issue(case, "provenance", "fragment-ownership"))
            if set(fragment["segmentIds"]) != available_segments.get(contour_id, set()):
                issues.append(_issue(case, "provenance", "fragment-segments-incomplete"))
            issues.extend(_validate_refs(case, [
                {"memberId": member_id, "contourId": contour_id, **item}
                for item in fragment["ranges"]
            ], ownership, available_segments))

    expected_bounds = extractor._bounds_dict(expected_final, units_per_em)  # pylint: disable=protected-access
    for side in contract.BOUND_SIDES:
        ink = case["inkBounds"][side]
        role = case["roleFaces"][side]
        if ink["status"] != "candidate" or not _close(ink["value"], expected_bounds[side]):
            issues.append(_issue(case, side, "ink-bound"))
        if role["status"] != "candidate" or not _close(role["value"], expected_bounds[side]):
            issues.append(_issue(case, side, "role-face-not-group-extremum"))
        if ink["status"] == "candidate":
            issues.extend(_validate_refs(case, ink["evidence"]["boundaryRefs"], ownership, available_segments))
        if role["status"] == "candidate":
            issues.extend(_validate_refs(case, role["evidence"]["boundaryRefs"], ownership, available_segments))
        axis = case["axisFaces"][side]
        if axis["status"] == "candidate":
            for face in axis["value"]:
                issues.extend(_validate_refs(case, face["boundaryRefs"], ownership, available_segments))

    expected_area = contract.selection_area_from_role_faces(expected_bounds)
    area = case["selectionArea"]
    if area["status"] != "candidate" or any(
        not _close(area["value"][key], expected_area[key])
        for key in ("x", "y", "width", "height")
    ):
        issues.append(_issue(case, "selectionArea", "selection-area-not-derived"))

    expected_relation = extractor._member_relation(selections, records_by_id, units_per_em)  # pylint: disable=protected-access
    if case["memberRelation"] != expected_relation:
        issues.append(_issue(case, "memberRelation", "member-relation-not-reproducible"))
    if len(members) == 2:
        relation = case["memberRelation"]
        if relation is None or relation["leftAnchorX"] >= relation["rightAnchorX"]:
            issues.append(_issue(case, "memberOrder", "left-right-direction"))
        elif relation["boundaryPairs"]:
            pair = relation["boundaryPairs"][0]
            issues.extend(_validate_refs(case, [pair["left"], pair["right"]], ownership, available_segments))

    expected_path_sha = initial._selected_path_sha256(expected_final)  # pylint: disable=protected-access
    if case["componentGroup"]["value"]["selectedPathSha256"] != expected_path_sha:
        issues.append(_issue(case, "componentGroup", "selected-path-sha"))
    return issues


def evaluate_response(
    font_path: Path,
    response: Dict[str, Any],
    stage_id: str = "G0",
) -> Dict[str, Any]:
    expected_cases = (
        contract.g2_cases()
        if stage_id in {"G2", "G3"}
        else contract.g0_cases()
    )
    expected_identity = [
        (case["character"], case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"])
        for case in expected_cases
    ]
    actual_identity = [
        (
            case["identity"]["character"],
            case["identity"]["initialJamo"],
            case["identity"]["medialJamo"],
            case["identity"]["finalJamo"],
            case["identity"]["contextId"],
        )
        for case in response["cases"]
    ]
    global_issues: List[str] = []
    expected_font_ids = {
        "G0": {medial.G0_FONT_ID},
        "G1": {medial.G4_FONT_ID},
        "G2": {medial.G0_FONT_ID, medial.G4_FONT_ID},
        "G3": {medial.DOTUM_FONT_ID},
    }.get(stage_id)
    if expected_font_ids is None:
        raise ValueError("지원하지 않는 받침 평가 단계입니다.")
    actual_font_sha = extractor._sha256_file(font_path)  # pylint: disable=protected-access
    if response["font"]["id"] not in expected_font_ids:
        global_issues.append("stage-font-id")
    if response["font"]["fileSha256"] != actual_font_sha:
        global_issues.append("font-sha")
    if any(
        case["identity"]["fontSha256"] != response["font"]["fileSha256"]
        or case["identity"]["axes"] != response["font"]["axes"]
        for case in response["cases"]
    ):
        global_issues.append("case-font-identity")
    if actual_identity != expected_identity:
        global_issues.append("stage-identity-order")
    forbidden = list(_forbidden_paths(response))
    if forbidden:
        global_issues.append("forbidden-candidate-keys")
    if any(not math.isfinite(value) for value in _finite_numbers(response)):
        global_issues.append("non-finite-number")

    issues: List[Dict[str, Any]] = []
    abstained_reason_counts: Dict[str, int] = {}
    font = medial.load_font(font_path)
    try:
        for case in response["cases"]:
            if case["state"] != "candidate":
                reason = str(case["reasonCode"])
                abstained_reason_counts[reason] = abstained_reason_counts.get(reason, 0) + 1
                continue
            issues.extend(_validate_candidate(font, case))
    finally:
        font.close()

    unique_families = {
        tuple(issue["invalidationFamily"][key] for key in contract.INVALIDATION_SCOPE)
        for issue in issues
    }
    return {
        "schema": "reference-final-component-{}-evaluation-v1".format(stage_id.lower()),
        "stage": stage_id,
        "candidateArtifactSchema": response["schema"],
        "candidateLifecycle": response["lifecycle"],
        "supportStatus": "candidate-only",
        "visualReviewStatus": "pending",
        "structuralCheckStatus": "pass" if not global_issues and not issues else "fail",
        "caseCount": len(response["cases"]),
        "candidateCount": sum(case["state"] == "candidate" for case in response["cases"]),
        "abstainedCount": sum(case["state"] == "abstained" for case in response["cases"]),
        "abstainedReasonCounts": abstained_reason_counts,
        "structureCounts": {
            kind["id"]: sum(case.get("structureKind") == kind["id"] for case in response["cases"])
            for kind in contract.STRUCTURE_KINDS
        },
        "relationCounts": {
            relation: sum(
                case.get("memberRelation", {}).get("relation") == relation
                if isinstance(case.get("memberRelation"), dict) else False
                for case in response["cases"]
            )
            for relation in contract.CONTACT_RELATIONS
        },
        "perInitial": {
            initial_jamo: {
                "caseCount": sum(case["identity"]["initialJamo"] == initial_jamo for case in response["cases"]),
                "candidateCount": sum(
                    case["identity"]["initialJamo"] == initial_jamo and case["state"] == "candidate"
                    for case in response["cases"]
                ),
                "abstainedCount": sum(
                    case["identity"]["initialJamo"] == initial_jamo and case["state"] == "abstained"
                    for case in response["cases"]
                ),
            }
            for initial_jamo in contract.INITIAL_JAMOS
        },
        "globalIssues": global_issues,
        "forbiddenPaths": forbidden,
        "issues": issues,
        "invalidatedFamilies": [
            dict(zip(contract.INVALIDATION_SCOPE, values))
            for values in sorted(unique_families)
        ],
    }


def _selection_path(records: Sequence[initial.ContourRecord], contour_ids: Sequence[int], units_per_em: int) -> str:
    selection = extractor._selection_for_ids(contour_ids, records, units_per_em)  # pylint: disable=protected-access
    return initial.selection_path_commands(selection)


def _axis_lines(case: Dict[str, Any]) -> str:
    lines: List[str] = []
    for side, observation in case["axisFaces"].items():
        if observation["status"] != "candidate":
            continue
        for face in observation["value"]:
            for span in face["visibleSpans"]:
                if face["orientation"] == "vertical":
                    points = (face["value"], span["from"], face["value"], span["to"])
                else:
                    points = (span["from"], face["value"], span["to"], face["value"])
                lines.append('<line x1="{}" y1="{}" x2="{}" y2="{}" stroke="{}" stroke-width="5" />'.format(*points, ROLE_COLORS[side]))
    return "".join(lines)


def _role_lines(case: Dict[str, Any]) -> str:
    area = case["selectionArea"]["value"]
    lines: List[str] = []
    for side, observation in case["roleFaces"].items():
        value = observation["value"]
        points = (
            (area["x"], value, area["x"] + area["width"], value)
            if side in {"top", "bottom"}
            else (value, area["y"], value, area["y"] + area["height"])
        )
        lines.append('<line x1="{}" y1="{}" x2="{}" y2="{}" stroke="#16a34a" stroke-width="4" stroke-dasharray="8 5" />'.format(*points))
    return "".join(lines)


def _card(font: Any, case: Dict[str, Any], view_box: str) -> str:
    identity = case["identity"]
    glyph_path = initial._glyph_path_commands(font, identity["glyphName"])  # pylint: disable=protected-access
    units_per_em = int(font["head"].unitsPerEm)
    screen_scale = 1000.0 / units_per_em
    screen_transform = "translate(0 {}) scale({} {})".format(
        initial.BASELINE_Y, screen_scale, -screen_scale
    )
    if case["state"] != "candidate":
        return '<article class="card bad"><svg viewBox="{}"><g class="glyph" transform="{}"><path d="{}" /></g></svg><b>{} · {}</b><small>{}</small></article>'.format(
            view_box, screen_transform, html.escape(glyph_path), identity["character"], identity["finalJamo"], case["reasonCode"]
        )
    _, records, _ = _outline_geometry(font, case)
    member_paths = []
    for member in case["members"]:
        path = _selection_path(records, sorted(_fragment_ids(member)), units_per_em)
        member_paths.append('<g transform="{}" fill="{}" fill-opacity=".9"><path d="{}" /></g>'.format(screen_transform, MEMBER_COLORS[member["id"]], html.escape(path)))
    area = case["selectionArea"]["value"]
    relation = case["memberRelation"]["relation"] if case["memberRelation"] else "single"
    return (
        '<article class="card"><svg viewBox="{}">'
        '<g class="glyph" transform="{}"><path d="{}" /></g>'
        '<rect class="area" x="{}" y="{}" width="{}" height="{}" />{}{}{}</svg>'
        '<b>{} · {} · {}</b><small>{} · {}</small></article>'
    ).format(
        view_box, screen_transform, html.escape(glyph_path), area["x"], area["y"], area["width"], area["height"],
        "".join(member_paths), _role_lines(case), _axis_lines(case),
        identity["character"], identity["finalJamo"], case["structureKind"], identity["contextId"], relation,
    )


def _review_view_box(font: Any, response: Dict[str, Any]) -> str:
    x_min = 0.0
    y_min = 0.0
    x_max = 1000.0
    y_max = 1000.0
    for case in response["cases"]:
        _, records, _ = _outline_geometry(font, case)
        for record in records:
            x_min = min(x_min, record.bounds[0])
            y_min = min(y_min, record.bounds[1])
            x_max = max(x_max, record.bounds[2])
            y_max = max(y_max, record.bounds[3])
    left = math.floor(x_min - 20.0) if x_min < 0.0 else 0
    top = math.floor(y_min - 20.0) if y_min < 0.0 else 0
    right = math.ceil(x_max + 20.0) if x_max > 1000.0 else 1000
    bottom = math.ceil(y_max + 20.0) if y_max > 1000.0 else 1000
    return "{} {} {} {}".format(left, top, right - left, bottom - top)


def contact_sheet_html(
    font_path: Path,
    response: Dict[str, Any],
    evaluation: Dict[str, Any],
    initial_jamo: Optional[str] = None,
) -> str:
    font = medial.load_font(font_path)
    try:
        selected_cases = [
            case
            for case in response["cases"]
            if initial_jamo is None or case["identity"]["initialJamo"] == initial_jamo
        ]
        view_box = _review_view_box(font, {**response, "cases": selected_cases})
        sections = []
        for context in contract.P0_CONTEXTS:
            cases = [case for case in selected_cases if case["identity"]["contextId"] == context["id"]]
            sections.append('<section><h2>{} · {}</h2><div class="grid">{}</div></section>'.format(
                context["id"], context["medialJamo"], "".join(_card(font, case, view_box) for case in cases)
            ))
    finally:
        font.close()
    return """<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>받침 {stage} 검토</title><style>
* {{ box-sizing:border-box }} body {{ margin:18px; font:13px -apple-system,BlinkMacSystemFont,sans-serif; color:#111827; background:#f8fafc }}
h1 {{ margin:0 0 4px; font-size:22px }} h2 {{ margin:16px 0 8px; font-size:16px }} p {{ margin:0; color:#475569 }}
.grid {{ display:grid; grid-template-columns:repeat(9, 150px); gap:8px }}.card {{ padding:6px; border:1px solid #cbd5e1; border-radius:8px; background:#fff }}
.card svg {{ width:136px; height:136px; display:block }}.glyph {{ fill:#d7dee8 }}.area {{ fill:#22c55e; fill-opacity:.12; stroke:#16a34a; stroke-width:3 }}
.card b,.card small {{ display:block; margin-top:2px }}.card small {{ font-size:9px; color:#64748b }}.bad {{ border-color:#dc2626 }}
</style></head><body><h1>{font_id} · 받침 {stage} · {initial_label}</h1>
<p>회색=전체 · 검정=단일 · 파랑=왼 구성원 · 주황=오른 구성원 · 초록 점선=받침군 전체 역할 단면/파생 영역 · 색 실선=선택 전 axisFaces<br>구조 검사={status} · 화면 검토=pending · 정확/지원 판정 아님</p>{sections}</body></html>""".format(
        status=html.escape(evaluation["structuralCheckStatus"]),
        stage=html.escape(evaluation["stage"]),
        font_id=html.escape(response["font"]["id"]),
        initial_label=html.escape(initial_jamo or "81자"),
        sections="".join(sections),
    )


def write_g2_contact_sheets(
    font_path: Path,
    response: Dict[str, Any],
    evaluation: Dict[str, Any],
    output_directory: Path,
) -> None:
    output_directory.mkdir(parents=True, exist_ok=True)
    links: List[str] = []
    for index, initial_jamo in enumerate(contract.INITIAL_JAMOS, start=1):
        file_name = "{:02d}-initial.html".format(index)
        (output_directory / file_name).write_text(
            contact_sheet_html(font_path, response, evaluation, initial_jamo),
            encoding="utf-8",
        )
        counts = evaluation["perInitial"][initial_jamo]
        links.append(
            '<li><a href="{}">{} · 후보 {} · 자동 포기 {}</a></li>'.format(
                file_name,
                html.escape(initial_jamo),
                counts["candidateCount"],
                counts["abstainedCount"],
            )
        )
    (output_directory / "index.html").write_text(
        """<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>받침 G2 검토</title><style>
body {{ margin:24px; font:16px -apple-system,BlinkMacSystemFont,sans-serif }} li {{ margin:8px 0 }}
</style></head><body><h1>{font_id} · G2 첫닿별 검토</h1><p>각 링크 81자. 후보는 자동 검증본 아님.</p><ol>{links}</ol></body></html>""".format(
            font_id=html.escape(response["font"]["id"]),
            links="".join(links),
        ),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate final-component candidates")
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, default=FIXTURE_PATH)
    parser.add_argument("--stage", choices=("G0", "G1", "G2", "G3"), default="G0")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--html", type=Path)
    parser.add_argument("--html-dir", type=Path)
    args = parser.parse_args()
    response = json.loads(args.fixture.read_text(encoding="utf-8"))
    evaluation = evaluate_response(args.font, response, args.stage)
    if args.report:
        args.report.write_text(json.dumps(evaluation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.html:
        args.html.write_text(contact_sheet_html(args.font, response, evaluation), encoding="utf-8")
    if args.html_dir:
        write_g2_contact_sheets(args.font, response, evaluation, args.html_dir)
    if not args.report and not args.html and not args.html_dir:
        print(json.dumps(evaluation, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
