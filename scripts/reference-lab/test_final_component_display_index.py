#!/usr/bin/env python3
"""Tests for verified-only final-component display projection."""

from __future__ import annotations

import hashlib
import json
import unittest

import final_component_contract as contract
from build_final_component_display_index import build_index


class FinalComponentDisplayIndexTest(unittest.TestCase):
    def _candidate_bytes(self) -> bytes:
        bounds = {"top": 600.0, "bottom": 820.0, "left": 100.0, "right": 800.0}
        axis_faces = {
            side: {
                "status": "candidate",
                "value": [{
                    "orientation": "vertical" if side in {"left", "right"} else "horizontal",
                    "value": value,
                    "visibleSpans": [{"from": 600.0, "to": 820.0}] if side in {"left", "right"} else [{"from": 100.0, "to": 800.0}],
                }],
            }
            for side, value in bounds.items()
        }
        candidate = {
            "schema": contract.RESPONSE_SCHEMA,
            "lifecycle": contract.CANDIDATE_LIFECYCLE,
            "extractorVersion": contract.EXTRACTOR_VERSION,
            "roleDefinitionVersion": contract.ROLE_DEFINITION_VERSION,
            "medialAnchorExtractorVersion": contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION,
            "font": {"id": "fixture", "fileSha256": "a" * 64, "axes": {}},
            "cases": [{
                "identity": {"character": "각", "pathSha256": "b" * 64},
                "state": "candidate",
                "structureKind": "single",
                "members": [{
                    "id": "only", "jamo": "ㄱ", "role": "only",
                    "boundaryFragments": [{"contourId": 7, "segmentIds": [1, 2]}],
                }],
                "componentGroup": {"value": {"contourIds": [7], "holeContourIds": [], "selectedPathSha256": "c" * 64}},
                "memberRelation": None,
                "inkBounds": {side: {"status": "candidate", "value": value} for side, value in bounds.items()},
                "axisFaces": axis_faces,
                "roleFaces": {side: {"status": "candidate", "value": value} for side, value in bounds.items()},
                "selectionArea": {"status": "candidate", "value": {"x": 100.0, "y": 600.0, "width": 700.0, "height": 220.0}},
            }],
        }
        return json.dumps(candidate, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

    def _verification(self, candidate_bytes: bytes) -> dict:
        candidate = json.loads(candidate_bytes.decode("utf-8"))
        identity_bytes = json.dumps(
            [case["identity"] for case in candidate["cases"]],
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return {
            "schema": contract.VERIFICATION_SCHEMA,
            "state": "verified",
            "candidateArtifactSha256": hashlib.sha256(candidate_bytes).hexdigest(),
            "candidateIdentitySha256": hashlib.sha256(identity_bytes).hexdigest(),
            "review": {"reviewedAt": "2026-09-15T00:00:00+09:00", "reviewedBy": "test"},
        }

    def test_display_projection_keeps_only_verified_display_data(self) -> None:
        candidate_bytes = self._candidate_bytes()
        index = build_index(candidate_bytes, self._verification(candidate_bytes))

        self.assertEqual(index["schema"], "reference-final-component-display-index-v1")
        self.assertEqual(index["verification"]["state"], "verified")
        case = index["cases"][0]
        self.assertEqual(case["members"], [{"id": "only", "jamo": "ㄱ", "role": "only", "contourIds": [7]}])
        self.assertEqual(case["selectionArea"]["value"], {"x": 100.0, "y": 600.0, "width": 700.0, "height": 220.0})
        self.assertNotIn("boundaryFragments", json.dumps(index, ensure_ascii=False))
        self.assertNotIn("evidence", json.dumps(index, ensure_ascii=False))

    def test_projection_rejects_unverified_or_mismatched_artifact(self) -> None:
        candidate_bytes = self._candidate_bytes()
        verification = self._verification(candidate_bytes)
        verification["candidateArtifactSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "candidate SHA"):
            build_index(candidate_bytes, verification)

        rejected = self._verification(candidate_bytes)
        rejected["state"] = "rejected"
        with self.assertRaisesRegex(ValueError, "승인"):
            build_index(candidate_bytes, rejected)


if __name__ == "__main__":
    unittest.main()
