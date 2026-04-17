import { onMounted, onUnmounted, ref } from 'vue'

const STORAGE_W1 = 'bbqnote_col_w1'
const STORAGE_W2 = 'bbqnote_col_w2'
const DEFAULT_W1 = 120
const DEFAULT_W2 = 200
const MIN_W1 = 80
const MIN_W2 = 120
/** Trần cố định (px) — cột folder không chiếm gần hết popup. */
const MAX_W1_ABS = 360
/** Trần cố định (px) — cột notes không bị kéo quá rộng. */
const MAX_W2_ABS = 480

function getMaxW1(): number {
  /* ~40% viewport, không vượt MAX_W1_ABS; chừa chỗ cho notes + editor. */
  return Math.min(MAX_W1_ABS, Math.floor(window.innerWidth * 0.4))
}

function getMaxW2(): number {
  return Math.min(MAX_W2_ABS, Math.floor(window.innerWidth * 0.42))
}

function clampW1(w: number): number {
  return Math.min(getMaxW1(), Math.max(MIN_W1, w))
}

function clampW2(w: number): number {
  return Math.min(getMaxW2(), Math.max(MIN_W2, w))
}

export function useColumnResize(): {
  colW1: ReturnType<typeof ref<number>>
  colW2: ReturnType<typeof ref<number>>
  onResizeStart: (which: 1 | 2, event: MouseEvent) => void
} {
  const colW1 = ref(DEFAULT_W1)
  const colW2 = ref(DEFAULT_W2)

  let dragging: 1 | 2 | null = null
  let startX = 0
  let startW1 = 0
  let startW2 = 0

  function clampBothToViewport(): void {
    colW1.value = clampW1(colW1.value)
    colW2.value = clampW2(colW2.value)
  }

  async function loadWidths(): Promise<void> {
    const { [STORAGE_W1]: w1, [STORAGE_W2]: w2 } = await chrome.storage.local.get([
      STORAGE_W1,
      STORAGE_W2,
    ])
    if (typeof w1 === 'number' && w1 >= MIN_W1) colW1.value = clampW1(w1)
    if (typeof w2 === 'number' && w2 >= MIN_W2) colW2.value = clampW2(w2)
  }

  async function saveWidths(): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_W1]: colW1.value,
      [STORAGE_W2]: colW2.value,
    })
  }

  function onMouseMove(e: MouseEvent): void {
    if (dragging === null) return
    const dx = e.clientX - startX
    if (dragging === 1) {
      colW1.value = clampW1(startW1 + dx)
    } else {
      colW2.value = clampW2(startW2 + dx)
    }
  }

  function onMouseUp(): void {
    if (dragging === null) return
    dragging = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    void saveWidths()
  }

  function onResizeStart(which: 1 | 2, event: MouseEvent): void {
    event.preventDefault()
    dragging = which
    startX = event.clientX
    startW1 = colW1.value
    startW2 = colW2.value
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  onMounted(() => {
    void loadWidths()
    window.addEventListener('resize', clampBothToViewport)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', clampBothToViewport)
  })

  return { colW1, colW2, onResizeStart }
}
