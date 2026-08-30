<script setup lang="ts">
/**
 * ListTable — 表格卡片容器。
 * 只提供卡片外壳与密度样式。数据/列定义由调用方在默认 slot 里写 <el-table>。
 * 不传 :data、不动态推列（决策 A：壳给槽，调用方塞内容）。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
defineProps<{}>()
</script>

<template>
  <div class="list-table">
    <slot />
  </div>
</template>

<style scoped>
.list-table {
  background: #fff;
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  overflow: hidden;
}

/* ── 密度样式：表格行高 / 单元格内距 ── */
.list-table :deep(.el-table__body-wrapper .el-table__row) {
  height: var(--sw-table-row-height);
}

.list-table :deep(.el-table__header-wrapper th) {
  background: var(--sw-fill-base);
  font-size: var(--sw-font-caption);
  font-weight: var(--sw-font-weight-caption);
  height: var(--sw-table-row-height-compact);
}

.list-table :deep(.el-table td),
.list-table :deep(.el-table th) {
  padding-left: var(--sw-cell-padding-x);
  padding-right: var(--sw-cell-padding-x);
}

.list-table :deep(.el-table) {
  border-radius: var(--sw-radius-card);
}
</style>
