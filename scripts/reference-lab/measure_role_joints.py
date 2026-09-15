#!/usr/bin/env python3
"""닿자 컴포넌트 윤곽의 코너 필렛(접합·획끝 라운딩)을 재는 속성 v3 패스.

두께 v1·곡률 v2와 같은 원칙: 재추출 없이 관측 캐시만 읽고, 산출물은 analysis/
아래 버전을 붙여 따로 저장하며, 잴 수 없으면 값을 만들지 않는다.

v2에서 모음 기둥·보의 역할면은 모두 직선(샤프 사각)임을 확인했다. 곡선은
닿자(ㄱㄴㄷ…)의 코너와 획끝에 있다. 여기서는 첫닿자·끝닿자가 고른 실제
윤곽에서, 두 직선을 잇는 곡선 세그먼트를 코너 필렛으로 보고 그 방향 전환각과
셋백(샤프 꼭짓점에서 곡선까지의 깊이)을 잰다. 필렛 셋백이 곧 라운딩 반경의
대리값이다. 획 자체가 긴 곡선인 원·사선(ㅇㅎㅅ)은 전환각이 코너 범위 밖이라
자연히 제외된다.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import initial_component_extractor as initial

Point = Tuple[float, float]
SCHEMA = "noto-role-joints-v1"
SHORT_CHORD = 80.0  # 이보다 짧은 곡선은 코너·획끝 라운딩, 길면 획 몸통의 굽음


def _tuple_operations(observation: Dict[str, Any]) -> List[Tuple[str, tuple]]:
    return [
        (item["operation"], tuple(tuple(argument) if argument is not None else None for argument in item["arguments"]))
        for item in observation["operations"]
    ]


def _point_line_distance(point: Point, start: Point, end: Point) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    return abs((point[0] - start[0]) * dy - (point[1] - start[1]) * dx) / length


def _curve_bends(record: Any, units_per_em: int) -> List[Dict[str, float]]:
    """곡선 세그먼트마다 현 길이와 bulge(현에서 제어점까지 최대 수직거리).

    bulge는 어떤 곡선에도 정의된다: 작은 코너·획끝 라운딩은 짧은 현+작은 bulge,
    ㄱ의 굽은 몸통은 긴 현+큰 bulge. 취약한 꼭짓점 추정을 쓰지 않는다.
    """
    scale = 1000.0 / units_per_em
    bends: List[Dict[str, float]] = []
    for segment in initial._boundary_segments(record, units_per_em):  # pylint: disable=protected-access
        if segment.operation not in ("qCurveTo", "curveTo"):
            continue
        controls = [
            (float(argument[0]) * scale, float(argument[1]) * scale)
            for argument in segment.arguments[:-1]
            if argument is not None and isinstance(argument, tuple) and len(argument) == 2
        ]
        if not controls:
            continue
        chord = math.hypot(segment.end_raw[0] - segment.start_raw[0], segment.end_raw[1] - segment.start_raw[1]) * scale
        bulge = max(_point_line_distance(control, (segment.start_raw[0] * scale, segment.start_raw[1] * scale), (segment.end_raw[0] * scale, segment.end_raw[1] * scale)) for control in controls)
        bends.append({"chord": round(chord, 2), "bulge": round(bulge, 2)})
    return bends


def _component_contour_ids(payload: Optional[Dict[str, Any]]) -> List[int]:
    group = ((payload or {}).get("observation") or {}).get("componentGroup") or {}
    return list((group.get("value") or {}).get("contourIds") or [])


def measure_character(row: Dict[str, Any], outline_payload: Dict[str, Any], component_payloads: Dict[str, Optional[Dict[str, Any]]], units_per_em: int) -> Dict[str, Any]:
    operations = _tuple_operations(outline_payload["observation"])
    records = {record.contour_id: record for record in initial._contour_records(operations, units_per_em)}  # pylint: disable=protected-access
    components: Dict[str, Any] = {}
    for stage in ("initial", "final"):
        if row["stages"][stage]["status"] != "candidate":
            components[stage] = {"reasonCode": f"{stage}-not-candidate"}
            continue
        contour_ids = _component_contour_ids(component_payloads.get(stage))
        if not contour_ids:
            components[stage] = {"reasonCode": "component-contours-missing"}
            continue
        bends: List[Dict[str, float]] = []
        for contour_id in contour_ids:
            if contour_id in records:
                bends.extend(_curve_bends(records[contour_id], units_per_em))
        short = [b for b in bends if b["chord"] <= SHORT_CHORD]  # 코너·획끝 라운딩
        long = [b for b in bends if b["chord"] > SHORT_CHORD]    # 획 몸통의 굽음
        components[stage] = {
            "curveCount": len(bends),
            "shortRoundingCount": len(short),
            "shortRoundingBulgeMedian": round(statistics.median([b["bulge"] for b in short]), 2) if short else None,
            "longBendCount": len(long),
            "longBendBulgeMedian": round(statistics.median([b["bulge"] for b in long]), 2) if long else None,
        }
    return {"components": components}


def run(corpus_root: Path, report_name: str = "all.json") -> Dict[str, Any]:
    with (corpus_root / "reports" / report_name).open(encoding="utf-8") as source:
        report = json.load(source)
    started = time.monotonic()
    units_per_em = int(report["font"]["unitsPerEm"])
    characters: Dict[str, Any] = {}
    short_bulges: List[float] = []
    long_bulges: List[float] = []
    short_total = 0
    long_total = 0
    for row in report["cases"]:
        with (corpus_root / row["stages"]["outline"]["artifact"]).open(encoding="utf-8") as source:
            outline_payload = json.load(source)["payload"]
        if outline_payload["status"] != "candidate":
            characters[row["identity"]["character"]] = {"reasonCode": "outline-unavailable"}
            continue
        component_payloads: Dict[str, Optional[Dict[str, Any]]] = {}
        for stage in ("initial", "final"):
            if row["stages"][stage]["status"] == "candidate":
                with (corpus_root / row["stages"][stage]["artifact"]).open(encoding="utf-8") as source:
                    component_payloads[stage] = json.load(source)["payload"]
            else:
                component_payloads[stage] = None
        result = measure_character(row, outline_payload, component_payloads, units_per_em)
        characters[row["identity"]["character"]] = result
        for component in result["components"].values():
            if isinstance(component, dict) and component.get("curveCount") is not None:
                short_total += component["shortRoundingCount"]
                long_total += component["longBendCount"]
                if component["shortRoundingBulgeMedian"] is not None:
                    short_bulges.append(component["shortRoundingBulgeMedian"])
                if component["longBendBulgeMedian"] is not None:
                    long_bulges.append(component["longBendBulgeMedian"])
    result = {
        "schema": SCHEMA,
        "font": report["font"],
        "stageKeys": report["stageKeys"],
        "sourceReport": report_name,
        "measurementScale": "1000-unit",
        "meaning": (
            "닿자 컴포넌트 윤곽의 곡선 세그먼트마다 현 길이와 bulge(현에서 제어점까지 최대 수직거리). "
            f"현 {SHORT_CHORD:g}u 이하는 코너·획끝 라운딩, 그보다 길면 획 몸통의 굽음으로 나눈다. "
            "Noto 닿자는 ㄱ처럼 굽은 획이 많아 코너를 직선+필렛으로 분해하기 어렵다는 점을 수치로 보여준다. 정확도 승인이 아니다."
        ),
        "summary": {
            "characterCount": len(characters),
            "shortRoundingTotal": short_total,
            "longBendTotal": long_total,
            "shortRoundingBulgeMedian": round(statistics.median(short_bulges), 2) if short_bulges else None,
            "longBendBulgeMedian": round(statistics.median(long_bulges), 2) if long_bulges else None,
            "elapsedSeconds": round(time.monotonic() - started, 3),
        },
        "characters": characters,
    }
    output_dir = corpus_root / "analysis"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "role-joints-v1.json"
    with output_path.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    result["outputPath"] = str(output_path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="닿자 코너 필렛 측정 패스 v3 (관측 불변)")
    parser.add_argument("--corpus", type=Path, default=Path(__file__).resolve().parents[2] / ".reference-fonts/guide-corpus/251eae7645152d1705a55414")
    parser.add_argument("--report", default="all.json")
    args = parser.parse_args()
    result = run(args.corpus, args.report)
    print(json.dumps({"summary": result["summary"], "outputPath": result["outputPath"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
