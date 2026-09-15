#!/usr/bin/env python3
"""Focused contract tests for the local, read-only Reference Lab API."""

from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from unittest import mock

import medial_guide_extractor as medial_extractor
import server as reference_server


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = PROJECT_ROOT / ".reference-fonts"
CATALOG_PATH = PROJECT_ROOT / "reference-data/font-catalog.v1.json"
LEGACY_MANIFEST_PATH = (
    PROJECT_ROOT / "public/references/vertical-vowel-gap.manifest.json"
)


class ReferenceLabHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = reference_server.create_server(FONT_DIR, CATALOG_PATH, 0)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.thread.join(timeout=5)
        cls.server.server_close()
        cls.server.engine.close()

    def request(
        self,
        method: str,
        path: str,
        payload: Optional[Any] = None,
    ) -> Tuple[int, Dict[str, Any]]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        body = None
        headers = {}
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, result

    def test_health_and_catalog_expose_fixed_read_only_contract(self) -> None:
        status, health = self.request("GET", "/api/reference/v1/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["schema"], "reference-lab-health-v1")
        self.assertEqual(health["apiVersion"], "reference.v1")
        self.assertFalse(health["runtime"]["diskWrites"])

        status, catalog = self.request("GET", "/api/reference/v1/fonts")
        self.assertEqual(status, 200)
        self.assertEqual(catalog["schema"], "reference-font-catalog-response-v1")
        self.assertGreaterEqual(len(catalog["fonts"]), 6)
        self.assertEqual(health["fontCount"], len(catalog["fonts"]))
        self.assertEqual(catalog["display"]["baselineY"], 880)
        self.assertEqual(catalog["display"]["viewBox"], [-120, -120, 1240, 1240])
        self.assertFalse(catalog["display"]["inkAutofit"])
        self.assertFalse(catalog["display"]["individualCentering"])
        self.assertFalse(catalog["display"]["advanceNormalization"])
        self.assertTrue(all("role" not in font for font in catalog["fonts"]))
        self.assertTrue(all("aggregation" not in font for font in catalog["fonts"]))

    def test_nfc_outline_matches_frozen_six_font_evidence(self) -> None:
        legacy = json.loads(LEGACY_MANIFEST_PATH.read_text(encoding="utf-8"))
        expected_hashes = {
            record["fontId"]: record["pathSha256"]
            for record in legacy["references"]
            if record["glyph"] == "가"
        }
        before = {
            path.name: (path.stat().st_size, path.stat().st_mtime_ns)
            for path in FONT_DIR.iterdir()
            if path.is_file()
        }
        status, result = self.request(
            "POST",
            "/api/reference/v1/outlines",
            {"text": " 가\n", "fontIds": list(expected_hashes)},
        )
        after = {
            path.name: (path.stat().st_size, path.stat().st_mtime_ns)
            for path in FONT_DIR.iterdir()
            if path.is_file()
        }

        self.assertEqual(status, 200)
        self.assertEqual(result["schema"], "reference-outline-response-v1")
        self.assertEqual(result["apiVersion"], "reference.v1")
        self.assertEqual(result["text"], "가")
        self.assertEqual(len(result["samples"]), 6)
        self.assertEqual(before, after)

        for sample in result["samples"]:
            glyph = sample["glyphs"][0]
            self.assertFalse(glyph["missing"])
            self.assertTrue(glyph["path"])
            self.assertEqual(glyph["pathSha256"], expected_hashes[sample["fontId"]])
            self.assertGreater(glyph["unitsPerEm"], 0)
            self.assertGreater(glyph["advance"], 0)
            self.assertEqual(len(glyph["bounds"]), 4)

    def test_subset_and_missing_glyph_use_discriminated_records(self) -> None:
        status, result = self.request(
            "POST",
            "/api/reference/v1/outlines",
            {"text": "🙂", "fontIds": ["black-han-sans"]},
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(result["samples"]), 1)
        glyph = result["samples"][0]["glyphs"][0]
        self.assertTrue(glyph["missing"])
        self.assertEqual(glyph["error"]["code"], "GLYPH_MISSING")
        self.assertNotIn("path", glyph)

    def test_medial_g0_candidates_return_finite_visible_face_segments(self) -> None:
        payload = {
            "fontId": "noto-sans-kr",
            "cases": [
                {"character": "가", "initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": None},
                {"character": "국", "initialJamo": "ㄱ", "medialJamo": "ㅜ", "finalJamo": "ㄱ"},
                {"character": "과", "initialJamo": "ㄱ", "medialJamo": "ㅘ", "finalJamo": None},
                {"character": "곽", "initialJamo": "ㄱ", "medialJamo": "ㅘ", "finalJamo": "ㄱ"},
            ],
        }
        with mock.patch.object(reference_server.medial_guide_extractor, "G0_ANNOTATIONS", {}):
            status, result = self.request(
                "POST",
                "/api/reference/v1/medial-guide-candidates",
                payload,
            )

        self.assertEqual(status, 200)
        self.assertEqual(result["schema"], "reference-medial-guide-candidate-response-v1")
        self.assertEqual(result["extractorVersion"], medial_extractor.API_EXTRACTOR_VERSION)
        self.assertEqual(result["roleDefinitionVersion"], "medial-guide-role-v4")
        self.assertEqual(result["matching"], "geometry-role-search")
        ga_pillar = next(
            element
            for element in result["cases"][0]["elements"]
            if element["elementId"] == "outerPillar"
        )
        self.assertEqual(round(ga_pillar["face"]["value"]), 745)
        self.assertTrue(ga_pillar["face"]["evidence"]["method"].startswith("geometric-role-matcher-v"))
        self.assertEqual(ga_pillar["match"]["confidence"], "high")
        self.assertGreater(ga_pillar["match"]["score"], 0.9)
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in ga_pillar["visibleSpans"]["value"]],
            [[53, 420], [489, 957]],
        )
        guk_stem = next(
            element
            for element in result["cases"][1]["elements"]
            if element["elementId"] == "baseStem"
        )
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in guk_stem["visibleSpans"]["value"]],
            [[487, 652]],
        )
        gwa_lower_beam = next(
            element
            for element in result["cases"][2]["elements"]
            if element["elementId"] == "lowerBeam"
        )
        self.assertEqual(round(gwa_lower_beam["face"]["value"]), 691)
        self.assertEqual(gwa_lower_beam["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in gwa_lower_beam["visibleSpans"]["value"]],
            [[41, 65]],
        )
        gwak_lower_beam = next(
            element
            for element in result["cases"][3]["elements"]
            if element["elementId"] == "lowerBeam"
        )
        self.assertEqual(round(gwak_lower_beam["face"]["value"]), 496)
        self.assertEqual(gwak_lower_beam["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in gwak_lower_beam["visibleSpans"]["value"]],
            [[44, 98]],
        )

        cache_size = len(self.server.engine._medial_candidate_cache)
        second_status, second_result = self.request(
            "POST",
            "/api/reference/v1/medial-guide-candidates",
            payload,
        )
        self.assertEqual(second_status, 200)
        self.assertEqual(second_result, result)
        self.assertEqual(len(self.server.engine._medial_candidate_cache), cache_size)

    def test_initial_component_candidates_return_role_derived_area_and_finite_face_evidence(self) -> None:
        cases = [
            {"character": "가", "initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": None, "contextId": "right"},
            {"character": "각", "initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": "ㄱ", "contextId": "right-final"},
            {"character": "고", "initialJamo": "ㄱ", "medialJamo": "ㅗ", "finalJamo": None, "contextId": "bottom"},
            {"character": "곡", "initialJamo": "ㄱ", "medialJamo": "ㅗ", "finalJamo": "ㄱ", "contextId": "bottom-final"},
            {"character": "과", "initialJamo": "ㄱ", "medialJamo": "ㅘ", "finalJamo": None, "contextId": "mixed"},
            {"character": "곽", "initialJamo": "ㄱ", "medialJamo": "ㅘ", "finalJamo": "ㄱ", "contextId": "mixed-final"},
        ]
        status, result = self.request(
            "POST",
            "/api/reference/v1/initial-component-candidates",
            {"fontId": "noto-sans-kr", "cases": cases},
        )

        self.assertEqual(status, 200)
        self.assertEqual(result["schema"], "reference-initial-component-candidate-response-v2")
        self.assertEqual(result["extractorVersion"], "initial-component-matcher-v3")
        self.assertEqual(result["roleDefinitionVersion"], "initial-component-role-v2")
        self.assertEqual(result["medialAnchorExtractorVersion"], "geometric-role-matcher-v9")
        self.assertEqual([case["character"] for case in result["cases"]], [case["character"] for case in cases])
        self.assertTrue(all(case["componentGroup"]["status"] == "candidate" for case in result["cases"]))
        for case in result["cases"]:
            role_faces = {side: observation["value"] for side, observation in case["roleFaces"].items()}
            area = case["selectionArea"]["value"]
            self.assertEqual(area, {
                "x": role_faces["left"],
                "y": role_faces["top"],
                "width": round(role_faces["right"] - role_faces["left"], 3),
                "height": round(role_faces["bottom"] - role_faces["top"], 3),
            })
            self.assertTrue(all(
                face["status"] in {"candidate", "abstained"}
                for face in case["axisFaces"].values()
            ))

        cache_size = len(self.server.engine._initial_component_candidate_cache)
        second_status, second_result = self.request(
            "POST",
            "/api/reference/v1/initial-component-candidates",
            {"fontId": "noto-sans-kr", "cases": cases},
        )
        self.assertEqual(second_status, 200)
        self.assertEqual(second_result, result)
        self.assertEqual(len(self.server.engine._initial_component_candidate_cache), cache_size)

    def test_initial_component_candidates_preserve_merged_boundary_and_scope(self) -> None:
        status, result = self.request(
            "POST",
            "/api/reference/v1/initial-component-candidates",
            {
                "fontId": "nanum-gothic",
                "cases": [
                    {"character": "노", "initialJamo": "ㄴ", "medialJamo": "ㅗ", "finalJamo": None, "contextId": "bottom"},
                ],
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(result["cases"][0]["componentGroup"]["evidence"]["selectionRule"], "context-directed-merged-boundary")

        status, error = self.request(
            "POST",
            "/api/reference/v1/initial-component-candidates",
            {
                "fontId": "noto-sans-kr",
                "cases": [
                    {"character": "거", "initialJamo": "ㄱ", "medialJamo": "ㅓ", "finalJamo": None, "contextId": "right"},
                ],
            },
        )
        self.assertEqual(status, 422)
        self.assertEqual(error["error"]["code"], "P0_SCOPE_UNAVAILABLE")

        status, error = self.request(
            "POST",
            "/api/reference/v1/initial-component-candidates",
            {
                "fontId": "noto-sans-kr",
                "cases": [
                    {"character": "가", "initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": None, "contextId": "bottom"},
                ],
            },
        )
        self.assertEqual(status, 400)
        self.assertEqual(error["error"]["code"], "INVALID_INITIAL_COMPONENT_IDENTITY")

    def test_final_component_display_uses_verified_fixture_and_member_paths(self) -> None:
        cases = [
            {
                "character": reference_server.final_component_contract.compose_syllable("ㄱ", "ㅏ", "ㄱ"),
                "initialJamo": "ㄱ",
                "medialJamo": "ㅏ",
                "finalJamo": "ㄱ",
                "contextId": "right-final",
            },
            {
                "character": reference_server.final_component_contract.compose_syllable("ㄱ", "ㅏ", "ㄳ"),
                "initialJamo": "ㄱ",
                "medialJamo": "ㅏ",
                "finalJamo": "ㄳ",
                "contextId": "right-final",
            },
        ]
        status, result = self.request(
            "POST",
            "/api/reference/v1/final-component-display",
            {"fontId": "noto-sans-kr", "cases": cases},
        )

        self.assertEqual(status, 200)
        self.assertEqual(result["schema"], "reference-final-component-display-response-v1")
        self.assertEqual(result["coordinateFrame"], "shared-baseline")
        self.assertEqual(result["source"]["verification"]["state"], "verified")
        self.assertEqual(result["font"]["fileSha256"], self.server.engine.fonts_by_id["noto-sans-kr"]["fileSha256"])
        self.assertEqual([case["identity"]["character"] for case in result["cases"]], [case["character"] for case in cases])

        single, compound = result["cases"]
        self.assertEqual(single["state"], "candidate")
        self.assertEqual([member["id"] for member in single["memberPaths"]], ["only"])
        self.assertEqual(compound["state"], "candidate")
        self.assertEqual([member["id"] for member in compound["memberPaths"]], ["left", "right"])
        self.assertTrue(all(member["path"] for member in compound["memberPaths"]))
        role_faces = {side: observation["value"] for side, observation in compound["roleFaces"].items()}
        self.assertEqual(compound["selectionArea"]["value"], {
            "x": role_faces["left"],
            "y": role_faces["top"],
            "width": round(role_faces["right"] - role_faces["left"], 3),
            "height": round(role_faces["bottom"] - role_faces["top"], 3),
        })

        for font_id in ("nanum-gothic", "dotum"):
            status, approved_result = self.request(
                "POST",
                "/api/reference/v1/final-component-display",
                {"fontId": font_id, "cases": cases[:1]},
            )
            self.assertEqual(status, 200)
            self.assertEqual(approved_result["font"]["id"], font_id)
            self.assertEqual(approved_result["source"]["verification"]["state"], "verified")
            self.assertEqual(approved_result["cases"][0]["identity"]["character"], "각")

        status, error = self.request(
            "POST",
            "/api/reference/v1/final-component-display",
            {"fontId": "ibm-plex-sans-kr", "cases": cases[:1]},
        )
        self.assertEqual(status, 422)
        self.assertEqual(error["error"]["code"], "P1_SCOPE_UNAVAILABLE")

    def test_medial_candidate_request_rejects_mismatched_or_out_of_scope_cases(self) -> None:
        status, error = self.request(
            "POST",
            "/api/reference/v1/medial-guide-candidates",
            {
                "fontId": "noto-sans-kr",
                "cases": [
                    {"character": "가", "initialJamo": "ㄱ", "medialJamo": "ㅓ", "finalJamo": None},
                ],
            },
        )
        self.assertEqual(status, 400)
        self.assertEqual(error["error"]["code"], "INVALID_SYLLABLE_CASE")

        status, error = self.request(
            "POST",
            "/api/reference/v1/medial-guide-candidates",
            {
                "fontId": "noto-sans-kr",
                "cases": [
                    {"character": "간", "initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": "ㄴ"},
                ],
            },
        )
        self.assertEqual(status, 422)
        self.assertEqual(error["error"]["code"], "P1_SCOPE_UNAVAILABLE")

        status, error = self.request(
            "POST",
            "/api/reference/v1/medial-guide-candidates",
            {
                "fontId": "ibm-plex-sans-kr",
                "cases": [
                    {"character": "가", "initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": None},
                ],
            },
        )
        self.assertEqual(status, 422)
        self.assertEqual(error["error"]["code"], "P1_SCOPE_UNAVAILABLE")

    def test_medial_p1_accepts_remaining_structure_families(self) -> None:
        requested = (
            ("개", "ㅐ", None, ["innerPillar", "outerPillar", "primaryBeam"]),
            ("걕", "ㅒ", "ㄱ", ["innerPillar", "outerPillar", "upperBeam", "lowerBeam"]),
            ("교", "ㅛ", None, ["leftStem", "rightStem", "primaryBeam"]),
            ("궥", "ㅞ", "ㄱ", ["baseStem", "innerPillar", "outerPillar", "upperBeam", "lowerBeam"]),
            ("긔", "ㅢ", None, ["outerPillar", "primaryBeam"]),
        )
        status, result = self.request(
            "POST",
            "/api/reference/v1/medial-guide-candidates",
            {
                "fontId": "noto-sans-kr",
                "cases": [
                    {"character": character, "initialJamo": "ㄱ", "medialJamo": medial, "finalJamo": final}
                    for character, medial, final, _ in requested
                ],
            },
        )

        self.assertEqual(status, 200)
        self.assertEqual(result["extractorVersion"], medial_extractor.API_EXTRACTOR_VERSION)
        self.assertEqual(result["roleDefinitionVersion"], "medial-guide-role-v4")
        for case, (_, _, _, expected_elements) in zip(result["cases"], requested):
            self.assertEqual([element["elementId"] for element in case["elements"]], expected_elements)
            self.assertTrue(all(
                element["face"]["evidence"]["method"].startswith("geometric-role-matcher-v")
                for element in case["elements"]
            ))

    def test_medial_p1_mixed_base_stem_stays_inside_its_medial_beam(self) -> None:
        requested = (
            ("풔", None, 380, 556),
            ("풕", "ㄱ", 370, 437),
        )
        status, result = self.request(
            "POST",
            "/api/reference/v1/medial-guide-candidates",
            {
                "fontId": "noto-sans-kr",
                "cases": [
                    {"character": character, "initialJamo": "ㅍ", "medialJamo": "ㅝ", "finalJamo": final}
                    for character, final, _, _ in requested
                ],
            },
        )

        self.assertEqual(status, 200)
        self.assertEqual(result["extractorVersion"], medial_extractor.API_EXTRACTOR_VERSION)
        for case, (_, _, expected_stem, expected_beam) in zip(result["cases"], requested):
            elements = {element["elementId"]: element for element in case["elements"]}
            stem = elements["baseStem"]
            beam = elements["upperBeam"]
            evidence = stem["face"]["evidence"]
            self.assertEqual(round(stem["face"]["value"]), expected_stem)
            self.assertEqual(round(beam["face"]["value"]), expected_beam)
            self.assertEqual(evidence["attachedBeamElementId"], "upperBeam")
            self.assertGreater(evidence["beamInteriorInset"], evidence["minimumBeamInteriorInset"])
            self.assertEqual(
                evidence["roleStrategy"],
                "below-initial-base-beam-directional-interior-stem",
            )

    def test_medial_p0_accepts_non_g0_initial(self) -> None:
        status, result = self.request(
            "POST",
            "/api/reference/v1/medial-guide-candidates",
            {
                "fontId": "noto-sans-kr",
                "cases": [
                    {"character": "다", "initialJamo": "ㄷ", "medialJamo": "ㅏ", "finalJamo": None},
                    {"character": "돡", "initialJamo": "ㄷ", "medialJamo": "ㅘ", "finalJamo": "ㄱ"},
                ],
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual([case["character"] for case in result["cases"]], ["다", "돡"])
        dwak_lower = next(
            element
            for element in result["cases"][1]["elements"]
            if element["elementId"] == "lowerBeam"
        )
        self.assertEqual(dwak_lower["face"]["status"], "candidate")
        self.assertEqual(dwak_lower["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertEqual(dwak_lower["face"]["evidence"]["referenceSide"], "left")

    def test_medial_p0_accepts_fixed_nanum_gothic_and_composite_glyph(self) -> None:
        status, result = self.request(
            "POST",
            "/api/reference/v1/medial-guide-candidates",
            {
                "fontId": "nanum-gothic",
                "cases": [
                    {"character": "다", "initialJamo": "ㄷ", "medialJamo": "ㅏ", "finalJamo": None},
                    {"character": "돡", "initialJamo": "ㄷ", "medialJamo": "ㅘ", "finalJamo": "ㄱ"},
                ],
            },
        )

        self.assertEqual(status, 200)
        self.assertEqual(result["font"]["id"], "nanum-gothic")
        self.assertEqual(result["font"]["fileSha256"], reference_server.medial_guide_extractor.G4_FONT_SHA256)
        da_elements = result["cases"][0]["elements"]
        self.assertEqual(
            {element["elementId"]: round(element["face"]["value"]) for element in da_elements},
            {"outerPillar": 770, "primaryBeam": 432},
        )
        dwak_lower = next(
            element
            for element in result["cases"][1]["elements"]
            if element["elementId"] == "lowerBeam"
        )
        self.assertEqual(round(dwak_lower["face"]["value"]), 566)
        self.assertEqual(dwak_lower["face"]["evidence"]["referenceMode"], "start-side-local-tangent")

    def test_invalid_input_and_methods_return_json_errors(self) -> None:
        status, error = self.request(
            "POST",
            "/api/reference/v1/outlines",
            {"text": "가" * 13},
        )
        self.assertEqual(status, 400)
        self.assertEqual(error["schema"], "reference-api-error-v1")
        self.assertEqual(error["error"]["code"], "TEXT_TOO_LONG")

        status, error = self.request("PUT", "/api/reference/v1/fonts", {})
        self.assertEqual(status, 405)
        self.assertEqual(error["schema"], "reference-api-error-v1")
        self.assertEqual(error["error"]["code"], "METHOD_NOT_ALLOWED")


class ReferenceFontIntegrityTests(unittest.TestCase):
    def test_catalog_accepts_a_future_font_without_engine_code_changes(self) -> None:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        future_font = dict(catalog["fonts"][0])
        future_font.update(
            {
                "id": "future-reference-font",
                "family": "Future Reference Font",
                "fileName": "FutureReferenceFont.ttf",
            }
        )
        catalog["fonts"].append(future_font)

        with tempfile.TemporaryDirectory() as temporary_directory:
            catalog_path = Path(temporary_directory) / "catalog.json"
            catalog_path.write_text(
                json.dumps(catalog, ensure_ascii=False),
                encoding="utf-8",
            )
            loaded = reference_server.load_catalog(catalog_path)

        self.assertEqual(len(loaded["fonts"]), 7)

    def test_missing_and_hash_mismatch_are_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            font_dir = Path(temporary_directory)
            engine = reference_server.ReferenceEngine(font_dir, CATALOG_PATH)
            try:
                with self.assertRaises(reference_server.APIError) as missing_context:
                    engine.outlines_response(
                        {"text": "가", "fontIds": ["noto-sans-kr"]}
                    )
                self.assertEqual(missing_context.exception.code, "FONT_FILE_MISSING")

                (font_dir / "NotoSansKR.ttf").write_bytes(b"not the catalog font")
                with self.assertRaises(reference_server.APIError) as mismatch_context:
                    engine.outlines_response(
                        {"text": "가", "fontIds": ["noto-sans-kr"]}
                    )
                self.assertEqual(mismatch_context.exception.code, "FONT_HASH_MISMATCH")
            finally:
                engine.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
