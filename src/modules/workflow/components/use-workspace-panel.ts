import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from '@/locales'
import type { Router } from 'vue-router'
import type { WorkspaceComponent } from '@/contracts/catalog'

/** 待办面板页签（设计01）：待办/已办/抄送/草稿 = 四个真实列表页签。 */
export type TodoPanelTab = 'todo' | 'processed' | 'cc' | 'drafts'

/** 业务动态来源（设计01 chips：全部/审批/抄送/消息）。 */
export type ActivitySource = 'approval' | 'initiated' | 'cc' | 'message'

export type WorkspaceActivityFilter = 'all' | ActivitySource

export interface WorkspacePanelDeps {
  components: Ref<WorkspaceComponent[]>
  rendererKeyOf: (key: string) => string
  todoList: Ref<Array<Record<string, unknown>>>
  processedList: Ref<Array<Record<string, unknown>>>
  initiatedList: Ref<Array<Record<string, unknown>>>
  ccList: Ref<Array<Record<string, unknown>>>
  draftsList: Ref<Array<Record<string, unknown>>>
  todoTotal: Ref<number>
  processedTotal: Ref<number>
  ccTotal: Ref<number>
  draftsTotal: Ref<number>
  router: Router
}

/**
 * 待办面板（四页签行元信息/期限标签）与业务动态（真实已办/发起/抄送合并）的派生逻辑，
 * 以及面板行跳转（详情深链/快捷发起/草稿续编）。
 */
