<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { useLangStore } from '@/stores/uiLang'

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
          @keydown.stop
        >
          <template v-if="variant === 'danger'">
            <header class="retro-confirm__header">
              <h2 id="retro-confirm-title" class="retro-confirm__title">{{ headline }}</h2>
              <IconButton
                variant="default"
                :label="t('common.close')"
                @click="dismiss"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    d="M6 6l12 12M18 6L6 18"
                  />
                </svg>
              </IconButton>
            </header>

            <div class="retro-confirm__body retro-confirm__body--danger">
              <div class="retro-confirm__icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                  <polyline
                    stroke="currentColor"
                    stroke-width="1.85"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    points="3 6 5 6 21 6"
                  />
                  <path
                    stroke="currentColor"
                    stroke-width="1.85"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line
                    stroke="currentColor"
                    stroke-width="1.85"
                    stroke-linecap="round"
                    x1="10"
                    y1="11"
                    x2="10"
                    y2="17"
                  />
                  <line
                    stroke="currentColor"
                    stroke-width="1.85"
                    stroke-linecap="round"
                    x1="14"
                    y1="11"
                    x2="14"
                    y2="17"
                  />
                </svg>
              </div>
              <p v-if="title" class="retro-confirm__detail">{{ message }}</p>
            </div>
          </template>

          <template v-else>
            <p class="retro-confirm__msg">{{ message }}</p>
          </template>

          <footer class="retro-confirm__actions">
            <RetroButton variant="sm" type="button" @click="dismiss">
              {{ t('common.cancel') }}
            </RetroButton>
            <RetroButton
              variant="sm"
              type="button"
              class="retro-confirm__confirm-btn"
              :class="{ 'retro-confirm__confirm-btn--danger': variant === 'danger' }"
              @click="confirm"
            >
              {{ variant === 'danger' ? t('common.delete') : t('common.confirm') }}
            </RetroButton>
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

.retro-confirm {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  outline: none;
  box-shadow: 0 12px 48px var(--panel-ring);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.retro-confirm--danger {
  border-color: rgba(207, 34, 40, 0.28);
}

.retro-confirm__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}

.retro-confirm__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.35;
}

.retro-confirm__body--danger {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 18px 16px 8px;
  text-align: center;
}

.retro-confirm__icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-pill);
  background: var(--surface-danger-muted);
  color: var(--danger);
}

.retro-confirm__detail {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.5;
  max-width: 320px;
}

.retro-confirm__msg {
  margin: 0;
  padding: 18px 16px 8px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.5;
  text-align: center;
  white-space: pre-wrap;
}

.retro-confirm__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 14px 14px;
}

.retro-confirm__confirm-btn--danger {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
  background: var(--surface-danger-muted) !important;
}

.retro-confirm__confirm-btn--danger:hover:not(:disabled) {
  color: var(--on-accent) !important;
  background: var(--danger) !important;
  border-color: var(--danger) !important;
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
