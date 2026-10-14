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
  background: #fafbfe;
  font-size: var(--sw-font-caption);
  font-weight: 600;
  height: var(--sw-table-row-height-compact);
}

/* BF20261013-040：单元格左右内距 = 标准 16px，**替换** Element Plus 的 .cell 默认 12px。
   此前写在 td/th 上，与 .cell 的 12px 叠加成 28px/侧，窄列表头放不下文字就换行
   （70px 列放不下 2 字标签、100px 列放不下 4 字标签）。 */
.list-table :deep(.el-table td .cell),
.list-table :deep(.el-table th .cell) {
  padding-left: var(--sw-cell-padding-x);
  padding-right: var(--sw-cell-padding-x);
}

.list-table :deep(.el-table) {
  border-radius: var(--sw-radius-card);
}
</style>
