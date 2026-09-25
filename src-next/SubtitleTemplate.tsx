import { AppGlyph } from './AppGlyph'
import styles from './SubtitleTemplate.module.css'

/**
 * 입혀보기 템플릿 하나 — 유튜브 자막 틀(검은 띠 위 흰 글 두 줄).
 * `fontFamily`가 있으면 진짜 폰트(방금 만든 OTF를 `FontFace`로 등록한 것)로, 없으면 내 획(`AppGlyph`)으로 그린다.
 * 문구는 받침 · 가로홀자 · 섞임홀자가 다 들어가게 골랐다 — 빠진 글자가 있으면 구멍이 그대로 보이는 것도 정보다.
 */
const SUBTITLE_LINES = ['괜찮아, 뭐든 될 거야', '오늘의 나를 사랑해야지'] as const
const GLYPH_PX = 28

const isHangul = (char: string) => { const code = char.codePointAt(0) ?? 0; return code >= 0xac00 && code <= 0xd7a3 }

export function SubtitleTemplate({ fontFamily, size = GLYPH_PX }: { fontFamily?: string; size?: number }) {
  return <figure className={styles.frame} data-testid="subtitle-template" data-mode={fontFamily ? 'font' : 'engine'} aria-label="자막 템플릿">
    <div className={styles.band} style={{ fontSize: size }}>
      {SUBTITLE_LINES.map((line) => <p key={line} style={fontFamily ? { fontFamily: `'${fontFamily}', sans-serif` } : undefined}>
        {fontFamily
          ? line
          : [...line].map((char, index) => isHangul(char)
            ? <span key={index} className={styles.glyph}><AppGlyph char={char} size={size} upright /></span>
            : <span key={index} className={styles.plain}>{char}</span>)}
      </p>)}
    </div>
  </figure>
}
