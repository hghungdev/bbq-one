/**
 * Clipboard utilities cho Chrome Extension popup (MV3).
 *
 * Đã xác nhận qua debug: navigator.clipboard.writeText() trong popup
 * log "writeText OK" nhưng Windows không nhận qua Win+V.
 *
 * Nguyên nhân thực: Windows Clipboard History cần được BẬT (Win+V → Turn on),
 * hoặc test paste bằng Ctrl+V vào Notepad/VS Code thay vì Win+V.
 * Ngoài ra popup có thể mất focus ngay sau click → writeText fail silently.
 *
 * Strategy hiện tại: thử popup writeText trước, fallback sang background offscreen.
 */

/**
 * Ghi text vào OS clipboard.
 * Thử navigator.clipboard.writeText() trực tiếp trong popup (đã confirm log "OK").
 * Nếu fail → fallback qua background → offscreen document dùng execCommand.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  // Thử trực tiếp trong popup trước
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      console.log('[BBQOne][clipboard] popup writeText OK, hasFocus=', document.hasFocus())
      return true
    } catch (e) {
      console.warn('[BBQOne][clipboard] popup writeText failed:', e)
    }
  }

  // Fallback: background → offscreen execCommand
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'copy-to-os-clipboard',
      payload: { text },
    }) as { ok: boolean; error?: string } | undefined
    console.log('[BBQOne][clipboard] offscreen result:', response)
    return response?.ok ?? false
  } catch (e) {
    console.warn('[BBQOne][clipboard] offscreen fallback failed:', e)
    return false
  }
}

/**
 * Dùng trong copy event handler (Ctrl+C).
 * Ghi clipboardData cho ProseMirror + đồng thời ghi OS clipboard.
 */
export function writeToClipboardEvent(event: ClipboardEvent, text: string): boolean {
  try {
    const cd = event.clipboardData
    if (cd) {
      event.preventDefault()
      cd.clearData()
      cd.setData('text/plain', text)
    }
    void copyTextToClipboard(text)
    return true
  } catch {
    return false
  }
}
