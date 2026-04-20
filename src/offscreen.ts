/**
 * Offscreen document — clipboard writer.
 *
 * Chrome offscreen CLIPBOARD reason cho phép dùng document.execCommand('copy').
 * navigator.clipboard.writeText() KHÔNG hoạt động trong offscreen vì thiếu user gesture.
 * execCommand('copy') với textarea trick hoạt động đúng trong offscreen context.
 */
chrome.runtime.onMessage.addListener(
  (msg: unknown, _sender, sendResponse: (r: { ok: boolean; error?: string }) => void) => {
    if (
      typeof msg !== 'object' ||
      msg === null ||
      (msg as Record<string, unknown>).type !== 'offscreen-copy'
    ) {
      return false
    }

    const text = (msg as { type: string; text: string }).text

    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText =
        'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;border:none;outline:none;'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      sendResponse({ ok })
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }

    return false
  },
)
