import { onMounted, onUnmounted } from 'vue'
import { requestBackgroundFlushPendingDeletes } from '@/services/pendingDeleteCommit.service'
import { useUndoToastStore } from '@/stores/undoToast'

/**
 * Popup MV3: đóng UI = hết timer undo → commit xóa thật.
 * Queue trong chrome.storage.local xử lý khi context bị kill giữa chừng.
 */
export function useCommitPendingDeletesOnClose(): void {
  const undoToast = useUndoToastStore()
  let flushing = false

  async function flushPendingDeletes(): Promise<void> {
    if (flushing) return
    flushing = true
    try {
      await undoToast.commitAllPending()
    } catch (e) {
      console.warn('[BBQOne] commitAllPending on close failed', e)
    } finally {
      flushing = false
    }
  }

  function onPopupHide(): void {
    requestBackgroundFlushPendingDeletes()
    void flushPendingDeletes()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') onPopupHide()
  }

  onMounted(() => {
    window.addEventListener('pagehide', onPopupHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    window.removeEventListener('pagehide', onPopupHide)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void flushPendingDeletes()
  })
}
