#!/usr/bin/env python3
"""Evaluate remaining-medial P1 anchor and full scopes on fixed fonts.

Outputs remain external-font diagnostics. They never become production values.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import evaluate_medial_g2 as shared
import medial_guide_extractor as extractor


P1_MEDIAL_JAMOS: Tuple[str, ...] = (
    "ㅐ", "ㅑ", "ㅒ", "ㅔ", "ㅕ", "ㅖ", "ㅙ", "ㅚ", "ㅛ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅢ",
)
MEDIAL_INDEX = {
    medial: index
    for index, medial in enumerate((
        "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ",
        "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
    ))
}
FINAL_CASES: Tuple[Tuple[Optional[str], int], ...] = ((None, 0), ("ㄱ", 1))
STRUCTURE_FAMILIES: Dict[str, Tuple[str, ...]] = {
    "vertical-double-pillar-single-beam": ("ㅐ", "ㅔ"),
    "vertical-single-pillar-double-beam": ("ㅑ", "ㅕ"),
    "vertical-double-pillar-double-beam": ("ㅒ", "ㅖ"),
    "horizontal-twin-stem": ("ㅛ", "ㅠ"),
    "mixed-double-pillar": ("ㅙ", "ㅞ"),
    "mixed-base-pillar": ("ㅚ", "ㅝ", "ㅟ"),
    "mixed-no-stem": ("ㅢ",),
}
FIXED_FONTS = {
    extractor.G0_FONT_SHA256: extractor.G0_FONT_ID,
    extractor.G4_FONT_SHA256: extractor.G4_FONT_ID,
}
LOCAL_TANGENT_ROLES = {
    "ㅙ": "lowerBeam",
    "ㅚ": "primaryBeam",
    "ㅝ": "upperBeam",
    "ㅞ": "upperBeam",
    "ㅟ": "primaryBeam",
    "ㅢ": "primaryBeam",
}


def compose(initial_jamo: str, medial_jamo: str, final_index: int) -> str:
    return chr(
        0xAC00
        + shared.INITIAL_JAMOS.index(initial_jamo) * 588
        + MEDIAL_INDEX[medial_jamo] * 28
        + final_index
    )


def evaluation_cases(scope: str) -> List[Dict[str, Optional[str]]]:
    initials = ("ㄱ",) if scope == "anchor" else shared.INITIAL_JAMOS
    return [
        {
            "character": compose(initial_jamo, medial_jamo, final_index),
            "initialJamo": initial_jamo,
            "medialJamo": medial_jamo,
            "finalJamo": final_jamo,
        }
        for initial_jamo in initials
        for medial_jamo in P1_MEDIAL_JAMOS
        for final_jamo, final_index in FINAL_CASES
    ]


def _composite_metadata(font, glyph_name: str) -> Dict[str, Any]:
    if "glyf" not in font:
        return {"isComposite": False, "componentCount": 0}
    glyph = font["glyf"][glyph_name]
    is_composite = glyph.isComposite()
    return {
        "isComposite": is_composite,
        "componentCount": len(glyph.components) if is_composite else 0,
    }


def _candidate_rate(cases: List[Dict[str, Any]], medials: Tuple[str, ...]) -> Dict[str, Any]:
    elements = [
        element
        for case in cases
        if case["status"] == "candidate" and case["medialJamo"] in medials
        for element in case["elements"]
    ]
    usable_count = sum(shared.usable(element) for element in elements)
    return {
        "elementCount": len(elements),
        "usableCandidateCount": usable_count,
        "candidateRate": round(usable_count / len(elements), 4) if elements else 0.0,
    }


def _structural_invariant_violations(cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    comparisons = (
        ("innerPillar", "outerPillar", "x-order"),
        ("upperBeam", "lowerBeam", "y-order"),
        ("leftStem", "rightStem", "x-order"),
    )
    violations: List[Dict[str, Any]] = []
    for case in cases:
        candidates = {
            element["elementId"]: element
            for element in case["elements"]
            if shared.usable(element)
        }
        for first_id, second_id, invariant in comparisons:
            if first_id not in candidates or second_id not in candidates:
                continue
            first = float(candidates[first_id]["face"]["value"])
            second = float(candidates[second_id]["face"]["value"])
            if first >= second:
                violations.append({
                    "character": case["character"],
                    "medialJamo": case["medialJamo"],
                    "invariant": invariant,
                    "first": {"elementId": first_id, "value": first},
                    "second": {"elementId": second_id, "value": second},
                })
    return violations


def _unexpected_local_tangents(cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "character": case["character"],
            "medialJamo": case["medialJamo"],
            "elementId": element["elementId"],
        }
        for case in cases
        for element in case["elements"]
        if element["face"]["evidence"].get("referenceMode") == "start-side-local-tangent"
        and LOCAL_TANGENT_ROLES.get(case["medialJamo"]) != element["elementId"]
    ]


def _directional_twin_structure_violations(cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    expected_ids = {"leftStem", "rightStem", "primaryBeam"}
    violations: List[Dict[str, Any]] = []
    for case in cases:
        medial_jamo = str(case["medialJamo"])
        if medial_jamo not in {"ㅛ", "ㅠ"}:
            continue
        elements = {element["elementId"]: element for element in case["elements"]}
        usable_ids = {element_id for element_id, element in elements.items() if shared.usable(element)}
        if usable_ids and usable_ids != expected_ids:
            violations.append({
                "character": case["character"],
                "medialJamo": medial_jamo,
                "reason": "partial-twin-structure",
                "usableElementIds": sorted(usable_ids),
            })
            continue
        if usable_ids != expected_ids:
            continue
        beam = elements["primaryBeam"]
        beam_spans = beam.get("componentSpans", [])
        beam_start = min(float(span["from"]) for span in beam_spans)
        beam_end = max(float(span["to"]) for span in beam_spans)
        beam_value = float(beam["face"]["value"])
        stem_values = []
        invalid_attachment = False
        for stem_id in ("leftStem", "rightStem"):
            stem = elements[stem_id]
            stem_values.append(float(stem["face"]["value"]))
            stem_spans = stem.get("componentSpans", [])
            stem_start = min(float(span["from"]) for span in stem_spans)
            stem_end = max(float(span["to"]) for span in stem_spans)
            attachment = stem_end if medial_jamo == "ㅛ" else stem_start
            directional_reach = beam_value - stem_start if medial_jamo == "ㅛ" else stem_end - beam_value
            if (
                abs(attachment - beam_value) > (100.0 if medial_jamo == "ㅛ" else 140.0)
                or not beam_start - 20.0 <= float(stem["face"]["value"]) <= beam_end + 20.0
                or directional_reach < extractor.MIN_TWIN_STEM_DIRECTIONAL_REACH
            ):
                invalid_attachment = True
        if invalid_attachment or stem_values[1] - stem_values[0] < 100.0:
            violations.append({
                "character": case["character"],
                "medialJamo": medial_jamo,
                "reason": "invalid-directional-attachment",
            })
    return violations


def _component_bounds(element: Dict[str, Any]) -> Tuple[float, float]:
    spans = element.get("componentSpans", [])
    return (
        min(float(span["from"]) for span in spans),
        max(float(span["to"]) for span in spans),
    )


def _scan_plan_violations(cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Verify layout scan order with role topology, not glyph/codepoint exceptions."""
    right_facing = {
        "ㅐ": ("primaryBeam",),
        "ㅑ": ("upperBeam", "lowerBeam"),
        "ㅒ": ("upperBeam", "lowerBeam"),
        "ㅙ": ("upperBeam",),
    }
    left_facing = {
        "ㅔ": ("primaryBeam",),
        "ㅕ": ("upperBeam", "lowerBeam"),
        "ㅖ": ("upperBeam", "lowerBeam"),
        "ㅝ": ("lowerBeam",),
        "ㅞ": ("lowerBeam",),
    }
    base_beam_roles = {
        "ㅙ": "lowerBeam",
        "ㅚ": "primaryBeam",
        "ㅝ": "upperBeam",
        "ㅞ": "upperBeam",
        "ㅟ": "primaryBeam",
        "ㅢ": "primaryBeam",
    }
    violations: List[Dict[str, Any]] = []
    for case in cases:
        medial_jamo = str(case["medialJamo"])
        elements = {
            element["elementId"]: element
            for element in case["elements"]
            if shared.usable(element)
        }
        arm_roles = right_facing.get(medial_jamo) or left_facing.get(medial_jamo) or ()
        if arm_roles:
            anchor_id = "innerPillar" if "innerPillar" in elements else "outerPillar"
            anchor = elements.get(anchor_id)
            if anchor is not None:
                anchor_x = float(anchor["face"]["value"])
                for role_id in arm_roles:
                    beam = elements.get(role_id)
                    if beam is None:
                        continue
                    beam_start, beam_end = _component_bounds(beam)
                    invalid = (
                        beam_end <= anchor_x + 30.0
                        if medial_jamo in right_facing
                        else beam_start >= anchor_x - 30.0
                    )
                    if invalid:
                        violations.append({
                            "character": case["character"],
                            "medialJamo": medial_jamo,
                            "reason": "side-beam-direction",
                            "elementId": role_id,
                        })

        base_role = base_beam_roles.get(medial_jamo)
        if base_role is None or base_role not in elements:
            continue
        base_beam = elements[base_role]
        evidence = base_beam["face"]["evidence"]
        if (
            evidence.get("referenceMode") != "start-side-local-tangent"
            or evidence.get("scanOrigin") != "below-initial-left-edge"
        ):
            violations.append({
                "character": case["character"],
                "medialJamo": medial_jamo,
                "reason": "mixed-base-scan-origin",
                "elementId": base_role,
            })
        if medial_jamo == "ㅢ" or "baseStem" not in elements:
            continue
        stem_evidence = elements["baseStem"]["face"]["evidence"]
        interior_inset = stem_evidence.get("beamInteriorInset")
        minimum_interior_inset = stem_evidence.get("minimumBeamInteriorInset")
        invalid_interior_attachment = (
            stem_evidence.get("attachedBeamElementId") != base_role
            or not isinstance(interior_inset, (int, float))
            or not isinstance(minimum_interior_inset, (int, float))
            or not math.isfinite(float(interior_inset))
            or not math.isfinite(float(minimum_interior_inset))
            or float(interior_inset) < float(minimum_interior_inset)
        )
        if invalid_interior_attachment:
            violations.append({
                "character": case["character"],
                "medialJamo": medial_jamo,
                "reason": "mixed-base-stem-not-inside-beam",
                "elementId": "baseStem",
            })
        beam_y = float(base_beam["face"]["value"])
        stem_start, stem_end = _component_bounds(elements["baseStem"])
        if medial_jamo in {"ㅙ", "ㅚ"}:
            invalid_attachment = not (
                stem_start < beam_y
                and abs(stem_end - beam_y) <= 150.0
            )
        else:
            invalid_attachment = not (
                stem_start >= beam_y - 40.0
                and stem_end > beam_y
                and abs(stem_start - beam_y) <= 150.0
            )
        if invalid_attachment:
            violations.append({
                "character": case["character"],
                "medialJamo": medial_jamo,
                "reason": "mixed-base-stem-directional-attachment",
                "elementId": "baseStem",
            })
    return violations


