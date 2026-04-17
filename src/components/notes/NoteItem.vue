<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { formatListUpdatedAt } from '@/utils/date'
import {
  firstLinePreview,
  highlightQueryHtml,
  noteListLabel,
  plainTextFromHtml,
} from '@/utils/text'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@/types'

const RENAME_HINT =
  'Double-click hoặc F2 để đổi tên hiển thị trong list (không đổi nội dung note)'

const props = defineProps<{
  note: Note
  selected: boolean
  renaming: boolean
  highlightQuery?: string
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
  'request-rename': [id: string]
  'rename-done': []
}>()

const notes = useNotesStore()
const draft = ref('')
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)

const label = computed(() => noteListLabel(props.note))

const titleHtml = computed(() =>
  highlightQueryHtml(label.value, props.highlightQuery ?? ''),
)

watch(
  () => props.renaming,
  async (v) => {
    if (v) {
      const t = props.note.title.trim()
      draft.value = t || firstLinePreview(plainTextFromHtml(props.note.content), 80)
      await nextTick()
      inputRef.value?.focus()
    }
  },
)

function onClick(): void {
  if (props.renaming) return
  emit('select', props.note.id)
}

function onDblClick(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  emit('request-rename', props.note.id)
}

async function commitRename(): Promise<void> {
  const raw = draft.value.trim()
  const prev = props.note.title.trim()
  if (raw !== prev) {
    try {
      await notes.updateNote(props.note.id, { title: raw })
    } catch (e) {
      console.error(e)
    }
  }
  emit('rename-done')
}

function onCancel(): void {
  emit('rename-done')
}

function onRenameKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    void commitRename()
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    onCancel()
  }
}
</script>

<template>
  <div
    class="note-item"
    :class="{ 'note-item--active': selected }"
    :title="RENAME_HINT"
  >
    <RetroInput
      v-if="renaming"
      :id="`note-rename-${note.id}`"
      ref="inputRef"
      v-model="draft"
      placeholder="tên hiển thị_"
      autocomplete="off"
      @blur="commitRename"
      @keydown="onRenameKeydown"
    />
    <template v-else>
      <div class="note-item__top">
        <button
          type="button"
          class="note-item__main"
          @click="onClick"
          @dblclick="onDblClick"
        >
          <template v-if="highlightQuery?.trim()">
            <span class="note-item__title" v-html="titleHtml" />
          </template>
          <template v-else>
            &gt; {{ label }}
          </template>
        </button>
        <RetroButton
          variant="sm"
          type="button"
          class="note-item__del"
          @click.stop="emit('delete', note.id)"
        >
          [DEL]
        </RetroButton>
      </div>
      <div class="note-item__foot">
        {{ formatListUpdatedAt(note.updated_at) }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.note-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  border: 1px solid transparent;
  margin-bottom: 4px;
}

.note-item__top {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.note-item--active {
  border-color: var(--accent);
}

/* Đồng bộ với .folder-item: hover = viền nhạt + chữ đậm hơn */
.note-item:hover:not(.note-item--active) {
  border-color: var(--border);
}

.note-item__main {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.note-item:hover .note-item__main {
  color: var(--text-primary);
}

.note-item--active .note-item__main {
  color: var(--accent);
}

.note-item__main:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.note-item__title :deep(.search-hit) {
  background: var(--search-hit-bg);
  color: var(--text-primary);
}

.note-item__del {
  flex: 0 0 auto;
}

.note-item__del:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.note-item__foot {
  align-self: flex-end;
  font-size: 10px;
  line-height: 1.2;
  color: var(--text-muted);
}
</style>
