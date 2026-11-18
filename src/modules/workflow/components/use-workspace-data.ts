import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { Document } from '@element-plus/icons-vue'
import { queryCatalogItems, queryMyCopies, type CatalogItem } from '@/modules/workflow/api/oa'
import { queryTodoTasks, myInstances, myDrafts, myProcessed } from '@/modules/workflow/api'
import type { WorkspaceComponent } from '@/contracts/catalog'

export type PageExtra = { badge?: string; urgentTotal?: number }

export interface WorkspaceDataDeps {
  components: Ref<WorkspaceComponent[]>
  favoriteKeys: Ref<string[]>
  rendererKeyOf: (key: string) => string
  showTodoPanel: ComputedRef<boolean>
  showStats: ComputedRef<boolean>
  showActivity: ComputedRef<boolean>
}

/**
 * 工作台组件数据：待办/已办/发起/抄送/草稿真实列表与分页 total、常用事项、
 * 统计卡派生（设计01：统计只使用真实分页 total，不伪造时间/超时维度）。
 * 隐藏组件不查询数据。
 */
export function useWorkspaceData(deps: WorkspaceDataDeps) {
  const { t } = useI18n()
  const { components, favoriteKeys, rendererKeyOf, showTodoPanel, showStats, showActivity } = deps

  // ─── 组件数据 ───
  const todoList = ref<Array<Record<string, unknown>>>([])
  const processedList = ref<Array<Record<string, unknown>>>([])
  const initiatedList = ref<Array<Record<string, unknown>>>([])
  const ccList = ref<Array<Record<string, unknown>>>([])
  const draftsList = ref<Array<Record<string, unknown>>>([])
  const favoriteItems = ref<CatalogItem[]>([])
  const todoExtra = ref<PageExtra>({})
  const processedExtra = ref<PageExtra>({})
  const initiatedExtra = ref<PageExtra>({})
  const draftsExtra = ref<PageExtra>({})

  // ─── 问候与真实统计（设计01：统计只使用真实分页 total，不伪造时间/超时维度） ───
  const todoTotal = ref(0)
  const initiatedTotal = ref(0)
  const processedTotal = ref(0)
  const draftsTotal = ref(0)
  const ccTotal = ref(0)

  // ─── B021-007 批次5：独立指标卡（设计01/工作台配置）──
  // typeCode → stats 计算属性指标键；画布/预览/首页共用同一形态。
  const STAT_METRIC_BY_TYPE: Record<string, string> = {
    statTodo: 'todo',
    statInitiated: 'initiated',
    statProcessed: 'processed',
    statDrafts: 'drafts',
  }

  const hasStatMetric = computed(() =>
    components.value.some((c) => c.visible && !!STAT_METRIC_BY_TYPE[c.typeCode ?? '']),
  )

  const stats = computed(() => [
    {
      key: 'todo',
      label: t('workspace.statMyTodo'),
      value: todoTotal.value,
      // 设计01：辅助文字右对齐；临期数来自真实分页附加字段（缺省 0，不伪造）
      helper: t('workspace.urgentCount', { count: todoExtra.value.urgentTotal ?? 0 }),
    },
    {
      key: 'initiated',
      label: t('workspace.statInitiated'),
      value: initiatedTotal.value,
      helper: initiatedExtra.value.badge,
    },
    {
      key: 'processed',
      label: t('workspace.statProcessed'),
      value: processedTotal.value,
      helper: processedExtra.value.badge ?? t('workspace.viewRecord'),
    },
    {
      key: 'drafts',
      label: t('workspace.statDrafts'),
      value: draftsTotal.value,
      helper: draftsExtra.value.badge ?? t('workflow.continueEditing'),
    },
  ])

  function statMetricOf(key: string) {
    const component = components.value.find((item) => item.key === key)
    const metricKey = STAT_METRIC_BY_TYPE[component?.typeCode ?? '']
    if (!metricKey) return null
    return stats.value.find((s) => s.key === metricKey) ?? null
  }

  /** 统计卡图标（设计01：右上简洁文档图标；数值全部为真实 total） */
  const STAT_ICONS: Record<string, { icon: unknown; bg: string; color: string }> = {
    todo: { icon: Document, bg: 'transparent', color: 'var(--sw-color-primary)' },
    initiated: { icon: Document, bg: 'transparent', color: 'var(--sw-color-primary)' },
    processed: { icon: Document, bg: 'transparent', color: 'var(--sw-color-primary)' },
    drafts: { icon: Document, bg: 'transparent', color: 'var(--sw-color-primary)' },
  }

  /** 快捷发起：设计01 文本瓦片，只列真实收藏常用事项。 */
  const quickActions = computed(() =>
    favoriteItems.value.slice(0, 5).map((item) => ({
      label: item.name,
      formKey: item.formKey,
    })),
  )

  async function loadComponentData() {
    const tasks: Array<Promise<void>> = []
    // B021-007 批次5：独立指标卡与统计概览需要同一批真实 total 数据
    const needTodo = showTodoPanel.value || showStats.value || hasStatMetric.value
    const needProcessed =
      showTodoPanel.value || showStats.value || showActivity.value || hasStatMetric.value
    const needInitiated = showStats.value || showActivity.value || hasStatMetric.value
    const needDrafts =
      showTodoPanel.value ||
      showStats.value ||
      hasStatMetric.value ||
      components.value.some((c) => rendererKeyOf(c.key) === 'drafts' && c.visible)
    const needCc = showTodoPanel.value || showActivity.value

    if (needTodo) {
      tasks.push(
        queryTodoTasks({ pageNum: 1, pageSize: 5 })
          .then((page) => {
            todoList.value = page.list as unknown as Array<Record<string, unknown>>
            todoTotal.value = page.total
            const extra = page as unknown as PageExtra
            todoExtra.value = { badge: extra.badge, urgentTotal: extra.urgentTotal }
          })
          .catch(() => {
            todoList.value = []
            todoTotal.value = 0
            todoExtra.value = {}
          }),
      )
    }
    if (needProcessed) {
      tasks.push(
        myProcessed({ pageNum: 1, pageSize: 5 })
          .then((page) => {
            processedList.value = page.list as unknown as Array<Record<string, unknown>>
            processedTotal.value = page.total
            processedExtra.value = page as unknown as PageExtra
          })
          .catch(() => {
            processedList.value = []
            processedTotal.value = 0
            processedExtra.value = {}
          }),
      )
    }
    if (needInitiated) {
      tasks.push(
        myInstances({ pageNum: 1, pageSize: 5 })
          .then((page) => {
            initiatedList.value = page.list as unknown as Array<Record<string, unknown>>
            initiatedTotal.value = page.total
            initiatedExtra.value = page as unknown as PageExtra
          })
          .catch(() => {
            initiatedList.value = []
            initiatedTotal.value = 0
            initiatedExtra.value = {}
          }),
      )
    }
    if (needDrafts) {
      tasks.push(
        myDrafts({ pageNum: 1, pageSize: 5 })
          .then((page) => {
            draftsList.value = page.list as unknown as Array<Record<string, unknown>>
            draftsTotal.value = page.total
            draftsExtra.value = page as unknown as PageExtra
          })
          .catch(() => {
            draftsList.value = []
            draftsTotal.value = 0
            draftsExtra.value = {}
          }),
      )
    }
    if (needCc) {
      tasks.push(
        queryMyCopies({ pageNum: 1, pageSize: 5 })
          .then((page) => {
            ccList.value = page.list as unknown as Array<Record<string, unknown>>
            ccTotal.value = page.total
          })
          .catch(() => {
            ccList.value = []
            ccTotal.value = 0
          }),
      )
    }
    await Promise.all(tasks)
  }

  /** 常用事项仅以当前可见目录解析：失效事项不渲染为入口。 */
  async function loadFavorites() {
    if (!components.value.some((c) => rendererKeyOf(c.key) === 'favorites' && c.visible)) {
      favoriteItems.value = []
      return
    }
    try {
      const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
      const keys = new Set(favoriteKeys.value)
      favoriteItems.value = page.list.filter((item) => keys.has(item.itemKey))
    } catch {
      ElMessage.error(t('common.loadFailed'))
      // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
      favoriteItems.value = []
    }
  }

  return {
    todoList,
    processedList,
    initiatedList,
    ccList,
    draftsList,
    favoriteItems,
    todoTotal,
    initiatedTotal,
    processedTotal,
    draftsTotal,
    ccTotal,
    todoExtra,
    processedExtra,
    initiatedExtra,
    draftsExtra,
    hasStatMetric,
    stats,
    STAT_ICONS,
    statMetricOf,
    quickActions,
    loadComponentData,
    loadFavorites,
  }
}
