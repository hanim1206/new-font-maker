#!/usr/bin/env python3
"""전수 관측에서 역할면별 변화량 모델 v1을 만드는 분석 패스.

모델은 층(조합 레이아웃 6종)별로 `대표값 + 첫닿자 효과 + 홀자 효과 + 받침 효과`의
주효과만 median polish로 푼다. 상호작용은 넣지 않고, 임계를 넘는 잔차는 예외로
실측을 보존한다. 추출 관측·검수·승인 기록은 읽기만 하고, 산출물은 corpus의
analysis/ 아래에 버전을 붙여 따로 저장한다.
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

Key = Tuple[str, str, str]
Observation = Tuple[Key, float]


# ---------------------------------------------------------------- 관측 수집

def collect_targets(row: Dict[str, Any]) -> Dict[str, float]:
    """한 글자의 후보 단계에서 역할면 타깃값을 모은다. 부분·포기 단계는 제외한다."""
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
    return values


def observation_key(row: Dict[str, Any]) -> Key:
    identity = row["identity"]
    return (identity["initialJamo"], identity["medialJamo"], identity["finalJamo"] or NO_FINAL)


def group_observations(rows: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, List[Tuple[str, Key, float]]]]:
    """target -> layer -> [(character, key, value)]. 글자 순서는 codepoint 순으로 고정한다."""
    grouped: Dict[str, Dict[str, List[Tuple[str, Key, float]]]] = defaultdict(lambda: defaultdict(list))
    for row in sorted(rows, key=lambda item: item["identity"]["codepoint"]):
        layer = row["identity"]["contextId"]
        key = observation_key(row)
        for target, value in collect_targets(row).items():
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


def evaluate_holdout(observations: Sequence[Tuple[str, Key, float]]) -> Optional[Dict[str, Any]]:
    training, holdout = split_holdout(observations)
    if not holdout or not training:
        return None
    fitted = median_polish([(observations[index][1], observations[index][2]) for index in training])
    errors: List[float] = []
    for index in holdout:
        _, key, value = observations[index]
        predicted = fitted["representative"] + sum(
            fitted["effects"][factor].get(key[position], 0.0) for position, factor in enumerate(FACTORS)
        )
        errors.append(value - predicted)
    return {
        "trainingCount": len(training),
        "holdoutCount": len(holdout),
        "reproductionError": residual_distribution(errors),
    }


# ---------------------------------------------------------------- 층 모델

def build_layer_model(
    observations: Sequence[Tuple[str, Key, float]],
    thresholds: Sequence[float] = THRESHOLDS,
    default_threshold: float = DEFAULT_THRESHOLD,
) -> Dict[str, Any]:
    fitted = median_polish([(key, value) for _, key, value in observations])
    residuals = fitted["residuals"]
    characters = [character for character, _, _ in observations]
    level_counts = {
        factor: Counter(key[index] for _, key, _ in observations) for index, factor in enumerate(FACTORS)
    }
    exceptions_by_threshold: Dict[str, Any] = {}
    for threshold in thresholds:
        selected = [
            (character, key, residual)
            for character, (key, residual) in zip(characters, residuals)
            if abs(residual) > threshold
        ]
        exceptions_by_threshold[f"{threshold:g}"] = {
            "count": len(selected),
            "ratio": round(len(selected) / len(observations), 4),
            "characters": [
                {"character": character, "residual": round(residual, 3)}
                for character, _, residual in sorted(selected, key=lambda item: -abs(item[2]))
            ],
        }
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


def build_model(report: Dict[str, Any]) -> Dict[str, Any]:
    grouped = group_observations(report["cases"])
    targets: Dict[str, Any] = {}
    for target in sorted(grouped):
        layers = {
            layer: build_layer_model(grouped[target][layer])
            for layer in LAYERS
            if grouped[target].get(layer)
        }
        targets[target] = {"layers": layers}
    return targets


def summarize(targets: Dict[str, Any]) -> Dict[str, Any]:
    verdicts: Counter = Counter()
    layer_count = 0
    for target in targets.values():
        for layer in target["layers"].values():
            layer_count += 1
            verdicts[layer["diagnosis"]["verdict"]] += 1
    return {"targetCount": len(targets), "layerModelCount": layer_count, "verdictCounts": dict(verdicts)}


def run(corpus_root: Path, report_name: str = "all.json") -> Dict[str, Any]:
    report_path = corpus_root / "reports" / report_name
    with report_path.open(encoding="utf-8") as source:
        report = json.load(source)
    started = time.monotonic()
    targets = build_model(report)
    summary = summarize(targets)
    summary["elapsedSeconds"] = round(time.monotonic() - started, 3)
    result = {
        "schema": SCHEMA,
        "estimator": ESTIMATOR,
        "interactions": "none",
        "font": report["font"],
        "stageKeys": report["stageKeys"],
        "sourceReport": report_name,
        "measurementScale": "1000-unit",
        "meaning": (
            "층별 median polish 주효과. 편집 후 = 실측 + 사용자가 바꾼 효과항 Δ. "
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
    output_dir = corpus_root / "analysis"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "variation-model-v1.json"
    with output_path.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    result["outputPath"] = str(output_path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="역할면 변화량 모델 v1 (주효과 median polish, 관측 불변)")
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
