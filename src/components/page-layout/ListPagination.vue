<script setup lang="ts">
/**
 * ListPagination — 统一分页区。
 *
 * 整页列表、弹窗选择器、控制台紧凑列表共用本组件：
 * - layout / pageSizes / small 透传给 el-pagination；
 * - hideTotal / hideSizes 从 layout 中剔除对应区段；
 * - totalText 在左侧单独展示「共 N 条记录」（弹窗两栏布局），此时 layout 自动去掉 total；
 * - align / inset 控制整条对齐与上下留白；
 * - showWhenSinglePage=false 时仅一页不渲染（内嵌小列表）。
 */
import { computed } from 'vue'
import { useI18n } from '@/locales'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    /** 后端可能下发字符串形式的 Long，组件内部统一归一为 number */
    total: number | string
    pageNum: number
    pageSize: number
    /** el-pagination layout；默认整页布局 */
    layout?: string
    pageSizes?: number[]
    small?: boolean
    /** 从 layout 中剔除 total 区段 */
    hideTotal?: boolean
    /** 从 layout 中剔除 sizes 区段（同时不传 page-sizes） */
    hideSizes?: boolean
    /** 左侧独立总数文案（弹窗/卡片内两栏布局）；开启后 layout 自动剔除 total */
    totalText?: boolean
    align?: 'start' | 'center' | 'end' | 'space-between'
    /** 容器上下留白；弹窗内一般传 false */
    inset?: boolean
    /** 仅一页时是否仍渲染；内嵌小列表传 false */
    showWhenSinglePage?: boolean
    testId?: string
    appearance?: 'default' | 'design'
  }>(),
  {
    layout: 'total, sizes, prev, pager, next, jumper',
    pageSizes: () => [10, 20, 50, 100],
    align: 'end',
    inset: true,
    showWhenSinglePage: true,
    testId: undefined,
    appearance: 'default',
  },
)

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

const effectiveLayout = computed(() => {
  const removed = new Set<string>()
  if (props.hideTotal || props.totalText) removed.add('total')
  if (props.hideSizes) removed.add('sizes')
  return props.layout
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !removed.has(part))
    .join(', ')
})

const visible = computed(
  () => props.showWhenSinglePage || pageTotal.value > (Number(props.pageSize) || 10),
)
</script>

<template>
  <div
    v-if="visible"
    class="list-pagination"
    :class="[
      `list-pagination--${align}`,
      { 'list-pagination--flush': !inset, 'list-pagination--design': appearance === 'design' },
    ]"
  >
    <span v-if="totalText" class="list-pagination__total">{{
      t(appearance === 'design' ? 'common.totalItems' : 'common.totalRecords', { total: pageTotal })
    }}</span>
    <el-pagination
      v-if="effectiveLayout"
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :total="pageTotal"
      :page-sizes="hideSizes ? undefined : pageSizes"
      :layout="effectiveLayout"
      :small="small"
      :data-test="testId"
      :prev-text="appearance === 'design' ? t('common.previousPage') : undefined"
      :next-text="appearance === 'design' ? t('common.nextPage') : undefined"
      background
    />
  </div>
</template>

<style scoped>
.list-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sw-space-12);
  padding: var(--sw-space-16) 0;
  font-size: var(--sw-font-secondary);
  color: var(--sw-text-secondary);
}

.list-pagination--flush {
  padding: 0;
}

.list-pagination--start {
  justify-content: flex-start;
}

.list-pagination--center {
  justify-content: center;
}

.list-pagination--space-between {
  justify-content: space-between;
}

.list-pagination__total {
  flex: 0 0 auto;
}
.list-pagination--design :deep(.el-pagination) {
  gap: var(--sw-space-8);
  --el-pagination-button-bg-color: var(--sw-surface-page);
}
.list-pagination--design :deep(.btn-prev),
.list-pagination--design :deep(.btn-next) {
  width: 80px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  margin: 0;
}
.list-pagination--design :deep(.el-pager li) {
  margin: 0;
  border-radius: var(--sw-radius-base);
}
.list-pagination--design :deep(.el-pagination__sizes),
.list-pagination--design :deep(.el-pagination__jump) {
  margin: 0;
}
.list-pagination--design :deep(.el-pagination__sizes .el-select) {
  width: 112px;
}
.list-pagination--design :deep(.el-pagination__editor) {
  width: 44px;
}
.list-pagination--design :deep(.el-pagination__jump) {
  width: 124px;
  justify-content: flex-start;
  gap: var(--sw-space-8);
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}
.list-pagination--design :deep(.el-pagination__goto),
.list-pagination--design :deep(.el-pagination__classifier) {
  margin: 0;
}
</style>
