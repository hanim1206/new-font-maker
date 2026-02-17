/**
 * baseJamos.json rect 스트로크를 신형 포맷으로 일괄 변환하는 스크립트
 *
 * 변환:
 * - x,y: 좌상단 → 중심 좌표
 * - 가로획: width 유지, height→thickness, angle=0
 * - 세로획: height→width(길이), width→thickness, angle=90
 * - height: thickness와 동일값 (StrokeBase 호환)
 * - path 스트로크: 변경 없음
 */
import { readFileSync, writeFileSync } from 'fs'

const filePath = './src/data/baseJamos.json'
const data = JSON.parse(readFileSync(filePath, 'utf-8'))

function round(value) {
  const snapped = Math.round(value / 0.025) * 0.025
  return Math.round(snapped * 1000) / 1000
}

let rectCount = 0
let pathCount = 0

function migrateStroke(stroke) {
  if (stroke.direction === 'path') {
    pathCount++
    return stroke // path 스트로크는 변경 없음
  }

  rectCount++

  if (stroke.direction === 'horizontal') {
    return {
      id: stroke.id,
      x: round(stroke.x + stroke.width / 2),
      y: round(stroke.y + stroke.height / 2),
      width: stroke.width,
      height: stroke.height,  // StrokeBase 호환: thickness와 동일
      thickness: stroke.height,
      angle: 0,
      direction: 'horizontal',
    }
  } else if (stroke.direction === 'vertical') {
    return {
      id: stroke.id,
      x: round(stroke.x + stroke.width / 2),
      y: round(stroke.y + stroke.height / 2),
      width: stroke.height,  // 길이 (세로방향이었으므로 height가 길이)
      height: stroke.width,  // StrokeBase 호환: thickness와 동일
      thickness: stroke.width, // 두께 (세로획에서 width가 두께)
      angle: 90,
      direction: 'vertical',
    }
  }

  return stroke
}

function migrateStrokes(strokes) {
  if (!strokes) return strokes
  return strokes.map(migrateStroke)
}

// 모든 카테고리 처리
for (const category of ['choseong', 'jungseong', 'jongseong']) {
  const map = data[category]
  if (!map) continue

  for (const [key, jamo] of Object.entries(map)) {
    if (jamo.strokes) {
      jamo.strokes = migrateStrokes(jamo.strokes)
    }
    if (jamo.horizontalStrokes) {
      jamo.horizontalStrokes = migrateStrokes(jamo.horizontalStrokes)
    }
    if (jamo.verticalStrokes) {
      jamo.verticalStrokes = migrateStrokes(jamo.verticalStrokes)
    }
  }
}

writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
console.log(`Migration complete: ${rectCount} rect strokes migrated, ${pathCount} path strokes unchanged`)
