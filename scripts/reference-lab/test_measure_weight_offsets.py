"""굵기 측정 패스의 규칙 검사. 실제 폰트 없이 합성 사각형으로 돈다."""

from dataclasses import dataclass
from typing import Tuple

import measure_weight_offsets as m


@dataclass(frozen=True)
class FakeRecord:
    bounds: Tuple[float, float, float, float]  # (left, top, right, bottom)

    @property
    def polygon(self):
        left, top, right, bottom = self.bounds
        return ((left, top), (right, top), (right, bottom), (left, bottom), (left, top))


def rect(left, top, right, bottom):
    return FakeRecord((left, top, right, bottom))


def test_filled_intervals_merges_overlapping_contours_and_skips_holes():
    outer = rect(100, 100, 300, 300).polygon
    hole = tuple(reversed(rect(150, 150, 250, 250).polygon))
    overlap = rect(280, 120, 400, 180).polygon
    assert m.filled_intervals("horizontal", 200, [outer, hole]) == [(100, 150), (250, 300)]
    assert m.filled_intervals("horizontal", 150.5, [outer, overlap]) == [(100, 400)]


def test_split_component_keeps_branch_with_stem_and_leg_with_initial():
    stem, branch = rect(662, 53, 745, 957), rect(723, 420, 889, 489)
    hook, leg = rect(55, 150, 512, 786), rect(400, 500, 700, 780)  # 다리가 기둥 왼쪽 면을 넘어와도 첫닿자
    component, medial_records, reason = m.split_component([stem, branch, hook, leg], "ㅏ")
    assert reason is None
    assert medial_records == [stem, branch]
    assert component == [hook, leg]
    beam, short_stem, ring = rect(50, 773, 870, 842), rect(417, 564, 499, 789), rect(130, 112, 787, 586)
    component, medial_records, reason = m.split_component([short_stem, ring, beam], "ㅗ")
    assert reason is None
    assert medial_records == [short_stem, beam]
    assert component == [ring]


def entry_with(base: Tuple[Tuple[float, float], ...], heavy: Tuple[Tuple[float, float], ...]):
    def weight(intervals):
        return {
            "componentBox": {"left": 0, "top": 0, "right": 500, "bottom": 500},
            "medial": {"stem": 80},
            "probes": {"horizontal": [{"ratio": 0.5, "intervals": list(intervals)}], "vertical": [{"ratio": 0.5, "intervals": []}]},
        }
    return {"weights": {"400": weight(base), "900": {**weight(heavy), "medial": {"stem": 160}}}}


def test_derive_character_reports_ratio_shift_share_and_counter():
    # 400: 두 줄기 (100–180) (320–400), 속공간 140. 900: 두께 160으로, 바깥 변은 1/4만 나가고 나머지는 안으로.
    derived = m.derive_character(entry_with(((100, 180), (320, 400)), ((80, 240), (260, 420))), (400, 900))
    row = derived["900"]["probes"]["horizontal"][0]
    left, right = row["strokes"]
    assert left["thicknessRatio"] == 2.0 and right["thicknessRatio"] == 2.0
    assert left["outerEdgeGrowthShare"] == 0.25 and right["outerEdgeGrowthShare"] == 0.25
    # 중심 140 → 160: 안쪽으로 20, 두께 차 80의 0.25
    assert left["centerShiftPerThicknessDelta"] == 0.25 and right["centerShiftPerThicknessDelta"] == 0.25
    assert row["counters"][0]["ratio"] == round(20 / 140, 4)
    assert derived["900"]["medial"]["stem"] == 2.0
    assert derived["400"]["probes"]["horizontal"][0]["strokes"][0]["centerShift"] == 0


def test_derive_character_skips_probe_when_interval_count_differs():
    derived = m.derive_character(entry_with(((100, 180), (320, 400)), ((80, 420),)), (400, 900))
    assert derived["900"]["probes"]["horizontal"][0]["reasonCode"] == "interval-count-differs"


def test_pool_reads_app_multiplier_and_error():
    characters = {"마": {"initialJamo": "ㅁ", "medialJamo": "ㅏ"}}
    derived = {"마": m.derive_character(entry_with(((100, 180), (320, 400)), ((80, 240), (260, 420))), (400, 900))}
    pooled = m.pool(characters, derived, (400, 900))
    assert pooled["900"]["appMultiplier"] == 2.2
    assert pooled["900"]["verticalThicknessRatio"]["median"] == 2.0
    assert pooled["900"]["appThicknessError"] == round(2.2 / 2.0 - 1, 4)
    assert pooled["900"]["outerEdgeGrowthShare"]["median"] == 0.25
