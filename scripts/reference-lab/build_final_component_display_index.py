#!/usr/bin/env python3
"""Build a compact, verified-only display projection for final components.

Candidate artifacts retain full contour and segment provenance. This index keeps
only geometry needed by Font Guide Lab plus member contour ownership for drawing.
It is generated only when the source candidate matches a separate user-visual
verification record.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List

import final_component_contract as contract


DISPLAY_INDEX_SCHEMA = "reference-final-component-display-index-v1"


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _identity_sha256(candidate: Dict[str, Any]) -> str:
    canonical = json.dumps(
        [case["identity"] for case in candidate["cases"]],
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256(canonical)


def _observation(value: Dict[str, Any]) -> Dict[str, Any]:
    if value["status"] == "abstained":
        return {
            "status": "abstained",
            "reasonCode": value["reasonCode"],
        }
    return {
        "status": "candidate",
        "value": value["value"],
    }


def _axis_observation(value: Dict[str, Any]) -> Dict[str, Any]:
    if value["status"] == "abstained":
        return _observation(value)
    return {
        "status": "candidate",
        "value": [
            {
                "orientation": face["orientation"],
                "value": face["value"],
                "visibleSpans": face["visibleSpans"],
            }
            for face in value["value"]
        ],
    }


def _member(value: Dict[str, Any]) -> Dict[str, Any]:
    contour_ids = sorted({int(fragment["contourId"]) for fragment in value["boundaryFragments"]})
    return {
        "id": value["id"],
        "jamo": value["jamo"],
        "role": value["role"],
        "contourIds": contour_ids,
    }


def _display_case(case: Dict[str, Any]) -> Dict[str, Any]:
    if case["state"] == "abstained":
        return {
            "identity": case["identity"],
            "state": "abstained",
            "reasonCode": case["reasonCode"],
        }
    relation = case["memberRelation"]
    return {
        "identity": case["identity"],
        "state": "candidate",
        "structureKind": case["structureKind"],
        "members": [_member(member) for member in case["members"]],
        "componentGroup": {
            "contourIds": case["componentGroup"]["value"]["contourIds"],
            "holeContourIds": case["componentGroup"]["value"]["holeContourIds"],
            "selectedPathSha256": case["componentGroup"]["value"]["selectedPathSha256"],
        },
        "memberRelation": None if relation is None else {
            "relation": relation["relation"],
            "leftAnchorX": relation["leftAnchorX"],
            "rightAnchorX": relation["rightAnchorX"],
        },
        "inkBounds": {
            side: _observation(case["inkBounds"][side])
            for side in contract.BOUND_SIDES
        },
        "axisFaces": {
            side: _axis_observation(case["axisFaces"][side])
            for side in contract.BOUND_SIDES
        },
        "roleFaces": {
            side: _observation(case["roleFaces"][side])
            for side in contract.BOUND_SIDES
        },
        "selectionArea": _observation(case["selectionArea"]),
    }


def build_index(candidate_bytes: bytes, verification: Dict[str, Any]) -> Dict[str, Any]:
    candidate = json.loads(candidate_bytes.decode("utf-8"))
    if candidate.get("schema") != contract.RESPONSE_SCHEMA or candidate.get("lifecycle") != contract.CANDIDATE_LIFECYCLE:
        raise ValueError("받침 candidate artifact가 아닙니다.")
    if verification.get("schema") != contract.VERIFICATION_SCHEMA or verification.get("state") != "verified":
        raise ValueError("사용자 화면 승인된 verification이 필요합니다.")
    candidate_sha = _sha256(candidate_bytes)
    if verification.get("candidateArtifactSha256") != candidate_sha:
        raise ValueError("verification candidate SHA가 원본과 다릅니다.")
    identity_sha = _identity_sha256(candidate)
    if verification.get("candidateIdentitySha256") != identity_sha:
        raise ValueError("verification identity SHA가 원본과 다릅니다.")
    font = candidate.get("font")
    if not isinstance(font, dict):
        raise ValueError("candidate font identity가 필요합니다.")
    return {
        "schema": DISPLAY_INDEX_SCHEMA,
        "apiVersion": "reference.v1",
        "coordinateFrame": contract.COORDINATE_FRAME,
        "displayProjection": "verified-final-component-display-v1",
        "candidateArtifactSha256": candidate_sha,
        "candidateIdentitySha256": identity_sha,
        "verification": {
            "state": verification["state"],
            "reviewedAt": verification["review"]["reviewedAt"],
            "reviewedBy": verification["review"]["reviewedBy"],
        },
        "extractorVersion": candidate["extractorVersion"],
        "roleDefinitionVersion": candidate["roleDefinitionVersion"],
        "medialAnchorExtractorVersion": candidate["medialAnchorExtractorVersion"],
        "font": font,
        "cases": [_display_case(case) for case in candidate["cases"]],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build verified final-component display index")
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--verification", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    index = build_index(
        args.candidate.read_bytes(),
        json.loads(args.verification.read_text(encoding="utf-8")),
    )
    args.output.write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
