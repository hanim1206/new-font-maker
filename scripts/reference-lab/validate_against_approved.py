#!/usr/bin/env python3
"""승인 입력(사람이 검증한 마스터) 대비 변화량 모델 예측의 정합을 재는 골든셋 회귀 패스.

모델(corpus 전수에서 학습)이 사람이 승인한 57자의 역할면 실측을 얼마나 재현하는지 본다.
예측 = 대표값 + Σ효과 + 셀 보정으로, notoCorpusApi.ts의 predictTarget과 같은 식이다.
승인 실측은 안 덮고 읽기만 하며, 큰 잔차는 모델이 못 맞힌 곳으로 보고만 한다.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

NO_FINAL = "∅"
SCALE = 1000.0
SCHEMAS = {"noto-variation-model-v1", "noto-variation-model-v2"}

DEFAULT_MODEL = (
    Path(__file__).resolve().parents[2]
    / ".reference-fonts/guide-corpus/251eae7645152d1705a55414/analysis/variation-model-v2.json"
)
DEFAULT_APPROVED = (
    Path(__file__).resolve().parents[2]
    / "reference-data/preset-candidates/noto-approved-guide-inputs.v1.json"
)

# 모델이 예측하는 역할면 타깃. notoCorpusApi.ts의 MODELED_TARGETS와 같은 집합·같은 읽기 규칙.
# ("target", "stage", "roleFace" side | "medial" role, field)
FACE_TARGETS = (
    ("initial.roleFaces.bottom", "initial", "bottom"),
    ("initial.roleFaces.left", "initial", "left"),
    ("initial.roleFaces.right", "initial", "right"),
    ("final.roleFaces.right", "final", "right"),
)
MEDIAL_TARGETS = (
    ("medial.baseStem.face", "baseStem", "face"),
    ("medial.leftStem.face", "leftStem", "face"),
    ("medial.rightStem.face", "rightStem", "face"),
    ("medial.primaryBeam.face", "primaryBeam", "face"),
    ("medial.upperBeam.face", "upperBeam", "face"),
    ("medial.lowerBeam.face", "lowerBeam", "face"),
    ("medial.upperBeam.visibleLength", "upperBeam", "visibleLength"),
    ("medial.primaryBeam.visibleLength", "primaryBeam", "visibleLength"),
    ("medial.lowerBeam.visibleLength", "lowerBeam", "visibleLength"),
)
TARGET_ORDER = [name for name, _, _ in FACE_TARGETS] + [name for name, _, _ in MEDIAL_TARGETS]


def cell_term(layer: Dict[str, Any], identity: Dict[str, Any]) -> float:
    """v2 층의 interaction이 이 글자 자모쌍에 걸리면 셀 보정값, 아니면 0."""
    interaction = layer.get("interaction", {})
    if not interaction.get("applied"):
        return 0.0
    level = {
        "initial": identity["initialJamo"],
        "medial": identity["medialJamo"],
        "final": identity["finalJamo"] or NO_FINAL,
    }
    first, second = interaction["pair"].split("×")
    for entry in interaction["cells"]:
        if entry["cell"][0] == level[first] and entry["cell"][1] == level[second]:
            return entry["term"]
    return 0.0


def predict(model: Dict[str, Any], target: str, identity: Dict[str, Any], value: float) -> Optional[Dict[str, Any]]:
    layer = model["targets"].get(target, {}).get("layers", {}).get(identity["contextId"])
    if not layer:
        return None
    effects = layer["effects"]
    predicted = (
        layer["representative"]
        + effects["initial"].get(identity["initialJamo"], 0.0)
        + effects["medial"].get(identity["medialJamo"], 0.0)
        + effects["final"].get(identity["finalJamo"] or NO_FINAL, 0.0)
        + cell_term(layer, identity)
    )
    actual = value * SCALE
    residual = actual - predicted
    return {
        "predicted": predicted,
        "actual": actual,
        "residual": residual,
        "threshold": layer["defaultThreshold"],
        "exception": abs(residual) > layer["defaultThreshold"],
    }


def read_value(stages: Dict[str, Any], spec: Tuple[str, str, str], face: bool) -> Optional[float]:
    if face:
        _, stage, side = spec
        measurements = (stages.get(stage) or {}).get("measurements", {})
        value = (measurements.get("roleFaces") or {}).get(side)
    else:
        _, role, field = spec
        measurement = ((stages.get("medial") or {}).get("measurements", {}) or {}).get(role)
        value = measurement.get(field) if measurement else None
    return value if isinstance(value, (int, float)) else None


def distribution(residuals: List[float]) -> Dict[str, float]:
    magnitudes = sorted(abs(value) for value in residuals)
    position = min(len(magnitudes) - 1, int(round(0.95 * (len(magnitudes) - 1))))
    return {
        "count": len(magnitudes),
        "median": round(statistics.median(magnitudes), 3),
        "p95": round(magnitudes[position], 3),
        "max": round(magnitudes[-1], 3),
    }


def validate(model: Dict[str, Any], approved: Dict[str, Any]) -> Dict[str, Any]:
    per_target: Dict[str, Dict[str, Any]] = {}
    residuals: Dict[str, List[float]] = {name: [] for name in TARGET_ORDER}
    exceptions: Dict[str, List[Dict[str, Any]]] = {name: [] for name in TARGET_ORDER}
    for case in approved["cases"]:
        identity, stages = case["identity"], case["stages"]
        for spec, face in [(spec, True) for spec in FACE_TARGETS] + [(spec, False) for spec in MEDIAL_TARGETS]:
            target = spec[0]
            value = read_value(stages, spec, face)
            if value is None:
                continue
            outcome = predict(model, target, identity, value)
            if outcome is None:
                continue
            residuals[target].append(outcome["residual"])
            if outcome["exception"]:
                exceptions[target].append({"character": identity["character"], "residual": round(outcome["residual"], 3)})
    for name in TARGET_ORDER:
        if not residuals[name]:
            per_target[name] = {"count": 0, "predicted": False}
            continue
        per_target[name] = {
            "predicted": True,
            "residual": distribution(residuals[name]),
            "exceptionCount": len(exceptions[name]),
            "exceptions": sorted(exceptions[name], key=lambda item: -abs(item["residual"])),
        }
    all_residuals = [value for name in TARGET_ORDER for value in residuals[name]]
    return {
        "schema": "noto-variation-model-validation-v1",
        "modelSchema": model["schema"],
        "approvedCaseCount": approved.get("caseCount"),
        "overall": distribution(all_residuals) if all_residuals else {"count": 0},
        "targets": per_target,
    }


def run(model_path: Path, approved_path: Path) -> Dict[str, Any]:
    with model_path.open(encoding="utf-8") as source:
        model = json.load(source)
    if model["schema"] not in SCHEMAS:
        raise ValueError(f"알 수 없는 모델 스키마: {model['schema']}")
    with approved_path.open(encoding="utf-8") as source:
        approved = json.load(source)
    if approved.get("inputApproved") is not True:
        raise ValueError("승인 입력이 아닙니다(inputApproved != true).")
    if model["font"].get("fileSha256") != approved["font"].get("fileSha256"):
        raise ValueError("모델과 승인 입력의 폰트가 다릅니다. 같은 폰트에서만 비교합니다.")
    return validate(model, approved)


def main() -> None:
    parser = argparse.ArgumentParser(description="변화량 모델 예측 vs 승인 마스터 골든셋 회귀")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--approved", type=Path, default=DEFAULT_APPROVED)
    args = parser.parse_args()
    result = run(args.model, args.approved)
    lines = [f"승인 {result['approvedCaseCount']}자 대비 {result['modelSchema']} 정합 (단위 1000)"]
    lines.append(f"{'target':38} {'n':>3} {'med':>6} {'p95':>6} {'max':>6} {'exc':>4}")
    for name in TARGET_ORDER:
        info = result["targets"][name]
        if not info.get("predicted"):
            lines.append(f"{name:38}  -- 무예측")
            continue
        dist = info["residual"]
        lines.append(f"{name:38} {dist['count']:>3} {dist['median']:>6.1f} {dist['p95']:>6.1f} {dist['max']:>6.1f} {info['exceptionCount']:>4}")
    overall = result["overall"]
    if overall.get("count"):
        lines.append(f"{'전체':38} {overall['count']:>3} {overall['median']:>6.1f} {overall['p95']:>6.1f} {overall['max']:>6.1f}")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
