<script setup lang="ts">
import { computed, ref } from 'vue'
import NoteItem from '@/components/notes/NoteItem.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'

defineProps<{
  renamingNoteId: string | null
}>()

const emit = defineEmits<{
  'update:renamingNoteId': [id: string | null]
}>()

const folders = useFoldersStore()
const notes = useNotesStore()

const busy = ref(false)
const confirmOpen = ref(false)
const pendingDeleteId = ref<string | null>(null)

const displayedNotes = computed(() => {
  const folderId = folders.activeFolderId
  const tag = notes.filterTag
  const q = notes.searchQuery.trim()
  if (q) {
    let list = notes.searchResults.slice()
    list = list.filter((n) => n.folder_id === folderId)
    if (tag) list = list.filter((n) => n.tags.includes(tag))
    return list
  }
  let list = notes.notesForFolder(folderId)
  if (tag) list = list.filter((n) => n.tags.includes(tag))
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
      NOTES
    </div>
    <div class="note-list__body">
      <NoteItem
        v-for="n in displayedNotes"
        :key="n.id"
        :note="n"
        :selected="notes.activeNoteId === n.id"
        :renaming="renamingNoteId === n.id"
        :highlight-query="highlightQuery"
        @select="notes.selectNote"
        @delete="requestDelete"
        @request-rename="emit('update:renamingNoteId', $event)"
        @rename-done="emit('update:renamingNoteId', null)"
      />
      <p
        v-if="displayedNotes.length === 0"
        class="note-list__empty retro-empty"
      >
        NO NOTES FOUND_
      </p>
    </div>
    <div class="note-list__foot">
      <RetroButton variant="sm" type="button" :disabled="busy" @click="onCreateNote">
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
