<script setup lang="ts">
/**
 * ListPagination — 分页区。
 * 右对齐容器，内用 el-pagination；文案与间距走 --sw-* token。
 */
import { computed } from 'vue'

const props = defineProps<{
  total: number
  pageNum: number
  pageSize: number
}>()

const emit = defineEmits<{
  'update:pageNum': [value: number]
  'update:pageSize': [value: number]
}>()

const currentPage = computed({
  get: () => Number(props.pageNum) || 1,
  set: (v: number) => emit('update:pageNum', v),
})

const pageSize = computed({
  get: () => Number(props.pageSize) || 10,
  set: (v: number) => emit('update:pageSize', v),
})

/**
 * total 必须是 number：后端 JacksonLongToStringConfig 把 PageResult.total（Long）
 * 序列化为字符串，直接透传会被 Element Plus 的 isAbsent（typeof !== 'number'）
 * 判为缺省，整个分页条静默消失（V012-BUG-003 根因，服务端分页列表全量命中）。
 */
const pageTotal = computed(() => {
  const n = Number(props.total)
  return Number.isFinite(n) ? n : 0
})
</script>

<template>
  <div class="list-pagination">
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :total="pageTotal"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      background
    />
  </div>
</template>

<style scoped>
.list-pagination {
  display: flex;
  justify-content: flex-end;
  padding: var(--sw-space-16) 0;
  font-size: var(--sw-font-secondary);
  color: var(--sw-text-secondary);
}
</style>
