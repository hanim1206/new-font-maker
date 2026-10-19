"""노토 산스 KR 가변 폰트에서 숫자·기호(ASCII U+0021~U+007E, 94자) 윤곽을 굵기별로 뽑는다.

OTF 추출에서 라틴 글리프를 노토 모양 그대로 넣기 위한 데이터다. 결과는 `src/data/notoLatin.v1.json` 하나.

    python3 scripts/reference-lab/export_noto_latin.py

- fontTools `instancer`로 wght 100 · 200 · … · 900 아홉 굵기를 각각 고정한 뒤 뽑는다.
- 좌표는 UPM 1000, y는 위로, 정수로 반올림. 점 하나는 `[x, y, onCurve(1/0)]`.
- glyf의 TrueType 점을 그대로 쓴다(연속 off-curve 그대로, 암시 점을 만들지 않는다). 합성 글리프는 풀어서 넣는다.
- 띄어쓰기(U+0020)는 넣지 않는다. 앱이 따로 만든다.
- 폰트 파일 SHA-256이 `build-neutral-gothic-noto-source.mjs`와 다르면 멈춘다.
"""

import hashlib
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".reference-fonts" / "NotoSansKR.ttf"
OUT = ROOT / "src" / "data" / "notoLatin.v1.json"

# scripts/preset-lab/build-neutral-gothic-noto-source.mjs 의 FONT_SHA256 과 같은 값이어야 한다.
FONT_SHA256 = "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252"
WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]
CODEPOINTS = list(range(0x21, 0x7F))
SIZE_LIMIT = 1_000_000


def fail(message: str) -> None:
    print(f"멈춤: {message}", file=sys.stderr)
    sys.exit(1)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glyph_contours(font: TTFont, name: str) -> list[list[list[int]]]:
    """glyf 점을 윤곽별로 `[x, y, onCurve]` 목록으로. 합성 글리프는 getCoordinates가 풀어 준다."""
    glyf = font["glyf"]
    glyph = glyf[name]
    coordinates, end_points, flags = glyph.getCoordinates(glyf)
    contours: list[list[list[int]]] = []
    start = 0
    for end in end_points:
        contour = [
            [round(x), round(y), int(flags[i] & 1)]
            for i, (x, y) in enumerate(coordinates[start : end + 1], start)
        ]
        contours.append(contour)
        start = end + 1
    return contours


def export_weight(weight: int) -> dict[str, dict]:
    font = instancer.instantiateVariableFont(TTFont(SOURCE), {"wght": weight})
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    glyphs: dict[str, dict] = {}
    for codepoint in CODEPOINTS:
        name = cmap.get(codepoint)
        if name is None:
            fail(f"U+{codepoint:04X} 글리프 없음 (wght {weight})")
        advance, _ = hmtx[name]
        glyphs[str(codepoint)] = {
            "advanceWidth": int(advance),
            "contours": glyph_contours(font, name),
        }
    return glyphs


def main() -> None:
    if not SOURCE.exists():
        fail(f"{SOURCE.relative_to(ROOT)} 없음")
    actual = sha256_file(SOURCE)
    if actual != FONT_SHA256:
        fail(f"NotoSansKR.ttf SHA-256 불일치: {actual}")

    base = TTFont(SOURCE)
    units_per_em = base["head"].unitsPerEm
    if units_per_em != 1000:
        fail(f"unitsPerEm {units_per_em} ≠ 1000")

    data = {
        "source": {
            "font": SOURCE.name,
            "sha256": FONT_SHA256,
            "license": "OFL-1.1",
            "unitsPerEm": units_per_em,
        },
        "weights": {str(weight): export_weight(weight) for weight in WEIGHTS},
    }

    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    size = len(text.encode("utf-8"))
    if size > SIZE_LIMIT:
        fail(f"JSON {size:,} bytes — 1MB 초과")
    OUT.write_text(text + "\n", encoding="utf-8")

    for weight in WEIGHTS:
        print(f"wght {weight}: {len(data['weights'][str(weight)])}자")
    print(f"{OUT.relative_to(ROOT)} {size:,} bytes ({size / 1024:.0f}KB)")


if __name__ == "__main__":
    main()
