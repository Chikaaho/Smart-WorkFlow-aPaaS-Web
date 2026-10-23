<script setup lang="ts">
/**
 * StandardListTemplate — 页型B（数据列表页）标准模板。
 *
 * 组合：ListToolbar + ListFilterBar + ListTable + ListPagination。
 * 数据外部进（props + slots），零 onMounted / 零路由耦合。
 * 0.1.7 #7：空列表也保留表格表头，空态文案由 el-table 内建「暂无数据」展示；
 * empty-action 槽（如「新建」按钮）移到表格卡片底部继续可用。
 */
import ListToolbar from './ListToolbar.vue'
import ListFilterBar from './ListFilterBar.vue'
import ListTable from './ListTable.vue'
import ListPagination from './ListPagination.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    large?: boolean
    /** 工具栏内联「共 N 条记录」：默认关闭，总条数统一由右下角分页区展示（V012-BUG-003） */
    showToolbarTotal?: boolean
    /** 筛选区排布：grid（默认，12 格栅格）| inline（批量操作条等非搜索场景） */
    filterLayout?: 'grid' | 'inline'
    /** 新稿列表：筛选、标题、按内容收高的表格与卡片内分页。 */
    appearance?: 'default' | 'design'
    /** 树形或一次加载完成的列表可隐藏分页控件。 */
    hidePagination?: boolean
    total: number
    pageNum: number
    pageSize: number
    empty?: boolean
  }>(),
  {
    title: '',
    description: '',
    showToolbarTotal: false,
    filterLayout: 'grid',
    appearance: 'default',
    hidePagination: false,
  },
)

const emit = defineEmits<{
  'update:pageNum': [value: number]
  'update:pageSize': [value: number]
}>()
</script>

<template>
  <div class="standard-list" :class="{ 'standard-list--design': appearance === 'design' }">
    <!-- 0.1.7 #25：搜索/筛选栏是页面最顶部的元素——原「工具栏」动作按钮（新建等）
         并入筛选栏动作区（toolbar-actions 在 filter-actions 之前），独立工具栏行取消；
         ListToolbar 仅在显式传 title/total 的页面保留（0.1.7 #10 已全局去标题）。 -->
    <ListToolbar
      v-if="props.title || props.showToolbarTotal"
      :title="props.title"
      :description="props.description"
      :large="props.large"
      :total="props.showToolbarTotal ? props.total : undefined"
    />

    <!-- 筛选区（BF20261013-040：所有动作槽都为空时不渲染——否则会留一条空白白条） -->
    <ListFilterBar
      v-if="$slots.filter || $slots['filter-actions'] || $slots['toolbar-actions']"
      :layout="props.filterLayout"
    >
      <slot name="filter" />
      <template v-if="$slots['filter-actions'] || $slots['toolbar-actions']" #actions>
        <template v-if="appearance === 'design'">
          <slot name="filter-actions" />
          <slot name="toolbar-actions" />
        </template>
        <template v-else>
          <slot name="toolbar-actions" />
          <slot name="filter-actions" />
        </template>
      </template>
    </ListFilterBar>

    <!-- 面板标题（可选）：数据表上方的小节标题行（如 P53 设计02「流程申请」） -->
    <div v-if="$slots['table-title']" class="standard-list__panel-head">
      <slot name="table-title" />
    </div>

    <!-- 主体：表格（0.1.7 #7：空列表同样渲染表头） -->
    <ListTable>
      <slot />
      <div v-if="props.empty && $slots['empty-action']" class="standard-list__empty-actions">
        <slot name="empty-action" />
      </div>
      <ListPagination
        v-if="appearance === 'design' && !props.hidePagination"
        :total="props.total"
        :page-num="props.pageNum"
        :page-size="props.pageSize"
        total-text
        appearance="design"
        align="space-between"
        layout="prev, pager, next, sizes, jumper"
        @update:page-num="emit('update:pageNum', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
    </ListTable>

    <!-- 分页 -->
    <ListPagination
      v-if="appearance !== 'design' && !props.hidePagination"
      :total="props.total"
      :page-num="props.pageNum"
      :page-size="props.pageSize"
      @update:page-num="emit('update:pageNum', $event)"
      @update:page-size="emit('update:pageSize', $event)"
    />
  </div>
</template>

<style scoped>
/* 0.1.7 #10：纵向 flex 画布——数据卡片撑满可视区，分页固定在画布右下角，
   不随行数上下浮动；四周留白收敛让数据展示区尽量铺满。 */
.standard-list {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 100%;
  padding: 12px 16px 8px;
}
.standard-list > .list-table {
  flex: 1 0 auto;
}
.standard-list__empty-actions {
  display: flex;
  justify-content: center;
  padding: 0 0 var(--sw-space-16);
}
.standard-list__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 var(--sw-space-8);
}

.standard-list--design {
  --sw-list-table-header-background: var(--sw-surface-page);
  --el-border-color: var(--sw-border-light);
  --el-input-border-color: var(--sw-border-light);
  --el-select-border-color: var(--sw-border-light);
  min-height: 0;
  padding: var(--sw-space-20);
  gap: var(--sw-space-16);
}
.standard-list--design > .list-filter-bar {
  order: 0;
  margin: 0;
  border: 1px solid var(--sw-border-light);
  padding: calc(var(--sw-space-16) - 1px) var(--sw-space-16);
  box-shadow: none;
}
.standard-list--design > .list-toolbar {
  order: 1;
  margin: 0;
  min-height: var(--sw-space-24);
}
.standard-list--design :deep(.list-toolbar__title) {
  font-weight: var(--sw-font-weight-emphasis);
  line-height: var(--sw-space-24);
}
.standard-list--design > .list-table {
  order: 2;
  flex: 0 0 auto;
  border: 1px solid var(--sw-border-light);
  box-shadow: none;
}
.standard-list--design :deep(.list-pagination) {
  box-sizing: border-box;
  height: 50px;
  padding: 0 var(--sw-space-16);
  font-size: var(--sw-font-caption);
}
.standard-list--design :deep(.list-table .el-table__header-wrapper th) {
  height: var(--sw-list-design-header-height);
  background: var(--sw-surface-page);
  font-weight: var(--sw-font-weight-body);
  border-bottom-color: transparent;
}
.standard-list--design :deep(.el-table td .cell) {
  color: var(--sw-text-primary);
}
.standard-list--design :deep(.el-input__wrapper) {
  padding-inline: 13px;
}
.standard-list--design :deep(.el-select__wrapper) {
  padding-inline: 13px;
}
.standard-list--design :deep(.el-select__placeholder.is-transparent) {
  color: var(--sw-text-regular);
}
.standard-list--design :deep(.list-actions) {
  gap: var(--sw-space-8);
  height: 32px;
}
.standard-list--design :deep(.list-actions .el-button.is-link) {
  min-width: 40px;
  height: 32px;
  font-size: var(--sw-font-body);
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 22px;
}
.standard-list--design :deep(.el-table__body-wrapper .el-table__row) {
  height: var(--sw-list-design-row-height);
}
.standard-list--design :deep(.el-table .cell) {
  text-align: left;
  line-height: 22px;
}
.standard-list--design :deep(.el-table th .cell) {
  line-height: 18px;
}
.standard-list--design :deep(.el-table),
.standard-list--design :deep(.el-table__inner-wrapper::before) {
  border-radius: 0;
}
</style>
