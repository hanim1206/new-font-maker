#!/usr/bin/env python3
"""캐시된 원본 윤곽에서 역할면의 곡률(면 굽음)을 재는 속성 v2 패스.

두께 v1과 같은 원칙: 재추출 없이 관측 캐시만 읽고, 산출물은 analysis/ 아래
버전을 붙여 따로 저장하며, 잴 수 없으면 값을 만들지 않고 이유를 남긴다.

v2 첫 컷은 홀자 역할면의 굽음만 잰다. 역할면은 단일 획의 한 면이라 굽음이
곧 그 획의 직선/곡선 성격이다. 첫닿자·끝닿자의 네 변은 여러 획을 감싼
경계 극값이라 획 곡률로 해석되지 않아 제외한다. 접합·획끝은 코너 검출이
필요해 다음 버전으로 둔다.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import initial_component_extractor as initial
import medial_guide_extractor as medial


SCHEMA = "noto-role-geometry-v1"
SAMPLE_COUNT = 7
Point = Tuple[float, float]


def _tuple_operations(observation: Dict[str, Any]) -> List[Tuple[str, tuple]]:
    return [
        (item["operation"], tuple(tuple(argument) if argument is not None else None for argument in item["arguments"]))
        for item in observation["operations"]
    ]


def _nearest_crossing(crossings: Sequence[float], face: float) -> Optional[float]:
    if not crossings:
        return None
    return min(crossings, key=lambda value: abs(value - face))


def face_bow(polygon: Sequence[Point], orientation: str, face: float, span: Tuple[float, float]) -> Optional[float]:
    """역할면의 가시 구간을 따라 실제 경계면 좌표가 직선에서 얼마나 벗어나는지."""
    low, high = sorted(span)
    if high - low < 20.0:
        return None
    # 세로면(x=face)은 구간을 따라 y를 훑으며 수평 프로브로 경계 x를, 가로면은 그 반대.
    probe_orientation = "horizontal" if orientation == "vertical" else "vertical"
    edges: List[float] = []
    for index in range(1, SAMPLE_COUNT + 1):
        position = low + (high - low) * index / (SAMPLE_COUNT + 1)
        crossing = _nearest_crossing(medial._probe_breakpoints(probe_orientation, position, [polygon]), face)  # pylint: disable=protected-access
        if crossing is not None and abs(crossing - face) <= 40.0:
            edges.append(crossing)
    if len(edges) < 3:
        return None
    return max(edges) - min(edges)


def _face_line_segments(record: Any, orientation: str, face: float, units_per_em: int) -> Tuple[int, int]:
    """면 위에 놓인 경계 세그먼트 중 곡선 수와 전체 수. 좌표는 raw."""
    axis = 0 if orientation == "vertical" else 1
    total = 0
    curved = 0
    for segment in initial._boundary_segments(record, units_per_em):  # pylint: disable=protected-access
        start_on = abs(segment.start_raw[axis] - face) <= 1.0
        end_on = abs(segment.end_raw[axis] - face) <= 1.0
        if start_on and end_on:
            total += 1
            if segment.operation in ("curveTo", "qCurveTo"):
                curved += 1
    return curved, total


def measure_character(row: Dict[str, Any], outline_payload: Dict[str, Any], medial_payload: Optional[Dict[str, Any]], units_per_em: int) -> Dict[str, Any]:
    if row["stages"]["medial"]["status"] != "candidate" or medial_payload is None:
        return {"reasonCode": "medial-not-candidate"}
    observation = medial_payload["observation"]
    operations = _tuple_operations(outline_payload["observation"])
    records = {record.contour_id: record for record in initial._contour_records(operations, units_per_em)}  # pylint: disable=protected-access
    roles: Dict[str, Any] = {}
    for element in observation.get("elements", ()):
        face_field = element.get("face") or {}
        evidence = face_field.get("evidence") or {}
        contour_id = evidence.get("contourId")
        spans = (element.get("visibleSpans") or {}).get("value") or []
        if face_field.get("status") != "candidate" or contour_id not in records or not spans:
            roles[element["elementId"]] = {"reasonCode": "face-not-usable"}
            continue
        polygon = records[contour_id].polygon
        face = float(face_field["value"])
        orientation = element["orientation"]
        bows = [bow for span in spans if (bow := face_bow(polygon, orientation, face, (float(span["from"]), float(span["to"])))) is not None]
        curved, total = _face_line_segments(records[contour_id], orientation, face, units_per_em)
        roles[element["elementId"]] = {
            "orientation": orientation,
            "bow": round(max(bows), 3) if bows else None,
            "bowReason": None if bows else "no-measurable-span",
            "curvedSegments": curved,
            "faceSegments": total,
        }
    return {"medialRoles": roles}


def run(corpus_root: Path, report_name: str = "all.json") -> Dict[str, Any]:
    with (corpus_root / "reports" / report_name).open(encoding="utf-8") as source:
        report = json.load(source)
    started = time.monotonic()
    units_per_em = int(report["font"]["unitsPerEm"])
    characters: Dict[str, Any] = {}
    bows_by_role: Dict[str, List[float]] = {}
    curved_faces = 0
    measured = 0
    for row in report["cases"]:
        with (corpus_root / row["stages"]["outline"]["artifact"]).open(encoding="utf-8") as source:
            outline_payload = json.load(source)["payload"]
        if outline_payload["status"] != "candidate":
            characters[row["identity"]["character"]] = {"reasonCode": "outline-unavailable"}
            continue
        medial_payload = None
        if row["stages"]["medial"]["status"] == "candidate":
            with (corpus_root / row["stages"]["medial"]["artifact"]).open(encoding="utf-8") as source:
                medial_payload = json.load(source)["payload"]
        result = measure_character(row, outline_payload, medial_payload, units_per_em)
        characters[row["identity"]["character"]] = result
        for role_id, role in (result.get("medialRoles") or {}).items():
            if isinstance(role, dict) and role.get("bow") is not None:
                bows_by_role.setdefault(role_id, []).append(role["bow"])
                measured += 1
                if role["curvedSegments"] > 0:
                    curved_faces += 1
    result = {
        "schema": SCHEMA,
        "font": report["font"],
        "stageKeys": report["stageKeys"],
        "sourceReport": report_name,
        "measurementScale": "1000-unit",
        "meaning": (
            "홀자 역할면의 굽음(가시 구간을 따라 경계면 좌표가 직선에서 벗어난 폭)과 "
            "면 위 곡선 세그먼트 수. 고딕은 대체로 0에 가깝다. 정확도 승인이 아니다. "
            "첫닿자·끝닿자 네 변은 경계 극값이라 획 곡률로 잴 수 없어 제외한다."
        ),
        "summary": {
            "characterCount": len(characters),
            "measuredFaceCount": measured,
            "curvedFaceCount": curved_faces,
            "bowMedianByRole": {role_id: round(statistics.median(values), 3) for role_id, values in sorted(bows_by_role.items())},
            "bowP95ByRole": {role_id: round(sorted(values)[min(len(values) - 1, int(0.95 * (len(values) - 1)))], 3) for role_id, values in sorted(bows_by_role.items())},
            "elapsedSeconds": round(time.monotonic() - started, 3),
        },
        "characters": characters,
    }
    output_dir = corpus_root / "analysis"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "role-geometry-v1.json"
    with output_path.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    result["outputPath"] = str(output_path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="역할면 곡률 측정 패스 v2 (관측 불변)")
    parser.add_argument("--corpus", type=Path, default=Path(__file__).resolve().parents[2] / ".reference-fonts/guide-corpus/251eae7645152d1705a55414")
    parser.add_argument("--report", default="all.json")
    args = parser.parse_args()
    result = run(args.corpus, args.report)
    print(json.dumps({"summary": result["summary"], "outputPath": result["outputPath"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
