<script setup lang="ts">
import RetroInput from '@/components/ui/RetroInput.vue'

const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="dict-search">
    <RetroInput
      id="dict-search-input"
      :model-value="model"
      placeholder="SEARCH dictionary..."
      @update:model-value="model = $event"
    />
  </div>
</template>

<style scoped>
.dict-search {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
</style>
