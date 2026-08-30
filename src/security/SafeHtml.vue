<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeHtml } from './sanitize'

const props = defineProps<{ html: string }>()
const safe = computed(() => sanitizeHtml(props.html))
</script>

<template>
  <!-- 唯一允许出现 v-html 的组件，业务层渲染用户产生的 HTML 必须经此组件 -->
  <div v-html="safe" />
</template>
