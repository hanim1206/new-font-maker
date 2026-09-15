import unittest

import measure_role_extents as extents


def _rect(x0: float, y0: float, x1: float, y1: float, slant: float = 0.0):
    """폰트 단위(y 위) 사각형. slant는 윗변 오른끝을 올려 기울인다."""
    return [
        {"operation": "moveTo", "arguments": [[x0, y0]]},
        {"operation": "lineTo", "arguments": [[x0, y1]]},
        {"operation": "lineTo", "arguments": [[x1, y1 + slant]]},
        {"operation": "lineTo", "arguments": [[x1, y0]]},
        {"operation": "closePath", "arguments": []},
    ]


class ContourExtentTest(unittest.TestCase):
    def test_slanted_beam_extent_covers_whole_bar(self) -> None:
        # contour 0 = 세로 줄기, contour 1 = 윗변이 기울어진 가로 보(x 40~610).
        operations = _rect(300, 200, 380, 500) + _rect(40, 120, 610, 190, slant=27)
        outline_payload = {"observation": {"unitsPerEm": 1000, "operations": operations}}
        medial_payload = {"observation": {"elements": [
            {"elementId": "baseStem", "face": {"evidence": {"contourId": 0}}},
            {"elementId": "lowerBeam", "face": {"evidence": {"contourId": 1}}},
        ]}}
        row = {"stages": {"medial": {"status": "candidate", "measurements": {
            "baseStem": {"orientation": "vertical", "visibleSpans": [{"from": 0.38, "to": 0.68}]},
            # 추출기가 기울어진 윗변에서 스텁만 봤다고 가정.
            "lowerBeam": {"orientation": "horizontal", "visibleSpans": [{"from": 0.04, "to": 0.065}]},
        }}}}
        result = extents.measure_character(row, outline_payload, medial_payload)
        self.assertEqual(result["baseStem"]["from"], 380.0)  # 화면 y = 880 − 500
        self.assertEqual(result["baseStem"]["to"], 680.0)
        self.assertEqual(result["lowerBeam"]["from"], 40.0)
        self.assertEqual(result["lowerBeam"]["to"], 610.0)
        self.assertLess(result["lowerBeam"]["visibleCoverage"], 0.1)
        self.assertGreater(result["baseStem"]["visibleCoverage"], 0.99)

    def test_missing_contour_evidence_is_reported(self) -> None:
        outline_payload = {"observation": {"unitsPerEm": 1000, "operations": _rect(0, 0, 10, 10)}}
        row = {"stages": {"medial": {"status": "candidate", "measurements": {
            "outerPillar": {"orientation": "vertical", "visibleSpans": [{"from": 0, "to": 0.01}]},
        }}}}
        result = extents.measure_character(row, outline_payload, {"observation": {"elements": []}})
        self.assertEqual(result["outerPillar"]["reasonCode"], "contour-evidence-missing")


if __name__ == "__main__":
    unittest.main()
