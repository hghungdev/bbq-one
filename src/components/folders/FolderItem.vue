<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useFoldersStore } from '@/stores/folders'
import type { Folder } from '@/types'

const RENAME_HINT =
  'Double-click hoặc F2 để đổi tên thư mục'

const props = defineProps<{
  folder: Folder
  selected: boolean
  renaming: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  'request-rename': [id: string]
  'rename-done': []
}>()

const folders = useFoldersStore()
const draft = ref('')
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)

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
    >
      &gt; {{ folder.name }}
    </button>
  </div>
</template>

<style scoped>
.folder-item-wrap {
  margin-bottom: 4px;
}

.folder-item {
  display: block;
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

.folder-item:hover {
  border-color: var(--border);
  color: var(--text-primary);
}

.folder-item--active {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
