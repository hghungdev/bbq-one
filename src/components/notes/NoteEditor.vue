<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import type { Editor } from '@tiptap/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CodeBlock from '@/components/notes/CodeBlock.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import { clearNoteDraft, saveNoteDraft } from '@/services/noteDraft.service'
import { isRowMissingOnServerError } from '@/utils/syncConflict'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import { useLangStore } from '@/stores/uiLang'
import type { NoteBody } from '@/types'
import { extractCodeBlocksFromDocJSON } from '@/utils/tiptapJson'
import { copyTextToClipboard } from '@/utils/clipboard'
import type { EditorView } from 'prosemirror-view'
import { firstLinePreview, plainTextFromHtml } from '@/utils/text'
import {
  handleNoteEditorPaste,
  noteHtmlNeedsPlainSanitize,
  sanitizeHtmlToNoteContent,
} from '@/utils/pastePlainText'

const notesStore = useNotesStore()
const foldersStore = useFoldersStore()
const { t } = useLangStore()
const codeBlocks = ref<{ lang: string; code: string }[]>([])
const copyFeedback = ref(false)
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

let saveTimer: ReturnType<typeof setTimeout> | null = null
let codeTimer: ReturnType<typeof setTimeout> | null = null
let draftTimer: ReturnType<typeof setTimeout> | null = null

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

function isSecureActiveNote(): boolean {
  const nid = notesStore.activeNoteId
  const note = nid ? notesStore.notes.find((n) => n.id === nid) : null
  const folder = note?.folder_id
    ? foldersStore.folders.find((f) => f.id === note.folder_id)
    : null
  return !!folder?.is_secure
}

function onAutosaveFailed(e: unknown): void {
  // N10: KHÔNG clearNoteDraft — keystroke còn trong draft. Báo lỗi thay vì chết câm mỗi 2s.
  console.warn('[BBQOne] Autosave failed:', e)
  notesStore.setDirty(true)
  notesStore.loadError = isRowMissingOnServerError(e)
    ? 'Note was deleted on another device — your latest text is kept in the draft.'
    : e instanceof Error
      ? e.message
      : 'Autosave failed'
}

/** Throttle ~300ms: draft luôn tươi hơn debounce-save 2s, đủ rẻ để chạy mỗi keystroke. */
function scheduleDraftWrite(): void {
  if (draftTimer !== null) return
  draftTimer = setTimeout(() => {
    draftTimer = null
    const id = notesStore.activeBodyId
    const ed = editor.value
    if (!id || !ed || !notesStore.isDirty) return
    if (isSecureActiveNote()) return
    void saveNoteDraft({
      bodyId: id,
      noteId: notesStore.activeNoteId ?? '',
      content: ed.getHTML(),
      at: new Date().toISOString(),
      baselineUpdatedAt: notesStore.activeBody?.updated_at,
    })
  }, 300)
}

function scheduleSave(): void {
  cancelScheduledSave()
  const runBodyId = notesStore.activeBodyId
  saveTimer = setTimeout(async () => {
    saveTimer = null
    if (!runBodyId || notesStore.activeBodyId !== runBodyId) return
    const ed = editor.value
    if (!ed) return
    try {
      await notesStore.updateBody(runBodyId, {
        content: ed.getHTML(),
      })
      void clearNoteDraft()
    } catch (e) {
      onAutosaveFailed(e)
    }
  }, 2000)
}

