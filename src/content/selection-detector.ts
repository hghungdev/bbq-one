export interface TextSelection {
  text: string
  rect: DOMRect
}

/** Rect tại đoạn chữ cuối của selection — tránh getBoundingClientRect() multi-line làm rect.right = mép cột. */
function anchorRectForRangeEnd(range: Range): DOMRect {
  const rects = range.getClientRects()
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i]
    if (r.width > 0 && r.height > 0) {
      return r
    }
  }
  return range.getBoundingClientRect()
}

export class SelectionDetector {
  private handlers: Array<(s: TextSelection | null) => void> = []
  private debounceTimer: ReturnType<typeof window.setTimeout> | null = null

  constructor() {
    document.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('selectionchange', this.onDocSelectionChange)
    document.addEventListener('touchend', this.onTouchEnd, { passive: true })
  }

  onSelectionChange(handler: (s: TextSelection | null) => void): void {
    this.handlers.push(handler)
  }

  destroy(): void {
    document.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('selectionchange', this.onDocSelectionChange)
    document.removeEventListener('touchend', this.onTouchEnd)
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
  }

  private onMouseUp = (): void => {
    this.debounce(() => { this.emit() })
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    // Trigger only on keyboard selection (shift+arrow keys)
    if (e.shiftKey) this.debounce(() => { this.emit() })
  }

  /** Bắt chọn bằng chuột / Ctrl+A / double-click từ — mouseup không đủ một mình. */
  private onDocSelectionChange = (): void => {
    this.debounce(() => { this.emit() })
  }

  private onTouchEnd = (): void => {
    this.debounce(() => { this.emit() })
  }

  private debounce(fn: () => void): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
    this.debounceTimer = window.setTimeout(fn, 200)
  }

  private emit(): void {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      this.handlers.forEach((h) => { h(null) })
      return
    }
    const text = sel.toString().trim()
    // Phase 1: cap at 500 chars — avoid massive selections
    if (!text || text.length > 500) {
      this.handlers.forEach((h) => { h(null) })
      return
    }
    const range = sel.getRangeAt(0)
    // getBoundingClientRect() trên multi-line trả về box rất rộng (rect.right ≈ mép cột).
    // Neo icon/popup vào đoạn chữ *cuối* — getClientRects()[last].
    const rect = anchorRectForRangeEnd(range)
    this.handlers.forEach((h) => { h({ text, rect }) })
  }
}
