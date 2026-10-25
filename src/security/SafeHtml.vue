<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeHtml } from './sanitize'
import { renderRichTextHtml } from '@/modules/form/rich-text'

const props = defineProps<{ html: string; richText?: boolean }>()
// richText 走 RICH_TEXT 专用清洗（受控令牌→固定内联样式）；其余仍走通用白名单。
const safe = computed(() =>
  props.richText ? renderRichTextHtml(props.html) : sanitizeHtml(props.html),
)
</script>

<template>
  <!-- 唯一允许出现 v-html 的组件，业务层渲染用户产生的 HTML 必须经此组件 -->
  <div v-html="safe" />
</template>