function applyBody(ed: Editor, body: NoteBody | null): void {
  if (!body) {
    ed.commands.setContent('<p></p>', false)
    codeBlocks.value = []
    notesStore.setDirty(false)
    return
  }
  const raw = body.content || '<p></p>'
  const needsSanitize = noteHtmlNeedsPlainSanitize(raw)
  const content = needsSanitize ? sanitizeHtmlToNoteContent(raw) : raw
  ed.commands.setContent(content || '<p></p>', false)
  if (needsSanitize) {
    notesStore.setDirty(true)
    scheduleSave()
  } else {
    notesStore.setDirty(false)
  }
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
     * Ctrl+C: dùng đúng serializer của ProseMirror (giống hành vi copy nội bộ),
     * không dùng doc.textBetween + writeToClipboardEvent — vì textBetween khác chuẩn PM
     * (block separator, code block, v.v.) và writeToClipboardEvent còn gọi writeText async
     * có thể ghi đè clipboard / mất format.
     */
    handleDOMEvents: {
      paste(view: EditorView, event: Event): boolean {
        if (!(event instanceof ClipboardEvent)) return false
        return handleNoteEditorPaste(view, event)
      },
      copy(view: EditorView, event: Event): boolean {
        if (!(event instanceof ClipboardEvent)) return false
        const sel = view.state.selection
        if (sel.empty) return false
        const cd = event.clipboardData
        if (!cd) return false
        const { dom, text } = view.serializeForClipboard(sel.content())
        event.preventDefault()
        cd.clearData()
        cd.setData('text/plain', text)
        cd.setData('text/html', dom.innerHTML)
        return true
      },
    },
  },
  onUpdate: () => {
    notesStore.setDirty(true)
    scheduleSave()
    scheduleDraftWrite()
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
      try {
        await notesStore.updateBody(oldId, {
          content: ed.getHTML(),
        })
        void clearNoteDraft()
      } catch (e) {
        onAutosaveFailed(e)
      }
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
  try {
    await notesStore.updateBody(id, {
      content: ed.getHTML(),
    })
    void clearNoteDraft()
  } catch (e) {
    onAutosaveFailed(e)
  }
}

function onPopupHideFlush(): void {
  void flushSave()
}

function onVisibilityChangeFlush(): void {
  if (document.visibilityState === 'hidden') onPopupHideFlush()
}

onMounted(() => {
  window.addEventListener('pagehide', onPopupHideFlush)
  document.addEventListener('visibilitychange', onVisibilityChangeFlush)
})

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
  window.removeEventListener('pagehide', onPopupHideFlush)
  document.removeEventListener('visibilitychange', onVisibilityChangeFlush)
  cancelScheduledSave()
  if (codeTimer !== null) {
    clearTimeout(codeTimer)
    codeTimer = null
  }
  if (draftTimer !== null) {
    clearTimeout(draftTimer)
    draftTimer = null
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
        {{ t('editor.noNoteSelected') }}
      </p>
    </template>
    <template v-else-if="bodiesForEditor.length === 0">
      <p class="note-editor__empty retro-empty">
        {{ t('editor.noBody') }}
      </p>
      <RetroButton
        variant="sm"
        type="button"
        class="note-editor__add-first"
        @click="onAddBody"
      >
        {{ t('editor.addFirstBody') }}
      </RetroButton>
    </template>
    <template v-else>
      <div class="note-editor__head">
        <span class="note-editor__label">{{ t('editor.bodyLabel') }}</span>
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
          >{{ t('editor.copied') }}</span>
          <button
            type="button"
            class="note-editor__copy"
            :title="t('editor.copyTitle')"
            :aria-label="t('editor.copyAriaLabel')"
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
        :aria-label="t('editor.bodiesTablist')"
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
            {{ bodyListLabel(b, i) }}
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
  padding: 12px;
  background:
    radial-gradient(
      ellipse 100% 70% at 50% 0%,
      color-mix(in srgb, var(--accent) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-primary);
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
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.note-editor__head-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
}

.note-editor__label {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.012em;
}

.note-editor__tabs {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 0 0 auto;
  max-height: min(40vh, 200px);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
}

.note-editor__tab {
  display: flex;
  align-items: stretch;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.note-editor__tab--active {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
}

.note-editor__tab-main {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 7px 9px;
  border: none;
  border-radius: var(--radius-md);
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
  color: var(--text-primary);
}

.note-editor__tab--active .note-editor__tab-main {
  color: var(--text-primary);
  font-weight: 600;
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
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
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
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
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
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--accent);
  font-family: var(--font-mono, inherit);
  font-size: var(--font-size-sm);
  overflow-x: auto;
}

.note-editor__code {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 10px;
  background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
}

.note-editor__code-head {
  margin-bottom: 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
</style>
