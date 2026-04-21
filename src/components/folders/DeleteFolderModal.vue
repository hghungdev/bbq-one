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
        <div class="delete-folder-modal__actions">
          <RetroButton
            variant="sm"
            type="button"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ t('deleteFolder.confirmBtn') }}
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            :disabled="isSubmitting"
            @click="emit('close')"
          >
            {{ t('deleteFolder.cancelBtn') }}
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
  background: rgba(13, 13, 6, 0.88);
  padding: 16px;
}

.delete-folder-modal {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 16px 14px 14px;
  outline: none;
}

.delete-folder-modal__title {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  letter-spacing: 0.08em;
}

.delete-folder-modal__warn {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.45;
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
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.delete-folder-modal__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
