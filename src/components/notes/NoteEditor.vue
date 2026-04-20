<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import type { Editor } from '@tiptap/core'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import CodeBlock from '@/components/notes/CodeBlock.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { useNotesStore } from '@/stores/notes'
import type { NoteBody } from '@/types'
import { extractCodeBlocksFromDocJSON } from '@/utils/tiptapJson'
import { copyTextToClipboard, writeToClipboardEvent } from '@/utils/clipboard'
import type { EditorView } from 'prosemirror-view'
import { firstLinePreview, plainTextFromHtml } from '@/utils/text'

const notesStore = useNotesStore()
const codeBlocks = ref<{ lang: string; code: string }[]>([])
const copyFeedback = ref(false)
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

let saveTimer: ReturnType<typeof setTimeout> | null = null
let codeTimer: ReturnType<typeof setTimeout> | null = null

const bodiesForEditor = computed(() => {
  const nid = notesStore.activeNoteId
  if (!nid) return []
  return notesStore.bodiesForNote(nid)
})

function bodyListLabel(b: NoteBody, index: number): string {
  const plain = plainTextFromHtml(b.content).replace(/\s+/g, ' ').trim()
  const line = firstLinePreview(plain, 44)
  return line || `[${index + 1}]`
}

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
  const runBodyId = notesStore.activeBodyId
  saveTimer = setTimeout(async () => {
    saveTimer = null
    if (!runBodyId || notesStore.activeBodyId !== runBodyId) return
    const ed = editor.value
    if (!ed) return
    await notesStore.updateBody(runBodyId, {
      content: ed.getHTML(),
    })
  }, 2000)
}

function applyBody(ed: Editor, body: NoteBody | null): void {
  if (!body) {
    ed.commands.setContent('<p></p>', false)
    codeBlocks.value = []
    notesStore.setDirty(false)
    return
  }
  ed.commands.setContent(body.content || '<p></p>', false)
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
    /**
     * ProseMirror mặc định dùng clipboardData; trong extension popup đôi khi cần fallback sync.
     * Luôn ghi text/plain để Ctrl+C / Win+V nhận nội dung.
     */
    handleDOMEvents: {
      copy(view: EditorView, event: Event): boolean {
        if (!(event instanceof ClipboardEvent)) return false
        const sel = view.state.selection
        if (sel.empty) return false
        const plain = view.state.doc.textBetween(sel.from, sel.to, '\n')
        return writeToClipboardEvent(event, plain)
      },
    },
  },
  onUpdate: () => {
    notesStore.setDirty(true)
    scheduleSave()
    scheduleCodeExtract()
  },
  onCreate: ({ editor: ed }) => {
    const body = notesStore.activeBody
    applyBody(ed, body)
  },
})

watch(
  () => notesStore.activeBodyId,
  async (newId, oldId) => {
    await nextTick()
    const ed = editor.value
    if (oldId && ed && notesStore.isDirty) {
      await notesStore.updateBody(oldId, {
        content: ed.getHTML(),
      })
    }
    if (!ed) return
    const body = newId
      ? notesStore.bodies.find((b) => b.id === newId) ?? null
      : null
    applyBody(ed, body)
  },
)

async function flushSave(): Promise<void> {
  cancelScheduledSave()
  const id = notesStore.activeBodyId
  const ed = editor.value
  if (!id || !ed || !notesStore.isDirty) return
  await notesStore.updateBody(id, {
    content: ed.getHTML(),
  })
}

async function copyBodyToClipboard(): Promise<void> {
  const ed = editor.value
  if (!ed) return
  const plain = ed.getText({ blockSeparator: '\n' })
  const ok = await copyTextToClipboard(plain)
  if (!ok) {
    console.warn('[BBQOne] Không ghi được clipboard — kiểm tra tab đang active có cho phép script không.')
    return
  }
  copyFeedback.value = true
  if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = setTimeout(() => {
    copyFeedback.value = false
    copyFeedbackTimer = null
  }, 1600)
}

function onSelectBodyTab(bodyId: string): void {
  const nid = notesStore.activeNoteId
  if (!nid) return
  notesStore.selectNote(nid, bodyId)
}

async function onAddBody(): Promise<void> {
  const nid = notesStore.activeNoteId
  if (!nid) return
  try {
    await notesStore.createBodyForNote(nid)
  } catch (e) {
    console.error(e)
  }
}

async function onDeleteBody(bodyId: string, e: MouseEvent): Promise<void> {
  e.stopPropagation()
  try {
    await notesStore.deleteBody(bodyId)
  } catch (err) {
    console.error(err)
  }
}

defineExpose({ flushSave })

onBeforeUnmount(() => {
  cancelScheduledSave()
  if (codeTimer !== null) {
    clearTimeout(codeTimer)
    codeTimer = null
  }
  const id = notesStore.activeBodyId
  if (id && editor.value && notesStore.isDirty) {
    void notesStore.updateBody(id, {
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
    <template v-else-if="bodiesForEditor.length === 0">
      <p class="note-editor__empty retro-empty">
        &gt; NO BODY_<span class="cursor-blink" aria-hidden="true"></span>
      </p>
      <RetroButton
        variant="sm"
        type="button"
        class="note-editor__add-first"
        @click="onAddBody"
      >
        + BODY
      </RetroButton>
    </template>
    <template v-else>
      <div class="note-editor__head">
        <span class="note-editor__label">BODY</span>
        <div class="note-editor__head-actions">
          <RetroButton
            variant="sm"
            type="button"
            :disabled="!notesStore.activeNoteId"
            @click="onAddBody"
          >
            +
          </RetroButton>
          <span
            v-if="copyFeedback"
            class="note-editor__copied"
            role="status"
          >COPIED</span>
          <button
            type="button"
            class="note-editor__copy"
            title="Copy nội dung (plain text) vào clipboard"
            aria-label="Copy nội dung body vào clipboard"
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

      <div
        class="note-editor__tabs"
        role="tablist"
        :aria-label="'Bodies for note'"
      >
        <div
          v-for="(b, i) in bodiesForEditor"
          :key="b.id"
          class="note-editor__tab"
          :class="{
            'note-editor__tab--active': notesStore.activeBodyId === b.id,
          }"
        >
          <button
            type="button"
            class="note-editor__tab-main"
            role="tab"
            :aria-selected="notesStore.activeBodyId === b.id"
            @click="onSelectBodyTab(b.id)"
          >
            &gt; {{ bodyListLabel(b, i) }}
          </button>
          <RetroButton
            variant="sm"
            type="button"
            class="note-editor__tab-del"
            aria-label="Xóa body"
            @click="onDeleteBody(b.id, $event)"
          >
            [×]
          </RetroButton>
        </div>
      </div>

      <template v-if="notesStore.activeBody">
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

.note-editor__add-first {
  align-self: flex-start;
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
  flex: 0 0 auto;
  margin-left: auto;
}

.note-editor__label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  letter-spacing: 0.08em;
}

.note-editor__tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 0 auto;
  max-height: min(40vh, 200px);
  overflow-y: auto;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.note-editor__tab {
  display: flex;
  align-items: stretch;
  gap: 4px;
  border: 1px solid transparent;
}

.note-editor__tab--active {
  border-color: var(--accent);
}

.note-editor__tab-main {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-editor__tab-main:hover {
  color: var(--text-secondary);
}

.note-editor__tab--active .note-editor__tab-main {
  color: var(--accent);
}

.note-editor__tab-main:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.note-editor__tab-del {
  flex: 0 0 auto;
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
  outline: 2px solid var(--focus-ring);
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
