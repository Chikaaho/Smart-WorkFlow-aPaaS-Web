import { computed, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { useI18n } from '@/locales'
import type { SnapshotNodeView, SnapshotTriggerView } from './published-snapshot'
import { useSnapshotLabels } from './use-snapshot-labels'
import type { SnapshotScriptDetailApi } from './use-snapshot-script-detail'

/* ── 流程设置页签（审查23 S14-E）：左200导航 通知/监听 + 变量/脚本额外分支 ── */
export type SettingsBranch = 'notification' | 'listeners' | 'variables' | 'approvalScripts'

/* Q28（509:19394）：冻结触发器独立投影——只取流程图 graph.triggers 的真实记录，
   不把表单事件/节点生命周期监听混入触发器表；执行方式/判断脚本全部来自冻结值。 */
export type SnapshotTriggerRow = {
  key: string
  name: string
  timing: string
  nodeName: string
  actionText: string
  orchestrationText: string
  script: string
  meta: string
  viewScript: () => void
}

export interface SnapshotSettingsDeps {
  triggers: ComputedRef<SnapshotTriggerView[]>
  nodes: ComputedRef<SnapshotNodeView[]>
  frozenFormEvents: ComputedRef<
    Array<{
      kind: string
      rows: Array<{ id: string; name: string; script: string; enabled: boolean }>
    }>
  >
  notificationText: (key: string) => string
  scriptDetail: Pick<SnapshotScriptDetailApi, 'openListenerScript'>
}

/**
 * 流程设置页签状态：通知行、表单事件监听行与冻结触发器弹窗（入口卡片 + 1100 只读窗）。
 */
export function useSnapshotSettings(deps: SnapshotSettingsDeps) {
  const { t } = useI18n()
  const { eventLabel } = useSnapshotLabels()
  const { triggers, nodes, frozenFormEvents, notificationText, scriptDetail } = deps

  const settingsBranch = ref<SettingsBranch>('notification')
  const settingsBranches = computed(() => [
    { key: 'notification' as const, label: t('form.snapshotViewer.notificationNav') },
    { key: 'listeners' as const, label: t('form.snapshotViewer.listenersNav') },
    { key: 'variables' as const, label: t('form.snapshotViewer.variables') },
    { key: 'approvalScripts' as const, label: t('form.snapshotViewer.approvalScripts') },
  ])

  const notificationRows = computed(() => [
    {
      label: t('form.snapshotViewer.notificationChannels'),
      value: notificationText('channels'),
    },
    {
      label: t('form.snapshotViewer.notificationApprovers'),
      value: notificationText('approvers'),
    },
    {
      label: t('form.snapshotViewer.notificationInitiator'),
      value: notificationText('initiator'),
    },
    {
      label: t('form.snapshotViewer.notificationOthers'),
      value: notificationText('otherRecipientIds'),
    },
  ])

  const listenerRows = computed(() =>
    frozenFormEvents.value.flatMap((group) =>
      group.rows.map((row) => ({
        key: `${group.kind}:${row.id}`,
        name: row.name || row.id,
        timing: group.kind,
        enabled: row.enabled ? t('form.snapshotViewer.enabled') : t('form.snapshotViewer.disabled'),
        view: () => {
          scriptDetail.openListenerScript({
            name: row.name || row.id,
            timing: group.kind,
            code: row.script || '—',
            meta: '',
          })
        },
      })),
    ),
  )

  const selectedTriggerKey = ref<string | null>(null)
  /* Q28（509:19394）：触发器 1100 只读内容宿主到遮罩只读弹窗（复用 DetailDialog 外壳），不再页内平铺。 */
  const triggerDialogVisible = ref(false)
  const triggerRows = computed<SnapshotTriggerRow[]>(() =>
    triggers.value.map((row) => {
      const processNodes = nodes.value.filter(
        (node) => node.processKey === row.processKey && node.graphVersion === row.graphVersion,
      )
      const node = row.trigger.nodeKey
        ? processNodes.find((candidate) => candidate.id === row.trigger.nodeKey)
        : undefined
      const actions = (row.trigger.branches ?? []).flatMap((branch) => branch.actions ?? [])
      const actionText =
        actions
          .map((action) => action.name?.trim() || action.actionId)
          .filter(Boolean)
          .join('、') || t('form.snapshotViewer.propNotConfigured')
      const orchestrations = [
        ...new Set(
          actions.map((action) =>
            action.orchestration === 'CHILD'
              ? t('form.snapshotViewer.orchestrationChild')
              : t('form.snapshotViewer.orchestrationIndependent'),
          ),
        ),
      ]
      const timing = eventLabel(row.trigger.event)
      const name = row.trigger.name || row.trigger.triggerId
      const script = row.trigger.script?.trim() ?? ''
      const meta = `${row.processName} · v${row.graphVersion}`
      return {
        key: `${row.processKey}:${row.graphVersion}:${row.trigger.triggerId}`,
        name,
        timing,
        nodeName: node?.name || row.trigger.nodeKey || '—',
        actionText,
        orchestrationText: actions.length
          ? orchestrations.join('、')
          : t('form.snapshotViewer.propNotConfigured'),
        script,
        meta,
        viewScript: () => {
          scriptDetail.openListenerScript({ name, timing, code: script || '—', meta })
        },
      }
    }),
  )

  const selectedTriggerRow = computed<SnapshotTriggerRow | null>(
    () =>
      triggerRows.value.find((row) => row.key === selectedTriggerKey.value) ??
      triggerRows.value[0] ??
      null,
  )

  watch(
    triggerRows,
    (rows) => {
      if (!rows.some((row) => row.key === selectedTriggerKey.value)) {
        selectedTriggerKey.value = rows[0]?.key ?? null
      }
    },
    { immediate: true },
  )

  return {
    settingsBranch,
    settingsBranches,
    notificationRows,
    listenerRows,
    selectedTriggerKey,
    triggerDialogVisible,
    triggerRows,
    selectedTriggerRow,
  }
}
