#!/usr/bin/env python3
"""눈 ① 그림 데이터 — 프로브가 줄기를 제대로 짚었는지 보는 실험실 JSON.

플랜 `docs/plans/2026-10-01_속공간-지키기.md`의 `같은 자` 단계 확인 그림.
글자마다 양쪽(우리 · 참고) × 굵기(400 · 900)의 윤곽과, 프로브 선 · 잉크 구간을 담는다.
실험실(`CounterProgressMap`의 같은 자 칸)이 그대로 그린다. 관측만 하고 앱 값은 바꾸지 않는다.

다시 만들기:
  WEIGHT_PROBE=1 PROBE_OUT=/tmp/ours-plain.json npx vitest run --dir src-next weight-probe-contours
  python3 measure_weight_offsets_contours.py --contours /tmp/ours-plain.json --output /tmp/ours-plain-offsets.json
  python3 build_weight_probe_lab.py --ours-contours /tmp/ours-plain.json --ours-offsets /tmp/ours-plain-offsets.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import compare_weight_offsets as compare

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEIGHTS = ("400", "900")
# 깨끗한 글자(가 · 마)와, 숫자가 수상했던 글자(초 ×2.46 · 뽀 가로 '-' · 쏘 빗금 · 쪼 합쳐짐 · 호 동그라미 · 하)를 섞는다.
DEFAULT_CHARS = "가마하호초뽀쏘쪼"


def path_of(polygons: List[List[List[float]]]) -> str:
    parts = []
    for polygon in polygons:
        if len(polygon) < 3:
            continue
        parts.append("M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in polygon) + "Z")
    return "".join(parts)


def probes_of(entry: Dict[str, Any], weight: str) -> Dict[str, Any] | None:
    record = entry["weights"].get(weight)
    if not record or record.get("reasonCode"):
        return None
    return {
        "box": record["componentBox"],
        "probes": {
            orientation: [
                {"position": row["position"], "intervals": row["intervals"]}
                for row in record["probes"][orientation]
            ]
            for orientation in ("horizontal", "vertical")
        },
    }


def side_of(char: str, offsets: Dict[str, Any], outlines: Dict[str, Dict[str, str]]) -> Dict[str, Any] | None:
    entry = offsets["characters"].get(char)
    if not entry:
        return None
    row = compare.character_row(entry, "900")
    per_weight: Dict[str, Any] = {}
    for weight in WEIGHTS:
        measured = probes_of(entry, weight)
        if not measured:
            per_weight[weight] = None
            continue
        per_weight[weight] = {**measured, **outlines.get(weight, {})}
    return {
        "weights": per_weight,
        "vertical900": row["vertical"] if row else None,
        "horizontal900": row["horizontal"] if row else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="같은 자 확인 그림 데이터 (관측 불변)")
    parser.add_argument("--ours-contours", type=Path, required=True)
    parser.add_argument("--ours-offsets", type=Path, required=True)
    parser.add_argument("--reference-offsets", type=Path, default=PROJECT_ROOT / "reference-data/noto-weight-offsets.v1.json")
    parser.add_argument("--reference-ghosts", type=Path, default=PROJECT_ROOT / "reference-data/noto-weight-ghosts.v1.json")
    parser.add_argument("--chars", default=DEFAULT_CHARS)
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "src-next/weightProbeLab.json")
    args = parser.parse_args()
    ours_contours = json.load(args.ours_contours.open(encoding="utf-8"))
    ours_offsets = json.load(args.ours_offsets.open(encoding="utf-8"))
    reference_offsets = json.load(args.reference_offsets.open(encoding="utf-8"))
    reference_ghosts = json.load(args.reference_ghosts.open(encoding="utf-8"))

    characters: Dict[str, Any] = {}
    for char in args.chars:
        our_shapes = ours_contours["characters"].get(char, {}).get("weights", {})
        our_outlines = {
            weight: {
                "component": path_of(our_shapes.get(weight, {}).get("component", [])),
                "rest": path_of(our_shapes.get(weight, {}).get("medial", [])),
            }
            for weight in WEIGHTS
        }
        ghost = reference_ghosts["characters"].get(char, {}).get("weights", {})
        reference_outlines = {
            weight: {
                "component": ghost.get(weight, {}).get("componentPath") or "",
                "rest": "",
                "full": ghost.get(weight, {}).get("path") or "",
            }
            for weight in WEIGHTS
        }
        ours = side_of(char, ours_offsets, our_outlines)
        reference = side_of(char, reference_offsets, reference_outlines)
        if ours and reference:
            characters[char] = {"ours": ours, "reference": reference}

    pooled: Dict[str, Any] = {}
    for key in compare.POOLED_KEYS:
        mine = (ours_offsets["pooled"]["900"].get(key) or {}).get("median")
        theirs = (reference_offsets["pooled"]["900"].get(key) or {}).get("median")
        pooled[key] = {"ours": mine, "reference": theirs}

    with args.output.open("w", encoding="utf-8") as target:
        json.dump({
            "schema": "weight-probe-lab-v1",
            "frame": "1000-unit, y-down, baseline 880",
            "weights": list(WEIGHTS),
            "probeRatios": ours_offsets.get("probeRatios"),
            "pooled900": pooled,
            "characters": characters,
        }, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    print(f"{args.output} ({len(characters)}자)")


if __name__ == "__main__":
    main()
