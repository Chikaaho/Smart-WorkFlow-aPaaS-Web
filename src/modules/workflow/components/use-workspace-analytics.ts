import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from '@/locales'
import { queryAnalyticsSummary } from '@/modules/workflow/api/i4'
import type { PageExtra } from './use-workspace-data'

export interface WorkspaceAnalyticsDeps {
  processedTotal: Ref<number>
  todoExtra: Ref<PageExtra>
}

/**
 * 流程效能面板（真实分析摘要；无权限/失败 → null → 空值呈现，不伪造指标）。
 */
export function useWorkspaceAnalytics(deps: WorkspaceAnalyticsDeps) {
  const { t } = useI18n()
  const { processedTotal, todoExtra } = deps

  const analytics = ref<Awaited<ReturnType<typeof queryAnalyticsSummary>> | null>(null)

  /** 流程效能：真实分析摘要；失败/无权限静默收敛为空值面板（不阻塞整页）。 */
  async function loadAnalytics() {
    try {
      analytics.value = await queryAnalyticsSummary()
    } catch {
      analytics.value = null
    }
  }

  /** 效能面板真实派生值；analytics 为 null 时以「—」呈现。 */
  const avgDurationText = computed(() => {
    const ms = analytics.value?.avgDurationMs
    return ms == null ? '—' : `${(ms / 3600000).toFixed(1)} ${t('workspace.hoursUnit')}`
  })
  /** 平均等待：nodeStats 各节点平均停留的真实均值（无数据 → null → 「—」） */
  const avgWaitText = computed(() => {
    const stats = analytics.value?.nodeStats
    if (!stats) return null
    const stays = Object.values(stats)
      .map((s) => s.avgStayMs)
      .filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (!stays.length) return null
    return (stays.reduce((a, b) => a + b, 0) / stays.length / 3600000).toFixed(1) + 'h'
  })
  /** 完成率：completed/launched 真实派生（不伪造「按时」口径） */
  const completionPct = computed(() => {
    const a = analytics.value
    if (!a || !a.launched) return null
    const ratio = a.completed / a.launched
    if (!Number.isFinite(ratio)) return null
    return Math.round(ratio * 100)
  })
  const effBoxes = computed(() => [
    {
      label: t('workspace.statProcessed'),
      value: processedTotal.value ? String(processedTotal.value) : '—',
      color: 'var(--sw-color-primary)',
    },
    {
      label: t('workspace.upcomingDeadline'),
      value: todoExtra.value.urgentTotal != null ? String(todoExtra.value.urgentTotal) : '—',
      color: 'var(--sw-danger)',
    },
    { label: t('workspace.avgWait'), value: avgWaitText.value ?? '—', color: 'var(--sw-success)' },
  ])

  return {
    analytics,
    loadAnalytics,
    avgDurationText,
    avgWaitText,
    completionPct,
    effBoxes,
  }
}
