<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { formatListUpdatedAt } from '@/utils/date'
import {
  firstLinePreview,
  highlightQueryHtml,
  noteListLabel,
  noteSearchBreadcrumbPath,
  plainTextFromHtml,
  searchBodySnippetPlain,
} from '@/utils/text'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@/types'

const RENAME_HINT =
  'Double-click hoặc F2 để đổi tên hiển thị trong list (không đổi nội dung note)'

const props = defineProps<{
  note: Note
  selected: boolean
  renaming: boolean
  /** Search global: hiện `Folder > note` thay vì chỉ tên note. */
  showFolderPath?: boolean
  highlightQuery?: string
  /** Ẩn nút xóa trên list kết quả search (giống bookmark global search). */
  hideDelete?: boolean
}>()

const emit = defineEmits<{
  delete: [id: string]
  'request-rename': [id: string]
  'rename-done': []
}>()

const notes = useNotesStore()
const folders = useFoldersStore()

const draft = ref('')
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)

const bodies = computed(() => notes.bodiesForNote(props.note.id))

const label = computed(() => noteListLabel(props.note, bodies.value))

const titleHtml = computed(() =>
  highlightQueryHtml(label.value, props.highlightQuery ?? ''),
)

const folderNameForNote = computed((): string | null => {
  const id = props.note.folder_id
  if (!id) return null
  return folders.folders.find((f) => f.id === id)?.name ?? null
})

const searchBreadcrumbPlain = computed(() =>
  noteSearchBreadcrumbPath(folderNameForNote.value, label.value),
)

const searchBreadcrumbHtml = computed(() =>
  highlightQueryHtml(searchBreadcrumbPlain.value, props.highlightQuery ?? ''),
)

const searchSnippetHtml = computed((): string => {
  if (!props.showFolderPath || !props.highlightQuery?.trim()) return ''
  const plain = searchBodySnippetPlain(bodies.value, props.highlightQuery)
  if (!plain) return ''
  return highlightQueryHtml(plain, props.highlightQuery)
})

watch(
  () => props.renaming,
  async (v) => {
    if (v) {
      const t = props.note.title.trim()
      const firstPlain = plainTextFromHtml(
        bodies.value[0]?.content ?? '',
      )
      draft.value = t || firstLinePreview(firstPlain, 80)
      await nextTick()
      inputRef.value?.focus()
    }
  },
)

function onMainClick(): void {
  if (props.renaming) return
  notes.selectNote(props.note.id)
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
    :class="{
      'note-item--active': selected,
      'note-item--search-hit': showFolderPath && hideDelete,
    }"
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
          :class="{ 'note-item__main--search-path': showFolderPath }"
          :title="showFolderPath ? searchBreadcrumbPlain : label"
          @click="onMainClick"
          @dblclick="onDblClick"
        >
          <template v-if="highlightQuery?.trim()">
            <template v-if="showFolderPath">
              <span class="note-item__search-title" v-html="titleHtml" />
              <span class="note-item__search-path" v-html="searchBreadcrumbHtml" />
              <span
                v-if="searchSnippetHtml"
                class="note-item__search-snippet"
                v-html="searchSnippetHtml"
              />
            </template>
            <span v-else class="note-item__title" v-html="titleHtml" />
          </template>
          <template v-else>
            &gt; {{ label }}
          </template>
        </button>
        <RetroButton
          v-if="!hideDelete"
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

.note-item:hover:not(.note-item--active),
.note-item:focus-within:not(.note-item--active) {
  border-color: var(--accent);
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

.note-item__main--search-path {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  white-space: normal;
  word-break: break-word;
}

.note-item--search-hit {
  padding-bottom: 6px;
  margin-bottom: 0;
  border-bottom: 1px solid var(--border);
}

.note-item__search-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1.35;
  width: 100%;
  text-align: left;
}

.note-item__search-path {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.35;
  width: 100%;
  text-align: left;
  word-break: break-word;
}

.note-item__search-snippet {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
  width: 100%;
  text-align: left;
  word-break: break-word;
  margin-top: 2px;
}

.note-item__search-title :deep(.search-hit),
.note-item__search-path :deep(.search-hit),
.note-item__search-snippet :deep(.search-hit) {
  background: var(--search-hit-bg);
  color: var(--text-primary);
}

.note-item:hover .note-item__main {
  color: var(--text-primary);
}

.note-item--active .note-item__main {
  color: var(--accent);
}

.note-item--active .note-item__main--search-path {
  color: var(--text-secondary);
}

.note-item--active .note-item__search-title {
  color: var(--accent);
}

.note-item--active .note-item__search-path {
  color: var(--text-muted);
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
