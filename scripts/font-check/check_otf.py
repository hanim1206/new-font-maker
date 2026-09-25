"""추출한 OTF를 베타 전 점검 목록(피드백 18)대로 자동으로 본다.

사람이 봐야 하는 것(설치 경고, 앱 안 이름 표시, 재설치)은 빼고 파일만으로 알 수 있는 것만 본다.

    python3 -B scripts/font-check/check_otf.py ~/Downloads/test1.otf [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

HANGUL_FIRST, HANGUL_LAST = 0xAC00, 0xD7A3
# 호환 자모 ㄱ(3131) ~ ㅣ(3163): ㅋㅋ · ㅎㅎ에 쓰는 낱자모
JAMO_FIRST, JAMO_LAST = 0x3131, 0x3163
# OS/2 ulCodePageRange1 bit 19 = Korean Wansung, bit 21 = Korean Johab
KOREAN_CODE_PAGE_BITS = (19, 21)
# OS/2 ulUnicodeRange1 bit 28 = Hangul Jamo, ulUnicodeRange2 bit 24(=56) = Hangul Syllables
HANGUL_SYLLABLE_UNICODE_BIT = 56
CURVE_STEPS = 8


@dataclass
class Report:
    rows: list[dict] = field(default_factory=list)

    def add(self, item: str, level: str, text: str, detail: object = None) -> None:
        self.rows.append({'item': item, 'level': level, 'text': text, 'detail': detail})


def flatten(pen_value: list) -> list[list[tuple[float, float]]]:
    """펜 기록을 윤곽별 점 목록으로 편다(곡선은 CURVE_STEPS 토막)."""
    contours: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for op, args in pen_value:
        if op == 'moveTo':
            current = [args[0]]
        elif op == 'lineTo':
            current.append(args[0])
        elif op == 'curveTo':
            p0 = current[-1]
            p1, p2, p3 = args
            for i in range(1, CURVE_STEPS + 1):
                t = i / CURVE_STEPS
                u = 1 - t
                current.append((
                    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
                ))
        elif op == 'qCurveTo':
            p0 = current[-1]
            p1, p2 = args[-2], args[-1]
            for i in range(1, CURVE_STEPS + 1):
                t = i / CURVE_STEPS
                u = 1 - t
                current.append((
                    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
                ))
        elif op in ('closePath', 'endPath'):
            if len(current) >= 2 and current[0] == current[-1]:
                current = current[:-1]
            if current:
                contours.append(current)
            current = []
    return contours


def signed_area(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for i, (x0, y0) in enumerate(points):
        x1, y1 = points[(i + 1) % len(points)]
        total += x0 * y1 - x1 * y0
    return total / 2


def point_in_polygon(pt: tuple[float, float], poly: list[tuple[float, float]]) -> bool:
    x, y = pt
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def depth_errors(contours: list[list[tuple[float, float]]]) -> tuple[int, int, int]:
    """(바깥 윤곽 방향 부호, 구멍이 바깥과 같은 방향인 윤곽 수, 넓이 0 윤곽 수).

    nonzero 채우기에서 구멍이 바깥과 같은 방향이면 메워진다. 바깥이 시계인지 반시계인지는 글꼴 전체에서 한쪽이면 된다.
    """
    areas = [signed_area(c) for c in contours]
    outer = max(range(len(contours)), key=lambda k: abs(areas[k]))
    outer_positive = areas[outer] > 0
    wrong = 0
    degenerate = 0
    for i, contour in enumerate(contours):
        if abs(areas[i]) < 1:
            degenerate += 1
            continue
        depth = 0
        probe = contour[0]
        for j, other in enumerate(contours):
            if i != j and abs(areas[j]) >= abs(areas[i]) and point_in_polygon(probe, other):
                depth += 1
        expected_positive = outer_positive if depth % 2 == 0 else not outer_positive
        if (areas[i] > 0) != expected_positive:
            wrong += 1
    return (1 if outer_positive else -1), wrong, degenerate


def name_record(font: TTFont, name_id: int, lang: int) -> str | None:
    rec = font['name'].getName(name_id, 3, 1, lang)
    return rec.toUnicode() if rec else None


def check(path: str) -> Report:
    report = Report()
    font = TTFont(path)
    try:
        cmap = font.getBestCmap()
    except Exception as error:  # noqa: BLE001 — 깨진 cmap도 점검 결과로 돌려준다
        report.add('3 cmap', 'fail', f'글자표(cmap)를 읽을 수 없다 — 앱이 글자를 못 찾는다: {error!r}')
        return report
    glyph_set = font.getGlyphSet()
    is_cff = 'CFF ' in font

    # 7 크기와 형식
    size_mb = os.path.getsize(path) / 1_000_000
    report.add('7 크기', 'ok' if size_mb < 8 else 'warn',
               f'{size_mb:.2f} MB · 글리프 {font["maxp"].numGlyphs}개 · {"CFF(OTF)" if is_cff else "TrueType"}')

    # 3 빠진 글자
    missing_syllables = [cp for cp in range(HANGUL_FIRST, HANGUL_LAST + 1) if cp not in cmap]
    missing_jamo = [cp for cp in range(JAMO_FIRST, JAMO_LAST + 1) if cp not in cmap]
    report.add('3 음절', 'ok' if not missing_syllables else 'fail',
               f'11,172자 중 빠진 것 {len(missing_syllables)}',
               ''.join(chr(cp) for cp in missing_syllables[:40]) or None)
    report.add('3 낱자모', 'ok' if not missing_jamo else 'warn',
               f'ㄱ~ㅣ 51자 중 빠진 것 {len(missing_jamo)}',
               ''.join(chr(cp) for cp in missing_jamo) or None)

    # 3 · 4 빈 글리프와 윤곽 방향
    empty: list[str] = []
    wrong_dir: list[str] = []
    outer_signs = {1: [], -1: []}
    degenerate_glyphs: list[str] = []
    y_max, y_min = -1e9, 1e9
    clipped_top: list[str] = []
    clipped_bottom: list[str] = []
    os2 = font['OS/2']
    win_top, win_bottom = os2.usWinAscent, -os2.usWinDescent
    checked = [cp for cp in list(range(HANGUL_FIRST, HANGUL_LAST + 1)) + list(range(JAMO_FIRST, JAMO_LAST + 1))
               if cp in cmap]
    for cp in checked:
        pen = DecomposingRecordingPen(glyph_set)
        glyph_set[cmap[cp]].draw(pen)
        contours = flatten(pen.value)
        if not contours:
            empty.append(chr(cp))
            continue
        sign, wrong, degenerate = depth_errors(contours)
        outer_signs[sign].append(chr(cp))
        if wrong:
            wrong_dir.append(chr(cp))
        if degenerate:
            degenerate_glyphs.append(chr(cp))
        ys = [p[1] for c in contours for p in c]
        top, bottom = max(ys), min(ys)
        y_max, y_min = max(y_max, top), min(y_min, bottom)
        if top > win_top:
            clipped_top.append(chr(cp))
        if bottom < win_bottom:
            clipped_bottom.append(chr(cp))

    report.add('3 빈 글자', 'ok' if not empty else 'fail',
               f'글리프는 있는데 윤곽이 없는 글자 {len(empty)}(추출 실패로 빈 칸 처리된 것 포함)',
               ''.join(empty[:60]) or None)
    majority = 1 if len(outer_signs[1]) >= len(outer_signs[-1]) else -1
    minority = outer_signs[-majority]
    report.add('4 바깥 방향', 'ok' if not minority else 'fail',
               f'바깥 윤곽 {"반시계" if majority == 1 else "시계"} {len(outer_signs[majority])}자 · 반대 {len(minority)}자',
               ''.join(minority[:60]) or None)
    report.add('4 구멍 방향', 'ok' if not wrong_dir else 'fail',
               f'구멍이 바깥과 같은 방향이라 메워질 수 있는 글자 {len(wrong_dir)}',
               ''.join(wrong_dir[:60]) or None)
    report.add('4 넓이 0 윤곽', 'ok' if not degenerate_glyphs else 'warn',
               f'넓이가 거의 0인 윤곽이 있는 글자 {len(degenerate_glyphs)}',
               ''.join(degenerate_glyphs[:60]) or None)

    # 5 높이 값
    hhea = font['hhea']
    upm = font['head'].unitsPerEm
    report.add('5 높이 값', 'info',
               f'UPM {upm} · hhea {hhea.ascent}/{hhea.descent}/gap {hhea.lineGap} · '
               f'typo {os2.sTypoAscender}/{os2.sTypoDescender}/gap {os2.sTypoLineGap} · '
               f'win {os2.usWinAscent}/{os2.usWinDescent} · 실제 잉크 {y_max:.0f}/{y_min:.0f}')
    report.add('5 윈도우 잘림', 'ok' if not (clipped_top or clipped_bottom) else 'fail',
               f'win 높이를 넘는 글자 위 {len(clipped_top)} · 아래 {len(clipped_bottom)}',
               (''.join(clipped_top[:30]) + ' / ' + ''.join(clipped_bottom[:30])) if (clipped_top or clipped_bottom) else None)
    typo_height = os2.sTypoAscender - os2.sTypoDescender + os2.sTypoLineGap
    report.add('5 줄 간격', 'ok' if typo_height > upm else 'warn',
               f'한 줄 높이 {typo_height / upm:.2f}em — 1.0em이면 긴 문단에서 줄이 붙어 보인다(워드·한글에서 확인)')

    # 2 이름
    names = {}
    for name_id, label in [(1, '가족'), (2, '스타일'), (4, '전체'), (5, '버전'), (6, 'PostScript'),
                           (13, '라이선스'), (14, '라이선스 URL'), (16, '타이포 가족')]:
        names[label] = {'en': name_record(font, name_id, 0x409), 'ko': name_record(font, name_id, 0x412)}
    missing_core = [k for k in ('가족', '스타일', '전체', '버전', 'PostScript') if not names[k]['en']]
    report.add('2 이름(영문)', 'ok' if not missing_core else 'fail',
               f'가족 {names["가족"]["en"]!r} · 전체 {names["전체"]["en"]!r} · PS {names["PostScript"]["en"]!r}'
               + (f' · 빠짐 {missing_core}' if missing_core else ''))
    family_en = names['가족']['en'] or ''
    if names['가족']['ko']:
        report.add('2 이름(한국어)', 'ok', f'한국어 가족 이름 {names["가족"]["ko"]!r}')
    else:
        report.add('2 이름(한국어)', 'info',
                   f'한국어 가족 이름 없음 — 받을 때 이름이 영문({family_en!r})이면 정상, 한글로 적었는데 없으면 버그')
    report.add('6 버전', 'info',
               f'{names["버전"]["en"]!r} · head.fontRevision {font["head"].fontRevision:.3f}')
    report.add('19 라이선스', 'ok' if names['라이선스']['en'] else 'warn',
               f'라이선스 칸 {"있음" if names["라이선스"]["en"] else "비어 있음 — 19번 결론 뒤 채움"}')

    # 1 · 2 OS/2 표시 값
    korean_cp = any(os2.ulCodePageRange1 >> bit & 1 for bit in KOREAN_CODE_PAGE_BITS)
    unicode_bits = (os2.ulUnicodeRange2 << 32) | os2.ulUnicodeRange1
    hangul_unicode = bool(unicode_bits >> HANGUL_SYLLABLE_UNICODE_BIT & 1)
    report.add('2 한국어 표시', 'ok' if korean_cp and hangul_unicode else 'warn',
               f'코드페이지 한국어 {"켬" if korean_cp else "꺼짐"} · 유니코드 범위 한글 음절 {"켬" if hangul_unicode else "꺼짐"}')
    report.add('1 내장 허용', 'ok' if os2.fsType == 0 else 'warn',
               f'fsType {os2.fsType}' + (' (제한 없음)' if os2.fsType == 0 else ' — PDF 내장이 막힐 수 있다'))
    italic = font['post'].italicAngle
    report.add('기울기 값', 'info',
               f'굵기 등급 {os2.usWeightClass} · post.italicAngle {italic} · fsSelection 0x{os2.fsSelection:04x}')

    return report


LEVEL_MARK = {'ok': '✅', 'warn': '⚠️', 'fail': '❌', 'info': 'ℹ️'}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    report = check(os.path.expanduser(args.path))
    if args.json:
        print(json.dumps(report.rows, ensure_ascii=False, indent=2))
    else:
        for row in report.rows:
            print(f'{LEVEL_MARK[row["level"]]} {row["item"]}: {row["text"]}')
            if row['detail']:
                print(f'    {row["detail"]}')
    return 1 if any(r['level'] == 'fail' for r in report.rows) else 0


if __name__ == '__main__':
    sys.exit(main())
