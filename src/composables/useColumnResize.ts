import { onMounted, onUnmounted, ref } from 'vue'

const STORAGE_W2 = 'bbqone_col_w2'
const DEFAULT_W2 = 200
const MIN_W2 = 120
/** Trần cố định (px) — cột notes không bị kéo quá rộng. */
const MAX_W2_ABS = 480

function getMaxW2(): number {
  return Math.min(MAX_W2_ABS, Math.floor(window.innerWidth * 0.42))
}

function clampW2(w: number): number {
  return Math.min(getMaxW2(), Math.max(MIN_W2, w))
}

export function useColumnResize(): {
  colW2: ReturnType<typeof ref<number>>
  onResizeStart: (event: MouseEvent) => void
} {
  const colW2 = ref(DEFAULT_W2)

  let dragging = false
  let startX = 0
  let startW2 = 0

  function clampToViewport(): void {
    colW2.value = clampW2(colW2.value)
  }

  async function loadWidths(): Promise<void> {
    const { [STORAGE_W2]: w2 } = await chrome.storage.local.get([STORAGE_W2])
    if (typeof w2 === 'number' && w2 >= MIN_W2) colW2.value = clampW2(w2)
  }

  async function saveWidths(): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_W2]: colW2.value,
    })
  }

  function onMouseMove(e: MouseEvent): void {
    if (!dragging) return
    const dx = e.clientX - startX
    colW2.value = clampW2(startW2 + dx)
  }

  function onMouseUp(): void {
    if (!dragging) return
    dragging = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    void saveWidths()
  }

  function onResizeStart(event: MouseEvent): void {
    event.preventDefault()
    dragging = true
    startX = event.clientX
    startW2 = colW2.value
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  onMounted(() => {
    void loadWidths()
    window.addEventListener('resize', clampToViewport)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', clampToViewport)
  })

  return { colW2, onResizeStart }
}
