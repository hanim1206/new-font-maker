#!/usr/bin/env python3
"""노토 가변 폰트를 굵기별로 놓고 첫닿자 · 홀자의 두께 · 속공간 · 중심선 밀림을 잰다.

플랜 `docs/plans/2026-09-25_굵기-보정-층.md`의 측정 패스. 관측만 하고 앱 값은 바꾸지 않는다.
- 같은 파일(`.reference-fonts/NotoSansKR.ttf`)의 `wght` 축을 100~900으로 옮겨 글자를 그린다.
- 첫닿자와 홀자를 윤곽 단위로 가르고, 첫닿자 잉크 상자 안 다섯 줄(가로 프로브 · 세로 프로브)에서
  잉크 구간을 읽는다. 구간이 곧 줄기 두께, 구간 사이가 속공간, 구간 가운데가 중심선이다.
- 400을 기준으로 두께 배율 · 속공간 배율 · 중심선 밀림(400 속공간 폭 비율)을 낸다.
- 이용제 속공간 그룹(S1~S7) 단위로 중앙값 · 사분위를 모은다.
- 실험실(`/weight-lab`) 고스트용으로 굵기별 윤곽 path도 같이 남긴다.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

import initial_component_extractor as initial
import medial_guide_extractor as medial

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "noto-weight-offsets-v1"
GHOST_SCHEMA = "noto-weight-ghosts-v1"
WEIGHTS = (100, 200, 300, 400, 500, 600, 700, 800, 900)
BASE_WEIGHT = 400
GHOST_WEIGHTS = WEIGHTS
PROBE_RATIOS = (0.2, 0.35, 0.5, 0.65, 0.8)
# 첫닿자 19자. 겹받침은 첫닿자 기준이 없고 `inkSpaceGroup`도 비어 있어 이번 범위 밖.
INITIALS = tuple("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")
INITIAL_INDEX = {jamo: index for index, jamo in enumerate(INITIALS)}
MEDIAL_INDEX = {jamo: index for index, jamo in enumerate("ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")}
# 홀자 ㅏ(세로모임)는 오른쪽 기둥, ㅗ(가로모임)는 아래 보. 첫닿자와 겹치지 않아 윤곽으로 가를 수 있다.
MEDIALS = ("ㅏ", "ㅗ")
GROUPS_PATH = PROJECT_ROOT / "src/data/jamoLiteratureGroups.json"
Interval = Tuple[float, float]


def syllable(initial_jamo: str, medial_jamo: str) -> str:
    return chr(0xAC00 + INITIAL_INDEX[initial_jamo] * 588 + MEDIAL_INDEX[medial_jamo] * 28)


def glyph_records(font: TTFont, glyph_set: Any, character: str) -> List[initial.ContourRecord]:
    glyph_name = font.getBestCmap()[ord(character)]
    recording = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(recording)
    return initial._contour_records(recording.value, int(font["head"].unitsPerEm))  # pylint: disable=protected-access


def split_component(records: Sequence[initial.ContourRecord], medial_jamo: str) -> Tuple[List[initial.ContourRecord], List[initial.ContourRecord], Optional[str]]:
    """홀자 윤곽을 떼고 나머지를 첫닿자로 본다. 노토는 윤곽을 합치지 않아 ㅏ는 기둥 + 곁줄기, ㅗ는 보 + 짧은기둥 두 윤곽이다.

    ㅏ: 가장 키 큰 윤곽이 기둥. 기둥 왼쪽 면을 넘어 들어오는 윤곽(곁줄기)도 홀자.
    ㅗ: 가장 넓은 윤곽이 보. 보 윗면을 넘어 내려오는 윤곽(짧은기둥)도 홀자.
    bounds = (left, top, right, bottom), y는 아래로 큼.
    """
    tolerance = 1.0
    if medial_jamo == "ㅏ":
        # 기둥 = 가장 키 큰 윤곽. 곁줄기는 기둥 왼쪽 면 안쪽에서 시작해 오른쪽으로 나간다.
        anchor = max(records, key=lambda record: record.bounds[3] - record.bounds[1])
        medial_records = [record for record in records if record is anchor or record.bounds[0] >= anchor.bounds[0] - tolerance]
    else:
        # 보 = 가장 넓은 윤곽. 짧은기둥은 보의 가로 범위 안에서 보 윗면을 넘어 내려온다.
        anchor = max(records, key=lambda record: record.bounds[2] - record.bounds[0])
        medial_records = [
            record for record in records
            if record is anchor or (
                record.bounds[3] > anchor.bounds[1] + tolerance
                and record.bounds[0] >= anchor.bounds[0] - tolerance
                and record.bounds[2] <= anchor.bounds[2] + tolerance
            )
        ]
    rest = [record for record in records if record not in medial_records]
    if len(medial_records) != 2:
        return rest, medial_records, "medial-contour-count-{}".format(len(medial_records))
    if not rest:
        return rest, medial_records, "component-missing"
    return rest, medial_records, None


def filled_intervals(orientation: str, position: float, polygons: Sequence[Sequence[Tuple[float, float]]]) -> List[Interval]:
    """프로브 위 잉크 구간. 윤곽이 겹치고 구멍이 있어 교차점 짝짓기 대신 사이 점의 채움(nonzero)을 본다."""
    crossings = sorted(set(round(value, 6) for value in medial._probe_breakpoints(orientation, position, polygons)))  # pylint: disable=protected-access
    intervals: List[Interval] = []
    for start, end in zip(crossings, crossings[1:]):
        along = (start + end) / 2.0
        point = (position, along) if orientation == "vertical" else (along, position)
        if not medial._is_filled(point, polygons):  # pylint: disable=protected-access
            continue
        if intervals and abs(intervals[-1][1] - start) < 1e-6:
            intervals[-1] = (intervals[-1][0], end)
        else:
            intervals.append((start, end))
    return intervals


def union_bounds(records: Sequence[initial.ContourRecord]) -> Dict[str, float]:
    return {
        "left": min(record.bounds[0] for record in records),
        "top": min(record.bounds[1] for record in records),
        "right": max(record.bounds[2] for record in records),
        "bottom": max(record.bounds[3] for record in records),
    }


def probe_intervals(polygons: Sequence[Sequence[Tuple[float, float]]], box: Dict[str, float]) -> Dict[str, List[Dict[str, Any]]]:
    """상자 높이 비율 자리의 가로 프로브(세로줄기 구간)와 너비 비율 자리의 세로 프로브(가로줄기 구간)."""
    width = box["right"] - box["left"]
    height = box["bottom"] - box["top"]
    horizontal: List[Dict[str, Any]] = []
    vertical: List[Dict[str, Any]] = []
    for ratio in PROBE_RATIOS:
        y = box["top"] + height * ratio
        x = box["left"] + width * ratio
        horizontal.append({"ratio": ratio, "position": round(y, 3), "intervals": [tuple(round(v, 3) for v in interval) for interval in filled_intervals("horizontal", y, polygons)]})  # pylint: disable=protected-access
        vertical.append({"ratio": ratio, "position": round(x, 3), "intervals": [tuple(round(v, 3) for v in interval) for interval in filled_intervals("vertical", x, polygons)]})  # pylint: disable=protected-access
    return {"horizontal": horizontal, "vertical": vertical}


def medial_thickness(records: Sequence[initial.ContourRecord], medial_jamo: str) -> Dict[str, Optional[float]]:
    """ㅏ 기둥은 곁줄기 위(높이 15%)의 가로 프로브, 곁줄기는 기둥 오른쪽 20u 자리의 세로 프로브.
    ㅗ 보는 짧은기둥을 피한 왼쪽 15% 자리의 세로 프로브, 짧은기둥은 보 윗면 위 20u의 가로 프로브."""
    polygons = [record.polygon for record in records]
    box = union_bounds(records)
    if medial_jamo == "ㅏ":
        y = box["top"] + (box["bottom"] - box["top"]) * 0.15
        stems = filled_intervals("horizontal", y, polygons)
        stem = max(stems, key=lambda interval: interval[1] - interval[0]) if stems else None
        branch: Optional[float] = None
        if stem is not None:
            branches = filled_intervals("vertical", stem[1] + 20.0, polygons)
            branch = max((b[1] - b[0] for b in branches), default=None)
        return {"stem": None if stem is None else round(stem[1] - stem[0], 3), "branch": None if branch is None else round(branch, 3)}
    x = box["left"] + (box["right"] - box["left"]) * 0.15
    beams = filled_intervals("vertical", x, polygons)
    beam = max(beams, key=lambda interval: interval[1] - interval[0]) if beams else None
    short_stem: Optional[float] = None
    if beam is not None:
        stems = filled_intervals("horizontal", beam[0] - 20.0, polygons)
        short_stem = max((s[1] - s[0] for s in stems), default=None)
    return {"beam": None if beam is None else round(beam[1] - beam[0], 3), "shortStem": None if short_stem is None else round(short_stem, 3)}


def path_of(records: Sequence[initial.ContourRecord], units_per_em: int) -> str:
    """1000-unit · y 아래 · 기준선 880 프레임의 SVG path. 곡선은 이미 편 폴리곤을 쓴다."""
    parts: List[str] = []
    for record in records:
        points = record.polygon
        if not points:
            continue
        parts.append("M" + " ".join(f"{x:.0f},{y:.0f}" for x, y in points) + "Z")
    return "".join(parts)


def measure_font(font_path: Path, weights: Sequence[int], initials: Sequence[str], medials: Sequence[str]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    font = TTFont(font_path)
    if _sha(font_path) != medial.G0_FONT_SHA256:
        raise ValueError("현재 배치는 기존 검증용 Noto Sans KR 파일 SHA만 허용합니다.")
    upm = int(font["head"].unitsPerEm)
    axis = next(axis for axis in font["fvar"].axes if axis.axisTag == "wght")
    if any(not axis.minValue <= weight <= axis.maxValue for weight in weights):
        raise ValueError("요청한 굵기가 wght 축 범위를 벗어납니다.")
    glyph_sets = {weight: font.getGlyphSet(location={"wght": float(weight)}) for weight in weights}
    characters: Dict[str, Any] = {}
    ghosts: Dict[str, Any] = {}
    for initial_jamo in initials:
        for medial_jamo in medials:
            character = syllable(initial_jamo, medial_jamo)
            per_weight: Dict[str, Any] = {}
            ghost: Dict[str, Any] = {}
            for weight in weights:
                records = glyph_records(font, glyph_sets[weight], character)
                component, medial_records, reason = split_component(records, medial_jamo)
                entry: Dict[str, Any] = {
                    "glyphBounds": union_bounds(records),
                    "contourCount": len(records),
                    "reasonCode": reason,
                }
                if reason is None:
                    box = union_bounds(component)
                    entry["componentBox"] = box
                    entry["probes"] = probe_intervals([record.polygon for record in component], box)
                    entry["medial"] = medial_thickness(medial_records, medial_jamo)
                per_weight[str(weight)] = entry
                if weight in GHOST_WEIGHTS:
                    ghost[str(weight)] = {"path": path_of(records, upm), "componentPath": path_of(component, upm) if reason is None else None}
            characters[character] = {"initialJamo": initial_jamo, "medialJamo": medial_jamo, "weights": per_weight}
            ghosts[character] = {"initialJamo": initial_jamo, "medialJamo": medial_jamo, "weights": ghost}
    return characters, ghosts


def _sha(path: Path) -> str:
    import hashlib
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def derive_character(entry: Dict[str, Any], weights: Sequence[int]) -> Dict[str, Any]:
    """400 대비 배율과 밀림. 프로브의 구간 수가 400과 다르면 그 프로브는 건너뛴다(reason 남김)."""
    base = entry["weights"].get(str(BASE_WEIGHT))
    if base is None or base.get("reasonCode"):
        return {"reasonCode": "base-unavailable"}
    base_box = base["componentBox"]
    base_width = base_box["right"] - base_box["left"]
    base_height = base_box["bottom"] - base_box["top"]
    out: Dict[str, Any] = {}
    for weight in weights:
        current = entry["weights"].get(str(weight))
        if current is None or current.get("reasonCode"):
            out[str(weight)] = {"reasonCode": current.get("reasonCode") if current else "missing"}
            continue
        box = current["componentBox"]
        derived: Dict[str, Any] = {
            "boxWidthRatio": round((box["right"] - box["left"]) / base_width, 4),
            "boxHeightRatio": round((box["bottom"] - box["top"]) / base_height, 4),
            "boxShift": {side: round(box[side] - base_box[side], 3) for side in ("left", "top", "right", "bottom")},
            "medial": {},
            "probes": {},
        }
        for key, base_value in base.get("medial", {}).items():
            value = current.get("medial", {}).get(key)
            derived["medial"][key] = None if base_value in (None, 0) or value is None else round(value / base_value, 4)
        for orientation in ("horizontal", "vertical"):
            rows: List[Dict[str, Any]] = []
            for base_probe, probe in zip(base["probes"][orientation], current["probes"][orientation]):
                base_intervals = base_probe["intervals"]
                intervals = probe["intervals"]
                if not base_intervals or len(base_intervals) != len(intervals):
                    rows.append({"ratio": base_probe["ratio"], "reasonCode": "interval-count-differs", "baseCount": len(base_intervals), "count": len(intervals)})
                    continue
                strokes: List[Dict[str, Any]] = []
                counters: List[Dict[str, Any]] = []
                for index, (b, c) in enumerate(zip(base_intervals, intervals)):
                    base_thickness = b[1] - b[0]
                    base_center = (b[0] + b[1]) / 2.0
                    center = (c[0] + c[1]) / 2.0
                    # 이웃 속공간: 다음 구간까지, 마지막 구간은 앞 구간까지. 구간이 하나면 없음.
                    if len(base_intervals) > 1:
                        neighbor = index + 1 if index + 1 < len(base_intervals) else index - 1
                        nb = base_intervals[neighbor]
                        base_counter = (nb[0] - b[1]) if neighbor > index else (b[0] - nb[1])
                    else:
                        base_counter = None
                    delta_thickness = (c[1] - c[0]) - base_thickness
                    # 바깥 변: 첫 구간은 시작 변, 마지막 구간은 끝 변. 바깥으로 자란 만큼이 +.
                    outer_growth = (b[0] - c[0]) if index == 0 else (c[1] - b[1]) if index == len(base_intervals) - 1 else None
                    inward = 1.0 if index < len(base_intervals) / 2.0 else -1.0
                    strokes.append({
                        "thicknessRatio": round((c[1] - c[0]) / base_thickness, 4) if base_thickness > 0 else None,
                        "centerShift": round(center - base_center, 3),
                        "centerShiftPerCounter": round((center - base_center) / base_counter, 4) if base_counter else None,
                        "centerShiftPerThickness": round((center - base_center) / base_thickness, 4) if base_thickness > 0 else None,
                        # 두께가 자란 양 대비 중심선이 안쪽으로 민 비율. 0이면 가운데 고정, 0.5면 바깥 변 고정.
                        "centerShiftPerThicknessDelta": round(inward * (center - base_center) / delta_thickness, 4) if abs(delta_thickness) > 1e-6 else None,
                        # 두께가 자란 양 중 바깥 변으로 나간 몫. 0.5면 가운데 고정, 0이면 바깥 변 고정.
                        "outerEdgeGrowthShare": round(outer_growth / delta_thickness, 4) if outer_growth is not None and abs(delta_thickness) > 1e-6 else None,
                    })
                for b0, b1, c0, c1 in zip(base_intervals, base_intervals[1:], intervals, intervals[1:]):
                    base_gap = b1[0] - b0[1]
                    gap = c1[0] - c0[1]
                    counters.append({"baseWidth": round(base_gap, 3), "width": round(gap, 3), "ratio": round(gap / base_gap, 4) if base_gap > 0 else None})
                rows.append({"ratio": base_probe["ratio"], "strokes": strokes, "counters": counters})
            derived["probes"][orientation] = rows
        out[str(weight)] = derived
    return out


def _quantiles(values: Sequence[float]) -> Optional[Dict[str, float]]:
    clean = [value for value in values if value is not None]
    if not clean:
        return None
    if len(clean) < 2:
        return {"median": round(clean[0], 4), "q1": round(clean[0], 4), "q3": round(clean[0], 4), "n": 1}
    q1, med, q3 = statistics.quantiles(clean, n=4)
    return {"median": round(med, 4), "q1": round(q1, 4), "q3": round(q3, 4), "n": len(clean)}


def summarize(characters: Dict[str, Any], derived: Dict[str, Any], groups: Dict[str, str], weights: Sequence[int]) -> Dict[str, Any]:
    """그룹 × 굵기 중앙값. 세로줄기 두께는 가로 프로브 구간, 가로줄기 두께는 세로 프로브 구간."""
    by_group: Dict[str, Dict[str, Dict[str, List[float]]]] = {}
    for character, entry in characters.items():
        group = groups.get(entry["initialJamo"], "?")
        for weight in weights:
            d = derived[character].get(str(weight))
            if not d or d.get("reasonCode"):
                continue
            bucket = by_group.setdefault(group, {}).setdefault(str(weight), {
                "verticalThicknessRatio": [], "horizontalThicknessRatio": [],
                "counterRatioAcrossX": [], "counterRatioAcrossY": [],
                "centerShiftPerCounterX": [], "centerShiftPerCounterY": [],
                "outerCenterShiftPerThicknessX": [], "innerCenterShiftPerThicknessX": [],
                "outerEdgeGrowthShare": [], "centerShiftPerThicknessDelta": [],
                "medialStemRatio": [], "medialBeamRatio": [],
                "boxWidthRatio": [], "boxHeightRatio": [],
            })
            for key, target in (("stem", "medialStemRatio"), ("beam", "medialBeamRatio")):
                if d["medial"].get(key) is not None:
                    bucket[target].append(d["medial"][key])
            bucket["boxWidthRatio"].append(d["boxWidthRatio"])
            bucket["boxHeightRatio"].append(d["boxHeightRatio"])
            for orientation, thickness_key, counter_key, shift_key in (
                ("horizontal", "verticalThicknessRatio", "counterRatioAcrossX", "centerShiftPerCounterX"),
                ("vertical", "horizontalThicknessRatio", "counterRatioAcrossY", "centerShiftPerCounterY"),
            ):
                for row in d["probes"][orientation]:
                    if row.get("reasonCode"):
                        continue
                    strokes = row["strokes"]
                    for index, stroke in enumerate(strokes):
                        if stroke["thicknessRatio"] is not None:
                            bucket[thickness_key].append(stroke["thicknessRatio"])
                        if stroke.get("outerEdgeGrowthShare") is not None:
                            bucket["outerEdgeGrowthShare"].append(stroke["outerEdgeGrowthShare"])
                        if stroke.get("centerShiftPerThicknessDelta") is not None and (index == 0 or index == len(strokes) - 1):
                            bucket["centerShiftPerThicknessDelta"].append(stroke["centerShiftPerThicknessDelta"])
                        if stroke["centerShiftPerCounter"] is not None:
                            # 왼쪽(위쪽) 구간은 안쪽으로 밀리면 +, 오른쪽(아래쪽)은 −. 부호를 안쪽 방향으로 맞춘다.
                            sign = 1.0 if index < len(strokes) / 2.0 else -1.0
                            bucket[shift_key].append(sign * stroke["centerShiftPerCounter"])
                        if orientation == "horizontal" and stroke["centerShiftPerThickness"] is not None and len(strokes) > 1:
                            outer = index == 0 or index == len(strokes) - 1
                            sign = 1.0 if index < len(strokes) / 2.0 else -1.0
                            bucket["outerCenterShiftPerThicknessX" if outer else "innerCenterShiftPerThicknessX"].append(sign * stroke["centerShiftPerThickness"])
                    for counter in row["counters"]:
                        if counter["ratio"] is not None:
                            bucket[counter_key].append(counter["ratio"])
    summary: Dict[str, Any] = {}
    for group, per_weight in sorted(by_group.items()):
        summary[group] = {weight: {key: _quantiles(values) for key, values in metrics.items()} for weight, metrics in per_weight.items()}
    return summary


def app_multiplier(weight: int) -> float:
    """앱 `weightToMultiplier`(src/utils/globalStyleUtils.ts)와 같은 식. 비교용."""
    if weight <= 400:
        return 0.4 + (weight - 100) / 300 * 0.6
    return 1 + (weight - 400) / 500 * 1.2


POOLED_KEYS = (
    "verticalThicknessRatio", "horizontalThicknessRatio", "counterRatioAcrossX", "counterRatioAcrossY",
    "outerEdgeGrowthShare", "centerShiftPerThicknessDelta", "medialStemRatio", "medialBeamRatio", "boxWidthRatio", "boxHeightRatio",
)


def pool(characters: Dict[str, Any], derived: Dict[str, Any], weights: Sequence[int]) -> Dict[str, Any]:
    """그룹을 가르지 않은 굵기별 표. 그룹 중앙값이 서로 비슷해 앱은 이 표 하나를 읽는다."""
    out: Dict[str, Any] = {}
    for weight in weights:
        values: Dict[str, List[float]] = {key: [] for key in POOLED_KEYS}
        for character in characters:
            d = derived[character].get(str(weight))
            if not d or d.get("reasonCode"):
                continue
            values["boxWidthRatio"].append(d["boxWidthRatio"])
            values["boxHeightRatio"].append(d["boxHeightRatio"])
            if d["medial"].get("stem") is not None:
                values["medialStemRatio"].append(d["medial"]["stem"])
            if d["medial"].get("beam") is not None:
                values["medialBeamRatio"].append(d["medial"]["beam"])
            for orientation, thickness_key, counter_key in (("horizontal", "verticalThicknessRatio", "counterRatioAcrossX"), ("vertical", "horizontalThicknessRatio", "counterRatioAcrossY")):
                for row in d["probes"][orientation]:
                    if row.get("reasonCode"):
                        continue
                    for index, stroke in enumerate(row["strokes"]):
                        if stroke["thicknessRatio"] is not None:
                            values[thickness_key].append(stroke["thicknessRatio"])
                        if stroke.get("outerEdgeGrowthShare") is not None:
                            values["outerEdgeGrowthShare"].append(stroke["outerEdgeGrowthShare"])
                        if stroke.get("centerShiftPerThicknessDelta") is not None and (index == 0 or index == len(row["strokes"]) - 1):
                            values["centerShiftPerThicknessDelta"].append(stroke["centerShiftPerThicknessDelta"])
                    for counter in row["counters"]:
                        if counter["ratio"] is not None:
                            values[counter_key].append(counter["ratio"])
        row_out: Dict[str, Any] = {key: _quantiles(items) for key, items in values.items()}
        row_out["appMultiplier"] = round(app_multiplier(weight), 4)
        vertical = row_out["verticalThicknessRatio"]
        row_out["appThicknessError"] = round(app_multiplier(weight) / vertical["median"] - 1, 4) if vertical else None
        out[str(weight)] = row_out
    return out


def interpolation_check(summary: Dict[str, Any], weights: Sequence[int]) -> Dict[str, Any]:
    """100과 900 중앙값을 직선으로 이었을 때 사이 굵기 중앙값과의 차. 두 마스터 보간이면 0에 가깝다."""
    low, high = str(min(weights)), str(max(weights))
    out: Dict[str, Any] = {}
    for group, per_weight in summary.items():
        rows: Dict[str, Any] = {}
        for weight in weights:
            key = str(weight)
            if key in (low, high) or key not in per_weight:
                continue
            t = (weight - int(low)) / (int(high) - int(low))
            residuals: Dict[str, Optional[float]] = {}
            for metric in per_weight[key]:
                a, b, c = per_weight[low].get(metric), per_weight[high].get(metric), per_weight[key].get(metric)
                if not a or not b or not c:
                    residuals[metric] = None
                    continue
                residuals[metric] = round(c["median"] - (a["median"] + (b["median"] - a["median"]) * t), 4)
            rows[key] = residuals
        out[group] = rows
    return out


def load_groups() -> Dict[str, str]:
    with GROUPS_PATH.open(encoding="utf-8") as source:
        data = json.load(source)
    return {jamo: record["inkSpaceGroup"] for jamo, record in data.items() if str(record.get("inkSpaceGroup", "")).startswith("S")}


def run(args: argparse.Namespace) -> Dict[str, Any]:
    weights = tuple(int(value) for value in args.weights.split(","))
    if BASE_WEIGHT not in weights:
        raise ValueError("기준 굵기 400이 목록에 있어야 합니다.")
    initials = tuple(args.initials) if args.initials else INITIALS
    characters, ghosts = measure_font(args.font, weights, initials, MEDIALS)
    derived = {character: derive_character(entry, weights) for character, entry in characters.items()}
    groups = load_groups()
    summary = summarize(characters, derived, groups, weights)
    pooled = pool(characters, derived, weights)
    font = TTFont(args.font, lazy=True)
    avar = {str(k): v for k, v in font["avar"].segments["wght"].items()} if "avar" in font else None
    result = {
        "schema": SCHEMA,
        "font": {"id": medial.G0_FONT_ID, "fileSha256": medial.G0_FONT_SHA256, "axis": "wght", "avarSegments": avar},
        "baseWeight": BASE_WEIGHT,
        "weights": list(weights),
        "probeRatios": list(PROBE_RATIOS),
        "measurementScale": "1000-unit, y-down, baseline 880",
        "meaning": "첫닿자 잉크 상자 안 프로브의 잉크 구간을 400과 비교한 배율 · 밀림. 그룹 값은 중앙값. 정확도 승인이 아니다.",
        "groups": groups,
        "pooled": pooled,
        "summary": summary,
        "interpolationResidual": interpolation_check(summary, weights),
        "characters": {character: {**entry, "derived": derived[character]} for character, entry in characters.items()},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    # 앱이 읽는 작은 표. 전체 관측(1MB 넘음)은 기록용이고 화면은 이것만 가져간다.
    with args.pooled_output.open("w", encoding="utf-8") as target:
        json.dump({"schema": "noto-weight-pooled-v1", "font": result["font"], "baseWeight": BASE_WEIGHT, "weights": list(weights), "meaning": result["meaning"], "pooled": pooled}, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"), indent=None)
    with args.ghost_output.open("w", encoding="utf-8") as target:
        json.dump({"schema": GHOST_SCHEMA, "font": result["font"], "frame": result["measurementScale"], "weights": list(GHOST_WEIGHTS), "characters": ghosts}, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="노토 굵기별 두께 · 속공간 · 중심선 밀림 측정 (관측 불변)")
    parser.add_argument("--font", type=Path, default=PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "reference-data/noto-weight-offsets.v1.json")
    parser.add_argument("--pooled-output", type=Path, default=PROJECT_ROOT / "reference-data/noto-weight-pooled.v1.json")
    parser.add_argument("--ghost-output", type=Path, default=PROJECT_ROOT / "reference-data/noto-weight-ghosts.v1.json")
    parser.add_argument("--weights", default=",".join(str(weight) for weight in WEIGHTS))
    parser.add_argument("--initials", help="공백 없이 첫닿자만. 기본은 19자 전부.")
    args = parser.parse_args()
    result = run(args)
    print("w    app   noto-v noto-h  cntX  outer  shift/dt  boxW", file=sys.stderr)
    for weight in result["weights"]:
        row = result["pooled"][str(weight)]
        med = lambda key: (row.get(key) or {}).get("median")  # noqa: E731
        print("{:3d} {:6.3f} {:6.3f} {:6.3f} {:5.2f} {:6.3f} {:8.3f} {:6.3f}".format(
            weight, row["appMultiplier"], med("verticalThicknessRatio") or float("nan"), med("horizontalThicknessRatio") or float("nan"),
            med("counterRatioAcrossX") or float("nan"), med("outerEdgeGrowthShare") or float("nan"), med("centerShiftPerThicknessDelta") or float("nan"), med("boxWidthRatio") or float("nan")), file=sys.stderr)


if __name__ == "__main__":
    main()
