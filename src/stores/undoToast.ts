import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

type UndoToastAction = {
  id: string
  message: string
  undo: () => void | Promise<void>
  commit: () => void | Promise<void>
  durationMs?: number
}

type UndoToastItem = {
  id: string
  message: string
  expiresAt: number
}

type PendingUndoAction = {
  undo: () => void | Promise<void>
  commit: () => void | Promise<void>
}

const DEFAULT_UNDO_MS = 5_000

export const useUndoToastStore = defineStore('undoToast', () => {
  const items = ref<UndoToastItem[]>([])
  const visible = computed(() => items.value.length > 0)
  const pendingActions = new Map<string, PendingUndoAction>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function clearTimer(id: string): void {
    const timer = timers.get(id)
    if (!timer) return
    clearTimeout(timer)
    timers.delete(id)
  }

  function removeItem(id: string): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  async function commit(id: string): Promise<void> {
    const action = pendingActions.get(id)
    clearTimer(id)
    pendingActions.delete(id)
    removeItem(id)
    if (!action) return
    await action.commit()
  }

  async function schedule(action: UndoToastAction): Promise<void> {
    if (pendingActions.has(action.id)) {
      await commit(action.id)
    }

    const durationMs = action.durationMs ?? DEFAULT_UNDO_MS
    pendingActions.set(action.id, {
      undo: action.undo,
      commit: action.commit,
    })
    items.value = [
      ...items.value,
      {
        id: action.id,
        message: action.message,
        expiresAt: Date.now() + durationMs,
      },
    ]
    timers.set(action.id, setTimeout(() => {
      void commit(action.id).catch((error) => {
        console.error('[BBQOne] Undo toast commit failed', error)
      })
    }, durationMs))
  }

  async function undo(id: string): Promise<void> {
    const action = pendingActions.get(id)
    clearTimer(id)
    pendingActions.delete(id)
    removeItem(id)
    if (!action) return
    await action.undo()
  }

  async function dismiss(id: string): Promise<void> {
    await commit(id)
  }

  return {
    items,
    visible,
    schedule,
    undo,
    dismiss,
  }
})
