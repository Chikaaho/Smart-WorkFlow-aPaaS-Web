<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue'

/** 用法说明的落点：界面只留小问号，完整文案悬停展示（BF20261013-024）。 */
defineProps<{ content: string }>()
</script>

<template>
  <el-tooltip
    placement="top"
    effect="dark"
    :show-after="120"
    :trigger="['hover', 'focus', 'click']"
  >
    <template #content>
      <div style="max-width: 340px; line-height: 1.6">{{ content }}</div>
    </template>
    <button type="button" class="hint-tip" :aria-label="content">
      <el-icon aria-hidden="true"><QuestionFilled /></el-icon>
    </button>
  </el-tooltip>
</template>

<style scoped>
.hint-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  margin-left: 4px;
  color: var(--el-text-color-secondary);
  cursor: help;
  vertical-align: -2px;
}
.hint-tip:focus-visible {
  outline: 2px solid var(--sw-color-primary);
  outline-offset: 2px;
  border-radius: 50%;
}
</style>
