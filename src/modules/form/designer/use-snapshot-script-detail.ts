import { computed, ref } from 'vue'
import type { SnapshotConstraintView, SnapshotScriptView } from './published-snapshot'
import { isJsBody, useSnapshotLabels } from './use-snapshot-labels'

type SnapshotConstraintRow = SnapshotConstraintView

/**
 * 快照查看器的脚本/校验只读详情弹窗状态与打开动作。
 * 状态单实例：由主文件创建，字段属性/节点配置/流程设置等消费方共享同一组弹窗。
 */
export function useSnapshotScriptDetail() {
  const { t, scriptKindLabel, scriptSourceLabel, eventLabel, validationLabel } = useSnapshotLabels()

  const scriptDetailVisible = ref(false)
  const scriptDetailTitle = ref('')
  const scriptDetailCode = ref('')
  const scriptDetailMeta = ref('')
  /* Q21（509:18714）：JS 监听脚本用 1200 宽只读代码窗（全文+行号）；内置动作摘要保持短摘要弹窗 */
  const scriptDetailMode = ref<'summary' | 'code'>('summary')
  const scriptDetailLines = computed(() => scriptDetailCode.value.split(/\r?\n/))
  const validationDetailVisible = ref(false)
  const validationDetailTitle = ref('')
  const validationDetailRow = ref<SnapshotConstraintRow | null>(null)
  /* Q22（509:18825）：校验折叠详情的「查看」改走 800 宽只读规则窗（真实规则名 + 32 高只读值 + 关闭 80×32）；
     字段属性路径（openFrozenDetail）保留原 520 详情窗。 */
  const validationRuleVisible = ref(false)
  const validationRuleRow = ref<SnapshotConstraintRow | null>(null)

  function openValidationRule(row: SnapshotConstraintRow): void {
    validationRuleRow.value = row
    validationRuleVisible.value = true
  }

  function openListenerScript(row: {
    name: string
    timing: string
    code: string
    meta: string
  }): void {
    scriptDetailCode.value = row.code
    const headline = `${row.name} · ${row.timing}`
    if (isJsBody(row.code)) {
      scriptDetailMode.value = 'code'
      scriptDetailTitle.value = t('form.snapshotViewer.listenerScriptTitle')
      scriptDetailMeta.value = row.meta ? `${headline} · ${row.meta}` : headline
    } else {
      scriptDetailMode.value = 'summary'
      scriptDetailTitle.value = headline
      scriptDetailMeta.value = row.meta
    }
    scriptDetailVisible.value = true
  }

  function openScriptDetail(row: SnapshotScriptView): void {
    scriptDetailMode.value = 'summary'
    scriptDetailTitle.value = `${row.label} · ${scriptKindLabel(row.kind)}`
    scriptDetailCode.value = row.code
    const meta = [
      scriptSourceLabel(row),
      row.event ? eventLabel(row.event) : '',
      row.nodeKey ?? '',
      row.enabled == null
        ? ''
        : row.enabled
          ? t('form.snapshotViewer.enabled')
          : t('form.snapshotViewer.disabled'),
    ].filter(Boolean)
    scriptDetailMeta.value = meta.join(' · ')
    scriptDetailVisible.value = true
  }

  /** Q29（518:24135）：审批人来源脚本固定走 1200 宽只读代码窗（行号 + 只读标识 + 关闭 80×32）。 */
  function openApprovalScript(row: SnapshotScriptView): void {
    scriptDetailMode.value = 'code'
    scriptDetailTitle.value = t('form.snapshotViewer.approvalScripts')
    scriptDetailCode.value = row.code
    scriptDetailMeta.value = [row.label, scriptSourceLabel(row), row.nodeKey]
      .filter(Boolean)
      .join(' · ')
    scriptDetailVisible.value = true
  }

  function openValidationDetail(row: SnapshotConstraintRow): void {
    validationDetailTitle.value = `${row.label} · ${validationLabel(row.kind)}`
    validationDetailRow.value = row
    validationDetailVisible.value = true
  }

  return {
    scriptDetailVisible,
    scriptDetailTitle,
    scriptDetailCode,
    scriptDetailMeta,
    scriptDetailMode,
    scriptDetailLines,
    validationDetailVisible,
    validationDetailTitle,
    validationDetailRow,
    validationRuleVisible,
    validationRuleRow,
    openValidationRule,
    openListenerScript,
    openScriptDetail,
    openApprovalScript,
    openValidationDetail,
  }
}

export type SnapshotScriptDetailApi = ReturnType<typeof useSnapshotScriptDetail>
