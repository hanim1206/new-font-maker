"""노토 가변 폰트에서 굵기별 글자 윤곽을 SVG 경로로 뽑는다.

속공간 지키기 실험실(`/design-body-lab`의 진행 지도 ②)이 노토 400 위에 900을 겹쳐 그릴 때 쓴다.
플랜 `docs/plans/2026-10-01_속공간-지키기.md`.

    python3 scripts/reference-lab/noto_weight_outlines.py

좌표는 폰트 단위(1000 = 1em), y는 위로 간다.
"""

import json
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".reference-fonts" / "NotoSansKR.ttf"
OUT = ROOT / "src-next" / "counterLabNoto.json"
CHARS = "빼를뷁한이밭쏟뭐갰웨많"
WEIGHTS = [400, 900]


def main() -> None:
    glyphs: dict[str, dict[str, dict]] = {char: {} for char in CHARS}
    for weight in WEIGHTS:
        font = instancer.instantiateVariableFont(TTFont(SOURCE), {"wght": weight})
        cmap = font.getBestCmap()
        glyph_set = font.getGlyphSet()
        for char in CHARS:
            name = cmap[ord(char)]
            pen = SVGPathPen(glyph_set, ntos=lambda value: f"{value:.0f}")
            glyph_set[name].draw(pen)
            bounds = BoundsPen(glyph_set)
            glyph_set[name].draw(bounds)
            left, bottom, right, top = (round(value) for value in bounds.bounds)
            glyphs[char][str(weight)] = {
                "d": pen.getCommands(),
                "advance": glyph_set[name].width,
                "bounds": [left, bottom, right, top],
            }
    OUT.write_text(json.dumps({"weights": WEIGHTS, "glyphs": glyphs}, ensure_ascii=False), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
