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

defineProps<{
  title?: string
  total: number
  pageNum: number
  pageSize: number
  empty?: boolean
}>()

const emit = defineEmits<{
  'update:pageNum': [value: number]
  'update:pageSize': [value: number]
}>()
</script>

<template>
  <div class="standard-list">
    <!-- 工具栏：标题 + 记录数 + 操作 -->
    <ListToolbar :title="title" :total="total">
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

    <!-- 主体：空态 或 表格 -->
    <ListEmpty v-if="empty" :description="undefined">
      <template v-if="$slots['empty-action']" #action>
        <slot name="empty-action" />
      </template>
    </ListEmpty>
    <ListTable v-else>
      <slot />
    </ListTable>

    <!-- 分页 -->
    <ListPagination
      :total="total"
      :page-num="pageNum"
      :page-size="pageSize"
      @update:page-num="emit('update:pageNum', $event)"
      @update:page-size="emit('update:pageSize', $event)"
    />
  </div>
</template>

<style scoped>
.standard-list {
  padding: var(--sw-space-24);
}
</style>
