<script setup lang="ts">
import { computed, ref } from 'vue'
import DeleteFolderModal from '@/components/folders/DeleteFolderModal.vue'
import FolderItem from '@/components/folders/FolderItem.vue'
import SecureFolderModal from '@/components/folders/SecureFolderModal.vue'
import TagBadge from '@/components/ui/TagBadge.vue'
import InlineSearch from '@/components/ui/InlineSearch.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import QuickCreateModal from '@/components/ui/QuickCreateModal.vue'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'
import { useLangStore } from '@/stores/uiLang'

defineProps<{
  renamingFolderId: string | null
}>()

const emit = defineEmits<{
  'update:renamingFolderId': [id: string | null]
}>()

const folders = useFoldersStore()
const notes = useNotesStore()
const secure = useSecureFolderStore()
const { t } = useLangStore()

const uniqueTags = computed(() => {
  const set = new Set<string>()
  for (const n of notes.notes) {
    for (const t of n.tags) set.add(t)
  }
  return [...set].sort().slice(0, 48)
})

const createFolderOpen = ref(false)
const newName = ref('')
const createFolderError = ref<string | null>(null)
const busy = ref(false)
/** U11: đang tìm mọi thư mục — folder đang chọn thôi là phạm vi. */
const searching = computed(() => notes.searchQuery.trim().length > 0)

const secureModal = ref<{
  open: boolean
  mode: 'enable' | 'unlock' | 'change'
  folderId: string
}>({ open: false, mode: 'enable', folderId: '' })

const deleteFolderModal = ref<{
  open: boolean
  folderId: string
  folderName: string
  noteCount: number
  submitting: boolean
  error: string
}>({
  open: false,
  folderId: '',
  folderName: '',
  noteCount: 0,
  submitting: false,
  error: '',
})

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

function openDeleteFolder(folderId: string): void {
  const f = folders.folders.find((x) => x.id === folderId)
  if (!f) return
  const noteCount = notes.notes.filter((n) => n.folder_id === folderId).length
  deleteFolderModal.value = {
    open: true,
    folderId,
    folderName: f.name,
    noteCount,
    submitting: false,
    error: '',
  }
}

function closeDeleteFolder(): void {
  if (deleteFolderModal.value.submitting) return
  deleteFolderModal.value = {
    open: false,
    folderId: '',
    folderName: '',
    noteCount: 0,
    submitting: false,
    error: '',
  }
}

async function confirmDeleteFolder(): Promise<void> {
  const id = deleteFolderModal.value.folderId
  if (!id) return
  deleteFolderModal.value.error = ''
  deleteFolderModal.value.submitting = true
  try {
    await folders.deleteFolder(id)
    secure.forgetFolderKey(id)
    deleteFolderModal.value = {
      open: false,
      folderId: '',
      folderName: '',
      noteCount: 0,
      submitting: false,
      error: '',
    }
  } catch (e) {
    deleteFolderModal.value.error =
      e instanceof Error ? e.message : t('sidebar.deleteFolderFailed')
    deleteFolderModal.value.submitting = false
  }
}

async function onCreateFolder(): Promise<void> {
  if (busy.value) return
  const trimmed = newName.value.trim()
  if (!trimmed) {
    createFolderError.value = t('sidebar.validation.folderNameRequired')
    return
  }
  createFolderError.value = null
  busy.value = true
  try {
    await folders.createFolder(trimmed)
    newName.value = ''
    createFolderOpen.value = false
  } catch (e) {
    createFolderError.value =
      e instanceof Error ? e.message : t('sidebar.deleteFolderFailed')
    console.error(e)
  } finally {
    busy.value = false
  }
}

function openCreateFolderModal(): void {
  notes.clearSearch()
  newName.value = ''
  createFolderError.value = null
  createFolderOpen.value = true
}

function closeCreateFolderModal(): void {
  if (busy.value) return
  createFolderOpen.value = false
  createFolderError.value = null
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--searching': searching }">
    <!-- U11: tìm ghi chú đặt TRÊN mọi thư mục → đọc là "tìm tất cả" (trước ở đầu cột Ghi chú, dễ hiểu
         nhầm là chỉ tìm trong folder đang mở). -->
    <div class="sidebar__search">
      <InlineSearch
        persistent
        input-id="bbqone-notes-search"
        :query="notes.searchQuery"
        :focus-request="notes.searchFocusRequest"
        :placeholder="t('search.placeholderAllNotes')"
        :input-label="t('search.ariaNotes')"
        :open-label="t('search.openNotes')"
        :close-label="t('search.close')"
        @search="(q) => notes.runSearch(q)"
        @clear="notes.clearSearch()"
      >
        <template #suffix>
          <span v-if="notes.searchLoading" class="sidebar__search-busy" aria-hidden="true">…</span>
        </template>
      </InlineSearch>
    </div>
    <SectionHeader :label="t('sidebar.folders')" :meta="String(folders.folders.length)">
      <button
        type="button"
        class="ds-icon-action ds-icon-action--accent"
        :aria-label="t('sidebar.aria.addFolder')"
        :title="t('sidebar.aria.addFolder')"
        :disabled="busy"
        @click="openCreateFolderModal"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </SectionHeader>
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
        @request-delete="openDeleteFolder"
        @open-secure-modal="openSecureModal"
      />
      <p
        v-if="folders.folders.length === 0"
        class="sidebar__empty retro-empty"
      >
        {{ t('sidebar.noFolders') }}
      </p>
    </div>

    <div v-if="uniqueTags.length" class="sidebar__tags">
      <SectionHeader :label="t('sidebar.tags')" />
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

    <QuickCreateModal
      v-model:name="newName"
      :open="createFolderOpen"
      :heading="t('sidebar.modal.createFolderTitle')"
      :field-label="t('sidebar.modal.createFolderField')"
      :placeholder="t('sidebar.folderPlaceholder')"
      :busy="busy"
      :error="createFolderError"
      input-id="new-folder-name"
      @close="closeCreateFolderModal"
      @save="onCreateFolder"
    />

    <SecureFolderModal
      v-if="secureModal.open"
      :open="secureModal.open"
      :mode="secureModal.mode"
      :folder-id="secureModal.folderId"
      @close="closeSecureModal"
      @done="closeSecureModal"
    />

    <DeleteFolderModal
      :open="deleteFolderModal.open"
      :folder-name="deleteFolderModal.folderName"
      :note-count="deleteFolderModal.noteCount"
      :submitting="deleteFolderModal.submitting"
      :server-error="deleteFolderModal.error"
      @close="closeDeleteFolder"
      @confirm="confirmDeleteFolder"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-primary);
}

.sidebar__search {
  padding: 10px 8px 6px;
}

.sidebar__search-busy {
  padding-right: 4px;
  color: var(--text-muted);
  font-size: 12px;
}

.sidebar__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 6px 8px;
}

/* Đang tìm (mọi thư mục): folder đang chọn không còn là phạm vi → bỏ nổi bật. */
.sidebar--searching :deep(.ds-row--selected) {
  background: transparent;
  box-shadow: none;
}

.sidebar__tags {
  padding: 6px 2px 8px;
  border-top: 1px solid var(--border);
}

.sidebar__tag-list {
  display: flex;
  flex-wrap: wrap;
  padding: 2px 8px 0;
}
</style>
