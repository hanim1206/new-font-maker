import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 브라우저 기본 핀치줌/제스처 방지 (capture: true로 자식 stopPropagation보다 먼저 처리)
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false, capture: true })
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false, capture: true })
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false, capture: true })
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault()
}, { passive: false, capture: true })
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault()
}, { passive: false, capture: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
