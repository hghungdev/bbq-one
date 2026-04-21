/**
 * Small floating icon that appears near text selection.
 * Pure DOM — no Vue, keeps content script bundle small.
 * fixed + tọa độ viewport (getClientRects) — không cộng scroll; tránh icon “mất” khi đã cuộn.
 */
const ICON_ID = '__bbq_one_translate_icon__'
const ICON_PX = 28
const ICON_GAP = 4
const VIEW_PAD = 4

export class TriggerIcon {
  private el: HTMLElement | null = null
  private clickHandler: (() => void) | null = null

  showNear(rect: DOMRect): void {
    this.ensureElement()
    if (!this.el) return

    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = rect.right - ICON_PX
    if (left < VIEW_PAD) left = VIEW_PAD
    if (left + ICON_PX > vw - VIEW_PAD) left = vw - ICON_PX - VIEW_PAD

    let top = rect.bottom + ICON_GAP
    if (top + ICON_PX > vh - VIEW_PAD) {
      const above = rect.top - ICON_PX - ICON_GAP
      top = above >= VIEW_PAD ? above : Math.max(VIEW_PAD, vh - ICON_PX - VIEW_PAD)
    }
    if (top < VIEW_PAD) top = VIEW_PAD

    this.el.style.top = `${top}px`
    this.el.style.left = `${left}px`
    this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }

  onClick(handler: () => void): void {
    this.clickHandler = handler
  }

  destroy(): void {
    this.el?.remove()
    this.el = null
    this.clickHandler = null
  }

  private ensureElement(): void {
    if (this.el) return
    // Reuse existing element if page already has one (e.g. after SPA navigation)
    const existing = document.getElementById(ICON_ID)
    if (existing instanceof HTMLElement) {
      this.el = existing
      return
    }
    const el = document.createElement('div')
    el.id = ICON_ID
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', 'Translate with BBQOne')
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: '2147483647',
      width: '28px',
      height: '28px',
      padding: '0',
      boxSizing: 'border-box',
      background: 'transparent',
      border: 'none',
      borderRadius: '0',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      userSelect: 'none',
      overflow: 'visible',
    } satisfies Partial<CSSStyleDeclaration>)
    const img = document.createElement('img')
    img.src = chrome.runtime.getURL('bbq_one-final.png')
    img.alt = ''
    img.draggable = false
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      display: 'block',
      pointerEvents: 'none',
      // Viền nhẹ quanh logo (không hộp đen), dễ nhìn trên nền sáng/tối
      filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
    })
    el.appendChild(img)
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.clickHandler?.()
    })
    document.body.appendChild(el)
    this.el = el
  }
}
