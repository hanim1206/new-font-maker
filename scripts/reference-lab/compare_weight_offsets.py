#!/usr/bin/env python3
"""굵기 측정 둘(우리 · 참고)을 같은 표로 견준다 — 역추론의 입력.

플랜 `docs/plans/2026-10-01_속공간-지키기.md`의 `오차 하나` 단계 재료. 관측만 한다.
입력은 `measure_weight_offsets.py`(폰트) 또는 `measure_weight_offsets_contours.py`(윤곽) 출력 —
둘 다 pooled · summary · characters[].derived 모양이 같다.

- pooled: 굵기별 중앙값을 나란히 (ours / ref / 차).
- per-character: 지정 굵기에서 글자마다 세로 · 가로 두께 배율 중앙값과 상자 밀림을 나란히, 차가 큰 순.
- --output 이 있으면 표를 JSON으로도 남긴다(실험실 · 오차 점수가 읽는다).
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any, Dict, List, Optional

POOLED_KEYS = (
    "verticalThicknessRatio", "horizontalThicknessRatio", "counterRatioAcrossX", "counterRatioAcrossY",
    "outerEdgeGrowthShare", "medialStemRatio", "medialBeamRatio", "boxWidthRatio", "boxHeightRatio",
)
# 기준 굵기(400)에서 프로브 구간 폭이 이 범위(u) 밖이면 줄기가 아니라고 보고 거른다.
# 밖인 것: 프로브가 기둥을 세로로 관통한 것(구간 = 기둥 키 300u+ → 배율 ~1.1), ㅇ · ㅎ 동그라미를 통째로 지난 것,
# ㅊ 꼭지 끝자락만 스친 것(10u 안팎 → 900에서 배율 8+). 400의 줄기 두께는 60~110u라 여유를 두고 25~150.
STEM_BASE_MIN = 25.0
STEM_BASE_MAX = 150.0
# 배율이 이보다 크면 400과 900이 서로 다른 것을 짚은 프로브다(줄기는 많아야 ×2.2 안팎).
# 예: ㅌ의 빈 줄 자리가 900에서 굵어진 가로줄기 안으로 들어가 구간이 줄기 길이가 된 것(×4~5).
RATIO_MAX = 3.0
# 오차 점수 가중치 — 글자마다 참고 폰트와의 차이를 점수 하나로 접는다(플랜 `오차 하나` 단계).
# 두께가 핵심(각 1), 속공간은 두께의 결과라 절반, 상자 밀림은 u라 100u = 0.3으로 환산.
# 검기는 두께 둘이 이미 담고 있어 따로 안 센다. 막힘 개수는 점수 밖 — 노토 900 상대 지표로 따로 본다.
SCORE_WEIGHTS = {"vertical": 1.0, "horizontal": 1.0, "counter": 0.5, "boxGrow": 0.3 / 100.0}


def load(path: Path) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def median_of(values: List[float]) -> Optional[float]:
    clean = [value for value in values if value is not None]
    return round(statistics.median(clean), 4) if clean else None


def character_row(entry: Dict[str, Any], weight: str, base_weight: str = "400") -> Optional[Dict[str, Any]]:
    derived = entry.get("derived", {}).get(weight)
    if not derived or derived.get("reasonCode"):
        return None
    base_probes = entry.get("weights", {}).get(base_weight, {}).get("probes", {})
    vertical: List[float] = []
    horizontal: List[float] = []
    counters: List[float] = []
    for orientation, bucket in (("horizontal", vertical), ("vertical", horizontal)):
        base_rows = {row["ratio"]: row for row in base_probes.get(orientation, [])}
        for row in derived["probes"][orientation]:
            if row.get("reasonCode"):
                continue
            base_intervals = (base_rows.get(row["ratio"]) or {}).get("intervals", [])
            for index, stroke in enumerate(row["strokes"]):
                if stroke["thicknessRatio"] is None:
                    continue
                # 기준 구간 폭으로 줄기 아닌 것(기둥 관통 · 동그라미 통짜 · 꼭지 끝자락)을 거른다.
                if index < len(base_intervals):
                    width = base_intervals[index][1] - base_intervals[index][0]
                    if not STEM_BASE_MIN <= width <= STEM_BASE_MAX:
                        continue
                if stroke["thicknessRatio"] > RATIO_MAX:
                    continue
                bucket.append(stroke["thicknessRatio"])
            counters.extend(counter["ratio"] for counter in row["counters"] if counter["ratio"] is not None)
    shift = derived["boxShift"]
    return {
        "vertical": median_of(vertical),
        "horizontal": median_of(horizontal),
        "counter": median_of(counters),
        "boxGrow": round((shift["right"] - shift["left"]) + (shift["bottom"] - shift["top"]), 1),
    }


def score_of(per_character: Dict[str, Any]) -> Dict[str, Any]:
    """글자마다 항목 차이의 가중 합 → 전체는 중앙값(한두 글자 측정 사고에 안 휘둘리게)과 나쁜 글자 목록."""
    rows: Dict[str, float] = {}
    item_values: Dict[str, List[float]] = {key: [] for key in SCORE_WEIGHTS}
    for character, row in per_character.items():
        total = 0.0
        counted = 0
        for key, weight in SCORE_WEIGHTS.items():
            mine = row["ours"].get(key)
            theirs = row["reference"].get(key)
            if mine is None or theirs is None:
                continue
            delta = abs(mine - theirs)
            item_values[key].append(delta)
            total += delta * weight
            counted += 1
        if counted:
            rows[character] = round(total, 4)
    ordered = sorted(rows.items(), key=lambda item: -item[1])
    return {
        "median": median_of(list(rows.values())),
        "mean": round(sum(rows.values()) / len(rows), 4) if rows else None,
        "perItemMedian": {key: median_of(values) for key, values in item_values.items()},
        "worst": [{"char": character, "score": value} for character, value in ordered[:5]],
        "perCharacter": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="굵기 측정 두 벌 견주기 (관측 불변)")
    parser.add_argument("--ours", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--weight", default="900")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    ours = load(args.ours)
    reference = load(args.reference)
    weights = [str(weight) for weight in ours["weights"] if str(weight) in {str(w) for w in reference["weights"]}]

    pooled_rows: Dict[str, Dict[str, Any]] = {}
    print("== pooled (ours / ref / 차) ==")
    header = "w    " + "".join(f"{key[:14]:>22}" for key in POOLED_KEYS)
    print(header)
    for weight in weights:
        row: Dict[str, Any] = {}
        cells: List[str] = []
        for key in POOLED_KEYS:
            mine = (ours["pooled"][weight].get(key) or {}).get("median")
            theirs = (reference["pooled"][weight].get(key) or {}).get("median")
            delta = round(mine - theirs, 4) if mine is not None and theirs is not None else None
            row[key] = {"ours": mine, "reference": theirs, "delta": delta}
            cells.append("{:>7} {:>6} {:>7}".format(
                "-" if mine is None else f"{mine:.3f}", "-" if theirs is None else f"{theirs:.3f}", "-" if delta is None else f"{delta:+.3f}"))
        pooled_rows[weight] = row
        print(f"{weight:>4} " + "".join(cells))

    weight = args.weight
    per_character: Dict[str, Any] = {}
    for character, entry in ours["characters"].items():
        theirs_entry = reference["characters"].get(character)
        mine = character_row(entry, weight)
        theirs = character_row(theirs_entry, weight) if theirs_entry else None
        if not mine or not theirs:
            continue
        per_character[character] = {
            "initialJamo": entry["initialJamo"], "medialJamo": entry["medialJamo"],
            "ours": mine, "reference": theirs,
            "deltaVertical": round(mine["vertical"] - theirs["vertical"], 4) if mine["vertical"] is not None and theirs["vertical"] is not None else None,
            "deltaHorizontal": round(mine["horizontal"] - theirs["horizontal"], 4) if mine["horizontal"] is not None and theirs["horizontal"] is not None else None,
        }
    print(f"\n== 글자별 (굵기 {weight}, 세로 차 큰 순) ==")
    print("자  글자   세로 o/r/차        가로 o/r/차        속공간 o/r     상자± o/r")
    ordered = sorted(per_character.items(), key=lambda item: -abs(item[1]["deltaVertical"] or 0))
    for character, row in ordered:
        mine, theirs = row["ours"], row["reference"]
        fmt = lambda value: "-" if value is None else f"{value:.2f}"  # noqa: E731
        print("{} {}  {:>5}/{:>5}/{:>6}  {:>5}/{:>5}/{:>6}  {:>5}/{:>5}  {:>6}/{:>6}".format(
            row["initialJamo"], character, fmt(mine["vertical"]), fmt(theirs["vertical"]),
            "-" if row["deltaVertical"] is None else f"{row['deltaVertical']:+.2f}",
            fmt(mine["horizontal"]), fmt(theirs["horizontal"]),
            "-" if row["deltaHorizontal"] is None else f"{row['deltaHorizontal']:+.2f}",
            fmt(mine["counter"]), fmt(theirs["counter"]), mine["boxGrow"], theirs["boxGrow"]))

    score = score_of(per_character)
    print(f"\n== 오차 점수 (굵기 {weight}, 낮을수록 참고 폰트에 가깝다) ==")
    print(f"중앙값 {score['median']} · 평균 {score['mean']} · 항목 중앙값 " + " ".join(f"{key} {value}" for key, value in score["perItemMedian"].items()))
    print("나쁜 글자: " + ", ".join(f"{row['char']} {row['score']}" for row in score["worst"]))

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8") as target:
            json.dump({
                "schema": "weight-offsets-compare-v1",
                "ours": str(args.ours), "reference": str(args.reference), "weight": weight,
                "score": score, "pooled": pooled_rows, "perCharacter": per_character,
            }, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


if __name__ == "__main__":
    main()
