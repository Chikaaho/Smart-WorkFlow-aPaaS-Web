<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue'

/** 用法说明的落点：界面只留小问号，完整文案悬停展示（BF20261013-024）。 */
defineProps<{ content: string }>()
</script>

<template>
  <el-tooltip placement="top" effect="dark" :show-after="120">
    <template #content>
      <div style="max-width: 340px; line-height: 1.6">{{ content }}</div>
    </template>
    <el-icon class="hint-tip"><QuestionFilled /></el-icon>
  </el-tooltip>
</template>

<style scoped>
.hint-tip {
  margin-left: 4px;
  color: var(--el-text-color-secondary);
  cursor: help;
  vertical-align: -2px;
}
</style>
