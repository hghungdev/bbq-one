<script setup lang="ts">
import { ref } from 'vue'
import type { BookmarkNode } from '@/types/bookmark'

const props = defineProps<{ nodes: BookmarkNode[]; depth?: number }>()
const depth = props.depth ?? 0
const collapsed = ref<Set<string>>(new Set())

function toggle(id: string): void {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}
</script>

<template>
  <ul class="bm-tree" :class="depth > 0 ? 'bm-tree--child' : ''">
    <li v-for="node in nodes" :key="node.id" class="bm-tree__item">
      <!-- Folder -->
      <div v-if="!node.url" class="bm-tree__row bm-tree__row--folder" @click="toggle(node.id)">
        <span class="bm-tree__icon">{{ collapsed.has(node.id) ? '▶' : '▼' }}</span>
        <span class="bm-tree__title">{{ node.title || '(no name)' }}</span>
        <span v-if="node.children" class="bm-tree__count">{{ node.children.length }}</span>
      </div>
      <!-- Bookmark link -->
      <div v-else class="bm-tree__row bm-tree__row--link">
        <span class="bm-tree__icon bm-tree__icon--link">›</span>
        <a :href="node.url" target="_blank" class="bm-tree__link" :title="node.url">
          {{ node.title || node.url }}
        </a>
      </div>
      <!-- Children đệ quy -->
      <BookmarkTree
        v-if="node.children && !collapsed.has(node.id)"
        :nodes="node.children"
        :depth="depth + 1"
      />
    </li>
  </ul>
</template>

<style scoped>
.bm-tree { list-style: none; margin: 0; padding: 0; }
.bm-tree--child { padding-left: 16px; }
.bm-tree__item { margin: 0; }
.bm-tree__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  font-size: var(--font-size-sm);
  cursor: pointer;
  border-radius: 2px;
}
.bm-tree__row:hover { background: var(--bg-panel); }
.bm-tree__row--folder { color: var(--accent); font-weight: 500; }
.bm-tree__row--link { color: var(--text-secondary); cursor: default; }
.bm-tree__icon { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.bm-tree__icon--link { color: var(--text-muted); }
.bm-tree__title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-tree__count {
  font-size: 10px;
  color: var(--text-muted);
  padding: 0 4px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.bm-tree__link {
  color: var(--text-secondary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.bm-tree__link:hover { color: var(--accent); text-decoration: underline; }
</style>
