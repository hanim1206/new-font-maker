// ===== JSON 클립보드 복사 =====
export async function copyJsonToClipboard(data: string): Promise<boolean> {
  // Clipboard API 시도
  try {
    await navigator.clipboard.writeText(data)
    return true
  } catch {
    // fallback: execCommand 사용
  }

  // fallback: textarea를 이용한 복사
  try {
    const textarea = document.createElement('textarea')
    textarea.value = data
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
