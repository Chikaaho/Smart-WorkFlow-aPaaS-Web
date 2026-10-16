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
    total: number
    pageNum: number
    pageSize: number
    empty?: boolean
  }>(),
  { showToolbarTotal: false },
)

const emit = defineEmits<{
  'update:pageNum': [value: number]
  'update:pageSize': [value: number]
}>()
</script>

<template>
  <div class="standard-list">
    <!-- 工具栏：标题 + 记录数 + 操作 -->
    <ListToolbar
      :title="props.title"
      :description="props.description"
      :large="props.large"
      :total="props.showToolbarTotal ? props.total : undefined"
    >
      <template v-if="$slots['toolbar-actions']" #actions>
        <slot name="toolbar-actions" />
      </template>
    </ListToolbar>

    <!-- 筛选区（BF20261013-040：两个槽都为空时不渲染——否则会留一条 48px 的空白白条） -->
    <ListFilterBar v-if="$slots.filter || $slots['filter-actions']">
      <slot name="filter" />
      <template v-if="$slots['filter-actions']" #actions>
        <slot name="filter-actions" />
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
    </ListTable>

    <!-- 分页 -->
    <ListPagination
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
  padding: 20px 24px 12px;
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
  margin: 0 0 var(--sw-space-12);
}
</style>
