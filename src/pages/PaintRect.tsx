import { useEffect, useRef } from 'react'

interface RectData {
  x: number
  y: number
  width: number
  height: number
  color: string
}

const canvasSize = 24

// 초성 ㄱ
const choseong: RectData = {
  x: 2.29,
  y: 5.48,
  width: 10.95,
  height: 15.33,
  color: '#8B0000', // 어두운 빨강
}

// 중성 ㅏ
const jungseong: RectData = {
  x: 16.82,
  y: 1,
  width: 5.49,
  height: 24,
  color: '#556B2F', // 짙은 올리브
}

const PaintRect = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 배경
    ctx.fillStyle = '#f0f0f0'
    ctx.fillRect(0, 0, canvasSize, canvasSize)

    // 렌더 유틸
    const drawRect = ({ x, y, width, height, color }: RectData) => {
      ctx.fillStyle = color
      ctx.fillRect(x, y, width, height)
    }

    drawRect(choseong)
    drawRect(jungseong)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize}
      height={canvasSize}
      style={{ border: '1px solid #ccc', imageRendering: 'pixelated' }}
    />
  )
}

export default PaintRect
