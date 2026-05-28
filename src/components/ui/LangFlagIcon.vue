<script setup lang="ts">
defineProps<{
  locale: 'en' | 'vi'
}>()
</script>

<template>
  <span class="lang-flag-root" aria-hidden="true">
    <!-- US: simplified stripes + canton (stars omitted); geometry ~ 1:1.9 fly -->
    <svg
      v-if="locale === 'en'"
      class="lang-flag-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 57 30"
    >
      <rect width="57" height="30" fill="#B22234" />
      <rect x="0" y="2.3077" width="57" height="2.3077" fill="#fff" />
      <rect x="0" y="6.9231" width="57" height="2.3077" fill="#fff" />
      <rect x="0" y="11.5385" width="57" height="2.3077" fill="#fff" />
      <rect x="0" y="16.1538" width="57" height="2.3077" fill="#fff" />
      <rect x="0" y="20.7692" width="57" height="2.3077" fill="#fff" />
      <rect x="0" y="25.3846" width="57" height="2.3077" fill="#fff" />
      <rect x="0" y="0" width="22.8" height="16.154" fill="#3C3B6E" />
    </svg>
    <svg v-else class="lang-flag-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 30">
      <rect width="57" height="30" fill="#DA251D" />
      <!-- pentagram centered; Ro≈8, Ri≈8/φ² — φ from vertical clockwise -->
      <path
        fill="#FFCD00"
        d="M28.5 7L30.294 12.527L36.109 12.527L31.449 15.946L33.202 21.472L28.5 18.055L23.798 21.472L25.694 15.946L20.891 12.528L26.706 12.527Z"
      />
    </svg>
  </span>
</template>

<style scoped>
.lang-flag-root {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.lang-flag-svg {
  display: block;
  width: 32px;
  height: calc(32px * 30 / 57);
  border-radius: var(--radius-sm);
  box-shadow: 0 0 0 1px var(--panel-ring);
}
</style>
