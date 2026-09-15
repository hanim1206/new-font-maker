#!/usr/bin/env python3
"""전수 목록, 출처 분리, 캐시와 변화량 계산의 단위 검증."""

from __future__ import annotations

import argparse
from copy import deepcopy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import initial_component_extractor as initial
import noto_guide_corpus as corpus


class FakeGlyph:
    def draw(self, pen):
        pen.moveTo((0, 0))
        pen.qCurveTo((100, 200), (200, 0))
        pen.lineTo((0, 0))
        pen.closePath()


class FakeFont:
    def getBestCmap(self):
        return {ord(character): "sample" for character in "가각걔꺄걕꺅"}

    def getGlyphSet(self):
        return {"sample": FakeGlyph()}

    def __getitem__(self, key):
        if key != "head":
            raise KeyError(key)
        return SimpleNamespace(unitsPerEm=1000)

    def close(self):
        pass


def medial_observation(_font, character, medial_jamo, final_jamo):
    return {
        "character": character, "medialJamo": medial_jamo, "finalJamo": final_jamo,
        "glyphName": "sample", "status": "candidate",
        "elements": [{
            "elementId": spec.element_id, "orientation": spec.orientation, "faceSide": spec.side,
            "face": {"status": "candidate", "value": 700, "evidence": {"contourId": 1}},
            "visibleSpans": {"status": "candidate", "value": [{"from": 100, "to": 400}]},
        } for spec in corpus.medial.MEDIAL_ROLE_SPECS[medial_jamo]],
    }


class CorpusIdentityTests(unittest.TestCase):
    def test_manifest_covers_exactly_modern_hangul(self):
        cases = corpus.all_cases()
        self.assertEqual(len(cases), 11172)
        self.assertEqual(len({case["character"] for case in cases}), 11172)
        self.assertEqual(cases[0]["character"], "가")
        self.assertEqual(cases[-1]["character"], "힣")
        self.assertEqual(len({case["initialJamo"] for case in cases}), 19)
        self.assertEqual(len({case["medialJamo"] for case in cases}), 21)
        self.assertEqual(len({case["finalJamo"] for case in cases}), 28)
        self.assertEqual(corpus.case_for(ord("꽈"))["initialJamo"], "ㄲ")
        self.assertEqual(corpus.case_for(ord("꽈"))["contextId"], "mixed")
        self.assertEqual(corpus.case_for(ord("곽"))["contextId"], "mixed-final")

    def test_scopes_and_exact_final_identity(self):
        self.assertEqual(len(corpus.selected_cases("no-final", None)), 399)
        self.assertEqual(len(corpus.selected_cases("anchors", None)), 114)
        self.assertEqual(len(corpus.selected_cases("all", None)), 11172)
        selected = corpus.selected_cases("all", "곽 가가")
        self.assertEqual([case["character"] for case in selected], ["가", "곽"])
        self.assertEqual(selected[1]["finalJamo"], "ㄱ")
        for character in ("A", "ㄱ", ""):
            with self.subTest(character=character), self.assertRaises(ValueError):
                corpus.selected_cases("all", character)

    def test_fixed_font_hash_rejected_before_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "wrong.ttf"
            source.write_bytes(b"not-noto")
            with patch.object(corpus, "TTFont") as loader:
                with self.assertRaisesRegex(ValueError, "SHA"):
                    corpus.font_identity(source)
                loader.assert_not_called()


