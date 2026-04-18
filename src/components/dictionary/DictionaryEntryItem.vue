<script setup lang="ts">

import { ref } from 'vue'

import type { DictionaryEntry } from '@/types/dictionary'

import RetroConfirm from '@/components/ui/RetroConfirm.vue'



const props = defineProps<{ entry: DictionaryEntry }>()

const emit = defineEmits<{ delete: [] }>()



const confirming = ref(false)



function askDelete(): void {

  confirming.value = true

}



function onConfirmDelete(): void {

  emit('delete')

}

</script>



<template>

  <div class="entry">

    <div class="entry__head">

      <div class="entry__meta-row">

        <span class="entry__lang">{{ props.entry.source_lang }}→{{ props.entry.target_lang }}</span>

        <span class="entry__type">[{{ props.entry.entry_type }}]</span>

      </div>

      <div class="entry__head-actions">

        <span class="entry__date">{{ props.entry.created_at.slice(0, 10) }}</span>

        <button

          type="button"

          class="entry__del-icon"

          title="Delete entry"

          aria-label="Delete dictionary entry"

          @click.stop="askDelete"

        >

          <svg class="entry__del-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">

            <path

              fill="currentColor"

              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"

            />

          </svg>

        </button>

      </div>

    </div>



    <div class="entry__line">

      <span class="entry__label">{{ props.entry.source_lang.toUpperCase() }}:</span>

      <span class="entry__source-text">{{ props.entry.source_text }}</span>

    </div>



    <div class="entry__line">

      <span class="entry__label">{{ props.entry.target_lang.toUpperCase() }}:</span>

      <span class="entry__translated-text">{{ props.entry.translated_text }}</span>

    </div>



    <div v-if="props.entry.custom_note" class="entry__note">

      <span class="entry__meta-label">NOTE</span>

      {{ props.entry.custom_note }}

    </div>



  </div>



  <RetroConfirm

    :open="confirming"

    :message="`Delete &quot;${props.entry.source_text}&quot;?`"

    @update:open="confirming = $event"

    @confirm="onConfirmDelete"

    @cancel="confirming = false"

  />

</template>



<style scoped>

.entry {

  padding: 8px 8px 6px;

  border-bottom: 1px solid var(--border);

  font-size: var(--font-size-sm);

}



.entry__head {

  display: flex;

  align-items: center;

  justify-content: space-between;

  gap: 8px;

  margin-bottom: 6px;

}



.entry__meta-row {

  display: flex;

  gap: 5px;

  align-items: baseline;

  flex-wrap: wrap;

  min-width: 0;

}



.entry__lang {

  flex-shrink: 0;

  font-size: 9px;

  color: var(--accent);

  border: 1px solid var(--border);

  padding: 0 4px;

  text-transform: uppercase;

  letter-spacing: 0.06em;

  line-height: 1.6;

}



.entry__type {

  flex-shrink: 0;

  font-size: 9px;

  color: var(--text-muted);

  letter-spacing: 0.04em;

}



.entry__line {

  display: flex;

  gap: 6px;

  align-items: flex-start;

  margin-bottom: 5px;

  line-height: 1.45;

  word-break: break-word;

}



.entry__label {

  flex-shrink: 0;

  font-size: 10px;

  font-weight: 600;

  color: var(--text-muted);

  letter-spacing: 0.02em;

  padding-top: 1px;

}



.entry__source-text {

  color: var(--text-primary);

  font-weight: 500;

  min-width: 0;

}



/* Cùng tông xanh với popup dịch (popup-styles: light #1565c0, dark #7ec8ff) */

.entry__translated-text {

  min-width: 0;

  font-weight: 600;

  color: #1565c0;

}



@media (prefers-color-scheme: dark) {

  .entry__translated-text {

    color: #7ec8ff;

  }

}



.entry__note {

  margin: 4px 0 6px;

  padding-top: 4px;

  border-top: 1px dashed var(--border);

  font-size: 11px;

  color: var(--text-muted);

  line-height: 1.4;

  word-break: break-word;

}



.entry__meta-label {

  font-size: 9px;

  color: var(--text-muted);

  opacity: 0.6;

  text-transform: uppercase;

  letter-spacing: 0.06em;

  margin-right: 5px;

}



.entry__head-actions {

  display: flex;

  flex-shrink: 0;

  align-items: center;

  gap: 6px;

}



.entry__date {

  font-size: 10px;

  color: var(--text-muted);

  opacity: 0.6;

}



.entry__del-icon {

  display: inline-flex;

  align-items: center;

  justify-content: center;

  width: 26px;

  height: 26px;

  padding: 0;

  border: 1px solid var(--border);

  border-radius: 2px;

  background: transparent;

  color: var(--text-muted);

  cursor: pointer;

}



.entry__del-icon:hover {

  color: var(--danger);

  border-color: var(--danger);

  background: rgba(184, 69, 58, 0.08);

}



.entry__del-svg {

  width: 15px;

  height: 15px;

  display: block;

}

</style>


