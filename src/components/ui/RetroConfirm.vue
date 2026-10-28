<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useLangStore } from '@/stores/uiLang'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{
  open: boolean
  /** Nội dung chính hoặc mô tả phụ (khi có title). */
  message: string
  /** Tiêu đề dialog — danger nên truyền riêng. */
  title?: string
  variant?: 'default' | 'danger'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

const { t } = useLangStore()

const panelRef = ref<HTMLElement | null>(null)

const headline = computed(() => props.title ?? props.message)

function dismiss(): void {
  emit('update:open', false)
  emit('cancel')
}

function confirm(): void {
  emit('update:open', false)
  emit('confirm')
}

function onKeydown(e: KeyboardEvent): void {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    dismiss()
  }
}

/**
 * C12: phím trong panel không lan xuống hộp thoại bên dưới (vd Esc của hộp Sửa sự kiện trên window) —
 * vì vậy Esc phải được xử lý NGAY TẠI ĐÂY, trình nghe trên window không bao giờ nhận được nó.
 */
function onPanelKeydown(e: KeyboardEvent): void {
  e.stopPropagation()
  if (e.key === 'Escape') {
    e.preventDefault()
    dismiss()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      queueMicrotask(() => panelRef.value?.focus())
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="retro-confirm-fade">
      <div
        v-if="open"
        class="retro-confirm__backdrop bbqone-overlay"
        role="presentation"
        @click.self="dismiss"
      >
        <div
          ref="panelRef"
          class="retro-confirm"
          :class="{ 'retro-confirm--danger': variant === 'danger' }"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="variant === 'danger' ? 'retro-confirm-title' : undefined"
          tabindex="-1"
          @keydown="onPanelKeydown"
        >
          <template v-if="variant === 'danger'">
            <header class="retro-confirm__header">
              <h2 id="retro-confirm-title" class="retro-confirm__title">{{ headline }}</h2>
              <IconButton
                variant="default"
                :label="t('common.close')"
                @click="dismiss"
              >
                <AppIcon name="close" :size="18" />
              </IconButton>
            </header>

            <div class="retro-confirm__body retro-confirm__body--danger">
              <div class="retro-confirm__icon-badge" aria-hidden="true">
                <AppIcon name="trash" :size="22" />
              </div>
              <p v-if="title" class="retro-confirm__detail">{{ message }}</p>
            </div>
          </template>

          <template v-else>
            <p class="retro-confirm__msg">{{ message }}</p>
          </template>

          <!-- U15: quyết định = chữ (quy tắc 4) — "Hủy" nút chữ, "Xóa" nút đặc màu đỏ ghi rõ bằng chữ. -->
          <footer class="retro-confirm__actions">
            <button type="button" class="ds-text-action ds-text-action--muted" @click="dismiss">
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="ds-primary retro-confirm__confirm-btn"
              :class="{ 'retro-confirm__confirm-btn--danger': variant === 'danger' }"
              @click="confirm"
            >
              {{ variant === 'danger' ? t('common.delete') : t('common.confirm') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.retro-confirm__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

/* U15 (ADN popover): một tấm phẳng như hộp thoại sự kiện — bỏ nền gradient, viền đỏ, hộp lồng hộp. */
.retro-confirm {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 380px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  box-shadow: 0 18px 48px var(--panel-ring);
  outline: none;
}

.retro-confirm__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 12px 0 20px;
}

.retro-confirm__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-primary);
}

.retro-confirm__body--danger {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 24px 4px;
  text-align: center;
}

.retro-confirm__icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.retro-confirm__detail {
  max-width: 320px;
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-secondary);
}

.retro-confirm__msg {
  margin: 0;
  padding: 18px 20px 4px;
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.retro-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 14px 16px 16px;
}

.retro-confirm__confirm-btn--danger {
  border-color: var(--danger);
  background: var(--danger);
  color: #fff;
}

.retro-confirm__confirm-btn--danger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--danger) 85%, #000);
  background: color-mix(in srgb, var(--danger) 85%, #000);
}

.retro-confirm-fade-enter-active,
.retro-confirm-fade-leave-active {
  transition: opacity 0.15s ease;
}

.retro-confirm-fade-enter-from,
.retro-confirm-fade-leave-to {
  opacity: 0;
}
</style>