class ObservationTests(unittest.TestCase):
    def test_raw_outline_preserves_curve_and_uses_actual_extrema(self):
        result = corpus.outline_observation(FakeFont(), corpus.case_for(ord("가")))
        self.assertEqual(result["status"], "candidate")
        observed = result["observation"]
        self.assertEqual(observed["contourCount"], 1)
        self.assertEqual(observed["inkBounds"]["top"], 100)
        self.assertEqual(observed["operations"][1]["operation"], "qCurveTo")
        self.assertEqual(observed["operations"][1]["arguments"][0], (100, 200))
        self.assertAlmostEqual(result["measurements"]["inkBounds"]["top"], 0.780)
        self.assertEqual(observed["fontToGlyphNormalized"], [0.001, 0, 0, -0.001, 0, 0.88])

    def test_missing_glyph_is_not_replaced(self):
        result = corpus.outline_observation(FakeFont(), corpus.case_for(ord("힣")))
        self.assertEqual(result["status"], "abstained")
        self.assertEqual(result["reasonCodes"], ["glyph-missing"])
        self.assertIsNone(result["observation"])

    def test_required_roles_and_finite_visible_spans(self):
        observation = medial_observation(None, "걔", "ㅒ", None)
        before = deepcopy(observation)
        result = corpus.medial_payload(observation, "ㅒ")
        self.assertEqual(result["status"], "candidate")
        self.assertEqual(observation, before)
        self.assertEqual(result["measurements"]["outerPillar"]["face"], 0.7)
        observation["elements"][0]["face"]["value"] = float("nan")
        self.assertEqual(corpus.medial_payload(observation, "ㅒ")["status"], "partial")
        observation["elements"] = []
        self.assertEqual(corpus.medial_payload(observation, "ㅒ")["status"], "abstained")

    def test_shared_medial_identity_must_match(self):
        observed = medial_observation(None, "각", "ㅏ", "ㄱ")
        with self.assertRaisesRegex(ValueError, "identity"):
            initial._medial_anchor_data(FakeFont(), "가", "ㅏ", None, medial_observation=observed)

    def test_shared_raw_medial_schema_does_not_reextract(self):
        observed = {"character": "가", "glyphName": "sample", "elements": []}
        with patch.object(corpus.medial, "extract_medial_character") as extract:
            faces, contour_ids = initial._medial_anchor_data(FakeFont(), "가", "ㅏ", None, medial_observation=observed)
            self.assertEqual((faces, contour_ids), ({}, set()))
            extract.assert_not_called()

    @unittest.skipUnless((corpus.PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf").is_file(), "Noto reference font unavailable")
    def test_real_noto_shared_observation_matches_existing_paths(self):
        font = corpus.medial.load_font(corpus.PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf")
        try:
            for character in ("가", "곽"):
                request = corpus.INITIAL_CASES[character]
                args = (character, request["initialJamo"], request["medialJamo"], request["finalJamo"], request["contextId"])
                observed = corpus.medial.extract_medial_character(font, character, request["medialJamo"], request["finalJamo"])
                with self.subTest(character=character, role="initial"):
                    expected = initial.extract_initial_character(font, *args)
                    shared = initial.extract_initial_character(font, *args, medial_observation=observed)
                    self.assertEqual(shared, expected)
                    self.assertEqual(shared["selectionArea"]["status"], "candidate")
                if request["finalJamo"] is not None:
                    with self.subTest(character=character, role="final"):
                        prefix = (font, corpus.medial.G0_FONT_SHA256, {"wght": 400.0})
                        expected = corpus.final.extract_final_character(*prefix, *args)
                        shared = corpus.final.extract_final_character(*prefix, *args, medial_observation=observed)
                        self.assertEqual(shared, expected)
                        self.assertEqual(shared["selectionArea"]["status"], "candidate")
        finally:
            font.close()

    def test_component_normalization_does_not_promote_approval(self):
        observed = {
            "componentGroup": {"status": "candidate"},
            "roleFaces": {side: {"status": "candidate", "value": value} for side, value in {"top": 100, "bottom": 600, "left": 100, "right": 400}.items()},
            "selectionArea": {"status": "candidate", "value": {"x": 100, "y": 100, "width": 300, "height": 500}},
        }
        result = corpus.component_payload(observed)
        self.assertEqual(result["status"], "candidate")
        self.assertEqual(result["measurements"]["selectionArea"]["width"], 0.3)
        self.assertNotIn("approved", result)
        self.assertFalse(corpus.REVIEW["approved"])


class CacheTests(unittest.TestCase):
    def test_resume_and_version_invalidation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = corpus.case_for(ord("가"))
            cache = corpus.StageCache(root, {"outline": "v1"})
            with patch.object(corpus, "outline_observation", return_value=corpus.unavailable("abstained", "sample")) as compute:
                callback = lambda: compute(None, case)
                cache.run("outline", case, callback)
                cache.run("outline", case, callback)
                self.assertEqual(compute.call_count, 1)
                self.assertEqual(cache.hits["outline"], 1)
                corpus.StageCache(root, {"outline": "v2"}).run("outline", case, callback)
                self.assertEqual(compute.call_count, 2)

    def test_corruption_and_wrong_identity_cannot_be_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = corpus.case_for(ord("가"))
            cache = corpus.StageCache(root, {"outline": "v1"})
            callback = lambda: corpus.unavailable("abstained", "sample")
            _, relative = cache.run("outline", case, callback)
            path = root / relative
            path.write_text("{", encoding="utf-8")
            cache.run("outline", case, callback)
            saved = json.loads(path.read_text(encoding="utf-8"))
            saved["identity"] = corpus.case_for(ord("각"))
            corpus.write_json(path, saved)
            cache.run("outline", case, callback)
            self.assertEqual(cache.writes["outline"], 3)
            self.assertEqual(cache.hits["outline"], 0)

    def test_explicit_retry_recomputes_incomplete_measurement(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = corpus.StageCache(Path(directory), {"medial": "v1"}, retry_incomplete=True)
            case = corpus.case_for(ord("가"))
            callback = lambda: corpus.unavailable("partial", "missing-role")
            cache.run("medial", case, callback)
            cache.run("medial", case, callback)
            self.assertEqual(cache.writes["medial"], 2)


class BatchTests(unittest.TestCase):
    def test_pause_resume_and_unsupported_without_projection(self):
        with tempfile.TemporaryDirectory() as directory:
            args = argparse.Namespace(font=Path("unused.ttf"), output=Path(directory), scope="all", characters="걕꺅", manifest_only=False, retry_incomplete=False, stop_after=1)
            identity = {"id": "fixture", "fileSha256": "fixture", "axes": {"wght": 400}, "unitsPerEm": 1000}
            keys = {stage: stage for stage in corpus.STAGES}
            with patch.object(corpus, "font_identity", return_value=identity), patch.object(corpus, "stage_versions", return_value=(keys, {})), patch.object(corpus.medial, "load_font", return_value=FakeFont()), patch.object(corpus.medial, "extract_medial_character", side_effect=medial_observation) as extract_medial, patch.object(corpus.initial, "extract_initial_character") as extract_initial:
                first = corpus.run_batch(args)
                self.assertEqual(first["status"], "paused")
                self.assertEqual(first["pendingCount"], 1)
                second = corpus.run_batch(args)
                self.assertEqual(second["status"], "completed")
                self.assertEqual(second["pendingCount"], 0)
                self.assertEqual(second["cacheHits"]["medial"], 1)
                self.assertEqual(extract_medial.call_count, 2)
                self.assertEqual(second["stageCounts"]["initial"], {"unsupported": 2})
                self.assertEqual(second["allRequiredRolesCandidateCount"], 0)
                self.assertEqual(second["verifiedCount"], 0)
                extract_initial.assert_not_called()
                with patch.object(corpus.medial, "load_font") as load:
                    third = corpus.run_batch(args)
                    self.assertEqual(third["stageWrites"], {})
                    load.assert_not_called()

    def test_medial_deltas_use_same_medial_and_exact_final(self):
        def row(character, face):
            return {"identity": corpus.case_for(ord(character)), "stages": {"medial": {
                "status": "candidate", "artifact": character + ".json",
                "measurements": {"outerPillar": {"orientation": "vertical", "faceSide": "right", "face": face, "visibleLength": 0.5}},
            }}}
        rows = [row("기", 0.7), row("니", 0.72), row("닉", 0.74)]
        before = deepcopy(rows)
        deltas = corpus.medial_deltas(rows)
        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0]["baselineCharacter"], "기")
        self.assertEqual(deltas[0]["character"], "니")
        self.assertAlmostEqual(deltas[0]["faceDelta"], 0.02)
        self.assertEqual(deltas[0]["status"], "analysis-candidate")
        self.assertEqual(rows, before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
