<script setup lang="ts">
import { computed, ref } from 'vue'
import NoteItem from '@/components/notes/NoteItem.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'

defineProps<{
  renamingNoteId: string | null
}>()

const emit = defineEmits<{
  'update:renamingNoteId': [id: string | null]
}>()

const folders = useFoldersStore()
const notes = useNotesStore()
const secure = useSecureFolderStore()

const busy = ref(false)
const confirmOpen = ref(false)
const pendingDeleteId = ref<string | null>(null)

const folderLocked = computed(() => {
  const id = folders.activeFolderId
  if (!id) return false
  return secure.isFolderLocked(id)
})

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

async function onCreateNote(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await notes.createNote(folders.activeFolderId)
  } catch (e) {
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
        SEARCH NOTES · {{ displayedNotes.length }} hit(s)
      </template>
      <template v-else>
        NOTES
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
        &gt; FOLDER LOCKED — UNLOCK VIA CONTEXT MENU_
      </p>
      <p
        v-else-if="displayedNotes.length === 0"
        class="note-list__empty retro-empty"
      >
        NO NOTES FOUND_
      </p>
    </div>
    <div class="note-list__foot">
      <RetroButton
        variant="sm"
        type="button"
        :disabled="busy || folderLocked"
        @click="onCreateNote"
      >
        + NOTE
      </RetroButton>
    </div>

    <RetroConfirm
      v-model:open="confirmOpen"
      message="DELETE NOTE?"
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
  background: var(--bg-secondary);
}

.note-list__head {
  padding: 8px 10px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border);
}

.note-list__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 6px;
}

.note-list__foot {
  padding: 8px 6px;
  border-top: 1px solid var(--border);
}
</style>
