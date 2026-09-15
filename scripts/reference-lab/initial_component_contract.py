#!/usr/bin/env python3
"""Shared P0 contract for medial-anchored initial component observations."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import final_component_contract as _final_contract


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/initial-component-p0-contract.v2.json"

with CONTRACT_PATH.open(encoding="utf-8") as source:
    CONTRACT: Dict[str, Any] = json.load(source)

SCHEMA = str(CONTRACT["schema"])
RESPONSE_SCHEMA = str(CONTRACT["responseSchema"])
EXTRACTOR_VERSION = str(CONTRACT["extractorVersion"])
ROLE_DEFINITION_VERSION = str(CONTRACT["roleDefinitionVersion"])
MEDIAL_ANCHOR_EXTRACTOR_VERSION = str(CONTRACT["medialAnchorExtractorVersion"])
COORDINATE_FRAME = str(CONTRACT["coordinateFrame"])
GROUPING_METHOD = str(CONTRACT["groupingMethod"])
BOUND_METHOD = str(CONTRACT["boundMethod"])
ROLE_FACE_METHOD = str(CONTRACT["roleFaceMethod"])
SELECTION_AREA_METHOD = str(CONTRACT["selectionAreaMethod"])
SELECTION_RULES = tuple(str(value) for value in CONTRACT["selectionRules"])
ROLE_FACE_SELECTION_RULES = tuple(str(value) for value in CONTRACT["roleFaceSelectionRules"])
ROLE_CLASSES = tuple(dict(value) for value in CONTRACT["roleClasses"])
INITIAL_JAMOS = tuple(str(value) for value in CONTRACT["initialJamos"])
BOUND_SIDES = tuple(str(value) for value in CONTRACT["boundSides"])
REASON_CODES = tuple(str(value) for value in CONTRACT["reasonCodes"])
P0_CONTEXTS = tuple(dict(value) for value in CONTRACT["contexts"])

MEDIAL_INDEX = {"ㅏ": 0, "ㅗ": 8, "ㅘ": 9}
FINAL_JAMOS = _final_contract.FINAL_JAMOS
FINAL_INDEX: Dict[Optional[str], int] = {None: 0, **{jamo: index + 1 for index, jamo in enumerate(FINAL_JAMOS)}}

NO_FINAL_CONTRACT_VERSION = "initial-no-final-context-v1"
NO_FINAL_MEDIALS = tuple("ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")
MIXED_BASE_BEAM_ROLES = {
    "ㅘ": "lowerBeam", "ㅙ": "lowerBeam", "ㅚ": "primaryBeam",
    "ㅝ": "upperBeam", "ㅞ": "upperBeam", "ㅟ": "primaryBeam", "ㅢ": "primaryBeam",
}


def _no_final_contexts() -> tuple:
    templates = {context["id"]: context for context in P0_CONTEXTS if context["finalJamo"] is None}
    contexts = []
    for medial_jamo in NO_FINAL_MEDIALS:
        family = "mixed" if medial_jamo in MIXED_BASE_BEAM_ROLES else "bottom" if medial_jamo in "ㅗㅛㅜㅠㅡ" else "right"
        template = templates[family]
        contexts.append({
            **template,
            "id": family if medial_jamo == template["medialJamo"] else "{}-medial-{:04x}".format(family, ord(medial_jamo)),
            "medialJamo": medial_jamo,
            "baseBeamRole": MIXED_BASE_BEAM_ROLES.get(medial_jamo),
        })
    return tuple(contexts)


NO_FINAL_CONTEXTS = _no_final_contexts()
EXPANDED_NO_FINAL_CONTEXT_IDS = frozenset(
    context["id"] for context in NO_FINAL_CONTEXTS if "-medial-" in context["id"]
)

FINAL_CONTEXT_CONTRACT_VERSION = "initial-final-context-v1"


def _final_contexts() -> tuple:
    """ㄱ받침 P0 템플릿에서 나머지 26받침 문맥을 파생한다. 기존 P0 문맥 ID는 바꾸지 않는다."""
    templates = {context["medialJamo"]: context for context in P0_CONTEXTS if context["finalJamo"] == "ㄱ"}
    contexts = []
    for medial_jamo in MEDIAL_INDEX:
        template = templates[medial_jamo]
        for final_jamo in FINAL_JAMOS:
            if final_jamo == "ㄱ":
                continue
            contexts.append({
                **template,
                "id": "{}-{:04x}".format(template["id"], ord(final_jamo)),
                "finalJamo": final_jamo,
            })
    return tuple(contexts)


FINAL_CONTEXTS = _final_contexts()
EXPANDED_FINAL_CONTEXT_IDS = frozenset(context["id"] for context in FINAL_CONTEXTS)


def compose_no_final_syllable(initial_jamo: str, medial_jamo: str) -> str:
    if initial_jamo not in INITIAL_JAMOS or medial_jamo not in NO_FINAL_MEDIALS:
        raise ValueError("지원하지 않는 무받침 첫닿자·홀자입니다.")
    return chr(0xAC00 + (INITIAL_JAMOS.index(initial_jamo) * 21 + NO_FINAL_MEDIALS.index(medial_jamo)) * 28)


def no_final_cases() -> List[Dict[str, Optional[str]]]:
    return [
        {
            "character": compose_no_final_syllable(initial_jamo, str(context["medialJamo"])),
            "initialJamo": initial_jamo,
            "medialJamo": str(context["medialJamo"]),
            "finalJamo": None,
            "contextId": str(context["id"]),
        }
        for initial_jamo in INITIAL_JAMOS
        for context in NO_FINAL_CONTEXTS
    ]


def final_cases() -> List[Dict[str, Optional[str]]]:
    return [
        {
            "character": compose_syllable(initial_jamo, str(context["medialJamo"]), context["finalJamo"]),
            "initialJamo": initial_jamo,
            "medialJamo": str(context["medialJamo"]),
            "finalJamo": context["finalJamo"],
            "contextId": str(context["id"]),
        }
        for initial_jamo in INITIAL_JAMOS
        for context in FINAL_CONTEXTS
    ]


def compose_syllable(initial_jamo: str, medial_jamo: str, final_jamo: Optional[str]) -> str:
    if initial_jamo not in INITIAL_JAMOS:
        raise ValueError("지원하지 않는 첫닿자입니다.")
    if medial_jamo not in MEDIAL_INDEX or final_jamo not in FINAL_INDEX:
        raise ValueError("지원하지 않는 홀자·받침 조합입니다.")
    return chr(
        0xAC00
        + INITIAL_JAMOS.index(initial_jamo) * 588
        + MEDIAL_INDEX[medial_jamo] * 28
        + FINAL_INDEX[final_jamo]
    )


def p0_cases() -> List[Dict[str, Optional[str]]]:
    return [
        {
            "character": compose_syllable(initial_jamo, str(context["medialJamo"]), context["finalJamo"]),
            "initialJamo": initial_jamo,
            "medialJamo": str(context["medialJamo"]),
            "finalJamo": context["finalJamo"],
            "contextId": str(context["id"]),
        }
        for initial_jamo in INITIAL_JAMOS
        for context in P0_CONTEXTS
    ]


def role_class_for(initial_jamo: str) -> Dict[str, Any]:
    matches = [
        role_class
        for role_class in ROLE_CLASSES
        if initial_jamo in role_class["initialJamos"]
    ]
    if len(matches) != 1:
        raise ValueError("첫닿자는 정확히 하나의 역할 구조 클래스에 속해야 합니다.")
    return matches[0]


def selection_area_from_role_faces(role_faces: Dict[str, float]) -> Dict[str, float]:
    if set(role_faces) != set(BOUND_SIDES):
        raise ValueError("상·하·좌·우 네 역할 단면이 필요합니다.")
    top = float(role_faces["top"])
    bottom = float(role_faces["bottom"])
    left = float(role_faces["left"])
    right = float(role_faces["right"])
    if not top < bottom or not left < right:
        raise ValueError("첫닿 영역 경계 순서가 잘못됐습니다.")
    return {
        "x": left,
        "y": top,
        "width": right - left,
        "height": bottom - top,
    }
