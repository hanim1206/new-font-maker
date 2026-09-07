#!/usr/bin/env python3
"""Generate the deterministic S0b vertical-vowel spacing evidence board."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
from typing import Any

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen, RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


FONT_SPECS = [
    {
        "id": "noto-sans-kr",
        "family": "Noto Sans KR",
        "fileName": "NotoSansKR.ttf",
        "role": "중립 기준",
        "aggregation": "core",
        "source": "https://github.com/google/fonts/tree/main/ofl/notosanskr",
    },
    {
        "id": "ibm-plex-sans-kr",
        "family": "IBM Plex Sans KR",
        "fileName": "IBMPlexSansKR-Regular.ttf",
        "role": "중립 기준",
        "aggregation": "core",
        "source": "https://github.com/google/fonts/tree/main/ofl/ibmplexsanskr",
    },
    {
        "id": "nanum-gothic",
        "family": "Nanum Gothic",
        "fileName": "NanumGothic-Regular.ttf",
        "role": "중립 기준",
        "aggregation": "core",
        "source": "https://github.com/google/fonts/tree/main/ofl/nanumgothic",
    },
    {
        "id": "dotum",
        "family": "Dotum",
        "fileName": "Dotum-Regular.ttf",
        "role": "중립 기준",
        "aggregation": "core",
        "source": "https://github.com/google/fonts/tree/main/ofl/dotum",
    },
    {
        "id": "gowun-dodum",
        "family": "Gowun Dodum",
        "fileName": "GowunDodum-Regular.ttf",
        "role": "스타일 경계",
        "aggregation": "boundary",
        "source": "https://github.com/google/fonts/tree/main/ofl/gowundodum",
    },
    {
        "id": "black-han-sans",
        "family": "Black Han Sans",
        "fileName": "BlackHanSans-Regular.ttf",
        "role": "고밀도 스트레스",
        "aggregation": "stress",
        "source": "https://github.com/google/fonts/tree/main/ofl/blackhansans",
    },
]

GLYPH_GROUPS = [
    ("ㄱ", ("가", "거")),
    ("ㄴ", ("나", "너")),
    ("ㄷ", ("다", "더")),
    ("ㅁ", ("마", "머")),
    ("ㅇ", ("아", "어")),
]
GLYPHS = [glyph for _, pair in GLYPH_GROUPS for glyph in pair]
LICENSE = "SIL Open Font License 1.1"
STROKE_WIDTH = 0.075
LEGACY_CURRENT_JU_X = 0.750625
DISPLAY_VIEW_BOX = [-120, -120, 1240, 1240]
CANONICAL_ASCENDER = 880
CANONICAL_DESCENDER = -120
BASELINE_Y = CANONICAL_ASCENDER
GAP_BAND_Y = 75
GAP_BAND_HEIGHT = 850
CH_RIGHT_CENTER = 0.495
JU_CENTER_OFFSET = 0.0871875
CH_TOP_Y = 300
CH_BOTTOM_Y = 675
JU_TOP_Y = 245
JU_ARM_Y = 500
JU_BOTTOM_Y = 755
NOTO_STROKE_SAMPLES = {
    "chHorizontal": 68.6114501953,
    "juHorizontal": 69.1715087891,
    "juVertical": 83.3118896484,
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load_font(path: Path) -> TTFont:
    font = TTFont(path)
    if "fvar" in font:
        axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
        if "wght" in axes:
            axes["wght"] = 400
        font = instantiateVariableFont(font, axes, inplace=False)
    return font


def font_version(font: TTFont) -> str:
    name_table = font["name"]
    for record in name_table.names:
        if record.nameID == 5:
            try:
                return record.toUnicode().strip()
            except UnicodeDecodeError:
                continue
    return "기록 없음"


def glyph_path(font: TTFont, glyph: str) -> dict[str, Any]:
    glyph_name = font.getBestCmap().get(ord(glyph))
    if glyph_name is None:
        raise ValueError(f"글리프 없음: {glyph}")
    glyph_set = font.getGlyphSet()
    item = glyph_set[glyph_name]
    path_pen = SVGPathPen(glyph_set)
    bounds_pen = BoundsPen(glyph_set)
    item.draw(path_pen)
    item.draw(bounds_pen)
    if not bounds_pen.bounds:
        raise ValueError(f"빈 윤곽: {glyph}")
    path = path_pen.getCommands()
    if not path or "nan" in path.lower() or "inf" in path.lower():
        raise ValueError(f"유효하지 않은 윤곽: {glyph}")
    return {
        "path": path,
        "pathSha256": sha256_bytes(path.encode("utf-8")),
        "unitsPerEm": int(font["head"].unitsPerEm),
        "advance": float(item.width) / font["head"].unitsPerEm,
        "bounds": [float(value) / font["head"].unitsPerEm for value in bounds_pen.bounds],
    }


def whole_x_empty_band(font: TTFont, glyph: str) -> dict[str, float] | None:
    """Largest fully empty vertical band between disjoint contour x-extents."""
    glyph_name = font.getBestCmap().get(ord(glyph))
    if glyph_name is None:
        return None
    glyph_set = font.getGlyphSet()
    pen = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(pen)

    contours: list[list[tuple[str, tuple[Any, ...]]]] = []
    current: list[tuple[str, tuple[Any, ...]]] = []
    for operator, arguments in pen.value:
        if operator == "moveTo" and current:
            contours.append(current)
            current = []
        current.append((operator, arguments))
        if operator in ("closePath", "endPath"):
            contours.append(current)
            current = []
    if current:
        contours.append(current)

    upm = font["head"].unitsPerEm
    intervals: list[tuple[float, float]] = []
    for commands in contours:
        recording = RecordingPen()
        recording.value = commands
        bounds = BoundsPen(glyph_set)
        recording.replay(bounds)
        if bounds.bounds:
            x_min, _, x_max, _ = bounds.bounds
            intervals.append((x_min / upm, x_max / upm))

    merged: list[tuple[float, float]] = []
    for left, right in sorted(intervals):
        if merged and left <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], right))
        else:
            merged.append((left, right))
    gaps = [
        {"value": merged[index + 1][0] - merged[index][1], "left": merged[index][1], "right": merged[index + 1][0]}
        for index in range(len(merged) - 1)
    ]
    return max(gaps, key=lambda gap: gap["value"]) if gaps else None


def rounded_five_units(value: float) -> float:
    return round(value * 1000 / 5) * 5 / 1000


def tukey_hinges(values: list[float]) -> tuple[float, float, float]:
    ordered = sorted(values)
    if len(ordered) != 4:
        raise ValueError("S0b core reference는 정확히 4종이어야 합니다.")
    return (
        (ordered[0] + ordered[1]) / 2,
        (ordered[1] + ordered[2]) / 2,
        (ordered[2] + ordered[3]) / 2,
    )


def y_calibration_variant(
    variant_id: str,
    label: str,
    target_ink_top: float,
    target_ink_bottom: float,
    basis: str,
) -> dict[str, Any]:
    half_stroke = STROKE_WIDTH * 1000 / 2
    target_centerline_top = target_ink_top + half_stroke
    target_centerline_bottom = target_ink_bottom - half_stroke
    scale_y = (target_centerline_bottom - target_centerline_top) / (JU_BOTTOM_Y - JU_TOP_Y)
    offset_y = target_centerline_top - JU_TOP_Y * scale_y
    map_y = lambda value: value * scale_y + offset_y
    return {
        "id": variant_id,
        "label": label,
        "basis": basis,
        "targetInkEnvelope": {"top": target_ink_top, "bottom": target_ink_bottom},
        "targetCenterlineEnvelope": {"top": target_centerline_top, "bottom": target_centerline_bottom},
        "affine": {"scaleY": scale_y, "offsetY": offset_y},
        "mappedCenterlines": {
            "chTop": map_y(CH_TOP_Y),
            "chBottom": map_y(CH_BOTTOM_Y),
            "juTop": map_y(JU_TOP_Y),
            "juArm": map_y(JU_ARM_Y),
            "juBottom": map_y(JU_BOTTOM_Y),
        },
        "bodyOverflow": {
            "top": max(0, 75 - target_ink_top),
            "bottom": max(0, target_ink_bottom - 925),
        },
    }


def collect(font_dir: Path) -> tuple[dict[str, Any], dict[tuple[str, str], dict[str, Any]]]:
    missing = [spec["fileName"] for spec in FONT_SPECS if not (font_dir / spec["fileName"]).is_file()]
    if missing:
        raise SystemExit(f"누락된 폰트: {', '.join(missing)}")

    font_records: list[dict[str, Any]] = []
    references: list[dict[str, Any]] = []
    render_data: dict[tuple[str, str], dict[str, Any]] = {}
    core_gaps: list[float] = []

    for spec in FONT_SPECS:
        path = font_dir / spec["fileName"]
        font = load_font(path)
        font_record = {
            **spec,
            "weight": 400,
            "license": LICENSE,
            "version": font_version(font),
            "fileSha256": sha256_bytes(path.read_bytes()),
        }
        font_records.append(font_record)
        for glyph in GLYPHS:
            outline = glyph_path(font, glyph)
            measurement = whole_x_empty_band(font, glyph) if glyph == "가" else None
            if glyph == "가" and measurement is None:
                raise ValueError(f"{spec['family']} 가의 X 빈 띠를 찾지 못했습니다.")
            if glyph == "가" and spec["aggregation"] == "core":
                core_gaps.append(measurement["value"])
            render_data[(spec["id"], glyph)] = {**outline, "measurement": measurement}
            references.append({
                "fontId": spec["id"],
                "glyph": glyph,
                "pathSha256": outline["pathSha256"],
                "unitsPerEm": outline["unitsPerEm"],
                "advance": outline["advance"],
                "bounds": outline["bounds"],
                "measurement": measurement,
            })
        font.close()

    noto_glyph = render_data[("noto-sans-kr", "가")]
    noto_measurement = noto_glyph["measurement"]
    if noto_measurement is None:
        raise ValueError("Noto Sans KR 가의 X 빈 띠가 필요합니다.")
    _, noto_y_min, _, noto_y_max = noto_glyph["bounds"]
    noto_ink_top = BASELINE_Y - noto_y_max * 1000
    noto_ink_bottom = BASELINE_Y - noto_y_min * 1000
    source_ink_top = JU_TOP_Y - STROKE_WIDTH * 1000 / 2
    source_ink_bottom = JU_BOTTOM_Y + STROKE_WIDTH * 1000 / 2
    y_variants = [
        y_calibration_variant(
            "current",
            "Current Y",
            source_ink_top,
            source_ink_bottom,
            "현재 Shape 중심선과 75-unit 획",
        ),
        y_calibration_variant(
            "body-fit",
            "Body-fit",
            75,
            925,
            "Canonical Design Body 75…925에 잉크 상·하단 일치",
        ),
        y_calibration_variant(
            "noto-envelope",
            "Noto envelope",
            noto_ink_top,
            noto_ink_bottom,
            "Noto Sans KR 400 가의 원본 잉크 상·하단 일치",
        ),
    ]

    raw_p25, raw_median, raw_p75 = tukey_hinges(core_gaps)
    p25, median, p75 = map(rounded_five_units, (raw_p25, raw_median, raw_p75))
    centerline_offset = CH_RIGHT_CENTER - JU_CENTER_OFFSET
    current_gap = LEGACY_CURRENT_JU_X - centerline_offset - STROKE_WIDTH
    candidate_values = [("current", current_gap), ("a", p25), ("b", median), ("c", p75)]
    candidates = [
        {
            "id": candidate_id,
            "label": {"current": "Current", "a": "A", "b": "B", "c": "C"}[candidate_id],
            "gap": gap,
            "gapFontUnits": gap * 1000,
            "strokeRatio": gap / STROKE_WIDTH,
            "juX": LEGACY_CURRENT_JU_X if candidate_id == "current" else gap + centerline_offset + STROKE_WIDTH,
            "deltaFromCurrent": (LEGACY_CURRENT_JU_X if candidate_id == "current" else gap + centerline_offset + STROKE_WIDTH) - LEGACY_CURRENT_JU_X,
            "basis": {
                "current": "현재 레거시 effective X · Noto 굵기로 재측정",
                "a": "중립 4종 Tukey P25 · 5 units 반올림",
                "b": "중립 4종 중앙값 · 5 units 반올림",
                "c": "중립 4종 Tukey P75 · 5 units 반올림",
            }[candidate_id],
        }
        for candidate_id, gap in candidate_values
    ]
    analysis_basis = {
        "schema": "vertical-vowel-gap-evidence-v1",
        "version": 1,
        "checkpoint": "S0b",
        "status": "candidate",
        "approved": False,
        "productionValueApplied": False,
        "decision": {
            "mode": "comparison-only-y-calibration",
            "xGapVerdict": "suspended",
            "question": "다음 X 간격 비교에서 Noto Sans KR 400 `가`의 잉크 상·하단에 맞춘 Y 표시안을 사용할까요?",
            "scope": "ㄱ+ㅏ 무받침 prototype의 비교 화면 전용 Y 크기·위치",
            "fixed": ["UPM 1000", "baseline 880", "획 75", "Noto 가와 같은 X 빈 띠", "Shape topology"],
            "excluded": ["X 간격 후보 선택", "production Y", "5선 위치", "다른 자소", "OTF 반영"],
        },
        "corpus": {
            "glyphs": GLYPHS,
            "fontCount": len(FONT_SPECS),
            "glyphCount": len(GLYPHS),
            "referenceSampleCount": len(references),
            "candidateCount": len(candidates),
            "missingCount": 0,
        },
        "fonts": font_records,
        "references": references,
        "measurement": {
            "id": "whole-x-empty-band",
            "label": "전폭 X 빈 띠(참고값)",
            "validForNumericAggregation": ["가"],
            "limitations": "초성–중성의 광학 최단거리가 아니다. x상 분리된 가의 contour 군집 사이에서 완전히 비는 가장 넓은 세로 띠만 잰다.",
            "coreFontIds": [spec["id"] for spec in FONT_SPECS if spec["aggregation"] == "core"],
            "excludedFromAggregation": [spec["id"] for spec in FONT_SPECS if spec["aggregation"] != "core"],
            "rawTukeyHinges": {"p25": raw_p25, "median": raw_median, "p75": raw_p75},
            "roundedFontUnitTargets": {"p25": p25 * 1000, "median": median * 1000, "p75": p75 * 1000},
        },
        "shapeGeometry": {
            "unitsPerEm": 1000,
            "strokeWidth": STROKE_WIDTH * 1000,
            "linecap": "round",
            "linejoin": "round",
            "chCenterline": [[180, 300], [495, 300], [495, 675]],
            "chRightCenter": CH_RIGHT_CENTER * 1000,
            "juCenterOffset": JU_CENTER_OFFSET * 1000,
            "juY": [245, 755],
            "juArmEndRatio": 0.8,
            "onlyVariable": "JU X translation",
            "strokeReference": {
                "fontId": "noto-sans-kr",
                "glyph": "가",
                "weight": 400,
                "method": "horizontal mean과 vertical stem의 균형값을 5 font units로 반올림",
                "samples": NOTO_STROKE_SAMPLES,
                "horizontalMean": (NOTO_STROKE_SAMPLES["chHorizontal"] + NOTO_STROKE_SAMPLES["juHorizontal"]) / 2,
                "rawBalancedValue": ((NOTO_STROKE_SAMPLES["chHorizontal"] + NOTO_STROKE_SAMPLES["juHorizontal"]) / 2 + NOTO_STROKE_SAMPLES["juVertical"]) / 2,
                "roundedValue": STROKE_WIDTH * 1000,
                "limitation": "Noto의 방향별 채움 윤곽을 복제하지 않고 단일 isotropic round stroke의 굵기만 정규화한다.",
            },
        },
        "comparisonYCalibration": {
            "status": "candidate",
            "scope": "display-only",
            "productionApplied": False,
            "reference": {
                "fontId": "noto-sans-kr",
                "glyph": "가",
                "weight": 400,
                "pathSha256": noto_glyph["pathSha256"],
                "sourceBounds": noto_glyph["bounds"],
                "inkEnvelope": {"top": noto_ink_top, "bottom": noto_ink_bottom},
            },
            "control": {
                "gapFontUnits": noto_measurement["value"] * 1000,
                "strokeWidth": STROKE_WIDTH * 1000,
                "xCalibration": "Noto 가의 전폭 X 빈 띠와 exact 일치",
            },
            "sourceCenterlines": {
                "chTop": CH_TOP_Y,
                "chBottom": CH_BOTTOM_Y,
                "juTop": JU_TOP_Y,
                "juArm": JU_ARM_Y,
                "juBottom": JU_BOTTOM_Y,
            },
            "variants": y_variants,
            "recommendedVariantId": "noto-envelope",
            "limitation": "Noto의 외곽 상·하단만 맞춘 비교 표시안이다. ㅏ 가로팔과 ㄱ 내부 획, 5선 위치의 승인이 아니다.",
        },
        "display": {
            "viewBox": DISPLAY_VIEW_BOX,
            "unitsPerEm": 1000,
            "rule": "공통 Font Space에서 reference는 원본, candidate는 명시한 comparison-only Y variant로 표시",
            "coordinateFrame": {
                "method": "shared-baseline",
                "ascender": CANONICAL_ASCENDER,
                "descender": CANONICAL_DESCENDER,
                "baselineY": BASELINE_Y,
                "xOrigin": 0,
                "yDirection": "down",
                "referenceTransform": "y=880-fontY*1000/nativeUPM",
                "candidateCoordinates": "font-space-y-down + explicit comparisonYCalibration variant",
                "inkAutofit": False,
                "individualCentering": False,
                "advanceNormalization": False,
                "emGuide": [0, 0, 1000, 1000],
                "designBodyGuide": [75, 75, 850, 850],
                "designBodyGuideRole": "guide-only",
                "gapBandY": [GAP_BAND_Y, GAP_BAND_Y + GAP_BAND_HEIGHT],
            },
            "glanceStrip": {
                "glyph": "가",
                "order": [f"reference:{spec['id']}" for spec in FONT_SPECS]
                + [f"candidate:{candidate['id']}" for candidate in candidates],
            },
        },
        "candidates": candidates,
        "xGapHypothesis": {
            "candidateId": "b",
            "reason": "중립 고딕 4종의 가 전폭 X 빈 띠 중앙값을 5 font units로 반올림한 prototype 후보",
            "provisional": True,
            "status": "suspended-until-y-calibration",
        },
        "recommendation": {
            "variantId": "noto-envelope",
            "reason": "X 간격 판단에서 글자 높이·상하 위치 차이를 줄이는 Noto 기준 비교 표시안",
            "provisional": True,
        },
    }
    analysis_sha = sha256_bytes(canonical_json(analysis_basis).encode("utf-8"))
    core = {**analysis_basis, "analysisSha256": analysis_sha}
    return core, render_data


def comparison_guides() -> str:
    return (
        '<rect class="em-frame" data-guide="em" x="0" y="0" width="1000" height="1000" aria-hidden="true"/>'
        '<rect class="body-frame" data-guide="design-body" x="75" y="75" width="850" height="850" aria-hidden="true"/>'
        f'<line class="baseline-guide" data-guide="baseline" x1="0" y1="{BASELINE_Y}" x2="1000" y2="{BASELINE_Y}" aria-hidden="true"/>'
    )


def reference_figure(spec: dict[str, Any], glyph: str, data: dict[str, Any]) -> str:
    scale = 1000 / data["unitsPerEm"]
    measurement = data["measurement"]
    if measurement:
        x = measurement["left"] * 1000
        width = measurement["value"] * 1000
        overlay = f'<rect class="gap-band" x="{x:.3f}" y="{GAP_BAND_Y}" width="{width:.3f}" height="{GAP_BAND_HEIGHT}" aria-hidden="true"/>'
        caption = f'<strong>{measurement["value"] * 1000:.1f}</strong> units · 전폭 X 빈 띠'
    else:
        overlay = ""
        caption = "시각 참고 · 자동 집계 제외"
    title = f'{spec["family"]} {glyph} 원본 좌표 윤곽'
    return (
        f'<figure class="reference-cell" data-testid="reference-cell" data-font="{spec["id"]}" data-glyph="{glyph}">'
        f'<svg data-coordinate-frame="shared-baseline" viewBox="{DISPLAY_VIEW_BOX[0]} {DISPLAY_VIEW_BOX[1]} {DISPLAY_VIEW_BOX[2]} {DISPLAY_VIEW_BOX[3]}" role="img" aria-labelledby="title-{spec["id"]}-{ord(glyph)}">'
        f'<title id="title-{spec["id"]}-{ord(glyph)}">{html.escape(title)}</title>'
        f'{overlay}{comparison_guides()}<g data-font-projection="upm-to-shared-baseline" transform="matrix({scale:.8f} 0 0 {-scale:.8f} 0 {BASELINE_Y})">'
        f'<path d="{html.escape(data["path"], quote=True)}"/></g></svg>'
        f'<figcaption><b>{glyph}</b><span>{caption}</span></figcaption></figure>'
    )


def candidate_svg(
    candidate: dict[str, Any],
    title_id: str,
    title: str,
    y_variant: dict[str, Any],
    show_target_guides: bool = False,
) -> str:
    gap = candidate["gapFontUnits"]
    ju_x = candidate["juX"] * 1000
    ju_center = ju_x + JU_CENTER_OFFSET * 1000
    ju_arm = ju_x + 139.5
    gap_x = CH_RIGHT_CENTER * 1000 + STROKE_WIDTH * 1000 / 2
    y = y_variant["mappedCenterlines"]
    target = y_variant["targetInkEnvelope"]
    target_guides = ""
    if show_target_guides:
        target_guides = (
            f'<line class="target-ink-guide" data-guide="target-ink-top" x1="0" y1="{target["top"]:.6f}" x2="1000" y2="{target["top"]:.6f}" aria-hidden="true"/>'
            f'<line class="target-ink-guide" data-guide="target-ink-bottom" x1="0" y1="{target["bottom"]:.6f}" x2="1000" y2="{target["bottom"]:.6f}" aria-hidden="true"/>'
        )
    return f'''
        <svg data-coordinate-frame="shared-baseline" data-y-variant="{y_variant['id']}" viewBox="{DISPLAY_VIEW_BOX[0]} {DISPLAY_VIEW_BOX[1]} {DISPLAY_VIEW_BOX[2]} {DISPLAY_VIEW_BOX[3]}" role="img" aria-labelledby="{title_id}">
          <title id="{title_id}">{title}</title>
          <rect class="gap-band" x="{gap_x}" y="{GAP_BAND_Y}" width="{gap:.3f}" height="{GAP_BAND_HEIGHT}" aria-hidden="true"/>
          {comparison_guides()}
          {target_guides}
          <path class="shape ch" style="stroke-width:{STROKE_WIDTH * 1000:g}" d="M 180 {y['chTop']:.6f} H 495 V {y['chBottom']:.6f}"/>
          <path class="shape ju" style="stroke-width:{STROKE_WIDTH * 1000:g}" d="M {ju_center:.3f} {y['juTop']:.6f} V {y['juBottom']:.6f} M {ju_center:.3f} {y['juArm']:.6f} H {ju_arm:.3f}"/>
        </svg>'''


def candidate_figure(candidate: dict[str, Any], y_variant: dict[str, Any]) -> str:
    gap = candidate["gapFontUnits"]
    delta = candidate["deltaFromCurrent"] * 1000
    range_label = "현재값" if candidate["id"] == "current" else "중립 4종 범위 안"
    svg = candidate_svg(
        candidate,
        f'candidate-title-{candidate["id"]}',
        f'우리 Shape 가 이전 X 후보 {candidate["label"]}, 잉크 간격 {gap:.0f} units, 비교용 {y_variant["label"]}',
        y_variant,
    )
    return f'''
      <article class="candidate-card" data-testid="candidate-card" data-candidate="{candidate["id"]}">
        <header><span>{candidate["label"]}</span><strong>{gap:.0f} units</strong></header>
        {svg}
        <dl>
          <div><dt>획 굵기 대비</dt><dd>{candidate["strokeRatio"]:.3f}×</dd></div>
          <div><dt>Current 대비</dt><dd>{delta:+.1f} units</dd></div>
          <div><dt>위치</dt><dd>{range_label}</dd></div>
        </dl>
        <p>{candidate["basis"]}</p>
      </article>'''


def glance_reference_figure(spec: dict[str, Any], data: dict[str, Any]) -> str:
    scale = 1000 / data["unitsPerEm"]
    measurement = data["measurement"]
    return f'''
      <figure class="glance-cell reference" data-testid="glance-specimen" data-specimen="reference:{spec['id']}" data-glyph="가">
        <span class="glance-source">무료폰트</span>
        <svg data-coordinate-frame="shared-baseline" viewBox="{DISPLAY_VIEW_BOX[0]} {DISPLAY_VIEW_BOX[1]} {DISPLAY_VIEW_BOX[2]} {DISPLAY_VIEW_BOX[3]}" role="img" aria-labelledby="glance-title-{spec['id']}">
          <title id="glance-title-{spec['id']}">{spec['family']} 가 원본 좌표 윤곽</title>
          <rect class="gap-band" x="{measurement['left'] * 1000:.3f}" y="{GAP_BAND_Y}" width="{measurement['value'] * 1000:.3f}" height="{GAP_BAND_HEIGHT}" aria-hidden="true"/>
          {comparison_guides()}
          <g data-font-projection="upm-to-shared-baseline" transform="matrix({scale:.8f} 0 0 {-scale:.8f} 0 {BASELINE_Y})"><path d="{html.escape(data['path'], quote=True)}"/></g>
        </svg>
        <figcaption><strong>{spec['family']}</strong><span>{measurement['value'] * 1000:.1f}</span></figcaption>
      </figure>'''


def glance_candidate_figure(candidate: dict[str, Any], y_variant: dict[str, Any]) -> str:
    svg = candidate_svg(
        candidate,
        f'glance-title-our-{candidate["id"]}',
        f'우리 Shape {candidate["label"]} 가, 잉크 간격 {candidate["gapFontUnits"]:.0f} units, 비교용 {y_variant["label"]}',
        y_variant,
    )
    return f'''
      <figure class="glance-cell ours" data-testid="glance-specimen" data-specimen="candidate:{candidate['id']}" data-glyph="가">
        <span class="glance-source">이전 X 가설 · 판정 보류</span>
        {svg}
        <figcaption><strong>{candidate['label']}</strong><span>{candidate['gapFontUnits']:.0f}</span></figcaption>
      </figure>'''


def y_calibration_control_candidate(calibration: dict[str, Any]) -> dict[str, Any]:
    gap = calibration["control"]["gapFontUnits"]
    centerline_offset = (CH_RIGHT_CENTER - JU_CENTER_OFFSET) * 1000
    return {
        "id": "y-control",
        "label": "Y control",
        "gapFontUnits": gap,
        "juX": (gap + centerline_offset + STROKE_WIDTH * 1000) / 1000,
    }


def y_calibration_reference_figure(data: dict[str, Any], calibration: dict[str, Any]) -> str:
    scale = 1000 / data["unitsPerEm"]
    measurement = data["measurement"]
    envelope = calibration["reference"]["inkEnvelope"]
    return f'''
      <figure class="y-calibration-card reference" data-testid="y-calibration-specimen" data-y-variant="reference">
        <header><strong>Noto 원본</strong><span>기준</span></header>
        <svg data-coordinate-frame="shared-baseline" viewBox="{DISPLAY_VIEW_BOX[0]} {DISPLAY_VIEW_BOX[1]} {DISPLAY_VIEW_BOX[2]} {DISPLAY_VIEW_BOX[3]}" role="img" aria-labelledby="y-calibration-reference-title">
          <title id="y-calibration-reference-title">Noto Sans KR 400 가 원본 Y 기준</title>
          <rect class="gap-band" x="{measurement['left'] * 1000:.3f}" y="{GAP_BAND_Y}" width="{measurement['value'] * 1000:.3f}" height="{GAP_BAND_HEIGHT}" aria-hidden="true"/>
          {comparison_guides()}
          <line class="target-ink-guide" data-guide="target-ink-top" x1="0" y1="{envelope['top']:.6f}" x2="1000" y2="{envelope['top']:.6f}" aria-hidden="true"/>
          <line class="target-ink-guide" data-guide="target-ink-bottom" x1="0" y1="{envelope['bottom']:.6f}" x2="1000" y2="{envelope['bottom']:.6f}" aria-hidden="true"/>
          <g data-font-projection="upm-to-shared-baseline" transform="matrix({scale:.8f} 0 0 {-scale:.8f} 0 {BASELINE_Y})"><path d="{html.escape(data['path'], quote=True)}"/></g>
        </svg>
        <figcaption><strong>{envelope['top']:.1f}…{envelope['bottom']:.1f}</strong><span>ink height {envelope['bottom'] - envelope['top']:.1f}</span></figcaption>
      </figure>'''


def y_calibration_candidate_figure(
    candidate: dict[str, Any],
    variant: dict[str, Any],
    recommended: bool,
) -> str:
    badge = '<span class="recommended">비교 권장</span>' if recommended else ""
    svg = candidate_svg(
        candidate,
        f'y-calibration-title-{variant["id"]}',
        f'우리 Shape 가 {variant["label"]}, 비교 화면 전용',
        variant,
        show_target_guides=True,
    )
    envelope = variant["targetInkEnvelope"]
    return f'''
      <figure class="y-calibration-card ours" data-testid="y-calibration-specimen" data-y-variant="{variant['id']}">
        <header><strong>{variant['label']}</strong>{badge}</header>
        {svg}
        <figcaption><strong>{envelope['top']:.1f}…{envelope['bottom']:.1f}</strong><span>ink height {envelope['bottom'] - envelope['top']:.1f}</span></figcaption>
        <p>{variant['basis']}</p>
      </figure>'''


def render_html(core: dict[str, Any], render_data: dict[tuple[str, str], dict[str, Any]]) -> str:
    calibration = core["comparisonYCalibration"]
    y_variants = {variant["id"]: variant for variant in calibration["variants"]}
    proposed_y_variant = y_variants[calibration["recommendedVariantId"]]
    y_control_candidate = y_calibration_control_candidate(calibration)
    groups = []
    for initial, glyph_pair in GLYPH_GROUPS:
        cards = []
        for spec in FONT_SPECS:
            figures = "".join(reference_figure(spec, glyph, render_data[(spec["id"], glyph)]) for glyph in glyph_pair)
            cards.append(
                f'<article class="font-card"><header><h3>{spec["family"]}</h3>'
                f'<span class="role {spec["aggregation"]}">{spec["role"]}</span></header>'
                f'<div class="glyph-pair">{figures}</div></article>'
            )
        groups.append(
            f'<details class="reference-group" data-testid="reference-group" data-initial="{initial}" open>'
            f'<summary><span>{initial}</span><strong>{glyph_pair[0]} · {glyph_pair[1]}</strong>'
            '<small>6개 무료폰트 원본 좌표</small></summary>'
            f'<div class="font-grid">{"".join(cards)}</div></details>'
        )

    gap_rows = []
    for spec in FONT_SPECS:
        data = render_data[(spec["id"], "가")]
        measurement = data["measurement"]
        gap_rows.append(
            f'<tr><th scope="row">{spec["family"]}</th><td>{spec["role"]}</td>'
            f'<td>{measurement["value"] * 1000:.1f}</td>'
            f'<td>{"집계" if spec["aggregation"] == "core" else "범위 확인만"}</td></tr>'
        )
    candidates = "".join(candidate_figure(candidate, proposed_y_variant) for candidate in core["candidates"])
    glance_reference_specimens = "".join(
        glance_reference_figure(spec, render_data[(spec["id"], "가")]) for spec in FONT_SPECS
    )
    glance_candidate_specimens = "".join(
        glance_candidate_figure(candidate, proposed_y_variant) for candidate in core["candidates"]
    )
    y_calibration_specimens = y_calibration_reference_figure(
        render_data[("noto-sans-kr", "가")], calibration
    ) + "".join(
        y_calibration_candidate_figure(
            y_control_candidate,
            variant,
            variant["id"] == calibration["recommendedVariantId"],
        )
        for variant in calibration["variants"]
    )
    source_rows = "".join(
        f'<tr><th scope="row">{font["family"]}</th><td>{font["version"]}</td><td>{font["license"]}</td>'
        f'<td><a href="{font["source"]}">공식 저장소</a></td><td><code>{font["fileSha256"]}</code></td></tr>'
        for font in core["fonts"]
    )
    embedded = canonical_json(core).replace("</", "<\\/")
    return f'''<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>S0b-Y · X 간격 전 Y 비교조건 근거 보드</title>
  <style>
    :root{{--ink:#172033;--muted:#5d6678;--line:#d9dee7;--paper:#f3f0e9;--card:#fff;--blue:#2357d3;--mint:#dff4ec;--amber:#f7e6b4;--ch:#172033;--ju:#d35b42}}
    *{{box-sizing:border-box}} html{{background:var(--paper);color:var(--ink);font-family:Inter,Pretendard,system-ui,sans-serif}} body{{margin:0}}
    main{{width:min(1440px,100%);margin:auto;padding:32px clamp(16px,4vw,56px) 80px}} a{{color:var(--blue)}}
    .hero{{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.6fr);gap:32px;align-items:end;padding:40px 0 34px;border-bottom:1px solid #aeb5c1}}
    .kicker,.section-kicker{{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--blue)}} h1{{max-width:840px;margin:12px 0;font-size:clamp(38px,6vw,76px);line-height:1.02;letter-spacing:-.055em}}
    .hero p{{max-width:720px;color:var(--muted);line-height:1.7}} .status-box{{padding:22px;border:1px solid var(--ink);border-radius:18px;background:var(--card);box-shadow:8px 8px 0 var(--ink)}}
    .status-box b{{display:block;font-size:18px}} .status-box strong{{display:block;margin-top:14px;font-size:26px;line-height:1.25}} .status-box small{{display:block;margin-top:8px;color:var(--muted)}}
    section.block{{margin-top:42px;padding:clamp(20px,3vw,34px);border:1px solid var(--line);border-radius:22px;background:var(--card)}}
    .y-calibration-section{{margin-top:24px;padding:22px;border:3px solid var(--blue);border-radius:22px;background:#eef3ff;box-shadow:7px 7px 0 var(--blue)}} .y-calibration-heading{{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:14px}} .y-calibration-heading h2{{margin:4px 0 0}} .y-calibration-heading p{{max-width:580px;margin:0;color:var(--muted);font-size:13px;line-height:1.6;text-align:right}} .y-calibration-grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}} .y-calibration-card{{padding:10px;border:1px solid #aebfe8;border-radius:14px;background:white}} .y-calibration-card[data-y-variant="noto-envelope"]{{border:3px solid var(--blue);padding:8px}} .y-calibration-card header{{display:flex;align-items:center;justify-content:space-between;min-height:28px;gap:6px}} .y-calibration-card header strong{{font-size:12px}} .y-calibration-card header>span:not(.recommended){{color:var(--muted);font-size:10px}} .y-calibration-card svg{{display:block;width:100%;height:auto;border-radius:8px;background:#f8f9fb}} .y-calibration-card.reference path{{fill:var(--ink)}} .y-calibration-card figcaption{{margin-top:7px}} .y-calibration-card figcaption strong{{font-size:11px}} .y-calibration-card figcaption span{{font-size:9px}} .y-calibration-card p{{margin:8px 0 0;color:var(--muted);font-size:10px;line-height:1.45}}
    .glance-section{{margin-top:24px;padding:22px;border:2px solid var(--ink);border-radius:22px;background:white;box-shadow:7px 7px 0 var(--ink)}} .glance-heading{{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:12px}} .glance-heading h2{{margin:3px 0 0;font-size:clamp(24px,3vw,38px)}} .glance-heading p{{max-width:560px;margin:0;color:var(--muted);font-size:13px;line-height:1.6;text-align:right}} .frame-contract{{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}} .frame-contract span{{padding:5px 8px;border:1px solid var(--line);border-radius:999px;background:#f8f9fb;color:var(--muted);font-size:10px;font-weight:700}}
    .glance-groups{{display:grid;grid-template-columns:3fr 2fr;gap:18px}} .glance-group h3{{margin:0 0 8px;font-size:12px}} .glance-grid{{display:grid;gap:8px}} .glance-reference-grid{{grid-template-columns:repeat(6,minmax(0,1fr))}} .glance-candidate-grid{{grid-template-columns:repeat(4,minmax(0,1fr))}} .glance-cell{{min-width:0;padding:8px;border:1px solid var(--line);border-radius:12px;background:#f8f9fb}} .glance-cell.ours{{border-color:#9eb5e8;background:#eef3ff}} .glance-source{{display:block;min-height:28px;color:var(--muted);font-size:9px;font-weight:800;line-height:1.3}} .glance-cell svg{{display:block;width:100%;height:auto;background:white;border-radius:7px}} .glance-cell.reference path{{fill:var(--ink)}} .glance-cell.ours .shape.ju{{stroke:var(--ink)}} .glance-cell figcaption{{display:flex;align-items:start;justify-content:space-between;gap:4px;margin-top:7px}} .glance-cell figcaption strong{{overflow-wrap:anywhere;font-size:10px;line-height:1.25}} .glance-cell figcaption span{{color:var(--muted);font-size:9px;font-variant-numeric:tabular-nums}}
    .scope-grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}} .scope-card{{padding:22px;border-radius:16px;background:#eef3ff}} .scope-card.excluded{{background:#eeeae2}}
    h2{{margin:7px 0 16px;font-size:clamp(27px,3vw,42px);letter-spacing:-.04em}} .scope-card h2{{font-size:24px}} .scope-card ul{{margin:12px 0 0;padding-left:20px;line-height:1.75}}
    .method-grid{{display:grid;grid-template-columns:1fr 1fr;gap:20px}} .method-grid p{{margin:0;line-height:1.75;color:var(--muted)}} .warning{{padding:18px;border-left:5px solid #ca7c00;background:#fff7dd;color:#5a430b}}
    .reference-group{{margin-top:16px;border:1px solid var(--line);border-radius:16px;background:#fafbfc;overflow:hidden}} summary{{display:flex;align-items:center;gap:14px;padding:18px;cursor:pointer;list-style:none}} summary::-webkit-details-marker{{display:none}} summary>span{{display:grid;width:42px;height:42px;place-items:center;border-radius:12px;background:var(--ink);color:white;font-size:22px}} summary strong{{font-size:20px}} summary small{{margin-left:auto;color:var(--muted)}}
    .font-grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:0 14px 14px}} .font-card{{min-width:0;padding:14px;border:1px solid var(--line);border-radius:13px;background:white}} .font-card>header{{display:flex;justify-content:space-between;gap:8px;align-items:center}} .font-card h3{{margin:0;font-size:14px}}
    .role{{padding:4px 7px;border-radius:999px;background:#e6ecf8;color:#29436d;font-size:10px;font-weight:800}} .role.boundary{{background:var(--mint);color:#176047}} .role.stress{{background:var(--amber);color:#72500b}}
    .glyph-pair{{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}} figure{{margin:0}} .reference-cell svg,.candidate-card svg{{display:block;width:100%;height:auto;background:#f7f8fa;border-radius:8px}} .candidate-card svg{{width:66.667%;margin:12px auto 0}} .reference-cell path{{fill:var(--ink)}} .em-frame,.body-frame{{fill:none;stroke:#aeb5c1;stroke-width:4;stroke-dasharray:12 10}} .body-frame{{stroke:#ccd2dc;stroke-dasharray:5 9}} .baseline-guide{{stroke:var(--blue);stroke-width:5;stroke-dasharray:20 10;opacity:.7}} .target-ink-guide{{stroke:#d35b42;stroke-width:4;stroke-dasharray:9 8;opacity:.7}} .gap-band{{fill:#6d9ef8;opacity:.24}}
    figcaption{{display:flex;align-items:baseline;justify-content:space-between;gap:4px;margin-top:7px}} figcaption b{{font-size:20px}} figcaption span{{color:var(--muted);font-size:10px;text-align:right}}
    .table-wrap{{overflow-x:auto}} table{{width:100%;border-collapse:collapse}} th,td{{padding:12px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}} thead th{{font-size:12px;color:var(--muted)}}
    .candidate-grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}} .candidate-card{{padding:15px;border:1px solid var(--line);border-radius:16px;background:#fafbfc}} .candidate-card header{{display:flex;align-items:center;gap:8px}} .candidate-card header>span:first-child{{font-size:21px;font-weight:900}} .candidate-card header strong{{margin-left:auto}} .recommended{{padding:3px 7px;border-radius:999px;background:var(--blue);color:white;font-size:10px;font-weight:800}} .shape{{fill:none;stroke-linecap:round;stroke-linejoin:round}} .shape.ch{{stroke:var(--ch)}} .shape.ju{{stroke:var(--ju)}}
    dl{{margin:12px 0}} dl div{{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)}} dt{{color:var(--muted);font-size:12px}} dd{{margin:0;font-size:12px;font-weight:800}} .candidate-card p{{min-height:38px;color:var(--muted);font-size:11px;line-height:1.5}}
    .trace{{display:flex;align-items:center;gap:8px;flex-wrap:wrap}} .trace span{{padding:10px 12px;border:1px solid var(--line);border-radius:999px;background:white;font-size:13px}} .trace i{{font-style:normal;color:var(--blue)}}
    fieldset{{margin:42px 0 0;padding:clamp(22px,4vw,40px);border:2px solid var(--ink);border-radius:22px;background:#172033;color:white}} legend{{padding:0 8px;font-weight:800}} fieldset h2{{max-width:920px}} .verdict-options{{display:flex;flex-wrap:wrap;gap:9px}} .verdict-options label{{padding:11px 14px;border:1px solid #66728a;border-radius:999px;cursor:pointer}} .verdict-options label:has(input:checked){{background:white;color:var(--ink)}} fieldset small{{display:block;margin-top:16px;color:#bfc7d6;line-height:1.6}} #selection-note{{min-height:24px;margin-top:16px;color:#a9c6ff}}
    details.provenance{{margin-top:28px;padding:18px;border:1px solid var(--line);border-radius:16px;background:white}} .provenance table code{{display:block;max-width:180px;overflow:hidden;text-overflow:ellipsis;font-size:10px}}
    @media(max-width:1100px){{.glance-groups{{grid-template-columns:1fr}} .glance-reference-grid{{grid-template-columns:repeat(6,minmax(0,112px))}} .glance-candidate-grid{{grid-template-columns:repeat(4,minmax(0,112px))}}}}
    @media(max-width:900px){{.scope-grid,.method-grid{{grid-template-columns:1fr}} .font-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}} .candidate-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}} .y-calibration-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}} .y-calibration-heading{{display:block}} .y-calibration-heading p{{margin-top:8px;text-align:left}}}}
    @media(max-width:820px){{.glance-reference-grid,.glance-candidate-grid{{grid-template-columns:repeat(3,minmax(0,1fr))}}}}
    @media(max-width:700px){{.hero{{grid-template-columns:1fr}} .glance-heading{{display:block}} .glance-heading p{{margin-top:8px;text-align:left}}}}
    @media(max-width:560px){{main{{padding:20px 12px 54px}} .hero{{padding-top:18px}} h1{{font-size:42px}} section.block{{padding:16px;margin-top:24px}} .y-calibration-section,.glance-section{{padding:14px}} .y-calibration-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}} .glance-reference-grid,.glance-candidate-grid{{grid-template-columns:repeat(3,minmax(0,1fr))}} .font-grid,.candidate-grid{{grid-template-columns:1fr}} summary{{padding:13px}} summary small{{display:none}} .glyph-pair{{gap:6px}} .candidate-card svg{{width:50%}} .candidate-card p{{min-height:0}}}}
  </style>
</head>
<body>
<main id="s0b-evidence-board">
  <header class="hero">
    <div><span class="kicker">Y 비교조건 · 선행 검수</span><h1>X 간격보다 먼저<br>글자 높이를 맞춥니다.</h1><p>공통 baseline만으로는 부족했습니다. 현재 Shape는 잉크 높이 585 units로 중앙에 떠 있고, Noto `가`는 904.5 units로 하단까지 내려옵니다. X 간격 선택을 멈추고 비교 화면의 Y 조건부터 확인합니다.</p></div>
    <aside class="status-box" data-testid="s0b-status"><b>S0b-Y · 비교 표시안</b><strong>제품 반영 0%<br>X 간격 판정 보류</strong><small>Y 후보 3안 · Noto 원본 1 · 저장 0</small></aside>
  </header>

  <section class="y-calibration-section" data-testid="y-calibration-gate" aria-labelledby="y-calibration-heading">
    <div class="y-calibration-heading"><div><span class="section-kicker">00 · 이번 확인 단위</span><h2 id="y-calibration-heading">Noto 원본과 우리 Y 3안을 같은 조건으로 비교</h2></div><p>네 칸 모두 Noto `가`의 X 빈 띠 {calibration['control']['gapFontUnits']:.1f} units와 획 75를 사용합니다. 빨간 점선은 각 안의 잉크 상·하단입니다. Noto envelope는 표시용 권장안일 뿐 production Y·5선에는 반영하지 않았습니다.</p></div>
    <div class="y-calibration-grid">{y_calibration_specimens}</div>
  </section>

  <section class="glance-section" data-testid="glance-strip" aria-labelledby="glance-heading">
    <div class="glance-heading"><div><span class="section-kicker">01 · 조건부 전체 비교</span><h2 id="glance-heading">무료폰트 원본 6종 + Noto-envelope 표시안</h2></div><p>무료폰트는 원본 좌표이고, 우리 네 안에는 위에서 제안한 동일 Y 표시안만 적용했습니다. 이 구역의 X 숫자는 이전 가설이며 아직 고르지 않습니다.</p></div>
    <div class="frame-contract" data-testid="coordinate-frame-contract"><span>UPM 1000</span><span>ascender 880</span><span>descender -120</span><span>baseline y=880</span><span>x 원점 0</span><span>우리 Y만 명시적 표시 보정</span></div>
    <div class="glance-groups">
      <section class="glance-group" aria-labelledby="glance-reference-heading"><h3 id="glance-reference-heading">무료폰트 6종</h3><div class="glance-grid glance-reference-grid">{glance_reference_specimens}</div></section>
      <section class="glance-group" aria-labelledby="glance-candidate-heading"><h3 id="glance-candidate-heading">이전 X 가설 4안 · 판정 보류</h3><div class="glance-grid glance-candidate-grid">{glance_candidate_specimens}</div></section>
    </div>
  </section>

  <section class="block" data-testid="decision-scope">
    <span class="section-kicker">02 · 판정 범위</span>
    <div class="scope-grid">
      <article class="scope-card"><h2>이번에 결정할 것</h2><p><strong>`ㄱ+ㅏ` 무받침 prototype</strong>의 다음 X 검수에서 사용할 비교 화면 전용 Y 크기·위치.</p><ul><li>고정: UPM·baseline·획 75·X 빈 띠</li><li>비교: Current / Body-fit / Noto envelope</li><li>권장: Noto envelope 표시안</li></ul></article>
      <article class="scope-card excluded"><h2>이번에 판단하지 않는 것</h2><p>Y 표시안을 골라도 서체의 실제 세로 설계가 승인되는 것은 아닙니다.</p><ul><li>A/B/C X 간격과 B 동결</li><li>5선·ㅏ 가로팔·ㄱ 내부 획 위치</li><li>production starter·OTF·다른 자소</li></ul></article>
    </div>
  </section>

  <section class="block">
    <span class="section-kicker">03 · 판단 기준</span><h2>크기·위치와 내부 5선을 분리합니다.</h2>
    <div class="method-grid"><p><strong>공통 조건:</strong> UPM 1000, ascender 880, descender -120, baseline y=880, 획 75입니다. Current는 잉크 207.5…792.5, Body-fit은 75…925, Noto envelope는 52.7…957.1입니다. Y 좌표만 다시 계산하고 획과 X 간격은 바꾸지 않았습니다.<br><br>Noto envelope가 다음 X 비교에는 가장 통제된 안이지만, 이것은 외곽 상·하단만 맞춘 표시 보정입니다.</p><p class="warning"><strong>아직 맞지 않는 것</strong><br>Noto `ㅏ` 가로팔 중심은 약 454.4이고 envelope 표시안의 팔은 504.9입니다. 외곽을 맞췄다고 내부 중심선·5선까지 맞은 것으로 보지 않습니다.</p></div>
  </section>

  <section class="block">
    <span class="section-kicker">04 · 무료폰트 실제 윤곽</span><h2>공통 baseline의 원본 좌표 · 10문맥 × 6종</h2>
    {''.join(groups)}
  </section>

  <section class="block" data-testid="measurement-summary">
    <span class="section-kicker">05 · `가` 측정 요약</span><h2>전폭 X 빈 띠(참고값)</h2>
    <div class="table-wrap"><table><thead><tr><th>폰트</th><th>역할</th><th>간격 / 1000</th><th>집계</th></tr></thead><tbody>{''.join(gap_rows)}</tbody></table></div>
  </section>

  <section class="block">
    <span class="section-kicker">06 · 이전 X 가설</span><h2>판정 보류 · Noto-envelope 표시안으로만 미리보기</h2>
    <div class="candidate-grid">{candidates}</div>
  </section>

  <section class="block" data-testid="decision-trace">
    <span class="section-kicker">07 · 결정 순서</span><h2>Y 표시 조건 승인 전에는 B를 고르지 않습니다.</h2>
    <div class="trace"><span>공통 baseline</span><i>→</i><span>Y 크기·위치</span><i>→</i><span>내부 5선</span><i>→</i><span>초성–중성 X 간격</span></div>
    <p><strong>이전 가설 기록:</strong> B = 190 units는 보존하지만 현재 상태는 `suspended-until-y-calibration`입니다.</p>
  </section>

  <fieldset data-testid="verdict-question">
    <legend>이번 판정 한 가지</legend>
    <h2>{core['decision']['question']}</h2>
    <div class="verdict-options">
      <label><input type="radio" name="verdict" value="Noto envelope로 진행"> Noto envelope로 진행</label>
      <label><input type="radio" name="verdict" value="Body-fit으로 진행"> Body-fit으로 진행</label>
      <label><input type="radio" name="verdict" value="Current Y 유지"> Current Y 유지</label>
      <label><input type="radio" name="verdict" value="Y 구조 다시 설계"> Y 구조 다시 설계</label>
    </div>
    <p id="selection-note" aria-live="polite"></p>
    <small>선택은 이 페이지에 저장되지 않습니다. 답을 채팅으로 알려주기 전에는 코드·starter·다른 글자에 반영되지 않습니다.</small>
  </fieldset>

  <details class="provenance"><summary><strong>출처·라이선스·파일 해시</strong><small>분석 SHA-256 {core['analysisSha256']}</small></summary><div class="table-wrap"><table><thead><tr><th>폰트</th><th>버전</th><th>라이선스</th><th>출처</th><th>파일 SHA-256</th></tr></thead><tbody>{source_rows}</tbody></table></div></details>
  <script id="evidence-manifest" type="application/json">{embedded}</script>
</main>
<script>
  for (const input of document.querySelectorAll('input[name="verdict"]')) input.addEventListener('change', event => {{
    document.getElementById('selection-note').textContent = `현재 선택: ${{event.target.value}} · 아직 저장하거나 제품에 반영하지 않았습니다.`;
  }});
  if (matchMedia('(max-width: 560px)').matches) document.querySelectorAll('.reference-group').forEach((group, index) => {{ if (index > 0) group.removeAttribute('open'); }});
</script>
</body>
</html>
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font-dir", type=Path, required=True, help="6개 reference font 파일이 있는 디렉터리")
    parser.add_argument("--output-dir", type=Path, default=Path("public/references"))
    args = parser.parse_args()
    core, render_data = collect(args.font_dir)
    document = render_html(core, render_data)
    html_bytes = document.encode("utf-8")
    sidecar = {**core, "htmlSha256": sha256_bytes(html_bytes)}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "vertical-vowel-gap.html").write_bytes(html_bytes)
    (args.output_dir / "vertical-vowel-gap.manifest.json").write_text(
        json.dumps(sidecar, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"reference samples: {core['corpus']['referenceSampleCount']}")
    print(f"analysis sha256: {core['analysisSha256']}")
    print(f"html sha256: {sidecar['htmlSha256']}")


if __name__ == "__main__":
    main()
