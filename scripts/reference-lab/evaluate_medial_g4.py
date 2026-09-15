#!/usr/bin/env python3
"""Evaluate medial matcher on fixed Nanum Gothic G4 risk and full P0 scopes.

Outputs remain diagnostics. They never become production layout or JamoMaster data.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Dict

import evaluate_medial_g2 as shared
import medial_guide_extractor as extractor


def _composite_metadata(font, glyph_name: str) -> Dict[str, Any]:
    if "glyf" not in font:
        return {"isComposite": False, "componentCount": 0}
    glyph = font["glyf"][glyph_name]
    is_composite = glyph.isComposite()
    return {
        "isComposite": is_composite,
        "componentCount": len(glyph.components) if is_composite else 0,
    }


def evaluate(font_path: Path, scope: str) -> Dict[str, Any]:
    actual_hash = extractor._sha256(font_path)  # pylint: disable=protected-access
    if actual_hash != extractor.G4_FONT_SHA256:
        raise ValueError("G4는 고정 나눔고딕 SHA에서만 평가합니다.")
    source_scope = "g2" if scope == "g4" else "full"
    font = extractor.load_font(font_path)
    try:
        cmap = font.getBestCmap() or {}
        cases = []
        for case in shared.evaluation_cases(source_scope):
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
    simple_elements = [
        element
        for case in candidate_cases
        if case["medialJamo"] != "ㅘ"
        for element in case["elements"]
    ]
    mixed_elements = [
        element
        for case in candidate_cases
        if case["medialJamo"] == "ㅘ"
        for element in case["elements"]
    ]
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
    expected_element_count = sum(
        len(extractor.MEDIAL_ROLE_SPECS[str(case["medialJamo"])])
        for case in cases
    )
    role_contract_violations = [
        {
            "character": case["character"],
            "expected": [role.element_id for role in extractor.MEDIAL_ROLE_SPECS[str(case["medialJamo"])]],
            "actual": [element["elementId"] for element in case.get("elements", [])],
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
    composite_cases = [case for case in candidate_cases if case["glyphStructure"]["isComposite"]]
    return {
        "schema": "medial-guide-g4-evaluation-v1",
        "version": 1,
        "status": "diagnostic-not-gold",
        "productionEligible": False,
        "scope": scope,
        "font": {"id": extractor.G4_FONT_ID, "fileSha256": actual_hash},
        "extractorVersion": extractor.EXTRACTOR_VERSION,
        "thresholdPolicy": "g1-frozen-contour-plus-g4-segment-fallback",
        "summary": {
            "caseCount": len(cases),
            "elementCount": expected_element_count,
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
            "simpleCandidateRate": round(
                sum(shared.usable(element) for element in simple_elements) / len(simple_elements),
                4,
            ),
            "mixedCandidateRate": round(
                sum(shared.usable(element) for element in mixed_elements) / len(mixed_elements),
                4,
            ),
            "invalidNumberCount": len(invalid_numbers),
            "roleContractViolationCount": len(role_contract_violations),
            "missingEvidenceCount": len(missing_evidence),
        },
        "violations": {
            "roleContract": role_contract_violations,
            "missingEvidence": missing_evidence,
        },
        "cases": cases,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate fixed Nanum Gothic G4 scope")
    parser.add_argument("font", type=Path)
    parser.add_argument("--scope", choices=("g4", "p0"), default="g4")
    parser.add_argument("--json", type=Path)
    parser.add_argument("--html", type=Path)
    args = parser.parse_args()
    report = evaluate(args.font.resolve(), args.scope)
    if args.json:
        args.json.resolve().write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.html:
        if args.scope != "g4":
            parser.error("--html은 g4 scope에서만 지원합니다.")
        args.html.resolve().write_text(
            shared.contact_sheet_html(args.font.resolve(), report, "나눔고딕 G4 위험 표본"),
            encoding="utf-8",
        )
    if not args.json and not args.html:
        print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
