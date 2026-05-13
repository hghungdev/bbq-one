<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useLangStore } from '@/stores/uiLang'

const props = defineProps<{
  open: boolean
  backupLabel: string
  submitting?: boolean
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

const nameMatches = computed(() => confirmText.value === props.backupLabel)

const canSubmit = computed(() => nameMatches.value && props.backupLabel.length > 0 && !isSubmitting.value)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      confirmText.value = props.backupLabel
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
      class="delete-backup-modal__backdrop bbqone-overlay"
      role="presentation"
      @click.self="onBackdropClick"
    >
      <div
        ref="panelRef"
        class="delete-backup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-backup-title"
        tabindex="-1"
        @keydown="onPanelKeydown"
      >
        <p id="delete-backup-title" class="delete-backup-modal__title">
          {{ t('bookmark.deleteBackup.title') }}
        </p>
        <p class="delete-backup-modal__warn">
          {{ t('bookmark.deleteBackup.warn', { label: backupLabel }) }}
        </p>
        <p class="delete-backup-modal__instr">
          {{ t('bookmark.deleteBackup.instrPre') }}
          <strong class="delete-backup-modal__mono">{{ backupLabel }}</strong>
          {{ t('bookmark.deleteBackup.instrPost') }}
        </p>
        <RetroInput
          id="delete-backup-confirm-name"
          ref="inputRef"
          v-model="confirmText"
          type="text"
          autocomplete="off"
          :disabled="isSubmitting"
          :placeholder="backupLabel"
          :aria-label="t('bookmark.deleteBackup.instrPre') + ' ' + backupLabel + ' ' + t('bookmark.deleteBackup.instrPost')"
          @keydown.enter.prevent="submit"
        />
        <div class="delete-backup-modal__actions">
          <RetroButton
            variant="sm"
            type="button"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ t('bookmark.deleteBackup.confirmBtn') }}
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            :disabled="isSubmitting"
            @click="emit('close')"
          >
            {{ t('bookmark.deleteBackup.cancelBtn') }}
          </RetroButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.delete-backup-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

.delete-backup-modal {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 16px 14px 14px;
  outline: none;
}

.delete-backup-modal__title {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  letter-spacing: 0.08em;
}

.delete-backup-modal__warn {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.45;
}

.delete-backup-modal__instr {
  margin: 0 0 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.4;
}

.delete-backup-modal__mono {
  font-family: ui-monospace, monospace;
  color: var(--text-primary);
}

.delete-backup-modal__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
