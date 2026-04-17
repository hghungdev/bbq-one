<script setup lang="ts">
import { computed, ref } from 'vue'
import FolderItem from '@/components/folders/FolderItem.vue'
import SecureFolderModal from '@/components/folders/SecureFolderModal.vue'
import TagBadge from '@/components/ui/TagBadge.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'

defineProps<{
  renamingFolderId: string | null
}>()

const emit = defineEmits<{
  'update:renamingFolderId': [id: string | null]
}>()

const folders = useFoldersStore()
const notes = useNotesStore()
const secure = useSecureFolderStore()

const uniqueTags = computed(() => {
  const set = new Set<string>()
  for (const n of notes.notes) {
    for (const t of n.tags) set.add(t)
  }
  return [...set].sort().slice(0, 48)
})

const creating = ref(false)
const newName = ref('')
const busy = ref(false)

const secureModal = ref<{
  open: boolean
  mode: 'enable' | 'unlock' | 'change'
  folderId: string
}>({ open: false, mode: 'enable', folderId: '' })

function onSelectFolder(id: string): void {
  if (folders.folders.find((f) => f.id === id)?.is_secure) {
    if (secure.isFolderLocked(id)) {
      notes.selectNote(null)
    }
  }
  folders.selectFolder(id)
}

function openSecureModal(
  mode: 'enable' | 'unlock' | 'change',
  folderId: string,
): void {
  secureModal.value = { open: true, mode, folderId }
}

function closeSecureModal(): void {
  secureModal.value = { ...secureModal.value, open: false }
}

async function onCreateFolder(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await folders.createFolder(newName.value)
    newName.value = ''
    creating.value = false
  } catch (e) {
    console.error(e)
  } finally {
    busy.value = false
  }
}

function startCreate(): void {
  notes.clearSearch()
  creating.value = true
  newName.value = ''
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__head">
      FOLDERS
    </div>
    <div class="sidebar__list">
      <FolderItem
        v-for="f in folders.folders"
        :key="f.id"
        :folder="f"
        :selected="folders.activeFolderId === f.id"
        :renaming="renamingFolderId === f.id"
        @select="onSelectFolder"
        @request-rename="emit('update:renamingFolderId', $event)"
        @rename-done="emit('update:renamingFolderId', null)"
        @open-secure-modal="openSecureModal"
      />
      <p
        v-if="folders.folders.length === 0"
        class="sidebar__empty retro-empty"
      >
        NO FOLDERS FOUND_
      </p>
    </div>

    <div v-if="uniqueTags.length" class="sidebar__tags">
      <div class="sidebar__tag-head">
        TAGS
      </div>
      <div class="sidebar__tag-list">
        <TagBadge
          v-for="t in uniqueTags"
          :key="t"
          :tag="t"
          :active="notes.filterTag === t"
          @select="notes.setFilterTag"
        />
      </div>
    </div>

    <div v-if="creating" class="sidebar__new">
      <RetroInput
        id="new-folder-name"
        v-model="newName"
        placeholder="folder_name"
        :disabled="busy"
        @keydown.enter.prevent="onCreateFolder"
      />
      <div class="sidebar__new-actions">
        <RetroButton variant="sm" type="button" :disabled="busy" @click="onCreateFolder">
          [ OK ]
        </RetroButton>
        <RetroButton variant="sm" type="button" :disabled="busy" @click="creating = false">
          [ X ]
        </RetroButton>
      </div>
    </div>

    <div class="sidebar__foot">
      <RetroButton variant="sm" type="button" :disabled="busy" @click="startCreate">
        + FOLDER
      </RetroButton>
    </div>

    <SecureFolderModal
      v-if="secureModal.open"
      :open="secureModal.open"
      :mode="secureModal.mode"
      :folder-id="secureModal.folderId"
      @close="closeSecureModal"
      @done="closeSecureModal"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-panel);
}

.sidebar__head {
  padding: 8px 10px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border);
}

.sidebar__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 6px;
}

.sidebar__new {
  padding: 8px 6px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar__new-actions {
  display: flex;
  gap: 8px;
}

.sidebar__foot {
  padding: 8px 6px;
  border-top: 1px solid var(--border);
}

.sidebar__tags {
  padding: 8px 6px;
  border-top: 1px solid var(--border);
}

.sidebar__tag-head {
  margin-bottom: 6px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.sidebar__tag-list {
  display: flex;
  flex-wrap: wrap;
}
</style>
