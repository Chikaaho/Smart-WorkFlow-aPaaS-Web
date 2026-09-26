<script setup lang="ts">
/**
 * StandardListTemplate — 页型B（数据列表页）标准模板。
 *
 * 组合：ListToolbar + ListFilterBar + 主体（ListTable 或 ListEmpty） + ListPagination。
 * 数据外部进（props + slots），零 onMounted / 零路由耦合。
 */
import ListToolbar from './ListToolbar.vue'
import ListFilterBar from './ListFilterBar.vue'
import ListTable from './ListTable.vue'
import ListEmpty from './ListEmpty.vue'
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

    <!-- 筛选区 -->
    <ListFilterBar>
      <slot name="filter" />
      <template v-if="$slots['filter-actions']" #actions>
        <slot name="filter-actions" />
      </template>
    </ListFilterBar>

    <!-- 面板标题（可选）：数据表上方的小节标题行（如 P53 设计02「流程申请」） -->
    <div v-if="$slots['table-title']" class="standard-list__panel-head">
      <slot name="table-title" />
    </div>

    <!-- 主体：空态 或 表格 -->
    <ListEmpty v-if="props.empty" :description="undefined">
      <template v-if="$slots['empty-action']" #action>
        <slot name="empty-action" />
      </template>
    </ListEmpty>
    <ListTable v-else>
      <slot />
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
.standard-list {
  padding: 40px 32px 32px;
}
.standard-list__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 var(--sw-space-12);
}
</style>
