#!/usr/bin/env python3
"""손잡이 격자 훑기 — 참고 폰트 900에 가장 가까운 손잡이 값을 숫자로 찾는다.

플랜 `docs/plans/2026-10-01_속공간-지키기.md`의 `900 맞추기` 단계.
조합마다 (우리 윤곽 내보내기 → 같은 프로브 → 오차 점수)를 돌리고 점수 낮은 순으로 늘어놓는다.
내보내기는 vitest(`weight-probe-contours`)를 환경 변수로 부른다. 관측만 하고 앱 값은 바꾸지 않는다.

  python3 fit_weight_handles.py --workdir /tmp/fit --output /tmp/fit/summary.json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import compare_weight_offsets as compare
import measure_weight_offsets as probe
import measure_weight_offsets_contours as contours_probe

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEIGHT = "900"
# 손잡이 격자. hshare = 400 대비 늘어난 두께 가운데 가로줄기가 받는 몫(1 = 지금 · 0.93 = 노토 ×1.88 · 0.526 = 눈으로 고른 ×1.5).
HSHARES = (1.0, 0.93, 0.79, 0.632, 0.526)
# 하한선 비율(고정 24u · 쌓인 가로줄기 0.25는 B′ 그대로). None = 하한선 끔.
FLOOR_RATIOS: Tuple[Optional[float], ...] = (None, 0.25, 0.35, 0.5)
# 자소 배율 바닥(하한선이 있을 때만 뜻이 있다).
MIN_SCALES = (0.0, 0.8, 0.9, 0.95)


def export_contours(out: Path, hshare: float, floor_ratio: Optional[float], min_scale: float) -> None:
    env = {**os.environ, "WEIGHT_PROBE": "1", "PROBE_OUT": str(out), "PROBE_WEIGHTS": "400,900"}
    if hshare != 1.0:
        env["PROBE_HSHARE"] = str(hshare)
    if floor_ratio is not None:
        env["PROBE_FLOOR"] = f"24,{floor_ratio},0.25"
        if min_scale:
            env["PROBE_MINSCALE"] = str(min_scale)
    subprocess.run(
        ["npx", "vitest", "run", "--dir", "src-next", "weight-probe-contours"],
        cwd=PROJECT_ROOT, env=env, check=True, capture_output=True,
    )


def rows_of(offsets: Dict[str, Any]) -> Dict[str, Any]:
    return {
        character: row
        for character, entry in offsets["characters"].items()
        if (row := compare.character_row(entry, WEIGHT)) is not None
    }


def offsets_of(contours_path: Path) -> Dict[str, Any]:
    source = json.loads(contours_path.read_text(encoding="utf-8"))
    characters = contours_probe.measure_characters(source)
    weights = [int(value) for value in source["weights"]]
    derived = {character: probe.derive_character(entry, weights) for character, entry in characters.items()}
    return {"characters": {character: {**entry, "derived": derived[character]} for character, entry in characters.items()}}


def main() -> None:
    parser = argparse.ArgumentParser(description="손잡이 격자 훑기 (관측 불변)")
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--reference", type=Path, default=PROJECT_ROOT / "reference-data/noto-weight-offsets.v1.json")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)
    reference_rows = rows_of(json.loads(args.reference.read_text(encoding="utf-8")))

    combos: List[Dict[str, Any]] = []
    for hshare in HSHARES:
        for floor_ratio in FLOOR_RATIOS:
            for min_scale in MIN_SCALES if floor_ratio is not None else (0.0,):
                combos.append({"hshare": hshare, "floorRatio": floor_ratio, "minScale": min_scale})

    results: List[Dict[str, Any]] = []
    for index, combo in enumerate(combos):
        name = f"h{combo['hshare']}-f{combo['floorRatio']}-m{combo['minScale']}"
        contours_path = args.workdir / f"{name}.json"
        if not contours_path.exists():
            export_contours(contours_path, combo["hshare"], combo["floorRatio"], combo["minScale"])
        ours_rows = rows_of(offsets_of(contours_path))
        per_character = {
            character: {"ours": mine, "reference": reference_rows[character]}
            for character, mine in ours_rows.items() if character in reference_rows
        }
        score = compare.score_of(per_character)
        results.append({**combo, "name": name, "median": score["median"], "mean": score["mean"], "worst": score["worst"][:3]})
        print(f"[{index + 1}/{len(combos)}] {name} 중앙값 {score['median']} 평균 {score['mean']}", file=sys.stderr)

    results.sort(key=lambda row: (row["median"] if row["median"] is not None else 9e9, row["mean"] or 9e9))
    print("\n== 점수 낮은 순 (중앙값 · 평균 · 나쁜 글자) ==")
    for row in results[:15]:
        worst = " ".join(f"{item['char']}{item['score']}" for item in row["worst"])
        print(f"{row['median']:.4f} {row['mean']:.4f}  h{row['hshare']} f{row['floorRatio']} m{row['minScale']}  {worst}")
    if args.output:
        args.output.write_text(json.dumps({"schema": "fit-weight-handles-v1", "weight": WEIGHT, "results": results}, ensure_ascii=False, sort_keys=True, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
