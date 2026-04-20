import { createApp, h, type App } from 'vue'
import TranslatePopup from './TranslatePopup.vue'
import popupStyles from './popup-styles.css?inline'

const HOST_ID = '__bbq_one_popup_host__'

export interface PopupShowArgs {
  text: string
  rect: DOMRect
}

export class PopupHost {
  private host: HTMLElement | null = null
  private mountPoint: HTMLElement | null = null
  private app: App | null = null
  /** Đóng popup khi click ra ngoài (capture trên document). */
  private boundOutsideClose: ((e: PointerEvent) => void) | null = null

  show(args: PopupShowArgs): void {
    this.detachOutsideClose()
    this.ensureHost()
    if (!this.mountPoint) return

    // Unmount previous app before remounting with new props
    if (this.app) {
      this.app.unmount()
      this.app = null
    }

    if (this.host) this.host.style.display = 'block'

    this.app = createApp({
      render: () =>
        h(TranslatePopup, {
          ...args,
          onClose: () => { this.hide() },
        }),
    })
    this.app.mount(this.mountPoint)

    this.attachOutsideClose()
  }

  hide(): void {
    this.detachOutsideClose()
    if (this.app) {
      this.app.unmount()
      this.app = null
    }
    if (this.host) this.host.style.display = 'none'
  }

  private attachOutsideClose(): void {
    const handler = (e: PointerEvent): void => {
      if (!this.host || this.host.style.display === 'none') return
      const path = e.composedPath()
      if (path.includes(this.host)) return
      this.hide()
    }
    this.boundOutsideClose = handler
    // Tránh bắt cùng sự kiện với click vừa mở popup (chuỗi đóng ngay).
    window.setTimeout(() => {
      if (!this.boundOutsideClose) return
      document.addEventListener('pointerdown', this.boundOutsideClose, true)
    }, 0)
  }

  private detachOutsideClose(): void {
    if (this.boundOutsideClose) {
      document.removeEventListener('pointerdown', this.boundOutsideClose, true)
      this.boundOutsideClose = null
    }
  }

  private ensureHost(): void {
    if (this.host) return

    // Reuse existing host if present (hot-reload or re-inject scenario)
    const existing = document.getElementById(HOST_ID)
    if (existing) {
      existing.remove()
    }

    const host = document.createElement('div')
    host.id = HOST_ID
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
      overflow: 'visible',
    } satisfies Partial<CSSStyleDeclaration>)

    const shadow = host.attachShadow({ mode: 'open' })

    // Inject isolated styles
    const styleEl = document.createElement('style')
    styleEl.textContent = popupStyles
    shadow.appendChild(styleEl)

    // Mount point — pointer events re-enabled inside shadow
    const mount = document.createElement('div')
    mount.className = 'bbq-shadow-root'
    Object.assign(mount.style, {
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>)
    shadow.appendChild(mount)

    document.body.appendChild(host)

    this.host = host
    this.mountPoint = mount
  }
}
