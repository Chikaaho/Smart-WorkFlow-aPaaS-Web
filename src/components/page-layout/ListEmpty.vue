<script setup lang="ts">
/**
 * ListEmpty — 空态占位。
 * 包装 el-empty，文案/间距走 --sw-* token。
 * #action slot 可选，如"新建"按钮。
 */
withDefaults(defineProps<{ description?: string }>(), { description: '暂无数据' })
</script>

<template>
  <div class="list-empty">
    <el-empty :description="description">
      <template v-if="$slots.action" #default>
        <slot name="action" />
      </template>
    </el-empty>
  </div>
</template>

<style scoped>
.list-empty {
  padding: var(--sw-space-32) 0;
  color: var(--sw-text-secondary);
}
</style>
