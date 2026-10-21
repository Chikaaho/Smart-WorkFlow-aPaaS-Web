import { computed, ref, type Ref } from 'vue'

/**
 * useClientList — 客户端分页 + 关键词筛选。
 *
 * 适用于接口一次返回全量数组的列表页（服务端未提供分页端点的场景）：
 * 页面只维护原始数据，筛选、切片、页码与总数由本组合式统一维护。
 * 关键词只在点击「查询」时生效（currentKeyword），输入过程中不改变表格。
 */
export interface ClientListOptions<T> {
  pageSize?: number
  /** 参与关键词匹配的字段（大小写不敏感，包含匹配）。 */
  searchFields: (row: T) => Array<string | number | null | undefined>
}

export function useClientList<T>(source: Ref<T[]>, options: ClientListOptions<T>) {
  const keyword = ref('')
  const currentKeyword = ref('')
  const pageNum = ref(1)
  const pageSize = ref(options.pageSize ?? 10)

  const filteredRows = computed<T[]>(() => {
    const needle = currentKeyword.value.trim().toLowerCase()
    if (!needle) return source.value
    return source.value.filter((row) =>
      options.searchFields(row).some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(needle),
      ),
    )
  })

  const pagedRows = computed<T[]>(() => {
    const start = (pageNum.value - 1) * pageSize.value
    return filteredRows.value.slice(start, start + pageSize.value)
  })

  const total = computed(() => filteredRows.value.length)

  function handleQuery() {
    currentKeyword.value = keyword.value.trim()
    pageNum.value = 1
  }

  function handleReset() {
    keyword.value = ''
    currentKeyword.value = ''
    pageNum.value = 1
  }

  function handlePageNumChange(page: number) {
    pageNum.value = page
  }

  function handlePageSizeChange(size: number) {
    pageSize.value = size
    pageNum.value = 1
  }

  return {
    keyword,
    currentKeyword,
    pageNum,
    pageSize,
    filteredRows,
    pagedRows,
    total,
    handleQuery,
    handleReset,
    handlePageNumChange,
    handlePageSizeChange,
  }
}
