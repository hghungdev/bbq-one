<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { useFoldersStore } from '@/stores/folders'
import { useLangStore } from '@/stores/uiLang'

const props = defineProps<{
  open: boolean
  noteId: string | null
  currentFolderId: string | null
  busy?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  close: []
  pick: [folderId: string]
}>()

const folders = useFoldersStore()
const { t } = useLangStore()
const panelRef = ref<HTMLElement | null>(null)

const targets = computed(() =>
  folders.folders
    .filter((f) => !f.is_secure)
    .map((f) => ({
      id: f.id,
      name: f.name,
      isCurrent: f.id === props.currentFolderId,
    })),
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    panelRef.value?.focus()
  },
)

function onBackdropClick(): void {
  if (props.busy) return
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !props.busy) {
    e.preventDefault()
    emit('close')
  }
}

function onPick(folderId: string): void {
  if (props.busy) return
  emit('pick', folderId)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="move-note-fade">
      <div
        v-if="open"
        class="move-note__backdrop bbqone-overlay"
        role="presentation"
        @click.self="onBackdropClick"
      >
        <div
          ref="panelRef"
          class="move-note"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          @keydown="onKeydown"
          @click.stop
        >
          <header class="move-note__header">
            <h2 class="move-note__title">{{ t('note.moveModalTitle') }}</h2>
            <IconButton
              variant="default"
              :label="t('common.close')"
              :disabled="busy"
              @click="emit('close')"
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

          <p class="move-note__hint">{{ t('note.moveModalHint') }}</p>
          <p v-if="error" class="move-note__error" role="alert">{{ error }}</p>

          <ul v-if="targets.length > 0" class="move-note__list" role="listbox">
            <li v-for="f in targets" :key="f.id" role="none">
              <button
                type="button"
                class="move-note__option"
                :class="{ 'move-note__option--current': f.isCurrent }"
                role="option"
                :aria-selected="f.isCurrent"
                :disabled="busy || f.isCurrent"
                @click="onPick(f.id)"
              >
                <span class="move-note__option-name">{{ f.name }}</span>
                <span v-if="f.isCurrent" class="move-note__option-badge">
                  {{ t('note.moveCurrentFolder') }}
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="move-note__empty">{{ t('note.moveNoTargets') }}</p>

          <div class="move-note__actions">
            <RetroButton variant="sm" type="button" :disabled="busy" @click="emit('close')">
              {{ t('calendar.modal.btn.cancel') }}
            </RetroButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.move-note__backdrop {
  position: fixed;
  inset: 0;
  z-index: 8600;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

.move-note {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  box-shadow: 0 12px 48px var(--panel-ring);
  overflow: hidden;
  outline: none;
}

.move-note__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 10px 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.move-note__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.35;
}

.move-note__hint {
  margin: 10px 14px 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.4;
}

.move-note__error {
  margin: 8px 14px 0;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--danger) 8%, var(--bg-panel));
}

.move-note__list {
  list-style: none;
  margin: 10px 14px 0;
  padding: 0;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
}

.move-note__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.move-note__option:last-child {
  border-bottom: none;
}

.move-note__option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.move-note__option-badge {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--text-muted);
}

.move-note__option:hover:not(:disabled) {
  background: var(--surface-accent-muted);
  color: var(--accent);
}

.move-note__option:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.move-note__option:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.move-note__option--current {
  background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.move-note__empty {
  margin: 12px 14px 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.move-note__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 12px 14px 14px;
}

.move-note-fade-enter-active,
.move-note-fade-leave-active {
  transition: opacity 0.14s ease;
}

.move-note-fade-enter-from,
.move-note-fade-leave-to {
  opacity: 0;
}
</style>