def _contact_sheet_subset(report: Dict[str, Any], medial_jamo: str) -> Dict[str, Any]:
    cases = [case for case in report["cases"] if case["medialJamo"] == medial_jamo]
    elements = [element for case in cases for element in case["elements"]]
    candidate_rate = round(sum(shared.usable(element) for element in elements) / len(elements), 4)
    return {
        **report,
        "summary": {
            **report["summary"],
            "caseCount": len(cases),
            "elementCount": len(elements),
            "usableCandidateCount": sum(shared.usable(element) for element in elements),
            "simpleCandidateRate": candidate_rate,
            "mixedCandidateRate": candidate_rate,
        },
        "cases": cases,
    }


def write_medial_contact_sheets(font_path: Path, report: Dict[str, Any], output_directory: Path) -> None:
    output_directory.mkdir(parents=True, exist_ok=True)
    for medial_jamo in P1_MEDIAL_JAMOS:
        index = MEDIAL_INDEX[medial_jamo]
        heading = "{} P1 G2 {} 전체 첫닿자".format(report["font"]["id"], medial_jamo)
        output_path = output_directory / "{:02d}-{}.html".format(index, medial_jamo)
        output_path.write_text(
            shared.contact_sheet_html(
                font_path,
                _contact_sheet_subset(report, medial_jamo),
                heading,
            ),
            encoding="utf-8",
        )


