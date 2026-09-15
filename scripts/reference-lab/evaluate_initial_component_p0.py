#!/usr/bin/env python3
"""Generate fixed-font P0 initial component fixtures and review sheets."""

from __future__ import annotations

import argparse
import html
import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import initial_component_contract as contract
import initial_component_extractor as extractor
import medial_guide_extractor as medial


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = PROJECT_ROOT / "reference-data/font-catalog.v1.json"
LEGACY_NOTO_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/noto-sans-kr.v1.json"
FIXED_FONT_IDS = {"noto-sans-kr", "nanum-gothic"}
LEGACY_CONTEXT_BY_P0 = {
    "right": "initial-horizontal",
    "right-final": "initial-horizontal-final",
    "bottom": "initial-vertical",
    "bottom-final": "initial-vertical-final",
    "mixed": "initial-mixed",
    "mixed-final": "initial-mixed-final",
}
FACE_COLORS = {
    "top": "#dc2626",
    "bottom": "#ea580c",
    "left": "#2563eb",
    "right": "#7c3aed",
}


def _catalog_record(font_path: Path) -> Dict[str, Any]:
    with CATALOG_PATH.open(encoding="utf-8") as source:
        catalog = json.load(source)
    actual_hash = extractor._sha256_file(font_path)  # pylint: disable=protected-access
    matching = [
        record
        for record in catalog["fonts"]
        if record["id"] in FIXED_FONT_IDS and record["fileSha256"] == actual_hash
    ]
    if len(matching) != 1:
        raise ValueError("P0는 catalog의 고정 Noto Sans KR·나눔고딕 SHA만 지원합니다.")
    return matching[0]


def finite_numbers(value: Any) -> Iterable[float]:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield float(value)
        return
    if isinstance(value, dict):
        for item in value.values():
            yield from finite_numbers(item)
        return
    if isinstance(value, list):
        for item in value:
            yield from finite_numbers(item)


