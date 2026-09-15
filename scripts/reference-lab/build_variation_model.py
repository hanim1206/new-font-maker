#!/usr/bin/env python3
"""전수 관측에서 역할면별 변화량 모델을 만드는 분석 패스.

v1은 층(조합 레이아웃 6종)별로 `대표값 + 첫닿자 효과 + 홀자 효과 + 받침 효과`의
주효과만 median polish로 푼다. 임계를 넘는 잔차는 예외로 실측을 보존한다.

v2는 v1 주효과를 그대로 두고, v1.1 판정이 고른 층에만 자모쌍 셀 보정항을 순차로
더한다(셀 보정 = v1 잔차의 셀 중앙값). 주효과가 v1과 같으므로 편집 Δ의 의미가
바뀌지 않고, 셀 보정항은 편집 단위가 아니라 잔차처럼 딸려간다.

추출 관측·검수·승인 기록은 읽기만 하고, 산출물은 corpus의 analysis/ 아래에
버전을 붙여 따로 저장한다.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


SCHEMA = "noto-variation-model-v1"
ESTIMATOR = "median-polish"
FACTORS = ("initial", "medial", "final")
LAYERS = ("right", "bottom", "mixed", "right-final", "bottom-final", "mixed-final")
THRESHOLDS = (7.0, 10.0, 14.0)
DEFAULT_THRESHOLD = 10.0
EXCEPTION_RATIO_LIMIT = 0.05
CLUSTER_TOP_CELLS = 10
CLUSTER_CELL_FRACTION = 0.05
CLUSTER_SHARE_LIMIT = 0.5
MIN_OBSERVATIONS_PER_CELL = 2.0
LOW_CONFIDENCE_MIN_COUNT = 10
HOLDOUT_EVERY = 10
NO_FINAL = "∅"
SCALE = 1000.0

SCHEMA_V2 = "noto-variation-model-v2"
STRONG_CELL_MIN_COUNT = 3
STRONG_CELL_SIGN_SHARE = 0.8
ABSORPTION_GAIN_LIMIT = 0.4
# v1.2: 하드 셀 수 cap 대신 두 게이트로 상호작용을 판정한다.
# 셀 보정은 순차 추정이라 주효과를 안 건드리므로 셀 수 자체는 위험이 아니다. 위험은 "잔차 암기"뿐이고,
# 그건 홀드아웃(못 본 글자 재현)이 직접 잡는다. coverage는 강셀이 관측 충분한 셀의 큰 비율이면
# 사실상 셀마다 잔차를 저장하는 셈이라 그때만 배제한다.
HOLDOUT_P95_IMPROVE = 0.1   # 셀 보정 넣은 홀드아웃 p95가 최소 이만큼(상대) 좋아져야 일반화로 본다
STRONG_CELL_COVERAGE_LIMIT = 0.6  # 강셀 / 관측 충분한 셀 비율이 이보다 크면 잔차 저장으로 보고 배제
# 셀 보정으로 흡수하면 안 되는 형태 전환. 실제 윤곽 대조로 확인한 층만 적는다.
SHAPE_TRANSITIONS = {
    ("medial.primaryBeam.visibleLength", "bottom-final"): (
        "ㄱ계 다리가 ㅜ·ㅠ·ㅡ 보에 닿아 가시 구간이 잘리고 ㅗ·ㅛ에서는 떠 있다. "
        "접촉 on/off 전환이라 셀 보정 대신 예외로 보존한다."
    ),
}

Key = Tuple[str, str, str]
Observation = Tuple[Key, float]
Pair = Tuple[str, str]
Cell = Tuple[str, str]


# ---------------------------------------------------------------- 관측 수집

def collect_targets(row: Dict[str, Any], extents: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
    """한 글자의 후보 단계에서 역할면 타깃값을 모은다. 부분·포기 단계는 제외한다.

    extents가 있으면 spanFrom/spanTo는 contour extent(measure_role_extents)에서 읽는다.
    visibleSpans는 기울어진 면에서 스텁만 남아 획 길이 원천으로 쓸 수 없다.
    """
    values: Dict[str, float] = {}
    stages = row["stages"]
    for stage_name in ("initial", "final"):
        stage = stages[stage_name]
        if stage["status"] != "candidate":
            continue
        for side, face in stage["measurements"]["roleFaces"].items():
            values[f"{stage_name}.roleFaces.{side}"] = face * SCALE
    medial = stages["medial"]
    if medial["status"] == "candidate":
        for role_id, value in medial["measurements"].items():
            values[f"medial.{role_id}.face"] = value["face"] * SCALE
            values[f"medial.{role_id}.visibleLength"] = value["visibleLength"] * SCALE
            # 획 마스터 fit은 길이만으로는 획을 못 놓는다. 가시 구간의 양끝(시작·끝 위치)도 타깃으로 둔다.
            extent = ((extents or {}).get(row["identity"]["character"]) or {}).get(role_id)
            if isinstance(extent, dict) and extent.get("reasonCode") is None:
                values[f"medial.{role_id}.spanFrom"] = float(extent["from"])
                values[f"medial.{role_id}.spanTo"] = float(extent["to"])
                continue
            spans = value.get("visibleSpans") or []
            if spans:
                values[f"medial.{role_id}.spanFrom"] = min(span["from"] for span in spans) * SCALE
                values[f"medial.{role_id}.spanTo"] = max(span["to"] for span in spans) * SCALE
    return values


def observation_key(row: Dict[str, Any]) -> Key:
    identity = row["identity"]
    return (identity["initialJamo"], identity["medialJamo"], identity["finalJamo"] or NO_FINAL)


def group_observations(rows: Iterable[Dict[str, Any]], extents: Optional[Dict[str, Any]] = None) -> Dict[str, Dict[str, List[Tuple[str, Key, float]]]]:
    """target -> layer -> [(character, key, value)]. 글자 순서는 codepoint 순으로 고정한다."""
    grouped: Dict[str, Dict[str, List[Tuple[str, Key, float]]]] = defaultdict(lambda: defaultdict(list))
    for row in sorted(rows, key=lambda item: item["identity"]["codepoint"]):
        layer = row["identity"]["contextId"]
        key = observation_key(row)
        for target, value in collect_targets(row, extents).items():
            grouped[target][layer].append((row["identity"]["character"], key, value))
    return grouped


# ---------------------------------------------------------------- median polish

def median_polish(observations: Sequence[Observation], max_iterations: int = 50, tolerance: float = 1e-9) -> Dict[str, Any]:
    """대표값 + 세 주효과를 반복 중앙값 제거로 푼다. 효과 중앙값은 0으로 정규화한다."""
    if not observations:
        raise ValueError("관측이 없습니다.")
    representative = statistics.median(value for _, value in observations)
    effects: List[Dict[str, float]] = [defaultdict(float) for _ in FACTORS]

    def predict(key: Key) -> float:
        return representative + sum(effects[index][key[index]] for index in range(len(FACTORS)))

    for _ in range(max_iterations):
        largest_change = 0.0
        for index in range(len(FACTORS)):
            buckets: Dict[str, List[float]] = defaultdict(list)
            for key, value in observations:
                buckets[key[index]].append(value - predict(key) + effects[index][key[index]])
            for level, residuals in buckets.items():
                updated = statistics.median(residuals)
                largest_change = max(largest_change, abs(updated - effects[index][level]))
                effects[index][level] = updated
        for index in range(len(FACTORS)):
            shift = statistics.median(effects[index].values())
            if shift:
                representative += shift
                for level in effects[index]:
                    effects[index][level] -= shift
        if largest_change < tolerance:
            break

    residuals = [(key, value - predict(key)) for key, value in observations]
    return {
        "representative": representative,
        "effects": {FACTORS[index]: dict(effects[index]) for index in range(len(FACTORS))},
        "residuals": residuals,
    }


# ---------------------------------------------------------------- 진단

def _quantile(sorted_values: Sequence[float], ratio: float) -> float:
    if not sorted_values:
        return 0.0
    position = min(len(sorted_values) - 1, int(round(ratio * (len(sorted_values) - 1))))
    return sorted_values[position]


def residual_distribution(residuals: Sequence[float]) -> Dict[str, float]:
    magnitudes = sorted(abs(value) for value in residuals)
    return {
        "median": round(_quantile(magnitudes, 0.5), 3),
        "p95": round(_quantile(magnitudes, 0.95), 3),
        "max": round(magnitudes[-1], 3) if magnitudes else 0.0,
    }


PAIRS = (("initial", "medial"), ("initial", "final"), ("medial", "final"))


def cell_of(key: Key, pair: Pair) -> Cell:
    return (key[FACTORS.index(pair[0])], key[FACTORS.index(pair[1])])


def pair_cell_diagnostics(
    residuals: Sequence[Tuple[Key, float]],
    exceptions: Sequence[Tuple[Key, float]],
    top: int = CLUSTER_TOP_CELLS,
) -> Dict[str, Any]:
    """자모쌍 셀별 잔차 중앙값 top과 예외 집중도. 상호작용 v2 후보를 고르는 근거다."""
    result: Dict[str, Any] = {}
    for first, second in PAIRS:
        indices = (FACTORS.index(first), FACTORS.index(second))
        cells: Dict[Tuple[str, str], List[float]] = defaultdict(list)
        for key, residual in residuals:
            cells[(key[indices[0]], key[indices[1]])].append(residual)
        exception_cells = Counter((key[indices[0]], key[indices[1]]) for key, _ in exceptions)
        ranked = sorted(cells.items(), key=lambda item: -abs(statistics.median(item[1])))[:top]
        # "상위 10셀이 예외의 절반"은 셀 수백 개 층 기준이다. 셀이 적으면 상위 셀 수를 셀 수의 5%로 줄여
        # 규칙이 자명하게 참이 되지 않게 한다.
        top_cell_count = min(top, max(1, math.ceil(len(cells) * CLUSTER_CELL_FRACTION)))
        top_exception_cells = exception_cells.most_common(top_cell_count)
        top_share = sum(count for _, count in top_exception_cells) / len(exceptions) if exceptions else 0.0
        # 한 자모가 수준 하나뿐이거나(무받침 층의 받침) 셀당 관측이 1개면 셀 중앙값이 잔차 자체라
        # 뭉침을 진단할 수 없다. 그런 쌍은 판정에서 제외하고 표시만 남긴다.
        level_counts = (len({key[indices[0]] for key, _ in residuals}), len({key[indices[1]] for key, _ in residuals}))
        diagnosable = min(level_counts) > 1 and len(residuals) / len(cells) >= MIN_OBSERVATIONS_PER_CELL
        result[f"{first}×{second}"] = {
            "cellCount": len(cells),
            "diagnosable": diagnosable,
            "topCellCount": top_cell_count,
            "topByResidualMedian": [
                {
                    "cell": [levels[0], levels[1]],
                    "residualMedian": round(statistics.median(values), 3),
                    "observationCount": len(values),
                }
                for levels, values in ranked
            ],
            "topByExceptionCount": [
                {"cell": [levels[0], levels[1]], "exceptionCount": count} for levels, count in top_exception_cells
            ],
            "topCellsExceptionShare": round(top_share, 4),
        }
    return result


def diagnose(exception_ratio: float, pair_diagnostics: Dict[str, Any]) -> Dict[str, Any]:
    """예외 비율과 집중도로 층을 판정한다. 판정은 v2 후보 표시일 뿐 규칙 승격이 아니다."""
    clustered = [
        pair
        for pair, value in pair_diagnostics.items()
        if value["diagnosable"] and value["topCellsExceptionShare"] >= CLUSTER_SHARE_LIMIT
    ]
    if exception_ratio <= EXCEPTION_RATIO_LIMIT:
        verdict = "exceptions-preserved"
    elif clustered:
        verdict = "interaction-candidate"
    else:
        verdict = "threshold-or-font-variation"
    return {"verdict": verdict, "clusteredPairs": clustered}


# ---------------------------------------------------------------- 홀드아웃

def split_holdout(observations: Sequence[Tuple[str, Key, float]], every: int = HOLDOUT_EVERY) -> Tuple[List[int], List[int]]:
    """codepoint 순서에서 every번째마다 홀드아웃. 어떤 자모 수준도 학습에서 비우지 않는다."""
    counts: List[Counter] = [Counter(key[index] for _, key, _ in observations) for index in range(len(FACTORS))]
    holdout: List[int] = []
    training: List[int] = []
    for position, (_, key, _) in enumerate(observations):
        can_hold = position % every == 0 and all(counts[index][key[index]] > 1 for index in range(len(FACTORS)))
        if can_hold:
            holdout.append(position)
            for index in range(len(FACTORS)):
                counts[index][key[index]] -= 1
        else:
            training.append(position)
    return training, holdout


def evaluate_holdout(
    observations: Sequence[Tuple[str, Key, float]],
    interaction: Optional[Tuple[Pair, Sequence[Cell]]] = None,
) -> Optional[Dict[str, Any]]:
    """홀드아웃 재현 오차. interaction=(자모쌍, 셀들)이면 셀 보정항을 학습분 잔차로 다시 추정해 더한다.
    셀 선택은 전체 데이터에서 한 것을 그대로 쓴다."""
    training, holdout = split_holdout(observations)
    if not holdout or not training:
        return None
    fitted = median_polish([(observations[index][1], observations[index][2]) for index in training])
    terms: Dict[Cell, float] = {}
    if interaction:
        pair, cells = interaction
        selected = set(cells)
        buckets: Dict[Cell, List[float]] = defaultdict(list)
        for key, residual in fitted["residuals"]:
            if cell_of(key, pair) in selected:
                buckets[cell_of(key, pair)].append(residual)
        terms = {cell: statistics.median(values) for cell, values in buckets.items()}
    errors: List[float] = []
    for index in holdout:
        _, key, value = observations[index]
        predicted = fitted["representative"] + sum(
            fitted["effects"][factor].get(key[position], 0.0) for position, factor in enumerate(FACTORS)
        )
        if interaction:
            predicted += terms.get(cell_of(key, interaction[0]), 0.0)
        errors.append(value - predicted)
    return {
        "trainingCount": len(training),
        "holdoutCount": len(holdout),
        "reproductionError": residual_distribution(errors),
    }


# ---------------------------------------------------------------- 층 모델

def exception_table(
    characters: Sequence[str],
    residuals: Sequence[Tuple[Key, float]],
    thresholds: Sequence[float],
) -> Dict[str, Any]:
    table: Dict[str, Any] = {}
    for threshold in thresholds:
        selected = [
            (character, key, residual)
            for character, (key, residual) in zip(characters, residuals)
            if abs(residual) > threshold
        ]
        table[f"{threshold:g}"] = {
            "count": len(selected),
            "ratio": round(len(selected) / len(residuals), 4),
            "characters": [
                {"character": character, "residual": round(residual, 3)}
                for character, _, residual in sorted(selected, key=lambda item: -abs(item[2]))
            ],
        }
    return table


def build_layer_model(
    observations: Sequence[Tuple[str, Key, float]],
    thresholds: Sequence[float] = THRESHOLDS,
    default_threshold: float = DEFAULT_THRESHOLD,
    fitted: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    fitted = fitted or median_polish([(key, value) for _, key, value in observations])
    residuals = fitted["residuals"]
    characters = [character for character, _, _ in observations]
    level_counts = {
        factor: Counter(key[index] for _, key, _ in observations) for index, factor in enumerate(FACTORS)
    }
    exceptions_by_threshold = exception_table(characters, residuals, thresholds)
    default_exceptions = [
        (key, residual) for key, residual in residuals if abs(residual) > default_threshold
    ]
    pair_diagnostics = pair_cell_diagnostics(residuals, default_exceptions)
    exception_ratio = len(default_exceptions) / len(observations)
    smallest_count = min(
        min(counter.values()) for factor, counter in level_counts.items() if len(counter) > 1
    ) if any(len(counter) > 1 for counter in level_counts.values()) else len(observations)
    return {
        "observationCount": len(observations),
        "levelCounts": {
            factor: {"levels": len(counter), "min": min(counter.values()), "max": max(counter.values())}
            for factor, counter in level_counts.items()
        },
        "confidence": "low" if smallest_count < LOW_CONFIDENCE_MIN_COUNT else "normal",
        "representative": round(fitted["representative"], 3),
        "effects": {
            factor: {level: round(value, 3) for level, value in sorted(fitted["effects"][factor].items())}
            for factor in FACTORS
        },
        "residuals": residual_distribution([residual for _, residual in residuals]),
        "exceptions": exceptions_by_threshold,
        "defaultThreshold": default_threshold,
        "diagnosis": diagnose(exception_ratio, pair_diagnostics),
        "pairCells": pair_diagnostics,
        "holdout": evaluate_holdout(observations),
    }


# ---------------------------------------------------------------- 상호작용 v2 (선택 셀 보정)

def strong_cells(
    residuals: Sequence[Tuple[Key, float]],
    pair: Pair,
    threshold: float = DEFAULT_THRESHOLD,
) -> List[Dict[str, Any]]:
    """셀 중앙값이 임계를 넘고 관측이 충분하며 잔차 부호가 일관된 셀. 셀 전체가 한 방향으로 튀는 구조 신호다."""
    cells: Dict[Cell, List[float]] = defaultdict(list)
    for key, residual in residuals:
        cells[cell_of(key, pair)].append(residual)
    found: List[Dict[str, Any]] = []
    for cell, values in cells.items():
        if len(values) < STRONG_CELL_MIN_COUNT:
            continue
        term = statistics.median(values)
        if abs(term) <= threshold:
            continue
        sign_share = sum(1 for value in values if value * term > 0) / len(values)
        if sign_share >= STRONG_CELL_SIGN_SHARE:
            found.append({"cell": cell, "term": term, "observationCount": len(values), "signShare": sign_share})
    return sorted(found, key=lambda item: (-abs(item["term"]), item["cell"]))


def absorb_cells(residuals: Sequence[Tuple[Key, float]], pair: Pair, terms: Dict[Cell, float]) -> List[Tuple[Key, float]]:
    """v1 주효과는 그대로 두고 선택 셀 잔차에서만 셀 보정항을 뺀다(순차 추정)."""
    return [(key, residual - terms.get(cell_of(key, pair), 0.0)) for key, residual in residuals]


def eligible_cell_count(residuals: Sequence[Tuple[Key, float]], pair: Pair) -> int:
    """관측이 최소 개수 이상인 셀 수. 강셀 coverage(강셀/eligible)의 분모다."""
    cells: Dict[Cell, int] = defaultdict(int)
    for key, _ in residuals:
        cells[cell_of(key, pair)] += 1
    return sum(1 for count in cells.values() if count >= STRONG_CELL_MIN_COUNT)


def holdout_p95_gain(observations: Sequence[Tuple[str, Key, float]], pair: Pair, terms: Dict[Cell, float]) -> Optional[float]:
    """셀 보정을 넣은 홀드아웃 p95가 안 넣은 것보다 얼마나(상대) 좋아지는지. 일반화 게이트의 지표다.
    분할이 안 되거나 기준 p95가 0이면 판정 불가로 None."""
    base = evaluate_holdout(observations)
    with_interaction = evaluate_holdout(observations, (pair, list(terms)))
    if not base or not with_interaction:
        return None
    base_p95 = base["reproductionError"]["p95"]
    if base_p95 <= 0:
        return None
    return (base_p95 - with_interaction["reproductionError"]["p95"]) / base_p95


def diagnose_v11(
    target: str,
    layer: str,
    observations: Sequence[Tuple[str, Key, float]],
    residuals: Sequence[Tuple[Key, float]],
    pair_diagnostics: Dict[str, Any],
    threshold: float = DEFAULT_THRESHOLD,
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    """v1.2 판정. 강셀을 순차 흡수해 예외가 충분히 줄고(흡수율), 그 보정이 홀드아웃에서 일반화되며,
    강셀 coverage가 잔차 저장 수준이 아닐 때만 상호작용을 적용한다. v1.1의 하드 셀 수 cap을 버렸다.
    셀 보정은 주효과를 안 건드리므로 셀 수 자체는 위험이 아니고, 암기 위험은 홀드아웃이 잡는다."""
    before = sum(1 for _, residual in residuals if abs(residual) > threshold)
    candidates: Dict[str, Dict[str, Any]] = {}
    for first, second in PAIRS:
        name = f"{first}×{second}"
        if not pair_diagnostics[name]["diagnosable"]:
            continue
        cells = strong_cells(residuals, (first, second), threshold)
        if not cells:
            continue
        terms = {item["cell"]: item["term"] for item in cells}
        after = sum(1 for _, residual in absorb_cells(residuals, (first, second), terms) if abs(residual) > threshold)
        eligible = eligible_cell_count(residuals, (first, second))
        candidates[name] = {
            "pair": (first, second),
            "cells": cells,
            "exceptionsAfter": after,
            "absorptionGain": (before - after) / before if before else 0.0,
            "eligibleCells": eligible,
            "coverage": len(cells) / eligible if eligible else 1.0,
        }
    # 흡수율 우선, 같으면 coverage 낮은(더 국소적인) 쪽을 고른다.
    best_name = max(
        candidates,
        key=lambda name: (candidates[name]["absorptionGain"], -candidates[name]["coverage"]),
        default=None,
    )
    best = candidates.get(best_name) if best_name else None
    holdout_gain = None
    if best:
        holdout_gain = holdout_p95_gain(observations, best["pair"], {item["cell"]: item["term"] for item in best["cells"]})
    if before / len(residuals) <= EXCEPTION_RATIO_LIMIT:
        verdict = "exceptions-preserved"
    elif best and best["absorptionGain"] >= ABSORPTION_GAIN_LIMIT:
        if (target, layer) in SHAPE_TRANSITIONS:
            verdict = "shape-transition"
        elif best["coverage"] > STRONG_CELL_COVERAGE_LIMIT:
            verdict = "broad-interaction"
        elif holdout_gain is None or holdout_gain < HOLDOUT_P95_IMPROVE:
            verdict = "no-generalization"
        else:
            verdict = "interaction"
    else:
        verdict = "threshold-or-font-variation"
    diagnosis = {
        "verdict": verdict,
        "exceptionsBefore": before,
        "bestPair": best_name,
        "holdoutP95Gain": round(holdout_gain, 4) if holdout_gain is not None else None,
        "pairs": {
            name: {
                "strongCellCount": len(candidate["cells"]),
                "eligibleCells": candidate["eligibleCells"],
                "coverage": round(candidate["coverage"], 4),
                "exceptionsAfter": candidate["exceptionsAfter"],
                "absorptionGain": round(candidate["absorptionGain"], 4),
            }
            for name, candidate in candidates.items()
        },
        "shapeTransition": SHAPE_TRANSITIONS.get((target, layer)),
    }
    return diagnosis, best


def build_layer_model_v2(
    target: str,
    layer: str,
    observations: Sequence[Tuple[str, Key, float]],
    thresholds: Sequence[float] = THRESHOLDS,
    default_threshold: float = DEFAULT_THRESHOLD,
) -> Dict[str, Any]:
    """v1 층 모델에 v1.2 판정과 상호작용 셀 보정항을 더한다. 주효과와 v1 필드는 v1과 같다."""
    fitted = median_polish([(key, value) for _, key, value in observations])
    result = build_layer_model(observations, thresholds, default_threshold, fitted=fitted)
    diagnosis, best = diagnose_v11(target, layer, observations, fitted["residuals"], result["pairCells"], default_threshold)
    result["v11Diagnosis"] = diagnosis
    if diagnosis["verdict"] != "interaction" or best is None:
        result["interaction"] = {"applied": False}
        return result
    pair = best["pair"]
    terms = {item["cell"]: item["term"] for item in best["cells"]}
    residuals = absorb_cells(fitted["residuals"], pair, terms)
    characters = [character for character, _, _ in observations]
    result["interaction"] = {
        "applied": True,
        "pair": f"{pair[0]}×{pair[1]}",
        "cells": [
            {
                "cell": list(item["cell"]),
                "term": round(item["term"], 3),
                "observationCount": item["observationCount"],
                "signShare": round(item["signShare"], 4),
            }
            for item in best["cells"]
        ],
        "residuals": residual_distribution([residual for _, residual in residuals]),
        "exceptions": exception_table(characters, residuals, thresholds),
        "holdout": evaluate_holdout(observations, (pair, list(terms))),
    }
    return result


# ---------------------------------------------------------------- 전체 모델

def load_role_extents(corpus_root: Path, report: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """attributes/role-extent-v1.json이 같은 추출 버전이면 글자별 extent를 준다. 없으면 None."""
    path = corpus_root / "attributes" / "role-extent-v1.json"
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as source:
        data = json.load(source)
    if data.get("schema") != "noto-role-extent-v1" or data.get("stageKeys") != report.get("stageKeys"):
        return None
    return data.get("characters") or {}


def build_model(report: Dict[str, Any], version: str = "v1", extents: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    grouped = group_observations(report["cases"], extents)
    targets: Dict[str, Any] = {}
    for target in sorted(grouped):
        layers = {
            layer: (
                build_layer_model_v2(target, layer, grouped[target][layer])
                if version == "v2"
                else build_layer_model(grouped[target][layer])
            )
            for layer in LAYERS
            if grouped[target].get(layer)
        }
        targets[target] = {"layers": layers}
    return targets


def summarize(targets: Dict[str, Any]) -> Dict[str, Any]:
    verdicts: Counter = Counter()
    v11_verdicts: Counter = Counter()
    exceptions_before = exceptions_after = applied = 0
    layer_count = 0
    for target in targets.values():
        for layer in target["layers"].values():
            layer_count += 1
            verdicts[layer["diagnosis"]["verdict"]] += 1
            if "v11Diagnosis" in layer:
                v11_verdicts[layer["v11Diagnosis"]["verdict"]] += 1
                if layer["interaction"]["applied"]:
                    applied += 1
                    exceptions_before += layer["exceptions"][f"{layer['defaultThreshold']:g}"]["count"]
                    exceptions_after += layer["interaction"]["exceptions"][f"{layer['defaultThreshold']:g}"]["count"]
    summary = {"targetCount": len(targets), "layerModelCount": layer_count, "verdictCounts": dict(verdicts)}
    if v11_verdicts:
        summary["v11VerdictCounts"] = dict(v11_verdicts)
        summary["interactionLayerCount"] = applied
        summary["interactionExceptions"] = {"before": exceptions_before, "after": exceptions_after}
    return summary


def run(corpus_root: Path, report_name: str = "all.json", version: str = "v1") -> Dict[str, Any]:
    report_path = corpus_root / "reports" / report_name
    with report_path.open(encoding="utf-8") as source:
        report = json.load(source)
    started = time.monotonic()
    extents = load_role_extents(corpus_root, report)
    targets = build_model(report, version, extents)
    summary = summarize(targets)
    summary["elapsedSeconds"] = round(time.monotonic() - started, 3)
    result = {
        "schema": SCHEMA_V2 if version == "v2" else SCHEMA,
        "estimator": ESTIMATOR,
        "interactions": "generalizing-cell-terms" if version == "v2" else "none",
        "font": report["font"],
        "stageKeys": report["stageKeys"],
        "sourceReport": report_name,
        "spanSource": "role-extent-v1" if extents is not None else "visibleSpans",
        "measurementScale": "1000-unit",
        "meaning": (
            "층별 median polish 주효과 + v1.2 판정이 고른 층의 자모쌍 셀 보정항. "
            "셀 보정은 v1 주효과를 고정한 채 v1 잔차의 셀 중앙값으로 순차 추정한다. "
            "적용은 흡수율·홀드아웃 일반화·강셀 coverage 세 게이트로 정한다(하드 셀 수 cap 없음). "
            "예측 = 대표값 + Σ효과 + 셀 보정. 편집 후 = 실측 + 사용자가 바꾼 주효과 Δ이며 "
            "셀 보정항은 편집 단위가 아니라 잔차처럼 딸려간다. "
            "임계를 넘는 잔차는 예외로 실측을 보존한다. 분석 후보이며 승인이나 편집 제약이 아니다."
            if version == "v2"
            else "층별 median polish 주효과. 편집 후 = 실측 + 사용자가 바꾼 효과항 Δ. "
            "임계를 넘는 잔차는 예외로 실측을 보존한다. 분석 후보이며 승인이나 편집 제약이 아니다. "
            "배치 보고서의 medialVariationFromGiyeok을 분석 입력으로 대체한다."
        ),
        "thresholds": list(THRESHOLDS),
        "defaultThreshold": DEFAULT_THRESHOLD,
        "exceptionRatioLimit": EXCEPTION_RATIO_LIMIT,
        "clusterRule": {
            "topCells": CLUSTER_TOP_CELLS,
            "topCellFraction": CLUSTER_CELL_FRACTION,
            "shareLimit": CLUSTER_SHARE_LIMIT,
            "minObservationsPerCell": MIN_OBSERVATIONS_PER_CELL,
        },
        "summary": summary,
        "targets": targets,
    }
    if version == "v2":
        result["interactionRule"] = {
            "estimation": "sequential",
            "strongCellMinCount": STRONG_CELL_MIN_COUNT,
            "strongCellSignShare": STRONG_CELL_SIGN_SHARE,
            "absorptionGainLimit": ABSORPTION_GAIN_LIMIT,
            "holdoutP95Improve": HOLDOUT_P95_IMPROVE,
            "strongCellCoverageLimit": STRONG_CELL_COVERAGE_LIMIT,
        }
        result["shapeTransitions"] = [
            {"target": target, "layer": layer, "reason": reason}
            for (target, layer), reason in sorted(SHAPE_TRANSITIONS.items())
        ]
    output_dir = corpus_root / "analysis"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"variation-model-{version}.json"
    with output_path.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    result["outputPath"] = str(output_path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="역할면 변화량 모델 (v1 주효과 · v2 선택 셀 보정, median polish, 관측 불변)"
    )
    parser.add_argument(
        "--corpus",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / ".reference-fonts/guide-corpus/251eae7645152d1705a55414",
    )
    parser.add_argument("--report", default="all.json")
    parser.add_argument("--model-version", choices=("v1", "v2"), default="v1")
    args = parser.parse_args()
    result = run(args.corpus, args.report, args.model_version)
    print(json.dumps({"summary": result["summary"], "outputPath": result["outputPath"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
