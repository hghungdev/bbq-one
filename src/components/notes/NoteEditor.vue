<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import type { Editor } from '@tiptap/core'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import CodeBlock from '@/components/notes/CodeBlock.vue'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@/types'
import { extractCodeBlocksFromDocJSON } from '@/utils/tiptapJson'
import { copyTextToClipboard } from '@/utils/clipboard'
import { htmlToClipboardPlain } from '@/utils/text'

const notesStore = useNotesStore()
const codeBlocks = ref<{ lang: string; code: string }[]>([])
const copyFeedback = ref(false)
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

let saveTimer: ReturnType<typeof setTimeout> | null = null
let codeTimer: ReturnType<typeof setTimeout> | null = null

function cancelScheduledSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

function scheduleCodeExtract(): void {
  if (codeTimer !== null) clearTimeout(codeTimer)
  codeTimer = setTimeout(() => {
    const ed = editor.value
    if (!ed) return
    codeBlocks.value = extractCodeBlocksFromDocJSON(ed.getJSON())
  }, 400)
}

function scheduleSave(): void {
  cancelScheduledSave()
  const runId = notesStore.activeNoteId
  saveTimer = setTimeout(async () => {
    saveTimer = null
    if (!runId || notesStore.activeNoteId !== runId) return
    const ed = editor.value
    if (!ed) return
    await notesStore.updateNote(runId, {
      content: ed.getHTML(),
    })
  }, 2000)
}

function applyNote(ed: Editor, note: Note | null): void {
  if (!note) {
    ed.commands.setContent('<p></p>', false)
    codeBlocks.value = []
    notesStore.setDirty(false)
    return
  }
  ed.commands.setContent(note.content || '<p></p>', false)
  notesStore.setDirty(false)
  scheduleCodeExtract()
}

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      codeBlock: {
        HTMLAttributes: {
          class: 'retro-code-block',
        },
      },
    }),
  ],
  content: '<p></p>',
  editorProps: {
    attributes: {
      class: 'note-editor__prose',
    },
  },
  onUpdate: () => {
    notesStore.setDirty(true)
    scheduleSave()
    scheduleCodeExtract()
  },
  onCreate: ({ editor: ed }) => {
    const note = notesStore.activeNote
    applyNote(ed, note)
  },
})

watch(
  () => notesStore.activeNoteId,
  async (newId, oldId) => {
    await nextTick()
    const ed = editor.value
    if (oldId && ed && notesStore.isDirty) {
      await notesStore.updateNote(oldId, {
        content: ed.getHTML(),
      })
    }
    if (!ed) return
    const note = newId
      ? notesStore.notes.find((n) => n.id === newId) ?? null
      : null
    applyNote(ed, note)
  },
)

async function flushSave(): Promise<void> {
  cancelScheduledSave()
  const id = notesStore.activeNoteId
  const ed = editor.value
  if (!id || !ed || !notesStore.isDirty) return
  await notesStore.updateNote(id, {
    content: ed.getHTML(),
  })
}

async function copyBodyToClipboard(): Promise<void> {
  const ed = editor.value
  if (!ed) return
  const plain = htmlToClipboardPlain(ed.getHTML())
  const ok = await copyTextToClipboard(plain)
  if (!ok) {
    console.warn('[RetroNote] Không ghi được clipboard (kiểm tra quyền clipboardWrite + Reload extension).')
    return
  }
  copyFeedback.value = true
  if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = setTimeout(() => {
    copyFeedback.value = false
    copyFeedbackTimer = null
  }, 1600)
}

defineExpose({ flushSave })

onBeforeUnmount(() => {
  cancelScheduledSave()
  if (codeTimer !== null) {
    clearTimeout(codeTimer)
    codeTimer = null
  }
  const id = notesStore.activeNoteId
  if (id && editor.value && notesStore.isDirty) {
    void notesStore.updateNote(id, {
      content: editor.value.getHTML(),
    })
  }
  if (copyFeedbackTimer !== null) {
    clearTimeout(copyFeedbackTimer)
    copyFeedbackTimer = null
  }
})
</script>

<template>
  <div class="note-editor">
    <template v-if="!notesStore.activeNote">
      <p class="note-editor__empty retro-empty">
        &gt; NO NOTE SELECTED_<span class="cursor-blink" aria-hidden="true"></span>
      </p>
    </template>
    <template v-else>
      <div class="note-editor__head">
        <label class="note-editor__label">BODY:</label>
        <div class="note-editor__head-actions">
          <span
            v-if="copyFeedback"
            class="note-editor__copied"
            role="status"
          >COPIED</span>
          <button
            type="button"
            class="note-editor__copy"
            title="Copy nội dung (plain text) vào clipboard"
            aria-label="Copy nội dung note vào clipboard"
            @click="copyBodyToClipboard"
          >
            <svg
              class="note-editor__copy-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
              />
            </svg>
          </button>
        </div>
      </div>
      <div class="note-editor__body">
        <EditorContent v-if="editor" :editor="editor" />
      </div>

      <div v-if="codeBlocks.length" class="note-editor__code">
        <div class="note-editor__code-head">
          CODE BLOCKS ({{ codeBlocks.length }})
        </div>
        <CodeBlock
          v-for="(b, i) in codeBlocks"
          :key="`${b.lang}-${i}`"
          :code="b.code"
          :language="b.lang"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.note-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1 1 auto;
  padding: 10px 12px;
}

.note-editor__empty {
  margin: 0;
  padding-top: 12px;
}

.note-editor__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 0 0 auto;
}

.note-editor__head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.note-editor__label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  letter-spacing: 0.08em;
}

.note-editor__copied {
  font-size: var(--font-size-sm);
  color: var(--success);
  letter-spacing: 0.06em;
}

.note-editor__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-panel);
  color: var(--accent);
  cursor: pointer;
  line-height: 0;
}

.note-editor__copy:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.note-editor__copy:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 2px;
}

.note-editor__copy-icon {
  display: block;
}

.note-editor__body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.note-editor__body :deep(.note-editor__prose) {
  outline: none;
  min-height: 120px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: var(--font-size-base);
}

.note-editor__body :deep(.note-editor__prose p) {
  margin: 0 0 0.6em;
}

.note-editor__body :deep(.retro-code-block) {
  margin: 0.6em 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--accent);
  font-family: var(--font-mono, inherit);
  font-size: var(--font-size-sm);
  overflow-x: auto;
}

.note-editor__code {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.note-editor__code-head {
  margin-bottom: 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
</style>
