#!/usr/bin/env python3
"""Noto 실측 윤곽 + 역할면 기준선을 글자별 프리셋 데이터로 내보내는 패스(Y 경로 1단계).

각 글자마다 실제 Noto 윤곽(폰트 단위 operations)과 0~1 정규화 역할면 기준선을 함께 담는다.
이 데이터는 앱이 67 자모 획 모델 대신 글자별 윤곽을 렌더하고, 기준선을 편집 단위로 결속하는
새 경로(단계 2·3)의 입력이다. 실측 그대로 읽기만 하며 모델 예측·편집은 넣지 않는다.

기준선은 보고서 인라인 측정에서, 윤곽 operations는 outline 캐시 파일에서 읽는다.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

from validate_against_approved import FACE_TARGETS, MEDIAL_TARGETS, read_value

SCHEMA = "noto-preset-outlines-v1"
DEFAULT_CORPUS = (
    Path(__file__).resolve().parents[2] / ".reference-fonts/guide-corpus/251eae7645152d1705a55414"
)


def baselines_of(stages: Dict[str, Any]) -> Dict[str, float]:
    """글자의 0~1 역할면 기준선(실측). 측정이 있는 타깃만."""
    result: Dict[str, float] = {}
    for spec in FACE_TARGETS:
        value = read_value(stages, spec, True)
        if value is not None:
            result[spec[0]] = value
    for spec in MEDIAL_TARGETS:
        value = read_value(stages, spec, False)
        if value is not None:
            result[spec[0]] = value
    return result


def outline_of(corpus_root: Path, artifact: str) -> Dict[str, Any]:
    """outline 캐시에서 폰트 단위 operations와 unitsPerEm·잉크 경계를 읽는다."""
    path = (corpus_root / artifact).resolve()
    if not str(path).startswith(str(corpus_root.resolve()) + "/"):
        raise ValueError(f"corpus 바깥 경로: {artifact}")
    with path.open(encoding="utf-8") as source:
        observation = json.load(source)["payload"]["observation"]
    return {
        "unitsPerEm": observation["unitsPerEm"],
        "operations": observation["operations"],
        "inkBounds": observation.get("inkBounds"),
    }


def export(corpus_root: Path, report_name: str = "all.json") -> Dict[str, Any]:
    with (corpus_root / "reports" / report_name).open(encoding="utf-8") as source:
        report = json.load(source)
    glyphs: List[Dict[str, Any]] = []
    skipped = 0
    for case in report["cases"]:
        stages = case["stages"]
        outline_stage = stages.get("outline", {})
        if outline_stage.get("status") != "candidate" or not outline_stage.get("artifact"):
            skipped += 1
            continue
        glyphs.append(
            {
                "identity": case["identity"],
                "outline": outline_of(corpus_root, outline_stage["artifact"]),
                "baselines": baselines_of(stages),
            }
        )
    return {
        "schema": SCHEMA,
        "font": report["font"],
        "stageKeys": report["stageKeys"],
        "coordinateFrame": "glyph-normalized-baselines-with-font-unit-outline",
        "sourceReport": report_name,
        "meaning": (
            "글자별 Noto 실측 윤곽(폰트 단위 operations)과 0~1 역할면 기준선. "
            "앱이 글자별 윤곽을 렌더하고 기준선을 편집 단위로 결속하는 경로의 입력이다. "
            "실측 그대로이며 모델 예측·편집·승인은 포함하지 않는다."
        ),
        "glyphCount": len(glyphs),
        "skippedNoOutline": skipped,
        "glyphs": glyphs,
    }


def run(corpus_root: Path, report_name: str = "all.json") -> Path:
    result = export(corpus_root, report_name)
    output_dir = corpus_root / "analysis"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{SCHEMA}.json"
    with output_path.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Noto 윤곽+기준선 글자별 프리셋 데이터 export")
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--report", default="all.json")
    args = parser.parse_args()
    output_path = run(args.corpus, args.report)
    size_mb = output_path.stat().st_size / (1024 * 1024)
    with output_path.open(encoding="utf-8") as source:
        result = json.load(source)
    print(
        f"글자 {result['glyphCount']}자 · outline 없음 {result['skippedNoOutline']}자 · "
        f"{size_mb:.1f}MB → {output_path}"
    )


if __name__ == "__main__":
    main()
