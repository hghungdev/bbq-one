<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useLangStore } from '@/stores/uiLang'

export interface RestorePreview {
  fileName: string
  /** Đã định dạng theo ngôn ngữ giao diện. */
  createdLabel: string
  inFileLabel: string
  willDeleteLabel: string
  /** Dòng sai / trùng / mồ côi / vượt 6 sự kiện mỗi ngày. */
  skipped: number
  unsafeBookmarks: number
}

/**
 * B1: xem trước khi khôi phục — xác nhận LẦN 1 ("Thay toàn bộ…"); lần 2 là RetroConfirm đỏ ở nơi gọi.
 * U31: bấm nền không đóng; ✕ / Esc đóng (trừ khi đang khôi phục).
 */
const props = defineProps<{
  open: boolean
  preview: RestorePreview | null
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  replace: []
}>()

const { t } = useLangStore()
const panelRef = ref<HTMLElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    panelRef.value?.focus()
  },
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !props.busy) {
    e.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && preview"
      class="restore-dialog__backdrop bbqone-overlay"
      role="presentation"
      @mousedown.self.prevent
    >
      <div
        ref="panelRef"
        class="restore-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bbqone-restore-title"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header class="restore-dialog__header">
          <h2 id="bbqone-restore-title" class="restore-dialog__title">{{ t('backup.preview.title') }}</h2>
          <IconButton variant="default" :label="t('common.close')" :disabled="busy" @click="emit('close')">
            <AppIcon name="close" :size="18" />
          </IconButton>
        </header>

        <div class="restore-dialog__body">
          <p class="restore-dialog__file" :title="preview.fileName">{{ preview.fileName }}</p>
          <p class="restore-dialog__meta">{{ preview.createdLabel }}</p>

          <div class="restore-dialog__block">
            <span class="restore-dialog__label">{{ t('backup.preview.inFile') }}</span>
            <span class="restore-dialog__counts">{{ preview.inFileLabel }}</span>
          </div>
          <div class="restore-dialog__block restore-dialog__block--danger">
            <span class="restore-dialog__label">{{ t('backup.preview.willDelete') }}</span>
            <span class="restore-dialog__counts">{{ preview.willDeleteLabel }}</span>
          </div>

          <p v-if="preview.skipped > 0" class="restore-dialog__note">
            <AppIcon name="alert" :size="14" />
            {{ t('backup.preview.skipped', { n: preview.skipped }) }}
          </p>
          <p v-if="preview.unsafeBookmarks > 0" class="restore-dialog__note restore-dialog__note--danger">
            <AppIcon name="alert" :size="14" />
            {{ t('backup.preview.unsafe', { n: preview.unsafeBookmarks }) }}
          </p>
          <p class="restore-dialog__safety">{{ t('backup.preview.safety') }}</p>
        </div>

        <footer class="restore-dialog__actions">
          <button type="button" class="ds-primary restore-dialog__replace" :disabled="busy" @click="emit('replace')">
            {{ t('backup.preview.replace') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.restore-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 8600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--overlay-scrim);
}

.restore-dialog {
  width: 100%;
  max-width: 420px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  box-shadow: 0 12px 48px var(--panel-ring);
  outline: none;
}

.restore-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 4px 18px;
}

.restore-dialog__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
}

.restore-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 18px 12px;
}

.restore-dialog__file {
  margin: 0;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.restore-dialog__meta {
  margin: -4px 0 2px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.restore-dialog__block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 62%, transparent);
}

.restore-dialog__block--danger {
  border-color: color-mix(in srgb, var(--danger) 34%, var(--border));
  background: var(--surface-danger-muted);
}

.restore-dialog__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.restore-dialog__counts {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.restore-dialog__note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.restore-dialog__note--danger {
  color: var(--danger);
}

.restore-dialog__safety {
  margin: 2px 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.restore-dialog__actions {
  display: flex;
  justify-content: flex-end;
  padding: 10px 18px 16px;
  border-top: 1px solid var(--border);
}

.restore-dialog__replace {
  background: var(--danger);
  border-color: var(--danger);
}

.restore-dialog__replace:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger) 88%, #000);
}
</style>
