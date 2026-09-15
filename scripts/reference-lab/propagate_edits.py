#!/usr/bin/env python3
"""효과항 편집을 문맥별 글자 기준선으로 전파하는 코어.

편집식은 `편집 후 = 실측 + Σ 바꾼 효과항 Δ`다(원칙: 실측 보존, 편집 단위 = 주효과).
전파는 모델 예측이 필요 없다 — Δ는 사용자가 정한 효과 편집값이고 실측에 더할 뿐이다.
모델은 UI에서 현재 효과값을 보여줘 무엇을 편집하는지 알리는 용도이며 여기 코어와 무관하다.

한 편집은 (타깃, 층, 인자, 수준, Δ)로 그 층·그 자모 수준에 해당하는 모든 글자에 브로드캐스트된다.
셀 보정·잔차는 실측에 이미 들어있어 효과 편집이 안 건드리므로 자동 보존된다.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

from validate_against_approved import (
    DEFAULT_APPROVED,
    FACE_TARGETS,
    MEDIAL_TARGETS,
    NO_FINAL,
    SCALE,
    read_value,
)

FACTORS = ("initial", "medial", "final")


@dataclass(frozen=True)
class Edit:
    """효과항 하나의 편집. layer는 contextId, factor는 initial/medial/final, level은 자모 수준."""

    target: str
    layer: str
    factor: str
    level: str
    delta: float  # 1000단위


@dataclass(frozen=True)
class Glyph:
    identity: Dict[str, Any]
    baselines: Dict[str, float]  # target -> 실측(1000단위)

    def level(self, factor: str) -> str:
        value = self.identity["finalJamo"] if factor == "final" else self.identity[f"{factor}Jamo"]
        return value or NO_FINAL if factor == "final" else value


def build_glyphs(approved: Dict[str, Any]) -> List[Glyph]:
    """승인 입력의 인라인 측정에서 글자별 타깃 기준선(1000단위)을 만든다."""
    glyphs: List[Glyph] = []
    for case in approved["cases"]:
        stages = case["stages"]
        baselines: Dict[str, float] = {}
        for spec in FACE_TARGETS:
            value = read_value(stages, spec, True)
            if value is not None:
                baselines[spec[0]] = value * SCALE
        for spec in MEDIAL_TARGETS:
            value = read_value(stages, spec, False)
            if value is not None:
                baselines[spec[0]] = value * SCALE
        glyphs.append(Glyph(identity=case["identity"], baselines=baselines))
    return glyphs


def edit_matches(edit: Edit, glyph: Glyph) -> bool:
    if glyph.identity["contextId"] != edit.layer:
        return False
    if edit.target not in glyph.baselines:
        return False
    return glyph.level(edit.factor) == edit.level


def propagate(glyphs: Sequence[Glyph], edits: Iterable[Edit]) -> Dict[str, Any]:
    """각 글자·타깃의 편집 후 기준선. delta는 이 글자에 적용되는 편집들의 합이다."""
    edits = list(edits)
    rows: List[Dict[str, Any]] = []
    changed = 0
    for glyph in glyphs:
        for target, base in glyph.baselines.items():
            delta = sum(edit.delta for edit in edits if edit.target == target and edit_matches(edit, glyph))
            if delta:
                changed += 1
            rows.append(
                {
                    "codepoint": glyph.identity["codepoint"],
                    "character": glyph.identity["character"],
                    "target": target,
                    "layer": glyph.identity["contextId"],
                    "baseline": round(base, 3),
                    "delta": round(delta, 3),
                    "edited": round(base + delta, 3),
                }
            )
    return {"editCount": len(edits), "rowCount": len(rows), "changedRowCount": changed, "rows": rows}


def parse_edit(text: str) -> Edit:
    """`target:layer:factor:level:delta` 형식을 Edit로."""
    parts = text.split(":")
    if len(parts) != 5:
        raise argparse.ArgumentTypeError("편집 형식은 target:layer:factor:level:delta 입니다.")
    target, layer, factor, level, delta = parts
    if factor not in FACTORS:
        raise argparse.ArgumentTypeError(f"factor는 {FACTORS} 중 하나여야 합니다.")
    return Edit(target=target, layer=layer, factor=factor, level=level, delta=float(delta))


def main() -> None:
    parser = argparse.ArgumentParser(description="효과항 편집을 글자 기준선으로 전파(실측 + Δ)")
    parser.add_argument("--approved", type=Path, default=DEFAULT_APPROVED)
    parser.add_argument(
        "--edit",
        action="append",
        type=parse_edit,
        default=[],
        help="target:layer:factor:level:delta (예: initial.roleFaces.bottom:bottom:initial:ㄱ:-10)",
    )
    args = parser.parse_args()
    with args.approved.open(encoding="utf-8") as source:
        approved = json.load(source)
    glyphs = build_glyphs(approved)
    result = propagate(glyphs, args.edit)
    print(f"글자 {len(glyphs)} · 타깃 행 {result['rowCount']} · 편집 {result['editCount']} · 바뀐 행 {result['changedRowCount']}")
    for row in result["rows"]:
        if row["delta"]:
            print(f"  {row['character']} {row['target']}: {row['baseline']:.1f} → {row['edited']:.1f} ({row['delta']:+.1f})")


if __name__ == "__main__":
    main()