def evaluate(font_path: Path, scope: str) -> Dict[str, Any]:
    actual_hash = extractor._sha256(font_path)  # pylint: disable=protected-access
    font_id = FIXED_FONTS.get(actual_hash)
    if font_id is None:
        raise ValueError("P1은 고정 Noto Sans KR·나눔고딕 SHA에서만 평가합니다.")
    font = extractor.load_font(font_path)
    try:
        cmap = font.getBestCmap() or {}
        cases: List[Dict[str, Any]] = []
        for case in evaluation_cases(scope):
            character = str(case["character"])
            glyph_name = cmap.get(ord(character))
            if glyph_name is None:
                cases.append({**case, "status": "glyph-missing"})
                continue
            result = extractor.extract_medial_character(
                font,
                character,
                str(case["medialJamo"]),
                case["finalJamo"],
            )
            cases.append({
                **case,
                "status": "candidate",
                "glyphName": result["glyphName"],
                "glyphStructure": _composite_metadata(font, result["glyphName"]),
                "elements": result["elements"],
            })
    finally:
        font.close()

    candidate_cases = [case for case in cases if case["status"] == "candidate"]
    elements = [element for case in candidate_cases for element in case["elements"]]
    reason_codes: Dict[str, int] = {}
    matching_units: Dict[str, int] = {}
    for element in elements:
        if shared.usable(element):
            unit = element["face"]["evidence"].get("matchingUnit", "unknown")
            matching_units[unit] = matching_units.get(unit, 0) + 1
            continue
        component = element["face"] if element["face"]["status"] == "abstained" else element["visibleSpans"]
        reason = component["reasonCode"]
        reason_codes[reason] = reason_codes.get(reason, 0) + 1
    role_contract_violations = [
        {
            "character": case["character"],
            "expected": [role.element_id for role in extractor.MEDIAL_ROLE_SPECS[str(case["medialJamo"])]],
            "actual": [element["elementId"] for element in case["elements"]],
        }
        for case in candidate_cases
        if [element["elementId"] for element in case["elements"]]
        != [role.element_id for role in extractor.MEDIAL_ROLE_SPECS[str(case["medialJamo"])] ]
    ]
    invalid_numbers = [value for value in shared.finite_numbers(cases) if not math.isfinite(value)]
    missing_evidence = [
        {"character": case["character"], "elementId": element["elementId"]}
        for case in candidate_cases
        for element in case["elements"]
        if not element["face"].get("evidence") or not element["visibleSpans"].get("evidence")
    ]
    simple_medials = tuple(medial for medial in P1_MEDIAL_JAMOS if medial not in {"ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"})
    mixed_medials = tuple(medial for medial in P1_MEDIAL_JAMOS if medial not in simple_medials)
    composite_cases = [case for case in candidate_cases if case["glyphStructure"]["isComposite"]]
    structural_invariant_violations = _structural_invariant_violations(candidate_cases)
    unexpected_local_tangents = _unexpected_local_tangents(candidate_cases)
    directional_twin_structure_violations = _directional_twin_structure_violations(candidate_cases)
    scan_plan_violations = _scan_plan_violations(candidate_cases)
    return {
        "schema": "medial-guide-p1-evaluation-v1",
        "version": 1,
        "status": "diagnostic-not-gold",
        "productionEligible": False,
        "scope": scope,
        "font": {"id": font_id, "fileSha256": actual_hash},
        "extractorVersion": extractor.P1_EXTRACTOR_VERSION,
        "roleContractVersion": extractor.P1_ROLE_CONTRACT_VERSION,
        "thresholdPolicy": "p1-v11-actual-pillar-side-beam-contact",
        "summary": {
            "caseCount": len(cases),
            "elementCount": len(elements),
            "glyphMissingCount": len(cases) - len(candidate_cases),
            "compositeCaseCount": len(composite_cases),
            "compositeCharacters": [case["character"] for case in composite_cases],
            "usableCandidateCount": sum(shared.usable(element) for element in elements),
            "usableConfidence": {
                label: sum(
                    shared.usable(element) and element["match"]["confidence"] == label
                    for element in elements
                )
                for label in ("high", "medium")
            },
            "matchingUnits": matching_units,
            "reasonCodes": reason_codes,
            "simpleCandidateRate": _candidate_rate(candidate_cases, simple_medials)["candidateRate"],
            "mixedCandidateRate": _candidate_rate(candidate_cases, mixed_medials)["candidateRate"],
            "perMedial": {
                medial: _candidate_rate(candidate_cases, (medial,))
                for medial in P1_MEDIAL_JAMOS
            },
            "perStructureFamily": {
                family: _candidate_rate(candidate_cases, medials)
                for family, medials in STRUCTURE_FAMILIES.items()
            },
            "invalidNumberCount": len(invalid_numbers),
            "roleContractViolationCount": len(role_contract_violations),
            "missingEvidenceCount": len(missing_evidence),
            "structuralInvariantViolationCount": len(structural_invariant_violations),
            "unexpectedLocalTangentCount": len(unexpected_local_tangents),
            "directionalTwinStructureViolationCount": len(directional_twin_structure_violations),
            "scanPlanViolationCount": len(scan_plan_violations),
        },
        "violations": {
            "roleContract": role_contract_violations,
            "missingEvidence": missing_evidence,
            "structuralInvariants": structural_invariant_violations,
            "unexpectedLocalTangents": unexpected_local_tangents,
            "directionalTwinStructures": directional_twin_structure_violations,
            "scanPlan": scan_plan_violations,
        },
        "cases": cases,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate remaining-medial P1 scope")
    parser.add_argument("font", type=Path)
    parser.add_argument("--scope", choices=("anchor", "p1"), default="anchor")
    parser.add_argument("--json", type=Path)
    parser.add_argument("--html", type=Path)
    parser.add_argument("--html-dir", type=Path)
    args = parser.parse_args()
    report = evaluate(args.font.resolve(), args.scope)
    if args.json:
        args.json.resolve().write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.html:
        if args.scope != "anchor":
            parser.error("--html은 anchor scope에서만 지원합니다.")
        heading = "{} P1 현재 14홀자 구조 대표".format(report["font"]["id"])
        args.html.resolve().write_text(
            shared.contact_sheet_html(args.font.resolve(), report, heading),
            encoding="utf-8",
        )
    if args.html_dir:
        write_medial_contact_sheets(
            args.font.resolve(),
            report,
            args.html_dir.resolve(),
        )
    if not args.json and not args.html and not args.html_dir:
        print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
