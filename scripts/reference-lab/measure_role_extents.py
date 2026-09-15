#!/usr/bin/env python3
"""홀자 역할이 잡은 contour의 축 방향 extent(시작·끝)를 재는 별도 패스.

추출기의 visibleSpans는 역할면과 같은 직선 위의 가시 구간만 본다. Noto 혼합 홀자의
가로 보처럼 윗변이 기울어진 획은 직선 구간이 짧아 보 길이가 스텁으로 남는다.
획 마스터 fit은 획의 시작·끝 위치가 필요하므로, 역할이 매칭한 contour 전체를
획 방향으로 투영한 extent를 따로 잰다. 추출 관측·검수·승인 기록은 읽기만 한다.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import initial_component_extractor as initial


SCHEMA = "noto-role-extent-v1"


def _tuple_operations(observation: Dict[str, Any]) -> List[Tuple[str, tuple]]:
    return [
        (item["operation"], tuple(tuple(argument) for argument in item["arguments"]))
        for item in observation["operations"]
    ]


def contour_extent(polygon: Sequence[Tuple[float, float]], orientation: str) -> Optional[Tuple[float, float]]:
    """세로 획은 y, 가로 획은 x 방향 투영 범위(1000-unit, 화면 y 아래)."""
    if not polygon:
        return None
    axis = 1 if orientation == "vertical" else 0
    values = [point[axis] for point in polygon]
    return min(values), max(values)


def measure_character(row: Dict[str, Any], outline_payload: Dict[str, Any], medial_payload: Dict[str, Any]) -> Dict[str, Any]:
    observation = outline_payload["observation"]
    records = initial._contour_records(  # pylint: disable=protected-access
        _tuple_operations(observation), int(observation["unitsPerEm"])
    )
    polygons = {record.contour_id: record.polygon for record in records}
    elements = (medial_payload.get("observation") or {}).get("elements") or []
    result: Dict[str, Any] = {}
    for role_id, value in row["stages"]["medial"]["measurements"].items():
        element = next((item for item in elements if item.get("elementId") == role_id), None)
        contour_id = ((element or {}).get("face") or {}).get("evidence", {}).get("contourId")
        polygon = polygons.get(contour_id) if contour_id is not None else None
        extent = contour_extent(polygon or (), value["orientation"])
        if extent is None:
            result[role_id] = {"orientation": value["orientation"], "reasonCode": "contour-evidence-missing"}
            continue
        visible = value["visibleSpans"]
        visible_from = min(span["from"] for span in visible) * 1000.0
        visible_to = max(span["to"] for span in visible) * 1000.0
        result[role_id] = {
            "orientation": value["orientation"],
            "contourId": contour_id,
            "from": round(extent[0], 3),
            "to": round(extent[1], 3),
            # 가시 구간이 contour extent의 얼마를 덮는지. 낮으면 면이 기울어져 직선 구간이 짧았던 것.
            "visibleCoverage": round(max(0.0, visible_to - visible_from) / max(1e-6, extent[1] - extent[0]), 4),
            "reasonCode": None,
        }
    return result


def run(corpus_root: Path, report_name: str = "all.json") -> Dict[str, Any]:
    report_path = corpus_root / "reports" / report_name
    with report_path.open(encoding="utf-8") as source:
        report = json.load(source)
    started = time.monotonic()
    characters: Dict[str, Any] = {}
    skipped = 0
    for row in report["cases"]:
        stages = row["stages"]
        if stages["medial"]["status"] != "candidate" or stages["outline"]["status"] != "candidate":
            characters[row["identity"]["character"]] = {"reasonCode": "medial-or-outline-not-candidate"}
            skipped += 1
            continue
        with (corpus_root / stages["outline"]["artifact"]).open(encoding="utf-8") as source:
            outline_payload = json.load(source)["payload"]
        with (corpus_root / stages["medial"]["artifact"]).open(encoding="utf-8") as source:
            medial_payload = json.load(source)["payload"]
        characters[row["identity"]["character"]] = measure_character(row, outline_payload, medial_payload)
    measured = sum(
        1 for value in characters.values() for role in value.values()
        if isinstance(role, dict) and role.get("reasonCode") is None
    )
    low_coverage = sum(
        1 for value in characters.values() for role in value.values()
        if isinstance(role, dict) and role.get("reasonCode") is None and role["visibleCoverage"] < 0.5
    )
    result = {
        "schema": SCHEMA,
        "font": report["font"],
        "stageKeys": report["stageKeys"],
        "sourceReport": report_name,
        "measurementScale": "1000-unit",
        "meaning": (
            "홀자 역할이 매칭한 contour를 획 방향으로 투영한 시작·끝. "
            "visibleSpans가 기울어진 면에서 짧아지는 것을 보완하는 획 길이 원천이다. 정확도 승인이 아니다."
        ),
        "summary": {
            "characterCount": len(characters),
            "roleExtentCount": measured,
            "lowVisibleCoverageCount": low_coverage,
            "skippedCount": skipped,
            "elapsedSeconds": round(time.monotonic() - started, 3),
        },
        "characters": characters,
    }
    output_dir = corpus_root / "attributes"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "role-extent-v1.json"
    with output_path.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    result["outputPath"] = str(output_path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="홀자 역할 contour extent 측정 패스 (관측 불변)")
    parser.add_argument(
        "--corpus",
        type=Path,
        default=Path(__file__).resolve().parents[2] / ".reference-fonts/guide-corpus/251eae7645152d1705a55414",
    )
    parser.add_argument("--report", default="all.json")
    args = parser.parse_args()
    result = run(args.corpus, args.report)
    print(json.dumps({"summary": result["summary"], "outputPath": result["outputPath"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
