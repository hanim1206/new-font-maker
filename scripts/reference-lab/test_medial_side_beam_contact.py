#!/usr/bin/env python3
"""기둥 접합을 증명하지 못하는 옆 보 후보의 역할 오염 회귀."""

import unittest

import medial_guide_extractor as medial


def face(contour_id, position, start, end, orientation="horizontal"):
    spans = (medial.Span(start, end),)
    return medial.FaceHypothesis(
        contour_id, (0,), orientation, "top" if orientation == "horizontal" else "right",
        position, spans, spans, end - start, start, end, (start + end) / 2, 1.0,
    )


class SideBeamContactTests(unittest.TestCase):
    pillar = face(4, 680, 70, 920, "vertical")
    polygon = [(610, 70), (680, 70), (680, 920), (610, 920), (610, 70)]

    def options(self, beams, medial_jamo="ㅖ", polygon=None):
        return medial._p1_attached_beam_options(
            beams, self.pillar, medial_jamo,
            pillar_polygons=[self.polygon if polygon is None else polygon],
        )

    def test_left_beam_pair_excludes_detached_initial_top_regardless_of_order(self):
        detached = face(2, 150, 320, 535)
        upper = face(5, 275, 495, 650)
        lower = face(7, 520, 497, 648)
        for beams in ((detached, upper, lower), (lower, upper, detached)):
            with self.subTest(order=[beam.contour_id for beam in beams]):
                self.assertEqual({item.contour_id for _, item in self.options(beams)}, {5, 7})

    def test_contact_uses_actual_pillar_width_not_fixed_distance(self):
        for left in (560, 610, 650):
            polygon = [(left, 70), (680, 70), (680, 920), (left, 920), (left, 70)]
            touching = face(10, 300, left - 100, left)
            detached = face(11, 500, left - 101, left - 1)
            with self.subTest(pillar_left=left):
                self.assertEqual([item.contour_id for _, item in self.options([touching, detached], polygon=polygon)], [10])

    def test_right_beams_must_reach_the_pillar_and_point_right(self):
        attached = face(10, 300, 660, 830)
        detached = face(11, 500, 700, 850)
        wrong_direction = face(12, 400, 500, 650)
        self.assertEqual([item.contour_id for _, item in self.options([attached, detached, wrong_direction], "ㅒ")], [10])

    def test_merged_contour_supports_real_join_but_not_same_id_shortcut(self):
        polygon = [(610, 70), (680, 70), (680, 920), (610, 920),
                   (610, 580), (490, 580), (490, 520), (610, 520),
                   (610, 340), (490, 340), (490, 275), (610, 275), (610, 70)]
        upper = face(4, 275, 490, 610)
        lower = face(4, 520, 490, 610)
        detached = face(4, 150, 320, 535)
        self.assertEqual({item.position for _, item in self.options([upper, lower, detached], polygon=polygon)}, {275, 520})

    def test_empty_or_wrong_height_pillar_cannot_prove_contact(self):
        beam = face(5, 300, 490, 650)
        self.assertEqual(self.options([beam], polygon=[]), [])
        above = [(610, 70), (680, 70), (680, 250), (610, 250), (610, 70)]
        self.assertEqual(self.options([beam], polygon=above), [])

    def test_pillar_bbox_is_not_contact_across_a_recess(self):
        polygon = [(610, 70), (680, 70), (680, 920), (610, 920),
                   (610, 580), (665, 580), (665, 270), (610, 270), (610, 70)]
        detached = face(5, 300, 490, 650)
        self.assertEqual(self.options([detached], polygon=polygon), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
