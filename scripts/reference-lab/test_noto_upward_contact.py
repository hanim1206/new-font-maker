"""확장 받침의 바탕 줄기와 수직 층 분리 회귀. 글자별 좌표 예외는 사용하지 않는다."""

from pathlib import Path
from types import SimpleNamespace
import unittest

import final_component_extractor as final
import medial_guide_extractor as medial
import noto_guide_corpus as corpus


FONT = Path(__file__).resolve().parents[2] / ".reference-fonts/NotoSansKR.ttf"
CONFLICT_CHARACTERS = "똫솗솙솣솥솧옻좋팍퐇홃홊홑홓홖홗홙홚활홟홠홦홨홪홫홬홭홯"


def stem(x=400.0, start=300.0, end=500.0, contour_id=1):
    span = medial.Span(start, end)
    return medial.FaceHypothesis(contour_id, (0,), "vertical", "right", x,
                                 (span,), (span,), end - start, start, end, (start + end) / 2, 1.0)


def beam():
    feature = medial.ContourFeatures(0, (50.0, 500.0, 850.0, 570.0), 800, 70, 450, 535, 1, 1, 1)
    return feature, [[(50.0, 500.0), (850.0, 500.0), (850.0, 570.0), (50.0, 570.0)]]


class UpwardContactTests(unittest.TestCase):
    def test_stem_reaches_actual_upper_shoulder(self):
        feature, polygons = beam()
        self.assertTrue(medial._upward_stem_contacts_beam(stem(), feature, polygons))
        self.assertTrue(medial._upward_stem_contacts_beam(stem(start=450), feature, polygons))

    def test_detached_downward_and_beam_cap_are_not_stems(self):
        feature, polygons = beam()
        for value in (stem(end=490), stem(start=580, end=650), stem(x=850), stem(x=50)):
            self.assertFalse(medial._upward_stem_contacts_beam(value, feature, polygons))

    def test_same_contour_id_does_not_prove_contact(self):
        feature, polygons = beam()
        self.assertFalse(medial._upward_stem_contacts_beam(stem(end=490, contour_id=0), feature, polygons))

    def test_bbox_with_recess_does_not_prove_contact(self):
        feature, _ = beam()
        recess = [[(50, 500), (390, 500), (390, 540), (420, 540), (420, 500), (850, 500), (850, 570), (50, 570)]]
        self.assertFalse(medial._upward_stem_contacts_beam(stem(), feature, recess))


class VerticalPartitionTests(unittest.TestCase):
    @staticmethod
    def record(left, top, right, bottom):
        return SimpleNamespace(bounds=(left, top, right, bottom), center_y=(top + bottom) / 2,
                               polygon=[(left, top), (right, top), (right, bottom), (left, bottom)])

    def test_bottom_bar_stays_with_overlapping_initial_stems(self):
        records = {index: self.record(0, top, 100, bottom) for index, (top, bottom) in enumerate(
            [(126, 195), (453, 547), (175, 494), (175, 494), (647, 958)])}
        self.assertEqual(final._contact_linked_vertical_clusters(list(records), records), ({0, 1, 2, 3}, {4}))

    def test_no_separator_or_tied_layers_abstain(self):
        connected = {0: self.record(0, 0, 100, 100), 1: self.record(0, 80, 100, 180)}
        tied = {0: self.record(0, 100, 100, 300), 1: self.record(200, 100, 300, 300)}
        for records in (connected, tied):
            self.assertIsNone(final._contact_linked_vertical_clusters(list(records), records))

    def test_order_and_ids_do_not_decide_layer(self):
        records = {40: self.record(0, 100, 100, 300), 3: self.record(0, 500, 100, 800)}
        self.assertEqual(final._contact_linked_vertical_clusters([3, 40], records), ({40}, {3}))

    def test_y_overlap_without_ink_contact_does_not_merge_jamos(self):
        records = {0: self.record(0, 100, 100, 550), 1: self.record(200, 530, 300, 650),
                   2: self.record(200, 620, 400, 900)}
        self.assertEqual(final._contact_linked_vertical_clusters(list(records), records), ({0}, {1, 2}))

    def test_final_cap_and_bar_stay_with_final_ring(self):
        records = {0: self.record(0, 100, 100, 550), 1: self.record(0, 100, 200, 170),
                   2: self.record(400, 490, 480, 630), 3: self.record(250, 590, 650, 660),
                   4: self.record(260, 700, 640, 950)}
        self.assertEqual(final._contact_linked_vertical_clusters(list(records), records), ({0, 1}, {2, 3, 4}))


@unittest.skipUnless(FONT.is_file(), "Noto reference font is unavailable")
class NotoExpandedFinalRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.font = medial.load_font(FONT)

    @classmethod
    def tearDownClass(cls):
        cls.font.close()

    def test_all_28_reported_conflicts_have_complete_disjoint_medial_and_final(self):
        self.assertEqual(len(CONFLICT_CHARACTERS), 28)
        for character in CONFLICT_CHARACTERS:
            with self.subTest(character=character):
                identity = corpus.case_for(ord(character))
                observation = medial.extract_medial_character(self.font, character, identity["medialJamo"], identity["finalJamo"])
                payload = corpus.medial_payload(observation, identity["medialJamo"])
                self.assertEqual(payload["status"], "candidate")
                medial_ids = {element["face"]["evidence"]["contourId"] for element in observation["elements"]}
                result = final.extract_final_character(self.font, medial.G0_FONT_SHA256, {"wght": 400.0},
                    character, identity["initialJamo"], identity["medialJamo"], identity["finalJamo"], identity["contextId"],
                    medial_observation=observation)
                self.assertEqual(result["state"], "candidate")
                final_ids = set(result["componentGroup"]["value"]["contourIds"])
                self.assertFalse(final_ids & medial_ids)
                self.assertEqual(result["componentGroup"]["evidence"]["verticalPartitionVersion"], final.VERTICAL_PARTITION_VERSION)
                if character == "팍":
                    initial = corpus.initial.extract_initial_character(self.font,
                        character, identity["initialJamo"], identity["medialJamo"], identity["finalJamo"], identity["contextId"],
                        medial_observation=observation)
                    self.assertFalse(final_ids & set(initial["componentGroup"]["value"]["contourIds"]))


if __name__ == "__main__":
    unittest.main()