def _rate(cases: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    candidate_count = sum(
        case["status"] == "candidate"
        and case["componentGroup"]["status"] == "candidate"
        and case["selectionArea"]["status"] == "candidate"
        for case in cases
    )
    return {
        "caseCount": len(cases),
        "usableAreaCount": candidate_count,
        "usableAreaRate": round(candidate_count / len(cases), 4) if cases else 0.0,
    }


def compare_noto_legacy_top_bottom(response: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if response["font"]["id"] != "noto-sans-kr":
        return None
    with LEGACY_NOTO_PATH.open(encoding="utf-8") as source:
        legacy = json.load(source)
    if response["font"]["fileSha256"] != legacy["font"]["fileSha256"]:
        raise ValueError("레거시 비교 대상 Noto SHA가 다릅니다.")
    context_order = [str(item["id"]) for item in legacy["contextOrder"]]
    deltas: List[float] = []
    for case in response["cases"]:
        legacy_context_id = LEGACY_CONTEXT_BY_P0[case["contextId"]]
        context_index = context_order.index(legacy_context_id)
        guide_order = legacy["contextOrder"][context_index]["guideOrder"]
        guide_values = legacy["values"][case["initialJamo"]][context_index]
        legacy_values = dict(zip(guide_order, guide_values))
        deltas.extend([
            abs(case["roleFaces"]["top"]["value"] - legacy_values["initialTop"]),
            abs(case["roleFaces"]["bottom"]["value"] - legacy_values["initialBottom"]),
        ])
    return {
        "comparisonOnly": True,
        "valueCount": len(deltas),
        "maximumDelta": round(max(deltas), 4),
        "rmse": round(math.sqrt(sum(delta * delta for delta in deltas) / len(deltas)), 4),
    }


def summarize(response: Dict[str, Any]) -> Dict[str, Any]:
    cases = response["cases"]
    reasons: Dict[str, int] = {}
    for case in cases:
        if case["status"] == "abstained":
            reason = str(case["reasonCode"])
        elif case["componentGroup"]["status"] == "abstained":
            reason = str(case["componentGroup"]["reasonCode"])
        else:
            continue
        reasons[reason] = reasons.get(reason, 0) + 1
    by_class = {
        class_id: _rate([
            case
            for case in cases
            if extractor.INITIAL_STRUCTURE_SPECS[case["initialJamo"]].class_id == class_id
        ])
        for class_id in sorted({
            spec.class_id for spec in extractor.INITIAL_STRUCTURE_SPECS.values()
        })
    }
    by_context = {
        str(context["id"]): _rate([
            case for case in cases if case["contextId"] == context["id"]
        ])
        for context in contract.P0_CONTEXTS
    }
    return {
        "caseCount": len(cases),
        "glyphMissingCount": sum(case["status"] == "abstained" for case in cases),
        "componentCandidateCount": sum(
            case["status"] == "candidate" and case["componentGroup"]["status"] == "candidate"
            for case in cases
        ),
        "selectionAreaCandidateCount": sum(
            case["status"] == "candidate" and case["selectionArea"]["status"] == "candidate"
            for case in cases
        ),
        "axisFaceCandidateCount": sum(
            face["status"] == "candidate"
            for case in cases
            if case["status"] == "candidate"
            for face in case["axisFaces"].values()
        ),
        "roleFaceCandidateCount": sum(
            face["status"] == "candidate"
            for case in cases
            if case["status"] == "candidate"
            for face in case["roleFaces"].values()
        ),
        "abstainedReasonCounts": reasons,
        "perStructureClass": by_class,
        "perContext": by_context,
        "invalidNumberCount": sum(
            not math.isfinite(value) for value in finite_numbers(response)
        ),
        "legacyTopBottomComparison": compare_noto_legacy_top_bottom(response),
    }


def evaluate(font_path: Path) -> Dict[str, Any]:
    record = _catalog_record(font_path)
    response = extractor.generate_p0_response_from_path(
        font_path,
        str(record["id"]),
        {str(key): float(value) for key, value in record["axes"].items()},
    )
    return {
        "response": response,
        "summary": summarize(response),
    }


def _selected_path(font: Any, case: Dict[str, Any]) -> str:
    selection = extractor.resolve_component_selection(
        font,
        case["character"],
        case["initialJamo"],
        case["medialJamo"],
        case["finalJamo"],
        case["contextId"],
    )
    if selection is None:
        raise ValueError("candidate의 선택 path를 재현하지 못했습니다.")
    return extractor.selection_path_commands(selection)


def _face_lines(case: Dict[str, Any]) -> str:
    lines: List[str] = []
    for side, observation in case["axisFaces"].items():
        if observation["status"] != "candidate":
            continue
        color = FACE_COLORS[side]
        for face in observation["value"]:
            for span in face["visibleSpans"]:
                if face["orientation"] == "vertical":
                    points = (face["value"], span["from"], face["value"], span["to"])
                else:
                    points = (span["from"], face["value"], span["to"], face["value"])
                lines.append(
                    '<line x1="{}" y1="{}" x2="{}" y2="{}" stroke="{}" stroke-width="7" />'.format(
                        *points,
                        color,
                    )
                )
    return "".join(lines)


def _role_face_lines(case: Dict[str, Any]) -> str:
    area = case["selectionArea"]["value"]
    lines: List[str] = []
    for side, observation in case["roleFaces"].items():
        if observation["status"] != "candidate":
            continue
        value = observation["value"]
        if side in {"top", "bottom"}:
            points = (area["x"], value, area["x"] + area["width"], value)
        else:
            points = (value, area["y"], value, area["y"] + area["height"])
        lines.append(
            '<line x1="{}" y1="{}" x2="{}" y2="{}" stroke="#16a34a" stroke-width="5" stroke-dasharray="8 5" />'.format(
                *points,
            )
        )
    return "".join(lines)


def _card(font: Any, case: Dict[str, Any]) -> str:
    label = "{} · {} · {}".format(
        case["character"],
        case["initialJamo"],
        case["contextId"],
    )
    glyph_path = extractor._glyph_path_commands(  # pylint: disable=protected-access
        font,
        case["glyphName"],
    )
    if case["componentGroup"]["status"] != "candidate":
        return (
            '<article class="card abstained"><svg viewBox="0 0 1000 1000">'
            '<g transform="translate(0 880) scale(1 -1)"><path d="{}" /></g>'
            '</svg><strong>{}</strong><small>{}</small></article>'
        ).format(
            html.escape(glyph_path),
            html.escape(label),
            html.escape(case["componentGroup"]["reasonCode"]),
        )
    group = case["componentGroup"]["value"]
    selected_path = _selected_path(font, case)
    area = case["selectionArea"]["value"]
    return (
        '<article class="card"><svg viewBox="0 0 1000 1000">'
        '<g class="glyph" transform="translate(0 880) scale(1 -1)"><path d="{}" /></g>'
        '<rect class="area" x="{}" y="{}" width="{}" height="{}" />'
        '<g class="selected" transform="translate(0 880) scale(1 -1)"><path d="{}" /></g>'
        '{}{}'
        '</svg><strong>{}</strong><small>contours {} · holes {}</small></article>'
    ).format(
        html.escape(glyph_path),
        area["x"],
        area["y"],
        area["width"],
        area["height"],
        html.escape(selected_path),
        _role_face_lines(case),
        _face_lines(case),
        html.escape(label),
        html.escape(str(group["contourIds"])),
        html.escape(str(group["holeContourIds"])),
    )


def contact_sheet_html(
    font_path: Path,
    response: Dict[str, Any],
    structure_class: str,
) -> str:
    font = medial.load_font(font_path)
    try:
        cases = [
            case
            for case in response["cases"]
            if extractor.INITIAL_STRUCTURE_SPECS[case["initialJamo"]].class_id == structure_class
        ]
        cards = "".join(_card(font, case) for case in cases)
    finally:
        font.close()
    return """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>{title}</title><style>
* {{ box-sizing: border-box; }}
body {{ margin: 24px; font: 14px -apple-system, BlinkMacSystemFont, sans-serif; color: #111827; background: #f8fafc; }}
h1 {{ margin: 0 0 8px; font-size: 22px; }}
.legend {{ margin-bottom: 20px; color: #475569; }}
.grid {{ display: grid; grid-template-columns: repeat(6, 190px); gap: 12px; }}
.card {{ padding: 8px; border: 1px solid #cbd5e1; border-radius: 10px; background: white; }}
.card svg {{ display: block; width: 172px; height: 172px; background: #fff; }}
.glyph {{ fill: #d7dee8; }}
.area {{ fill: #22c55e; fill-opacity: .17; stroke: #16a34a; stroke-width: 5; }}
.selected {{ fill: #111827; fill-opacity: .82; }}
.card strong, .card small {{ display: block; margin-top: 4px; }}
.card small {{ min-height: 30px; color: #64748b; font-size: 10px; overflow-wrap: anywhere; }}
.abstained {{ border-color: #ef4444; }}
.abstained .glyph {{ fill: #fecaca; }}
</style></head><body>
<h1>{title}</h1>
<div class="legend">회색=전체 글자 · 검정=선택 첫닿 · 초록=네 역할 단면과 파생 영역 · 빨강/주황/파랑/보라=선택 전 top/bottom/left/right 축평행 면 후보</div>
<main class="grid">{cards}</main></body></html>
""".format(
        title=html.escape("{} · {}".format(response["font"]["id"], structure_class)),
        cards=cards,
    )


def write_contact_sheets(
    font_path: Path,
    response: Dict[str, Any],
    output_directory: Path,
) -> List[Path]:
    output_directory.mkdir(parents=True, exist_ok=True)
    paths = []
    class_ids = sorted({spec.class_id for spec in extractor.INITIAL_STRUCTURE_SPECS.values()})
    for index, class_id in enumerate(class_ids, start=1):
        output_path = output_directory / "{:02d}-{}.html".format(index, class_id)
        output_path.write_text(
            contact_sheet_html(font_path, response, class_id),
            encoding="utf-8",
        )
        paths.append(output_path)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate P0 initial component extraction")
    parser.add_argument("font", type=Path)
    parser.add_argument("--json", type=Path)
    parser.add_argument("--html-dir", type=Path)
    args = parser.parse_args()
    font_path = args.font.resolve()
    result = evaluate(font_path)
    if args.json:
        args.json.resolve().write_text(
            json.dumps(result["response"], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    if args.html_dir:
        write_contact_sheets(font_path, result["response"], args.html_dir.resolve())
    if not args.json and not args.html_dir:
        print(json.dumps(result["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
