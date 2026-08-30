<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="error-page">
    <h1>{{ route.meta.errorCode }}</h1>
    <p>{{ route.meta.title ?? '出错了' }}</p>
  </div>
</template>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 8px;
}
.error-page h1 {
  font-size: 64px;
  margin: 0;
  color: #999;
}
</style>
