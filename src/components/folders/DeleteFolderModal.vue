<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useLangStore } from '@/stores/uiLang'

const props = defineProps<{
  open: boolean
  folderName: string
  noteCount: number
  submitting?: boolean
  serverError?: string
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { t } = useLangStore()
const confirmText = ref('')
const panelRef = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)

const isSubmitting = computed(() => props.submitting ?? false)

const nameMatches = computed(() => confirmText.value === props.folderName)

const canSubmit = computed(() => nameMatches.value && !isSubmitting.value)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      confirmText.value = ''
      await nextTick()
      panelRef.value?.focus()
      inputRef.value?.focus()
    }
  },
)

function onPanelKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !isSubmitting.value) {
    e.preventDefault()
    emit('close')
  }
}

function submit(): void {
  if (!canSubmit.value) return
  emit('confirm')
}

function onBackdropClick(): void {
  if (isSubmitting.value) return
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="delete-folder-modal__backdrop bbqone-overlay"
      role="presentation"
      @click.self="onBackdropClick"
    >
      <div
        ref="panelRef"
        class="delete-folder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-folder-title"
        tabindex="-1"
        @keydown="onPanelKeydown"
      >
        <p id="delete-folder-title" class="delete-folder-modal__title">
          {{ t('deleteFolder.title') }}
        </p>
        <p class="delete-folder-modal__warn">
          {{ t('deleteFolder.warnPre') }}
          <strong class="delete-folder-modal__mono">{{ folderName }}</strong>
          {{ t('deleteFolder.warnMid') }}
          <strong>{{ noteCount }}</strong>
          {{ noteCount === 1 ? t('deleteFolder.warnNote') : t('deleteFolder.warnNotes') }}
          {{ t('deleteFolder.warnPost') }}
        </p>
        <p class="delete-folder-modal__instr">
          {{ t('deleteFolder.instrPre') }}
          <strong class="delete-folder-modal__mono">{{ folderName }}</strong>
          {{ t('deleteFolder.instrPost') }}
        </p>
        <p v-if="serverError" class="delete-folder-modal__err" role="alert">
          {{ serverError }}
        </p>
        <div class="delete-folder-modal__input-wrap">
          <RetroInput
            id="delete-folder-confirm-name"
            ref="inputRef"
            v-model="confirmText"
            type="text"
            autocomplete="off"
            :disabled="isSubmitting"
            :placeholder="folderName"
            :aria-label="t('deleteFolder.instrPre') + ' ' + folderName + ' ' + t('deleteFolder.instrPost')"
            @keydown.enter.prevent="submit"
          />
        </div>
        <div class="delete-folder-modal__actions">
          <RetroButton
            variant="sm"
            type="button"
            :disabled="isSubmitting"
            @click="emit('close')"
          >
            {{ t('common.cancel') }}
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            class="delete-folder-modal__delete-btn"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ t('common.delete') }}
          </RetroButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.delete-folder-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

.delete-folder-modal {
  width: 100%;
  max-width: 400px;
  border: 1px solid rgba(207, 34, 40, 0.28);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--danger) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  padding: 12px;
  outline: none;
  box-shadow: 0 12px 48px var(--panel-ring);
}

.delete-folder-modal__title {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.012em;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
}

.delete-folder-modal__warn {
  margin: 0 0 12px;
  padding: 9px 10px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.45;
  border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.delete-folder-modal__instr {
  margin: 0 0 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.4;
}

.delete-folder-modal__mono {
  font-family: ui-monospace, monospace;
  color: var(--text-primary);
}

.delete-folder-modal__err {
  margin: 0 0 10px;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.delete-folder-modal__input-wrap :deep(.retro-input) {
  border-color: var(--danger);
}

.delete-folder-modal__input-wrap :deep(.retro-input:focus),
.delete-folder-modal__input-wrap :deep(.retro-input:focus-visible) {
  border-color: var(--danger);
  outline-color: var(--danger);
}

.delete-folder-modal__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 14px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
}

.delete-folder-modal__delete-btn {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
  background: var(--surface-danger-muted) !important;
}

.delete-folder-modal__delete-btn:hover:not(:disabled) {
  color: var(--on-accent) !important;
  background: var(--danger) !important;
  border-color: var(--danger) !important;
}

.delete-folder-modal__delete-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
