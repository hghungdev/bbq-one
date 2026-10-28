<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import ListItemSettingsMenu from '@/components/ui/ListItemSettingsMenu.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useFoldersStore } from '@/stores/folders'
import { useSecureFolderStore } from '@/stores/secureFolder'
import { useLangStore } from '@/stores/uiLang'
import { formatListUpdatedAt } from '@/utils/date'
import type { Folder } from '@/types'

const props = defineProps<{
  folder: Folder
  selected: boolean
  renaming: boolean
}>()


const emit = defineEmits<{
  select: [id: string]
  'request-rename': [id: string]
  'rename-done': []
  'request-delete': [id: string]
  'open-secure-modal': [mode: 'enable' | 'unlock' | 'change', folderId: string]
}>()

const folders = useFoldersStore()
const secure = useSecureFolderStore()
const { t } = useLangStore()
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
  <div
    class="folder-item ds-row"
    :class="{ 'folder-item--active ds-row--selected': selected }"
    :title="t('folder.renameHint')"
  >
    <RetroInput
      v-if="renaming"
      :id="`folder-rename-${folder.id}`"
      ref="inputRef"
      v-model="draft"
      :placeholder="t('sidebar.folderPlaceholder')"
      autocomplete="off"
      @blur="commitRename"
      @keydown="onRenameKeydown"
    />
    <div v-else class="folder-item__top">
      <button
        type="button"
        class="folder-item__main"
        @click="onClick"
        @dblclick="onDblClick"
        @contextmenu="onContextMenu"
      >
        <div class="folder-item__row">
          <span class="folder-item__label">{{ folder.name }}</span>

          <span
            v-if="folder.is_secure"
            class="folder-item__icon-secure"
            :title="t('folder.secureLabel')"
            :aria-label="t('folder.secureLabel')"
          >
            <AppIcon name="lock" :size="14" class="folder-item__lock" />
          </span>
        </div>
        <div class="folder-item__foot">
          {{ formatListUpdatedAt(folder.updated_at ?? folder.created_at) }}
        </div>
      </button>
      <ListItemSettingsMenu
        :settings-title="t('folder.actionsTitle')"
        :rename-title="t('folder.renameTitle')"
        :delete-title="t('folder.deleteTitle')"
        @rename="emit('request-rename', folder.id)"
        @delete="emit('request-delete', folder.id)"
      />
    </div>

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
              <AppIcon name="shield" :size="15" />
            {{ t('folder.ctx.secure') }}
          </button>
        </li>
        <template v-else>
          <li v-if="secure.isFolderLocked(folder.id)" role="none">
            <button type="button" role="menuitem" @click="pickAction('unlock')">
              <AppIcon name="unlock" :size="15" />
              {{ t('folder.ctx.unlock') }}
            </button>
          </li>
          <li v-else role="none">
            <button
              type="button"
              role="menuitem"
              @click="secure.lockFolder(folder.id)"
            >
              <AppIcon name="lock" :size="15" />
              {{ t('folder.ctx.lock') }}
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" @click="pickAction('change')">
              <AppIcon name="key" :size="15" />
              {{ t('folder.ctx.changePassphrase') }}
            </button>
          </li>
        </template>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.folder-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  margin-bottom: 2px;
}

.folder-item__top {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 2px;
}

/* U11 (ADN popover): dòng phẳng — nền / vạch chọn ở ds-row (ds.css). ⚙ chỉ hiện khi rê chuột, đang
   chọn hoặc focus bàn phím — bớt nhiễu khi lướt danh sách. */
.folder-item :deep(.list-settings) {
  opacity: 0;
  transition: opacity 0.12s linear;
}

.folder-item:hover :deep(.list-settings),
.folder-item:focus-within :deep(.list-settings),
.folder-item--active :deep(.list-settings),
.folder-item :deep(.list-settings:has([aria-expanded='true'])) {
  opacity: 1;
}

.folder-item__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  margin: 0;
  padding: 7px 10px 7px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.folder-item--active .folder-item__main {
  color: var(--text-primary);
  font-weight: 600;
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
  align-self: flex-start;
  width: 100%;
  font-size: 10px;
  line-height: 1.2;
  color: var(--text-muted);
  text-align: left;
}

.folder-item__main:hover {
  color: var(--text-primary);
}

.folder-item__main:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.folder-item__icon-secure {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}


.folder-ctx {
  position: fixed;
  z-index: 10002;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  min-width: 180px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  box-shadow: 0 12px 28px var(--panel-ring);
  overflow: hidden;
}

.folder-ctx button {
  /* U15: menu dọc = icon + chữ. */
  display: flex;
  align-items: center;
  gap: 10px;
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
  background: var(--surface-accent-muted);
  color: var(--accent);
}

.folder-ctx button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -1px;
}
</style>
