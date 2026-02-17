/**
 * baseJamos.json을 레거시 형식에서 V2 형식으로 변환하는 스크립트
 * Usage: node scripts/convertBaseJamos.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputPath = path.resolve(__dirname, '../src/data/baseJamos.json')

const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))

function convertRectStroke(stroke) {
  const angle = stroke.angle ?? 0
  const halfLen = stroke.width / 2

  let start, end

  if (angle === 0) {
    start = { x: round(stroke.x - halfLen), y: round(stroke.y) }
    end = { x: round(stroke.x + halfLen), y: round(stroke.y) }
  } else if (angle === 90) {
    start = { x: round(stroke.x), y: round(stroke.y - halfLen) }
    end = { x: round(stroke.x), y: round(stroke.y + halfLen) }
  } else {
    const angleRad = (angle * Math.PI) / 180
    const dx = halfLen * Math.cos(angleRad)
    const dy = halfLen * Math.sin(angleRad)
    start = { x: round(stroke.x - dx), y: round(stroke.y - dy) }
    end = { x: round(stroke.x + dx), y: round(stroke.y + dy) }
  }

  return {
    id: stroke.id,
    points: [start, end],
    closed: false,
    thickness: stroke.thickness,
    label: stroke.direction,
  }
}

function convertPathStroke(stroke) {
  const points = stroke.pathData.points.map((pt) => {
    const anchor = {
      x: round(stroke.x + pt.x * stroke.width),
      y: round(stroke.y + pt.y * stroke.height),
    }
    if (pt.handleIn) {
      anchor.handleIn = {
        x: round(stroke.x + pt.handleIn.x * stroke.width),
        y: round(stroke.y + pt.handleIn.y * stroke.height),
      }
    }
    if (pt.handleOut) {
      anchor.handleOut = {
        x: round(stroke.x + pt.handleOut.x * stroke.width),
        y: round(stroke.y + pt.handleOut.y * stroke.height),
      }
    }
    return anchor
  })

  return {
    id: stroke.id,
    points,
    closed: stroke.pathData.closed,
    thickness: stroke.thickness,
    label: stroke.pathData.closed ? 'circle' : 'curve',
  }
}

function convertStroke(stroke) {
  if (stroke.direction === 'path') {
    return convertPathStroke(stroke)
  }
  return convertRectStroke(stroke)
}

function round(n) {
  // 소수점 6자리까지 반올림 (부동소수점 오차 방지)
  return Math.round(n * 1000000) / 1000000
}

function convertJamoGroup(group) {
  const result = {}
  for (const [char, jamo] of Object.entries(group)) {
    const converted = { ...jamo }
    if (jamo.strokes) {
      converted.strokes = jamo.strokes.map(convertStroke)
    }
    if (jamo.horizontalStrokes) {
      converted.horizontalStrokes = jamo.horizontalStrokes.map(convertStroke)
    }
    if (jamo.verticalStrokes) {
      converted.verticalStrokes = jamo.verticalStrokes.map(convertStroke)
    }
    result[char] = converted
  }
  return result
}

// 통계
let rectCount = 0, pathCount = 0
function countStrokes(group) {
  for (const jamo of Object.values(group)) {
    const allStrokes = [
      ...(jamo.strokes || []),
      ...(jamo.horizontalStrokes || []),
      ...(jamo.verticalStrokes || []),
    ]
    for (const s of allStrokes) {
      if (s.direction === 'path') pathCount++
      else rectCount++
    }
  }
}
countStrokes(data.choseong)
countStrokes(data.jungseong)
countStrokes(data.jongseong)

const output = {
  version: '2.0.0',
  choseong: convertJamoGroup(data.choseong),
  jungseong: convertJamoGroup(data.jungseong),
  jongseong: convertJamoGroup(data.jongseong),
  exportedAt: new Date().toISOString(),
}

fs.writeFileSync(inputPath, JSON.stringify(output, null, 2) + '\n')
console.log(`Converted ${rectCount} rect + ${pathCount} path = ${rectCount + pathCount} strokes`)
console.log(`Output: ${inputPath}`)
