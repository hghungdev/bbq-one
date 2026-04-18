<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useFoldersStore } from '@/stores/folders'
import { useSecureFolderStore } from '@/stores/secureFolder'
import { formatListUpdatedAt } from '@/utils/date'
import type { Folder } from '@/types'

const RENAME_HINT =
  'Double-click hoặc F2 để đổi tên thư mục — chuột phải: Secure folder'

const props = defineProps<{
  folder: Folder
  selected: boolean
  renaming: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  'request-rename': [id: string]
  'rename-done': []
  'open-secure-modal': [mode: 'enable' | 'unlock' | 'change', folderId: string]
}>()

const folders = useFoldersStore()
const secure = useSecureFolderStore()
const draft = ref('')
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)

const menuOpen = ref(false)
const menuX = ref(0)
const menuY = ref(0)

watch(
  () => props.renaming,
  async (v) => {
    if (v) {
      draft.value = props.folder.name
      await nextTick()
      inputRef.value?.focus()
    }
  },
)

function closeMenu(): void {
  menuOpen.value = false
}

function onClick(): void {
  if (props.renaming) return
  emit('select', props.folder.id)
}

function onDblClick(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  emit('request-rename', props.folder.id)
}

async function commitRename(): Promise<void> {
  const name = draft.value.trim()
  if (!name) {
    draft.value = props.folder.name
    emit('rename-done')
    return
  }
  if (name !== props.folder.name) {
    try {
      await folders.renameFolder(props.folder.id, name)
    } catch (e) {
      console.error(e)
      draft.value = props.folder.name
    }
  }
  emit('rename-done')
}

function onCancel(): void {
  draft.value = props.folder.name
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

function onContextMenu(e: MouseEvent): void {
  e.preventDefault()
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuOpen.value = true
  void nextTick(() => {
    const close = (): void => {
      closeMenu()
      document.removeEventListener('click', close)
    }
    document.addEventListener('click', close, { once: true })
  })
}

function pickAction(
  mode: 'enable' | 'unlock' | 'change',
): void {
  closeMenu()
  emit('open-secure-modal', mode, props.folder.id)
}
</script>

<template>
  <div class="folder-item-wrap" :title="RENAME_HINT">
    <RetroInput
      v-if="renaming"
      :id="`folder-rename-${folder.id}`"
      ref="inputRef"
      v-model="draft"
      placeholder="folder_name"
      autocomplete="off"
      @blur="commitRename"
      @keydown="onRenameKeydown"
    />
    <button
      v-else
      type="button"
      class="folder-item"
      :class="{ 'folder-item--active': selected }"
      @click="onClick"
      @dblclick="onDblClick"
      @contextmenu="onContextMenu"
    >
      <div class="folder-item__row">
        <span class="folder-item__label">&gt; {{ folder.name }}</span>

        <span
          v-if="folder.is_secure"
          class="folder-item__icon-secure"
          title="Secure folder"
          aria-label="Secure folder"
        >
        [
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            class="folder-item__shield"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M12 2 4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"
            />
          </svg>
        ]
        </span>
      </div>
      <div class="folder-item__foot">
        {{ formatListUpdatedAt(folder.updated_at ?? folder.created_at) }}
      </div>
    </button>

    <Teleport to="body">
      <ul
        v-if="menuOpen"
        class="folder-ctx bbqone-overlay"
        :style="{ left: `${menuX}px`, top: `${menuY}px` }"
        role="menu"
        @click.stop
      >
        <li v-if="!folder.is_secure" role="none">
          <button type="button" role="menuitem" @click="pickAction('enable')">
            Secure folder…
          </button>
        </li>
        <template v-else>
          <li v-if="secure.isFolderLocked(folder.id)" role="none">
            <button type="button" role="menuitem" @click="pickAction('unlock')">
              Unlock…
            </button>
          </li>
          <li v-else role="none">
            <button
              type="button"
              role="menuitem"
              @click="secure.lockFolder(folder.id)"
            >
              Lock
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" @click="pickAction('change')">
              Change passphrase…
            </button>
          </li>
        </template>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.folder-item-wrap {
  margin-bottom: 4px;
  position: relative;
}

.folder-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.folder-item__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
}

.folder-item__label {
  min-width: 0;
  text-align: left;
}

.folder-item__foot {
  align-self: flex-end;
  font-size: 10px;
  line-height: 1.2;
  color: var(--text-muted);
}

.folder-item:hover {
  border-color: var(--border);
  color: var(--text-primary);
}

.folder-item--active {
  border-color: var(--accent);
  color: var(--accent);
}

.folder-item:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.folder-item__icon-secure {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  opacity: 0.92;
}

.folder-item__shield {
  width: 13px;
  height: 13px;
  display: block;
}

.folder-ctx {
  position: fixed;
  z-index: 10002;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  min-width: 180px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.folder-ctx button {
  display: block;
  width: 100%;
  margin: 0;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.folder-ctx button:hover {
  background: var(--bg-secondary);
  color: var(--accent);
}

.folder-ctx button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -1px;
}
</style>
