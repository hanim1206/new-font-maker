#!/usr/bin/env python3
"""캐시된 원본 윤곽에서 역할 단위 획 속성을 측정하는 별도 패스.

추출 관측·검수·승인 기록은 읽기만 하고 바꾸지 않는다. 산출물은
corpus의 attributes/ 아래에 버전을 붙여 따로 저장한다. 측정 실패는
이유 코드로 남기고 임의 좌표로 채우지 않는다.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import initial_component_extractor as initial
import medial_guide_extractor as medial


SCHEMA = "noto-role-thickness-v1"
SAMPLE_RATIOS = (0.25, 0.5, 0.75)


def _tuple_operations(observation: Dict[str, Any]) -> List[Tuple[str, tuple]]:
    return [
        (item["operation"], tuple(tuple(argument) for argument in item["arguments"]))
        for item in observation["operations"]
    ]


def _ink_intervals(crossings: Sequence[float]) -> List[Tuple[float, float]]:
    ordered = sorted(crossings)
    return [
        (ordered[index], ordered[index + 1])
        for index in range(0, len(ordered) - 1, 2)
    ]


def _interval_containing(intervals: Sequence[Tuple[float, float]], point: float) -> Optional[Tuple[float, float]]:
    for start, end in intervals:
        if start - 1e-6 <= point <= end + 1e-6:
            return start, end
    return None


def measure_face_thickness(
    polygons: Sequence[Sequence[Tuple[float, float]]],
    orientation: str,
    face_side: str,
    face: float,
    span: Tuple[float, float],
) -> Optional[float]:
    """역할면에서 잉크 안쪽으로 1unit 들어간 지점의 수직 잉크 두께."""
    inside_offset = {"left": 1.0, "top": 1.0, "right": -1.0, "bottom": -1.0}[face_side]
    probe_point = face + inside_offset
    samples: List[float] = []
    for ratio in SAMPLE_RATIOS:
        position = span[0] + (span[1] - span[0]) * ratio
        # 세로면 두께는 가로 프로브(고정 y), 가로면 두께는 세로 프로브(고정 x)다.
        probe_orientation = "horizontal" if orientation == "vertical" else "vertical"
        crossings = medial._probe_breakpoints(  # pylint: disable=protected-access
            probe_orientation, position, polygons
        )
        interval = _interval_containing(_ink_intervals(crossings), probe_point)
        if interval is not None:
            samples.append(interval[1] - interval[0])
    if not samples:
        return None
    return statistics.median(samples)


def _component_summary(
    records: Sequence[Any],
    contour_ids: Sequence[int],
    selection_area: Dict[str, float],
) -> Dict[str, Any]:
    selected = set(contour_ids)
    # 구멍(반대 방향 윤곽)은 음수로 합산되도록 부호를 유지한다.
    ink_area = abs(sum(record.signed_area for record in records if record.contour_id in selected))
    box_area = selection_area["width"] * selection_area["height"] * 1_000_000.0
    return {
        "contourCount": len(contour_ids),
        "inkArea": round(ink_area, 1),
        "selectionBoxArea": round(box_area, 1),
        "inkCoverage": round(ink_area / box_area, 4) if box_area > 1e-6 else None,
    }


def measure_character(
    row: Dict[str, Any],
    outline_payload: Dict[str, Any],
    component_payloads: Dict[str, Optional[Dict[str, Any]]],
) -> Dict[str, Any]:
    observation = outline_payload["observation"]
    operations = _tuple_operations(observation)
    units_per_em = int(observation["unitsPerEm"])
    records = initial._contour_records(operations, units_per_em)  # pylint: disable=protected-access
    polygons = [record.polygon for record in records]
    result: Dict[str, Any] = {"medialRoles": {}, "components": {}}

    medial_stage = row["stages"]["medial"]
    if medial_stage["status"] == "candidate":
        for role_id, value in medial_stage["measurements"].items():
            span = value["visibleSpans"][0]
            thickness = measure_face_thickness(
                polygons,
                value["orientation"],
                value["faceSide"],
                value["face"] * 1000.0,
                (span["from"] * 1000.0, span["to"] * 1000.0),
            )
            result["medialRoles"][role_id] = {
                "orientation": value["orientation"],
                "faceSide": value["faceSide"],
                "thickness": None if thickness is None else round(thickness, 3),
                "reasonCode": None if thickness is not None else "no-ink-interval",
            }
    else:
        result["medialRoles"] = {"reasonCode": "medial-not-candidate"}

    for stage_name in ("initial", "final"):
        stage = row["stages"][stage_name]
        if stage["status"] != "candidate":
            result["components"][stage_name] = {"reasonCode": f"{stage_name}-not-candidate"}
            continue
        area = stage["measurements"].get("selectionArea")
        payload = component_payloads.get(stage_name)
        group = ((payload or {}).get("observation") or {}).get("componentGroup") or {}
        contour_ids = (group.get("value") or {}).get("contourIds")
        if area is None or not contour_ids:
            result["components"][stage_name] = {"reasonCode": "selection-evidence-missing"}
            continue
        result["components"][stage_name] = _component_summary(records, contour_ids, area)
    return result


def run(corpus_root: Path, report_name: str = "all.json") -> Dict[str, Any]:
    report_path = corpus_root / "reports" / report_name
    with report_path.open(encoding="utf-8") as source:
        report = json.load(source)
    started = time.monotonic()
    characters: Dict[str, Any] = {}
    failures = 0
    for row in report["cases"]:
        artifact = row["stages"]["outline"]["artifact"]
        with (corpus_root / artifact).open(encoding="utf-8") as source:
            outline_payload = json.load(source)["payload"]
        if outline_payload["status"] != "candidate":
            characters[row["identity"]["character"]] = {"reasonCode": "outline-unavailable"}
            failures += 1
            continue
        component_payloads: Dict[str, Optional[Dict[str, Any]]] = {}
        for stage_name in ("initial", "final"):
            if row["stages"][stage_name]["status"] != "candidate":
                component_payloads[stage_name] = None
                continue
            with (corpus_root / row["stages"][stage_name]["artifact"]).open(encoding="utf-8") as source:
                component_payloads[stage_name] = json.load(source)["payload"]
        characters[row["identity"]["character"]] = measure_character(row, outline_payload, component_payloads)
    roles_measured = sum(
        1
        for value in characters.values()
        for role in (value.get("medialRoles") or {}).values()
        if isinstance(role, dict) and role.get("thickness") is not None
    )
    result = {
        "schema": SCHEMA,
        "font": report["font"],
        "stageKeys": report["stageKeys"],
        "sourceReport": report_name,
        "measurementScale": "1000-unit",
        "meaning": "역할면 안쪽 1unit 지점의 수직 잉크 두께 표본 중앙값. 정확도 승인이 아니다.",
        "summary": {
            "characterCount": len(characters),
            "roleThicknessCount": roles_measured,
            "outlineUnavailableCount": failures,
            "elapsedSeconds": round(time.monotonic() - started, 3),
        },
        "characters": characters,
    }
    output_dir = corpus_root / "attributes"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "role-thickness-v1.json"
    with output_path.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    result["outputPath"] = str(output_path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="역할 단위 획 두께 측정 패스 (관측 불변)")
    parser.add_argument(
        "--corpus",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / ".reference-fonts/guide-corpus/251eae7645152d1705a55414",
    )
    parser.add_argument("--report", default="all.json")
    args = parser.parse_args()
    result = run(args.corpus, args.report)
    print(json.dumps({"summary": result["summary"], "outputPath": result["outputPath"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
