"""후보 수와 구조 검사·승인을 구분하고 손상된 관측 연결을 거부한다."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

import audit_noto_guide_corpus as audit


def rectangle(left, top, right, bottom):
    points = [(left, top), (right, top), (right, bottom), (left, bottom)]
    return [{"operation": "moveTo" if index == 0 else "lineTo", "arguments": [[x * 1000, 880 - y * 1000]]}
            for index, (x, y) in enumerate(points)] + [{"operation": "closePath", "arguments": []}]


def component(ids, bounds):
    faces = {side: {"status": "candidate", "value": value * 1000} for side, value in bounds.items()}
    area = {"x": bounds["left"], "y": bounds["top"], "width": bounds["right"] - bounds["left"], "height": bounds["bottom"] - bounds["top"]}
    return {"status": "candidate", "reasonCodes": [], "measurements": {"roleFaces": bounds, "selectionArea": area},
            "observation": {"componentGroup": {"status": "candidate", "value": {"contourIds": ids, "holeContourIds": []}},
                            "inkBounds": deepcopy(faces), "roleFaces": faces,
                            "selectionArea": {"status": "candidate", "value": {key: value * 1000 for key, value in area.items()}}}}


def fixture():
    identity = audit.corpus.case_for(ord("가"))
    outline = {"coordinateFrame": "font-units-y-up", "unitsPerEm": 1000,
               "fontToGlyphNormalized": [0.001, 0, 0, -0.001, 0, 0.88], "contourCount": 3, "glyphName": "uniAC00",
               "operations": rectangle(0.1, 0.1, 0.4, 0.6) + rectangle(0.7, 0.1, 0.8, 0.9) + rectangle(0.8, 0.4, 0.95, 0.5)}
    elements, measurements = [], {}
    for role, orientation, side, face, spans, contour in [
        ("outerPillar", "vertical", "right", 0.8, [(0.1, 0.4), (0.5, 0.9)], 1),
        ("primaryBeam", "horizontal", "top", 0.4, [(0.8, 0.95)], 2),
    ]:
        elements.append({"elementId": role, "orientation": orientation, "faceSide": side,
                         "face": {"status": "candidate", "value": face * 1000, "evidence": {"contourId": contour}},
                         "visibleSpans": {"status": "candidate", "value": [{"from": start * 1000, "to": end * 1000} for start, end in spans]}})
        measurements[role] = {"orientation": orientation, "faceSide": side, "face": face,
                              "visibleSpans": [{"from": start, "to": end} for start, end in spans],
                              "visibleLength": sum(end - start for start, end in spans)}
    return identity, {
        "outline": {"status": "candidate", "reasonCodes": [], "observation": outline,
                    "measurements": {"inkBounds": {"left": 0.1, "right": 0.95, "top": 0.1, "bottom": 0.9}}},
        "initial": component([0], {"left": 0.1, "right": 0.4, "top": 0.1, "bottom": 0.6}),
        "medial": {"status": "candidate", "reasonCodes": [], "requiredRoleIds": list(measurements),
                   "measurements": measurements, "observation": {"character": "가", "elements": elements}},
        "final": {"status": "not-applicable", "reasonCodes": ["no-final"], "measurements": {}, "observation": None},
    }


class RoleIntegrityTests(unittest.TestCase):
    def test_complete_case_passes_without_mutating_inputs(self):
        identity, payloads = fixture()
        before = deepcopy(payloads)
        result = audit.audit_case(identity, payloads)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["contourOwnership"], {"initial": [0], "medial": [1, 2]})
        self.assertEqual(payloads, before)
        self.assertNotIn("approved", result)

    def test_unassigned_contour_fails(self):
        identity, payloads = fixture()
        raw = payloads["outline"]["observation"]
        raw["operations"] += rectangle(0.2, 0.2, 0.3, 0.3)
        raw["contourCount"] += 1
        self.assertIn("joint:unassigned-contours", audit.audit_case(identity, payloads)["issues"])

    def test_shared_contour_fails(self):
        identity, payloads = fixture()
        payloads["initial"] = component([0, 1], {"left": 0.1, "right": 0.8, "top": 0.1, "bottom": 0.9})
        self.assertIn("joint:contour-overlap:initial:medial", audit.audit_case(identity, payloads)["issues"])

    def test_incomplete_stage_blocks_joint_pass(self):
        identity, payloads = fixture()
        payloads["medial"]["status"] = "partial"
        payloads["medial"]["reasonCodes"] = ["ambiguous-role-match"]
        result = audit.audit_case(identity, payloads)
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["checks"]["initial"], "passed")
        self.assertEqual(result["blockedStages"][0]["reasonCodes"], ["ambiguous-role-match"])

    def test_wrong_role_and_measurement_fail(self):
        for mutation in ("orientation", "face", "visibleLength"):
            with self.subTest(mutation=mutation):
                identity, payloads = fixture()
                measured = payloads["medial"]["measurements"]["primaryBeam"]
                measured[mutation] = "vertical" if mutation == "orientation" else 1.5
                self.assertEqual(audit.audit_case(identity, payloads)["status"], "failed")

    def test_visible_spans_must_stay_on_source_bounds(self):
        identity, payloads = fixture()
        element = payloads["medial"]["observation"]["elements"][1]
        element["visibleSpans"]["value"][0]["to"] = 990
        measured = payloads["medial"]["measurements"]["primaryBeam"]
        measured["visibleSpans"][0]["to"] = 0.99
        measured["visibleLength"] = 0.19
        self.assertIn("medial:visible-span-outside-source", audit.audit_case(identity, payloads)["issues"])

    def test_nonfinite_outline_fails(self):
        identity, payloads = fixture()
        payloads["outline"]["observation"]["operations"][0]["arguments"][0][0] = float("nan")
        self.assertEqual(audit.audit_case(identity, payloads)["status"], "failed")

    def test_component_area_and_identity_mismatch_fail(self):
        identity, payloads = fixture()
        payloads["initial"]["measurements"]["selectionArea"]["width"] += 0.01
        self.assertIn("initial:selection-area-mismatch", audit.audit_case(identity, payloads)["issues"])
        payloads["medial"]["observation"]["character"] = "너"
        self.assertIn("medial:observation-identity-mismatch", audit.audit_case(identity, payloads)["issues"])

    def test_curve_bounds_are_not_control_point_bounds(self):
        _, payloads = fixture()
        raw = payloads["outline"]["observation"]
        raw["contourCount"] = 1
        raw["operations"] = [
            {"operation": "moveTo", "arguments": [[0, 0]]},
            {"operation": "qCurveTo", "arguments": [[100, 100], [200, 0]]},
            {"operation": "closePath", "arguments": []},
        ]
        self.assertAlmostEqual(audit.outline_contours(raw)[0]["bounds"]["top"], 0.83)

    def test_final_members_follow_contract_and_exhaust_contours(self):
        identity, payloads = fixture()
        identity = audit.corpus.case_for(ord("각"))
        payloads["medial"]["observation"]["character"] = "각"
        raw = payloads["outline"]["observation"]
        raw["operations"] += rectangle(0.1, 0.7, 0.4, 0.9)
        raw["contourCount"] += 1
        payloads["final"] = component([3], {"left": 0.1, "right": 0.4, "top": 0.7, "bottom": 0.9})
        observation = payloads["final"]["observation"]
        observation.update({"structureKind": "single", "members": [{"id": "only", "jamo": "ㄱ", "role": "only",
            "boundaryFragments": [{"contourId": 3, "segmentIds": [0], "ranges": [{"segmentId": 0, "from": 0, "to": 1}]}]}]})
        self.assertEqual(audit.audit_case(identity, payloads)["status"], "passed")
        observation["members"][0]["jamo"] = "ㄴ"
        self.assertIn("final:final-member-contract-mismatch", audit.audit_case(identity, payloads)["issues"])


class CacheIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        identity, payloads = fixture()
        self.key = "a" * 64
        self.manifest = {"stageKeys": {"initial": self.key}}
        self.payload = payloads["initial"]
        self.sha = audit.corpus.digest(self.payload)
        self.relative = "cache/initial/{}/AC00.json".format(self.key)
        self.row = {"identity": identity, "stages": {"initial": {"artifact": self.relative, "payloadSha256": self.sha,
            **{field: deepcopy(self.payload[field]) for field in ("status", "reasonCodes", "measurements")}}}}
        self.record = {"schema": audit.corpus.CACHE_SCHEMA, "stage": "initial", "stageKey": self.key,
                       "identity": identity, "payload": self.payload, "payloadSha256": self.sha}
        self.path = self.root / self.relative
        self.path.parent.mkdir(parents=True)
        self.write_record()

    def write_record(self):
        self.path.write_text(json.dumps(self.record), encoding="utf-8")

    def test_matching_cache_passes(self):
        self.assertEqual(audit.read_stage(self.root, self.manifest, self.row, "initial"), self.payload)

    def test_payload_tamper_fails(self):
        self.record["payload"]["measurements"]["roleFaces"]["left"] = 0.2
        self.write_record()
        with self.assertRaisesRegex(audit.AuditError, "hash-mismatch"):
            audit.read_stage(self.root, self.manifest, self.row, "initial")

    def test_stale_cache_and_report_measurement_fail(self):
        self.record["stageKey"] = "b" * 64
        self.write_record()
        with self.assertRaisesRegex(audit.AuditError, "version-mismatch"):
            audit.read_stage(self.root, self.manifest, self.row, "initial")
        self.record["stageKey"] = self.key
        self.write_record()
        self.row["stages"]["initial"]["status"] = "approved"
        with self.assertRaisesRegex(audit.AuditError, "report-payload-mismatch"):
            audit.read_stage(self.root, self.manifest, self.row, "initial")

    def test_foreign_path_and_symlink_fail(self):
        self.row["stages"]["initial"]["artifact"] = "../outside.json"
        with self.assertRaisesRegex(audit.AuditError, "path-mismatch"):
            audit.read_stage(self.root, self.manifest, self.row, "initial")
        self.row["stages"]["initial"]["artifact"] = self.relative
        self.path.unlink()
        self.path.symlink_to(self.root.parent / "outside.json")
        with self.assertRaisesRegex(audit.AuditError, "outside-root"):
            audit.read_stage(self.root, self.manifest, self.row, "initial")


if __name__ == "__main__":
    unittest.main()
