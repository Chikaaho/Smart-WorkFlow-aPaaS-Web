<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="blank-page">
    <p>{{ route.meta.title ?? '占位页面' }}</p>
    <!-- TODO(skeleton): 业务内容待后续迭代实现 -->
  </div>
</template>