export function useWorkspacePanel(deps: WorkspacePanelDeps) {
  const { t } = useI18n()
  const {
    components,
    rendererKeyOf,
    todoList,
    processedList,
    initiatedList,
    ccList,
    draftsList,
    todoTotal,
    processedTotal,
    ccTotal,
    draftsTotal,
    router,
  } = deps

  const activeTodoTab = ref<TodoPanelTab>('todo')
  const panelTabs = computed(() => [
    { key: 'todo' as const, label: t('workspace.tabTodo'), count: todoTotal.value },
    { key: 'processed' as const, label: t('workspace.tabProcessed'), count: processedTotal.value },
    { key: 'cc' as const, label: t('workflow.cc'), count: ccTotal.value },
    { key: 'drafts' as const, label: t('common.statusDraft'), count: draftsTotal.value },
  ])
  const panelRows = computed(() => {
    switch (activeTodoTab.value) {
      case 'processed':
        return processedList.value
      case 'cc':
        return ccList.value
      case 'drafts':
        return draftsList.value
      default:
        return todoList.value
    }
  })

  /** 面板行标题（6:2 同源参考）：优先流程名称，缺省回退主题/任务名/标题，末位回退表单标识。 */
  function rowTitle(row: Record<string, unknown>): string {
    for (const key of ['processName', 'theme', 'taskName', 'title', 'name']) {
      const value = row[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return typeof row.formKey === 'string' && row.formKey ? row.formKey : '-'
  }

  /** 状态/动作翻译（V012-BUG-022）：已知枚举译为人话，未知值原样展示。 */
  function statusText(value: unknown): string {
    const key = String(value ?? '')
    const map: Record<string, () => string> = {
      RUNNING: () => t('common.statusInProgress'),
      APPROVED: () => t('common.statusApproved'),
      REJECTED: () => t('common.statusRejected'),
    }
    return map[key]?.() ?? key
  }

  function actionText(value: unknown): string {
    const key = String(value ?? '')
    const map: Record<string, () => string> = {
      APPROVE: () => t('common.resultAgreed'),
      REJECT: () => t('common.statusRejected'),
      DISAPPROVE: () => t('common.statusRejected'),
    }
    return map[key]?.() ?? key
  }

  /** 活动时间显示（设计01）：今天→HH:mm，昨天→昨天 HH:mm，其余→MM-DD HH:mm；基于真实时间戳派生。 */
  function activityTime(v: unknown): string {
    const s = String(v ?? '')
    if (!s) return ''
    const d = new Date(s.replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) return s
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (dayDiff === 0) return hhmm
    if (dayDiff === 1) return `${t('workspace.yesterday')} ${hhmm}`
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hhmm}`
  }

  /** 设计01 待办行期限标签：仅使用接口真实 `dueAt` 派生（参考 3:2「明天 10:00」格式）；无期限不渲染（不编造期限）。 */
  function dueChip(row: Record<string, unknown>): string {
    const raw = row.dueAt
    if (typeof raw !== 'string' || !raw.trim()) return ''
    const due = new Date(raw)
    if (Number.isNaN(due.getTime())) return ''
    const hhmm = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
    const now = new Date()
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000)
    if (dayDiff === 0) return `今天 ${hhmm}`
    if (dayDiff === 1) return `明天 ${hhmm}`
    return `${due.getMonth() + 1}月${due.getDate()}日 ${hhmm}`
  }

  /** 已过期仍待办：仅按接口真实 dueAt 判断；文字仍为真实期限，颜色如实标示过期。 */
  function isOverdue(row: Record<string, unknown>): boolean {
    const raw = row.dueAt
    if (typeof raw !== 'string' || !raw.trim()) return false
    const due = new Date(raw)
    return !Number.isNaN(due.getTime()) && due.getTime() < Date.now()
  }

  /** 面板行两行式元信息：发起人 · 发起时间（当前节点/办理人字段在待办响应中不存在时留空，不虚构）。 */
  function rowMeta(row: Record<string, unknown>): string {
    const parts = [
      typeof row.initiatorName === 'string' ? row.initiatorName.trim() : '',
      row.createTime ? activityTime(row.createTime) : '',
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(' · ')
    const base = String(row.action ?? '')
      ? [actionText(row.action)]
      : [String(row.nodeName ?? row.currentNode ?? ''), String(row.assigneeName ?? '')].filter(
          Boolean,
        )
    const due = dueChip(row)
    const meta =
      (base.length ? base.join(' · ') : '') + (due ? (base.length ? ' · ' : '') + due : '')
    return meta
  }

  /** 待办面板深链：已办页签携带 source=processed，详情页按已办只读渲染并回跳（V012-BUG-001）。 */
  function openPanelTask(row: Record<string, unknown>) {
    const taskId = String(row.taskId ?? '')
    if (!taskId) return
    const query = activeTodoTab.value === 'processed' ? { source: 'processed' } : undefined
    void router.push({ path: `/workflow/task/${taskId}`, query })
  }

  /** 业务动态：真实已办/发起/抄送按时间合并（设计01 chips：全部/审批/抄送/消息）。 */
  const activityFilter = ref<WorkspaceActivityFilter>('all')
  const activityRowsAll = computed(() => {
    const rows: Array<{
      title: string
      meta: string
      time: string
      at: number
      src: ActivitySource
    }> = []
    const timeOf = (v: unknown): number =>
      typeof v === 'string' ? Date.parse(v.replace(' ', 'T')) || 0 : 0
    const activityVisible = components.value.some(
      (c) => rendererKeyOf(c.key) === 'activity' && c.visible,
    )
    if (activityVisible) {
      for (const item of processedList.value) {
        const defName = String(item.processName ?? '').trim()
        const taskName = String(item.taskName ?? '').trim()
        const action = String(item.action ?? '')
        rows.push({
          // 参考 3:2：行为「事项 + 事件描述」，不是实例编号
          title: [defName || String(item.theme ?? '-'), taskName, actionText(action)]
            .filter(Boolean)
            .join(' '),
          meta:
            [t('workspace.activityApproval'), String(item.initiatorName ?? '').trim()]
              .filter(Boolean)
              .join(' · ') || String(item.action ?? t('workflow.myProcessed')),
          time: activityTime(item.endTime ?? item.createTime),
          at: timeOf(item.endTime ?? item.createTime),
          src: 'approval',
        })
      }
    }
    if (activityVisible) {
      for (const item of initiatedList.value) {
        const defName = String(item.processName ?? '').trim()
        const currentNode = String(item.currentNode ?? '').trim()
        rows.push({
          title: defName
            ? `${defName}${currentNode ? `进入${currentNode}` : statusText(item.status)}`
            : String(item.theme ?? '-'),
          meta:
            [statusText(item.status), String(item.initiatorName ?? '').trim()]
              .filter(Boolean)
              .join(' · ') || statusText(item.status),
          time: activityTime(item.createTime),
          at: timeOf(item.createTime),
          src: 'initiated',
        })
      }
    }
    if (activityVisible) {
      for (const item of ccList.value) {
        rows.push({
          title: [
            String(item.processName ?? item.taskName ?? item.formKey ?? '-'),
            t('workflow.cc'),
          ]
            .filter(Boolean)
            .join(' '),
          meta: [t('workflow.cc'), statusText(item.instanceStatus)].filter(Boolean).join(' · '),
          time: activityTime(item.createTime),
          at: timeOf(item.createTime),
          src: 'cc',
        })
      }
    }
    return rows.sort((a, b) => b.at - a.at).slice(0, 4)
  })
  const activityRows = computed(() =>
    activityFilter.value === 'all'
      ? activityRowsAll.value
      : activityRowsAll.value.filter((r) => r.src === activityFilter.value),
  )
  const activityChips = computed(() => [
    { key: 'all' as const, label: t('common.all') },
    { key: 'approval' as const, label: t('workspace.activityApproval') },
    { key: 'cc' as const, label: t('workflow.cc') },
    { key: 'message' as const, label: t('common.message') },
  ])

  function openForm(formKey: string) {
    void router.push(`/form/form-render/${formKey}`)
  }

  /**
   * Q08（645:28703）原文的保存后查看态「返回」由配置工作台自身工具栏承担
   * （/workspace/config 左上角返回即回首页）。
   * B021-001（Owner 裁量）：工作台是顶层导航页，首页工具栏不提供返回按钮——
   * history.state.back 无法区分"保存后回跳"与"从配置页经顶栏切回"，
   * 任何来源推断都会让首页重新出现无意义返回，故整体移除。
   */
  function openDraft(item: Record<string, unknown>) {
    const formKey = String(item.formKey ?? '')
    const draftId = String(item.id ?? '')
    void router.push(`/form/form-render/${formKey}?draftId=${draftId}&mode=draft`)
  }

  return {
    activeTodoTab,
    panelTabs,
    panelRows,
    rowTitle,
    statusText,
    actionText,
    activityTime,
    dueChip,
    isOverdue,
    rowMeta,
    openPanelTask,
    activityFilter,
    activityRows,
    activityChips,
    openForm,
    openDraft,
  }
}
