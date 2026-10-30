<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NoteItem from '@/components/notes/NoteItem.vue'
import MoveNoteModal from '@/components/notes/MoveNoteModal.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import QuickCreateModal from '@/components/ui/QuickCreateModal.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import SecureFolderModal from '@/components/folders/SecureFolderModal.vue'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useSecureFolderStore } from '@/stores/secureFolder'
import { useLangStore } from '@/stores/uiLang'
import { useProgressiveList } from '@/composables/useProgressiveList'
import { DEFAULT_PBKDF2_ITERATIONS } from '@/utils/secureCrypto'

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
const moveOpen = ref(false)
const moveNoteId = ref<string | null>(null)
const moveError = ref<string | null>(null)

const moveCurrentFolderId = computed(() => {
  if (!moveNoteId.value) return null
  return notes.notes.find((n) => n.id === moveNoteId.value)?.folder_id ?? null
})

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

/** U11: phạm vi hiển thị ở đầu cột. */
const searching = computed(() => notes.searchQuery.trim().length > 0)

/** S9: thư mục bảo mật tạo trước 2.2.0 (310.000 vòng) đang mở → mời nâng cấp (người dùng bấm, hỏi lại mật khẩu). */
const upgradeOpen = ref(false)
const needsUpgrade = computed(() => {
  const f = folders.folders.find((x) => x.id === folders.activeFolderId)
  return !!f?.is_secure && !folderLocked.value && !searching.value && f.pbkdf2_iterations < DEFAULT_PBKDF2_ITERATIONS
})
const activeFolderName = computed(
  () => folders.folders.find((f) => f.id === folders.activeFolderId)?.name ?? '',
)

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

/** P3: vẽ dần — 60 dòng đầu, cuộn gần cuối thì vẽ thêm; ghi chú đang chọn nằm trong phần đã vẽ. */
const { visible, hasMore, sentinel } = useProgressiveList(() => displayedNotes.value, {
  resetKey: () => [folders.activeFolderId, notes.searchQuery, notes.filterTag],
  // Đang tìm thì cột editor ẩn — không kéo dài danh sách tới ghi chú đang mở.
  mustShowIndex: () => (searching.value ? -1 : displayedNotes.value.findIndex((n) => n.id === notes.activeNoteId)),
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

function requestMove(id: string): void {
  moveNoteId.value = id
  moveError.value = null
  moveOpen.value = true
}

function closeMoveModal(): void {
  if (busy.value) return
  moveOpen.value = false
  moveNoteId.value = null
  moveError.value = null
}

async function onMovePick(folderId: string): Promise<void> {
  const id = moveNoteId.value
  if (!id || busy.value) return
  busy.value = true
  moveError.value = null
  try {
    await notes.moveNoteToFolder(id, folderId)
    moveOpen.value = false
    moveNoteId.value = null
  } catch (e) {
    if (e instanceof Error && e.message === 'SECURE_FOLDER_MOVE_UNSUPPORTED') {
      moveError.value = t('note.moveSecureUnsupported')
    } else if (e instanceof Error && e.message === 'Target folder not found') {
      moveError.value = t('note.moveTargetMissing')
    } else {
      moveError.value =
        e instanceof Error ? e.message : t('common.operationFailed')
    }
    console.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="note-list">
    <!-- U11: đầu cột ghi rõ phạm vi — "GHI CHÚ · <folder>" hoặc, khi tìm, "KẾT QUẢ · n · mọi thư mục"
         (ô tìm ở đầu cột Thư mục). -->
    <SectionHeader
      v-if="searching"
      class="note-list__head"
      :label="t('notes.searchResults')"
      :meta="notes.searchLoading ? '…' : `${displayedNotes.length} · ${t('notes.scopeAllFolders')}`"
    />
    <SectionHeader v-else class="note-list__head" :label="t('notes.header')" :meta="activeFolderName">
      <button
        v-if="canAddNote"
        type="button"
        class="ds-icon-action ds-icon-action--accent"
        :aria-label="t('notes.aria.addNote')"
        :title="t('notes.aria.addNote')"
        :disabled="busy || folderLocked"
        @click="openCreateNoteModal"
      >
        <AppIcon name="plus" :size="17" />
      </button>
    </SectionHeader>
    <p v-if="needsUpgrade" class="note-list__upgrade" role="note">
      <AppIcon name="shield" :size="14" />
      <span>{{ t('secureFolder.upgradeHint') }}</span>
      <button type="button" class="ds-text-action note-list__upgrade-btn" @click="upgradeOpen = true">
        {{ t('secureFolder.upgradeBtn') }}
      </button>
    </p>
    <div class="note-list__body">
      <NoteItem
        v-for="n in visible"
        :key="n.id"
        :note="n"
        :selected="notes.activeNoteId === n.id"
        :renaming="renamingNoteId === n.id"
        :show-folder-path="!!notes.searchQuery.trim()"
        :hide-delete="!!notes.searchQuery.trim()"
        :highlight-query="highlightQuery"
        @delete="requestDelete"
        @move="requestMove"
        @request-rename="emit('update:renamingNoteId', $event)"
        @rename-done="emit('update:renamingNoteId', null)"
      />
      <div v-if="hasMore" ref="sentinel" class="note-list__more" aria-hidden="true" />
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

    <MoveNoteModal
      :open="moveOpen"
      :note-id="moveNoteId"
      :current-folder-id="moveCurrentFolderId"
      :busy="busy"
      :error="moveError"
      @close="closeMoveModal"
      @pick="onMovePick"
    />

    <SecureFolderModal
      v-if="upgradeOpen && folders.activeFolderId"
      :open="upgradeOpen"
      mode="upgrade"
      :folder-id="folders.activeFolderId"
      @close="upgradeOpen = false"
    />
  </div>
</template>

<style scoped>
.note-list__upgrade {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

.note-list__upgrade-btn {
  margin-left: auto;
}

.note-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-primary);
}

/* Cùng hàng với ô tìm ở đầu cột Thư mục (10 px trên, cao 30 px). */
.note-list__head {
  margin: 10px 4px 6px 0;
}

/* P3: phần tử canh cuối danh sách — lọt khung cuộn thì vẽ thêm dòng. */
.note-list__more {
  height: 1px;
}

.note-list__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 6px 8px;
}
</style>
