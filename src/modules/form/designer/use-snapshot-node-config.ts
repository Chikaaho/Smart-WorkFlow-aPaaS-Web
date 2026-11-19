import { computed, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { useI18n } from '@/locales'
import {
  snapshotNodeAdvancedEntries,
  snapshotNodeConditionText,
  snapshotNodeFieldPermissions,
  snapshotNodeFieldStates,
  snapshotNodeFormOf,
  snapshotNodeInlineScripts,
  snapshotNodeOperations,
  snapshotNodeTriggerBindings,
  snapshotOpinionFormOf,
  snapshotParticipantOf,
  snapshotValueText,
  type SnapshotNodeView,
  type SnapshotOpinionFormView,
  type SnapshotParticipantView,
  type SnapshotProcessSource,
} from './published-snapshot'
import { asRecord, useSnapshotLabels } from './use-snapshot-labels'
import {
  FROZEN_EVENT_TYPES,
  FROZEN_GATEWAY_TYPES,
  type FrozenLayoutNode,
} from './use-snapshot-frozen-graph'
import type { SnapshotScriptDetailApi } from './use-snapshot-script-detail'

/* ── Q31/Q25/Q26/Q20：冻结节点按真实 kind/config 的只读消费者 ──
 * 共同五属性保持 295×32 只读框；以下配置行只投影冻结版本真实值，
 * 缺值显示「未配置」，不补演示值、不把全局监听当作节点钩子。 */
export type FrozenNodeConfigRow = {
  key: string
  label: string
  value: string
  detail?: 'fieldPermissions' | 'advancedConfig' | 'beforeScript'
}

const KNOWN_NODE_TYPES = new Set([
  'START',
  'END',
  'APPROVAL',
  'CONSENSUS',
  'CONDITION',
  'COPY',
  'NOTIFICATION',
  'DYNAMIC_PARALLEL',
  'PARALLEL_GATEWAY',
  'SUBFLOW_WAIT',
  'TXN_ACTION',
])

export interface SnapshotNodeConfigDeps {
  selectedNode: ComputedRef<SnapshotNodeView | null>
  selectedProcess: ComputedRef<SnapshotProcessSource | null>
  nodeById: ComputedRef<Map<string, FrozenLayoutNode>>
  scriptDetail: SnapshotScriptDetailApi
}

/**
 * 选中冻结节点的只读属性面：共同五属性 + 按真实 kind/config 的配置行，
 * 以及节点字段权限/高级配置两个 1100/1000 只读弹窗。
 */
export function useSnapshotNodeConfig(deps: SnapshotNodeConfigDeps) {
  const { t } = useI18n()
  const { eventLabel } = useSnapshotLabels()
  const { selectedNode, selectedProcess, nodeById, scriptDetail } = deps

  const nodeFieldStateRows = computed(() =>
    selectedNode.value ? snapshotNodeFieldStates(selectedNode.value.config) : [],
  )
  const nodeFieldPermissionRows = computed(() =>
    selectedNode.value ? snapshotNodeFieldPermissions(selectedNode.value.config) : [],
  )
  const nodeOpinionForm = computed<SnapshotOpinionFormView | null>(() =>
    selectedNode.value ? snapshotOpinionFormOf(selectedNode.value.config) : null,
  )
  const nodeFormBinding = computed(() =>
    selectedNode.value ? snapshotNodeFormOf(selectedNode.value.config) : null,
  )
  const nodeInlineScripts = computed(() =>
    selectedNode.value ? snapshotNodeInlineScripts(selectedNode.value.config) : [],
  )
  const nodeBeforeBindings = computed(() =>
    selectedNode.value && selectedProcess.value
      ? snapshotNodeTriggerBindings(selectedProcess.value.graph, selectedNode.value.id)
      : [],
  )
  const nodeOperations = computed(() =>
    selectedNode.value
      ? snapshotNodeOperations(selectedNode.value.config)
      : { allowedActions: [], returnTargets: [] },
  )
  const nodeAdvancedEntries = computed(() =>
    selectedNode.value ? snapshotNodeAdvancedEntries(selectedNode.value.config) : [],
  )
  const nodeListeners = computed<Record<string, unknown>[]>(() => {
    const raw = selectedNode.value?.config.listeners
    if (!Array.isArray(raw)) return []
    return raw.map((entry) => asRecord(entry)).filter((entry) => entry !== null)
  })
  const nodeHasAdvancedConfig = computed(
    () =>
      nodeOperations.value.allowedActions.length > 0 ||
      nodeOperations.value.returnTargets.length > 0 ||
      nodeListeners.value.length > 0 ||
      nodeAdvancedEntries.value.length > 0,
  )

  function participantStrategyLabel(strategy: string): string {
    if (!strategy) return t('form.snapshotViewer.propConfigured')
    return t(`form.snapshotViewer.participantStrategy.${strategy}`, strategy)
  }

  function participantValueText(participant: SnapshotParticipantView | null): string {
    if (!participant) return t('form.snapshotViewer.propNotConfigured')
    const value = participant.value
    if (value == null || snapshotValueText(value) === '') {
      return participant.adapterId || t('form.snapshotViewer.propNotConfigured')
    }
    const record = asRecord(value)
    if (record && ('objectType' in record || 'field' in record || 'tableField' in record)) {
      const parts: string[] = []
      const objectType = String(record.objectType ?? '').toUpperCase()
      if (objectType === 'USER') parts.push(t('form.snapshotViewer.nodeObjectTypeUser'))
      if (objectType === 'DEPT') parts.push(t('form.snapshotViewer.nodeObjectTypeDept'))
      const scope = String(record.scope ?? '').toUpperCase()
      if (scope === 'MAIN') parts.push(t('form.snapshotViewer.nodeScopeMain'))
      if (scope === 'TABLE') parts.push(t('form.snapshotViewer.nodeScopeTable'))
      for (const key of ['field', 'tableField', 'column']) {
        const textValue = snapshotValueText(record[key])
        if (textValue) parts.push(textValue)
      }
      if (parts.length) return parts.join(' · ')
    }
    if (record && ('nodeKey' in record || 'formField' in record)) {
      const parts = [
        snapshotValueText(record.nodeKey),
        snapshotValueText(record.formField),
        String(record.round ?? '').toUpperCase() === 'PREVIOUS'
          ? t('form.snapshotViewer.nodeRoundPrevious')
          : t('form.snapshotViewer.nodeRoundCurrent'),
      ].filter(Boolean)
      if (parts.length) return parts.join(' · ')
    }
    return snapshotValueText(value)
  }

  function opinionFormText(form: SnapshotOpinionFormView | null): string {
    if (!form) return t('form.snapshotViewer.propNotConfigured')
    const head = [form.formId, form.version ? `v${form.version}` : ''].filter(Boolean).join(' · ')
    const labels = form.fields.map((field) => field.label).filter(Boolean)
    const fieldText = form.fields.length
      ? `${form.fields.length} ${t('form.snapshotViewer.nodeFieldUnit')}${
          labels.length > 0 && labels.length <= 6 ? `（${labels.join('、')}）` : ''
        }`
      : t('form.snapshotViewer.nodeFieldEmpty')
    return [head, fieldText].filter(Boolean).join(' · ')
  }

  function nodeFormText(): string {
    const form = nodeFormBinding.value
    if (!form) return t('form.snapshotViewer.propNotConfigured')
    return [form.formKey, form.formVersion ? `v${form.formVersion}` : '']
      .filter(Boolean)
      .join(' · ')
  }

  function consensusModeLabel(mode: unknown): string {
    const raw = String(mode ?? '').trim()
    if (!raw) return t('form.snapshotViewer.propNotConfigured')
    const labels: Record<string, string> = {
      COUNT: t('form.snapshotViewer.nodeModeCount'),
      RATIO: t('form.snapshotViewer.nodeModeRatio'),
      ALL: t('form.snapshotViewer.nodeModeAll'),
      VETO: t('form.snapshotViewer.nodeModeVeto'),
      ANY: t('form.snapshotViewer.nodeModeAny'),
    }
    return labels[raw.toUpperCase()] ?? raw
  }

  function dynamicSourceText(source: unknown): string {
    const record = asRecord(source)
    if (!record) return snapshotValueText(source) || t('form.snapshotViewer.propNotConfigured')
    const type = String(record.type ?? '').toUpperCase()
    const typeLabels: Record<string, string> = {
      FORM_FIELD: t('form.snapshotViewer.nodeSourceFormField'),
      VARIABLE: t('form.snapshotViewer.nodeSourceVariable'),
      FIXED: t('form.snapshotViewer.nodeSourceFixed'),
    }
    const parts = [typeLabels[type] ?? type, snapshotValueText(record.value)]
    for (const key of ['objectType', 'scope', 'tableField', 'column']) {
      const textValue = snapshotValueText(record[key])
      if (textValue) parts.push(`${key}=${textValue}`)
    }
    return parts.filter(Boolean).join(' · ')
  }

  function strategyValueText(raw: unknown): string {
    return snapshotValueText(raw) || t('form.snapshotViewer.propNotConfigured')
  }

  function enabledStrategyText(raw: unknown): string {
    const value = String(raw ?? '').toUpperCase()
    if (value === 'BLOCK') return t('form.snapshotViewer.nodeStrategyBlock')
    if (value === 'PROCEED') return t('form.snapshotViewer.nodeStrategyProceed')
    if (value === 'SKIP') return t('form.snapshotViewer.nodeStrategySkip')
    return strategyValueText(raw)
  }

  function buildFrozenNodeConfigRows(node: SnapshotNodeView): FrozenNodeConfigRow[] {
    const notConfigured = t('form.snapshotViewer.propNotConfigured')
    const config = node.config
    const type = node.type.trim().toUpperCase()
    const participant = snapshotParticipantOf(config)
    const rows: FrozenNodeConfigRow[] = []

    if (type === 'APPROVAL' || type === 'CONSENSUS') {
      rows.push({
        key: 'participant-source',
        label: t(
          type === 'APPROVAL'
            ? 'form.snapshotViewer.nodeApprovalSource'
            : 'form.snapshotViewer.nodeParticipantSource',
        ),
        value: participant
          ? `${participantStrategyLabel(participant.strategy)}${
              participant.strategy ? `（${participant.strategy}）` : ''
            }`
          : notConfigured,
      })
      rows.push({
        key: 'participant-value',
        label: t(
          type === 'APPROVAL'
            ? 'form.snapshotViewer.nodeApprovers'
            : 'form.snapshotViewer.nodeParticipants',
        ),
        value: participantValueText(participant),
      })
    }

    if (type === 'APPROVAL' || type === 'CONSENSUS' || type === 'CONDITION') {
      rows.push({
        key: 'condition',
        label: t('form.snapshotViewer.nodeCondition'),
        value: snapshotNodeConditionText(config) || notConfigured,
      })
    } else if (snapshotNodeConditionText(config)) {
      rows.push({
        key: 'condition',
        label: t('form.snapshotViewer.nodeCondition'),
        value: snapshotNodeConditionText(config),
      })
    }

    if (type === 'APPROVAL') {
      rows.push({
        key: 'opinion-form',
        label: t('form.snapshotViewer.nodeOpinionForm'),
        value: opinionFormText(nodeOpinionForm.value),
      })
      rows.push({
        key: 'node-form',
        label: t('form.snapshotViewer.nodeNodeForm'),
        value: nodeFormText(),
      })
    }

    if (type === 'CONSENSUS') {
      rows.push({
        key: 'mode',
        label: t('form.snapshotViewer.nodeSettleMode'),
        value: consensusModeLabel(config.mode),
      })
      rows.push({
        key: 'ratio',
        label: t('form.snapshotViewer.nodeRatio'),
        value: strategyValueText(config.ratio),
      })
      rows.push({
        key: 'node-form',
        label: t('form.snapshotViewer.nodeNodeForm'),
        value: nodeFormText(),
      })
    }

    if (type === 'COPY' || type === 'NOTIFICATION') {
      rows.push({
        key: 'participant-source',
        label: t('form.snapshotViewer.nodeParticipantSource'),
        value: participant
          ? `${participantStrategyLabel(participant.strategy)}${
              participant.strategy ? `（${participant.strategy}）` : ''
            }`
          : notConfigured,
      })
      rows.push({
        key: 'participant-value',
        label: t('form.snapshotViewer.nodeParticipants'),
        value: participantValueText(participant),
      })
      rows.push({
        key: 'failure-strategy',
        label: t('form.snapshotViewer.nodeFailureStrategy'),
        value: strategyValueText(config.failureStrategy),
      })
    }

    if (type === 'DYNAMIC_PARALLEL') {
      rows.push({
        key: 'source',
        label: t('form.snapshotViewer.nodeBranchSource'),
        value: dynamicSourceText(config.source),
      })
      rows.push({
        key: 'mode',
        label: t('form.snapshotViewer.nodeSettleMode'),
        value: consensusModeLabel(config.mode),
      })
      rows.push({
        key: 'ratio',
        label: t('form.snapshotViewer.nodeRatio'),
        value: strategyValueText(config.ratio),
      })
      rows.push({
        key: 'max-branches',
        label: t('form.snapshotViewer.nodeMaxBranches'),
        value: strategyValueText(config.maxBranches),
      })
      rows.push({
        key: 'empty-strategy',
        label: t('form.snapshotViewer.nodeEmptyStrategy'),
        value: enabledStrategyText(config.emptyStrategy),
      })
      rows.push({
        key: 'invalid-strategy',
        label: t('form.snapshotViewer.nodeInvalidStrategy'),
        value: enabledStrategyText(config.invalidStrategy),
      })
      rows.push({
        key: 'semantic-version',
        label: t('form.snapshotViewer.nodeSemanticVersion'),
        value: strategyValueText(config.semanticVersion),
      })
    }

    if (type === 'SUBFLOW_WAIT') {
      rows.push({
        key: 'wait-actions',
        label: t('form.snapshotViewer.nodeWaitActionIds'),
        value: snapshotValueText(config.waitActionIds) || notConfigured,
      })
    }

    if (type === 'TXN_ACTION') {
      rows.push({
        key: 'action-id',
        label: t('form.snapshotViewer.nodeActionId'),
        value: strategyValueText(config.actionId),
      })
      rows.push({
        key: 'record-source',
        label: t('form.snapshotViewer.nodeRecordIdSource'),
        value: strategyValueText(config.recordIdSource),
      })
      rows.push({
        key: 'quantity',
        label: t('form.snapshotViewer.nodeQuantity'),
        value: strategyValueText(config.quantity),
      })
      rows.push({
        key: 'failure-strategy',
        label: t('form.snapshotViewer.nodeFailureStrategy'),
        value: strategyValueText(config.failureStrategy),
      })
    }

    if (type === 'START' || type === 'END' || type === 'PARALLEL_GATEWAY') {
      rows.push({
        key: 'node-config',
        label: t('form.snapshotViewer.nodeConfigContent'),
        value: notConfigured,
      })
    }

    if (type === 'APPROVAL' || type === 'CONSENSUS') {
      const permissionCount =
        nodeFieldStateRows.value.length || nodeFieldPermissionRows.value.length
      rows.push({
        key: 'field-permissions',
        label: t('form.snapshotViewer.nodeFieldPermissions'),
        value: permissionCount
          ? t('form.snapshotViewer.nodeFieldCount', { count: permissionCount })
          : notConfigured,
        detail: permissionCount ? 'fieldPermissions' : undefined,
      })
    } else if (nodeFieldStateRows.value.length || nodeFieldPermissionRows.value.length) {
      rows.push({
        key: 'field-permissions',
        label: t('form.snapshotViewer.nodeFieldPermissions'),
        value: t('form.snapshotViewer.nodeFieldCount', {
          count: nodeFieldStateRows.value.length || nodeFieldPermissionRows.value.length,
        }),
        detail: 'fieldPermissions',
      })
    }

    rows.push({
      key: 'advanced-scripts',
      label: t('form.snapshotViewer.nodeAdvancedScripts'),
      value: nodeInlineScripts.value.length
        ? t('form.snapshotViewer.nodeScriptCount', { count: nodeInlineScripts.value.length })
        : notConfigured,
    })
    rows.push({
      key: 'before-script',
      label: t('form.snapshotViewer.nodeBeforeScript'),
      value: nodeBeforeBindings.value.length
        ? t('form.snapshotViewer.nodeBoundCount', { count: nodeBeforeBindings.value.length })
        : notConfigured,
      detail: nodeBeforeBindings.value.length ? 'beforeScript' : undefined,
    })
    rows.push({
      key: 'advanced-config',
      label: t('form.snapshotViewer.nodeAdvancedConfig'),
      value: nodeHasAdvancedConfig.value
        ? t('form.snapshotViewer.nodeConfiguredCount', {
            count:
              nodeOperations.value.allowedActions.length +
              nodeOperations.value.returnTargets.length +
              nodeListeners.value.length +
              nodeAdvancedEntries.value.length,
          })
        : notConfigured,
      detail: nodeHasAdvancedConfig.value ? 'advancedConfig' : undefined,
    })

    if (!KNOWN_NODE_TYPES.has(type)) {
      for (const [key, value] of Object.entries(config)) {
        if (key === 'name') continue
        const textValue = snapshotValueText(value)
        if (!textValue) continue
        rows.push({ key: `config.${key}`, label: key, value: textValue })
      }
    }
    return rows
  }

  const frozenNodeConfigRows = computed<FrozenNodeConfigRow[]>(() =>
    selectedNode.value ? buildFrozenNodeConfigRows(selectedNode.value) : [],
  )

  /* 502:21715：冻结流程右栏节点属性五只读框——尺寸按真实图形（事件128×44/网关28×28/普通230×44），
     坐标沿查看层派生结果，仅只读展示，不写回版本。 */
  const frozenNodePropRows = computed(() => {
    const node = selectedNode.value
    if (!node) return []
    const layoutNode = nodeById.value.get(node.id)
    const size = FROZEN_GATEWAY_TYPES.has(node.type)
      ? '28 × 28'
      : FROZEN_EVENT_TYPES.has(node.type)
        ? '128 × 44'
        : '230 × 44'
    return [
      { label: t('form.snapshotViewer.nodeName'), value: node.name },
      { label: t('form.snapshotViewer.propType'), value: node.type },
      { label: t('form.snapshotViewer.nodeId'), value: node.id },
      {
        label: t('form.snapshotViewer.nodePosition'),
        value: layoutNode ? `${Math.round(layoutNode.x)} , ${Math.round(layoutNode.y)}` : '',
      },
      { label: t('form.snapshotViewer.nodeSize'), value: size },
    ]
  })

  const nodeFieldPermissionVisible = ref(false)
  const nodeAdvancedVisible = ref(false)

  function openNodeConfigDetail(row: FrozenNodeConfigRow): void {
    if (!selectedNode.value) return
    if (row.detail === 'fieldPermissions') {
      nodeFieldPermissionVisible.value = true
      return
    }
    if (row.detail === 'advancedConfig') {
      nodeAdvancedVisible.value = true
      return
    }
    if (row.detail === 'beforeScript') openNodeBeforeScript()
  }

  /** Q20：节点开始前绑定复用既有 1200 只读代码窗（行号 + 只读标识 + 关闭 80×32）。 */
  function openNodeBeforeScript(): void {
    const node = selectedNode.value
    if (!node || nodeBeforeBindings.value.length === 0) return
    scriptDetail.scriptDetailMode.value = 'code'
    scriptDetail.scriptDetailTitle.value = t('form.snapshotViewer.nodeBeforeScriptTitle')
    scriptDetail.scriptDetailCode.value = nodeBeforeBindings.value
      .map(
        (binding) => `// ${binding.name} · ${eventLabel(binding.event)}\n${binding.script || '—'}`,
      )
      .join('\n\n')
    scriptDetail.scriptDetailMeta.value = [node.name, t('form.snapshotViewer.nodeId'), node.id]
      .filter(Boolean)
      .join(' · ')
    scriptDetail.scriptDetailVisible.value = true
  }

  return {
    nodeFieldStateRows,
    nodeFieldPermissionRows,
    nodeOpinionForm,
    nodeFormBinding,
    nodeInlineScripts,
    nodeBeforeBindings,
    nodeOperations,
    nodeAdvancedEntries,
    nodeListeners,
    nodeHasAdvancedConfig,
    frozenNodeConfigRows,
    frozenNodePropRows,
    nodeFieldPermissionVisible,
    nodeAdvancedVisible,
    openNodeConfigDetail,
    openNodeBeforeScript,
  }
}
