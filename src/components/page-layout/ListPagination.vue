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
  get: () => props.pageNum,
  set: (v: number) => emit('update:pageNum', v),
})

const pageSize = computed({
  get: () => props.pageSize,
  set: (v: number) => emit('update:pageSize', v),
})
</script>

<template>
  <div class="list-pagination">
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :total="total"
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
