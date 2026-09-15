#!/usr/bin/env python3
"""효과항 편집 전파 코어 검증(실측 + Δ, 브로드캐스트, 불변성)."""

import json
import unittest
from pathlib import Path

import propagate_edits as prop

ROOT = Path(__file__).resolve().parents[2]
APPROVED = ROOT / "reference-data/preset-candidates/noto-approved-guide-inputs.v1.json"


def glyph(character, codepoint, context, initial, medial, final, baselines):
    return prop.Glyph(
        identity={
            "character": character, "codepoint": codepoint, "contextId": context,
            "initialJamo": initial, "medialJamo": medial, "finalJamo": final,
        },
        baselines=baselines,
    )


T = "initial.roleFaces.bottom"
U = "medial.baseStem.face"


class PropagateCoreTests(unittest.TestCase):
    def setUp(self):
        self.glyphs = [
            glyph("고", 1, "bottom", "ㄱ", "ㅗ", None, {T: 650.0, U: 470.0}),
            glyph("노", 2, "bottom", "ㄴ", "ㅗ", None, {T: 640.0, U: 465.0}),
            glyph("구", 3, "bottom", "ㄱ", "ㅜ", None, {T: 655.0, U: 460.0}),
        ]

    def test_no_edits_is_identity(self):
        result = prop.propagate(self.glyphs, [])
        self.assertEqual(result["changedRowCount"], 0)
        for row in result["rows"]:
            self.assertEqual(row["edited"], row["baseline"])
            self.assertEqual(row["delta"], 0.0)

    def test_effect_edit_broadcasts_to_all_matching_glyphs(self):
        # ㄱ 첫닿효과 −10 → contextId bottom·initial ㄱ인 고·구만 −10, 노는 그대로.
        edit = prop.Edit(target=T, layer="bottom", factor="initial", level="ㄱ", delta=-10.0)
        rows = {(r["character"], r["target"]): r for r in prop.propagate(self.glyphs, [edit])["rows"]}
        self.assertEqual(rows[("고", T)]["edited"], 640.0)
        self.assertEqual(rows[("구", T)]["edited"], 645.0)
        self.assertEqual(rows[("노", T)]["edited"], 640.0)  # 노는 ㄴ이라 불변
        # 다른 타깃(U)은 이 편집과 무관하게 실측 그대로
        self.assertEqual(rows[("고", U)]["edited"], rows[("고", U)]["baseline"])

    def test_edits_stack_additively(self):
        edits = [
            prop.Edit(T, "bottom", "initial", "ㄱ", -10.0),
            prop.Edit(T, "bottom", "medial", "ㅗ", 4.0),
        ]
        rows = {(r["character"], r["target"]): r for r in prop.propagate(self.glyphs, edits)["rows"]}
        # 고: ㄱ(-10) + ㅗ(+4) 둘 다 걸림 → -6
        self.assertEqual(rows[("고", T)]["delta"], -6.0)
        # 구: ㄱ(-10)만, ㅜ는 안 걸림 → -10
        self.assertEqual(rows[("구", T)]["delta"], -10.0)
        # 노: ㅗ(+4)만 → +4
        self.assertEqual(rows[("노", T)]["delta"], 4.0)

    def test_edit_on_wrong_layer_does_nothing(self):
        edit = prop.Edit(target=T, layer="right", factor="initial", level="ㄱ", delta=-10.0)
        self.assertEqual(prop.propagate(self.glyphs, [edit])["changedRowCount"], 0)

    def test_edit_on_absent_level_does_nothing(self):
        edit = prop.Edit(target=T, layer="bottom", factor="initial", level="ㅎ", delta=-10.0)
        self.assertEqual(prop.propagate(self.glyphs, [edit])["changedRowCount"], 0)

    def test_baseline_is_never_overwritten(self):
        edit = prop.Edit(target=T, layer="bottom", factor="initial", level="ㄱ", delta=99.0)
        for row in prop.propagate(self.glyphs, [edit])["rows"]:
            self.assertEqual(row["edited"], round(row["baseline"] + row["delta"], 3))


@unittest.skipUnless(APPROVED.is_file(), "approved unavailable")
class PropagateApprovedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with APPROVED.open(encoding="utf-8") as source:
            cls.glyphs = prop.build_glyphs(json.load(source))

    def test_builds_57_glyphs_with_baselines(self):
        self.assertEqual(len(self.glyphs), 57)
        self.assertTrue(all(g.baselines for g in self.glyphs))

    def test_no_edit_keeps_every_approved_baseline(self):
        result = prop.propagate(self.glyphs, [])
        self.assertEqual(result["changedRowCount"], 0)
        self.assertTrue(all(row["edited"] == row["baseline"] for row in result["rows"]))

    def test_giyeok_bottom_edit_only_moves_giyeok_bottom_glyphs(self):
        edit = prop.Edit("initial.roleFaces.bottom", "bottom", "initial", "ㄱ", -10.0)
        changed = [r for r in prop.propagate(self.glyphs, [edit])["rows"] if r["delta"]]
        self.assertTrue(changed)
        for row in changed:
            self.assertEqual(row["target"], "initial.roleFaces.bottom")
            self.assertEqual(row["layer"], "bottom")
            self.assertEqual(row["delta"], -10.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
