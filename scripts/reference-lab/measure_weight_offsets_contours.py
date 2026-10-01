#!/usr/bin/env python3
"""윤곽 JSON(`weight-probe-contours-v1`)에 굵기 프로브를 돌린다 — 참고 폰트 측정과 같은 자.

플랜 `docs/plans/2026-10-01_속공간-지키기.md`의 `같은 자` 단계. 폰트 파일 대신 윤곽을 받아서
어느 폰트든(우리 앱 내보내기, 다른 참고 폰트) 같은 셈을 지난다. 프로브 · 파생 · 요약은
`measure_weight_offsets.py`의 함수를 그대로 쓴다. 관측만 하고 앱 값은 바꾸지 않는다.

입력 JSON: 글자마다 `component`(첫닿자) · `medial`(홀자) 폴리곤, 1000-unit · y-down · baseline 880.
앱 쪽 내보내기: `WEIGHT_PROBE=1 npx vitest run --dir src-next weight-probe-contours`.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Any, Dict, List, Sequence, Tuple

import measure_weight_offsets as probe

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "weight-offsets-from-contours-v1"


@dataclass(frozen=True)
class Record:
    """프로브 함수들이 쓰는 최소 모양(`ContourRecord`의 polygon · bounds만)."""

    polygon: Tuple[Tuple[float, float], ...]
    bounds: Tuple[float, float, float, float]  # (left, top, right, bottom), y 아래로 큼


def records_of(polygons: Sequence[Sequence[Sequence[float]]]) -> List[Record]:
    out: List[Record] = []
    for polygon in polygons:
        points = tuple((float(x), float(y)) for x, y in polygon)
        if len(points) < 3:
            continue
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        out.append(Record(polygon=points, bounds=(min(xs), min(ys), max(xs), max(ys))))
    return out


def measure_characters(source: Dict[str, Any]) -> Dict[str, Any]:
    characters: Dict[str, Any] = {}
    for character, entry in source["characters"].items():
        per_weight: Dict[str, Any] = {}
        for weight, shapes in entry["weights"].items():
            component = records_of(shapes["component"])
            medial = records_of(shapes["medial"])
            if not component or not medial:
                per_weight[weight] = {"reasonCode": "component-missing" if not component else "medial-missing"}
                continue
            box = probe.union_bounds(component)
            per_weight[weight] = {
                "glyphBounds": probe.union_bounds(component + medial),
                "contourCount": len(component) + len(medial),
                "reasonCode": None,
                "componentBox": box,
                "probes": probe.probe_intervals([record.polygon for record in component], box),
                "medial": probe.medial_thickness(medial, entry["medialJamo"]),
            }
        characters[character] = {"initialJamo": entry["initialJamo"], "medialJamo": entry["medialJamo"], "weights": per_weight}
    return characters


def run(args: argparse.Namespace) -> Dict[str, Any]:
    with args.contours.open(encoding="utf-8") as handle:
        source = json.load(handle)
    if source.get("schema") != "weight-probe-contours-v1":
        raise ValueError("weight-probe-contours-v1 JSON이 필요합니다.")
    weights = [int(value) for value in source["weights"]]
    if probe.BASE_WEIGHT not in weights:
        raise ValueError("기준 굵기 400이 목록에 있어야 합니다.")
    characters = measure_characters(source)
    derived = {character: probe.derive_character(entry, weights) for character, entry in characters.items()}
    groups = probe.load_groups()
    summary = probe.summarize(characters, derived, groups, weights)
    pooled = probe.pool(characters, derived, weights)
    result = {
        "schema": SCHEMA,
        "source": {"path": str(args.contours), "frame": source.get("frame"), "floor": source.get("floor"), "horizontalShare": source.get("horizontalShare"), "body": source.get("body")},
        "baseWeight": probe.BASE_WEIGHT,
        "weights": weights,
        "probeRatios": list(probe.PROBE_RATIOS),
        "measurementScale": source.get("frame"),
        "meaning": "윤곽의 프로브 잉크 구간을 400과 비교한 배율 · 밀림. 참고 폰트 측정과 같은 셈. 정확도 승인이 아니다.",
        "groups": groups,
        "pooled": pooled,
        "summary": summary,
        "interpolationResidual": probe.interpolation_check(summary, weights),
        "characters": {character: {**entry, "derived": derived[character]} for character, entry in characters.items()},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="윤곽 JSON에 굵기 프로브 돌리기 (관측 불변)")
    parser.add_argument("--contours", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run(args)
    print("w    app   vert   horz   cntX  outer  shift/dt  boxW", file=sys.stderr)
    for weight in result["weights"]:
        row = result["pooled"][str(weight)]
        med = lambda key: (row.get(key) or {}).get("median")  # noqa: E731
        print("{:3d} {:6.3f} {:6.3f} {:6.3f} {:5.2f} {:6.3f} {:8.3f} {:6.3f}".format(
            weight, row["appMultiplier"], med("verticalThicknessRatio") or float("nan"), med("horizontalThicknessRatio") or float("nan"),
            med("counterRatioAcrossX") or float("nan"), med("outerEdgeGrowthShare") or float("nan"),
            med("centerShiftPerThicknessDelta") or float("nan"), med("boxWidthRatio") or float("nan")), file=sys.stderr)


if __name__ == "__main__":
    main()
