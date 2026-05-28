<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NoteItem from '@/components/notes/NoteItem.vue'
import IconButton from '@/components/ui/IconButton.vue'
import QuickCreateModal from '@/components/ui/QuickCreateModal.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'
import { useLangStore } from '@/stores/uiLang'

defineProps<{
  renamingNoteId: string | null
}>()

const emit = defineEmits<{
  'update:renamingNoteId': [id: string | null]
}>()

const folders = useFoldersStore()
const notes = useNotesStore()
const secure = useSecureFolderStore()
const { t } = useLangStore()

const busy = ref(false)
const createNoteOpen = ref(false)
const newNoteTitle = ref('')
const createNoteError = ref<string | null>(null)
const confirmOpen = ref(false)
const pendingDeleteId = ref<string | null>(null)

const folderLocked = computed(() => {
  const id = folders.activeFolderId
  if (!id) return false
  return secure.isFolderLocked(id)
})

/** Chỉ thêm note khi đã chọn một folder (vd. sau khi tạo / click folder). */
const canAddNote = computed(
  () =>
    !!folders.activeFolderId &&
    !folderLocked.value &&
    !notes.searchQuery.trim(),
)

watch(
  () => folders.activeFolderId,
  (id) => {
    if (!id) closeCreateNoteModal()
  },
)

function sortNotesByUpdatedDesc<T extends { updated_at: string }>(list: T[]): T[] {
  return list.slice().sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )
}

const displayedNotes = computed(() => {
  const folderId = folders.activeFolderId
  const tag = notes.filterTag
  const q = notes.searchQuery.trim()
  if (q) {
    let list = notes.searchResults.slice()
    /* Global: mọi folder thường; secure đã lọc trong runSearch — giữ lọc phòng stale. */
    list = list.filter((n) => !folders.isSecureFolder(n.folder_id))
    if (tag) list = list.filter((n) => n.tags.includes(tag))
    return sortNotesByUpdatedDesc(list)
  }
  if (folderId && secure.isFolderLocked(folderId)) {
    return []
  }
  let list = notes.notesForFolder(folderId)
  if (tag) {
    list = list.filter((n) => n.tags.includes(tag))
    return sortNotesByUpdatedDesc(list)
  }
  return list
})

const highlightQuery = computed(() =>
  notes.searchQuery.trim() ? notes.searchQuery : '',
)

function openCreateNoteModal(): void {
  if (!canAddNote.value) return
  newNoteTitle.value = ''
  createNoteError.value = null
  createNoteOpen.value = true
}

function closeCreateNoteModal(): void {
  if (busy.value) return
  createNoteOpen.value = false
  createNoteError.value = null
}

async function onCreateNote(): Promise<void> {
  if (busy.value || !canAddNote.value) return
  busy.value = true
  createNoteError.value = null
  try {
    await notes.createNote(folders.activeFolderId, newNoteTitle.value)
    newNoteTitle.value = ''
    createNoteOpen.value = false
  } catch (e) {
    if (e instanceof Error && e.message === 'Folder locked') {
      createNoteError.value = t('notes.folderLocked')
    } else {
      createNoteError.value =
        e instanceof Error ? e.message : t('common.operationFailed')
    }
    console.error(e)
  } finally {
    busy.value = false
  }
}

function requestDelete(id: string): void {
  pendingDeleteId.value = id
  confirmOpen.value = true
}

async function confirmDelete(): Promise<void> {
  const id = pendingDeleteId.value
  pendingDeleteId.value = null
  if (!id) return
  try {
    await notes.deleteNote(id)
  } catch (e) {
    console.error(e)
  }
}

function onCancelDelete(): void {
  pendingDeleteId.value = null
}
</script>

<template>
  <div class="note-list">
    <div class="note-list__head">
      <template v-if="notes.searchQuery.trim()">
        {{ t('notes.searchHits', { n: displayedNotes.length }) }}
      </template>
      <template v-else>
        {{ t('notes.header') }}
      </template>
    </div>
    <div class="note-list__body">
      <NoteItem
        v-for="n in displayedNotes"
        :key="n.id"
        :note="n"
        :selected="notes.activeNoteId === n.id"
        :renaming="renamingNoteId === n.id"
        :show-folder-path="!!notes.searchQuery.trim()"
        :hide-delete="!!notes.searchQuery.trim()"
        :highlight-query="highlightQuery"
        @delete="requestDelete"
        @request-rename="emit('update:renamingNoteId', $event)"
        @rename-done="emit('update:renamingNoteId', null)"
      />
      <p
        v-if="displayedNotes.length === 0 && folderLocked && !notes.searchQuery.trim()"
        class="note-list__empty retro-empty"
      >
        {{ t('notes.folderLocked') }}
      </p>
      <p
        v-else-if="!canAddNote && !notes.searchQuery.trim()"
        class="note-list__empty retro-empty"
      >
        {{ folders.folders.length === 0 ? t('notes.createFolderFirst') : t('notes.selectFolderFirst') }}
      </p>
      <p
        v-else-if="displayedNotes.length === 0"
        class="note-list__empty retro-empty"
      >
        {{ t('notes.noNotes') }}
      </p>
    </div>
    <div v-if="canAddNote" class="note-list__foot note-list__foot--add">
      <IconButton
        variant="accent"
        :label="t('notes.aria.addNote')"
        :disabled="busy || folderLocked"
        @click="openCreateNoteModal"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            d="M12 5v14M5 12h14"
          />
        </svg>
      </IconButton>
      <span class="note-list__foot-label">{{ t('notes.aria.addNote') }}</span>
    </div>

    <QuickCreateModal
      v-model:name="newNoteTitle"
      :open="createNoteOpen"
      :heading="t('notes.modal.createNoteTitle')"
      :field-label="t('notes.modal.createNoteField')"
      :placeholder="t('notes.modal.createNotePlaceholder')"
      :busy="busy"
      :error="createNoteError"
      input-id="new-note-title"
      @close="closeCreateNoteModal"
      @save="onCreateNote"
    />

    <RetroConfirm
      v-model:open="confirmOpen"
      variant="danger"
      :title="t('notes.deleteConfirmTitle')"
      :message="t('notes.deleteConfirmDetail')"
      @confirm="confirmDelete"
      @cancel="onCancelDelete"
    />
  </div>
</template>

<style scoped>
.note-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-panel) 80%, transparent), transparent 180px),
    var(--bg-primary);
}

.note-list__head {
  margin: 8px 8px 4px;
  padding: 7px 10px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.012em;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 74%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.note-list__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px 8px;
}

.note-list__foot {
  padding: 10px 10px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-panel) 68%, transparent);
}

.note-list__foot--add {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 8px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.note-list__foot-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
</style>
