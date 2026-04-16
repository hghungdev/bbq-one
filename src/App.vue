<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView class="app-root" />
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 100%;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}
</style>
