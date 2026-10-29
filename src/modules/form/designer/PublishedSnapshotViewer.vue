<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'
import DetailDialog from '@/components/DetailDialog.vue'
import { parseDefinition } from '@/adapters/form-designer'
import FormPreview from '@/adapters/form-designer/FormPreview.vue'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import {
  loadSnapshotProcessVersionCandidates,
  loadSnapshotProcessVersionGraph,
  type SnapshotProcessVersionCandidate,
} from '@/adapters/published-snapshot'
import type { FormSchema, VisibilityRule } from '@/contracts/form-schema'
import { useI18n } from '@/locales'
import {
  getFormSnapshotDefinition,
  type FormSnapshotDTO,
  type FormSnapshotDetailDTO,
} from '../api/form-def'
import {
  buildSnapshotAdvancedConfigs,
  buildSnapshotApprovalScripts,
  buildSnapshotConstraints,
  buildSnapshotFieldPermissions,
  buildSnapshotNodes,
  buildSnapshotScripts,
  buildSnapshotTriggers,
  buildSnapshotVariables,
  buildSnapshotVisibility,
  extractSnapshotListConfig,
  flattenSnapshotFields,
  matchesSnapshotFormVersion,
  type SnapshotProcessSource,
  type SnapshotScriptKind,
  type SnapshotScriptView,
} from './published-snapshot'

/**
 * PublishedSnapshotViewer — one read-only surface for a frozen form + workflow version.
 *
 * The form snapshot is authoritative for the form definition. Related process
 * definitions are found through the adapter seam, then only versions whose
 * formVersion matches the selected form snapshot are loaded from the immutable
 * workflow version endpoint. Missing data is displayed as missing; current
 * mutable configuration is never substituted for a frozen value.
 */

const props = defineProps<{
  formId: string
  formKey: string
  snapshot: FormSnapshotDTO | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const { t } = useI18n()

/** 0.2.0 G14（272:1518）：全屏外壳五页签——原 12 分区按实际内容归入对应页签。 */
type SnapshotTab = 'fields' | 'design' | 'process' | 'numbering' | 'settings'

const loading = ref(false)
const loadError = ref('')
const warnings = ref<string[]>([])
const detail = ref<FormSnapshotDetailDTO | null>(null)
const schema = ref<FormSchema | null>(null)
const rawDefinition = ref<Record<string, unknown> | null>(null)
const processSources = ref<SnapshotProcessSource[]>([])
const activeTab = ref<SnapshotTab>('fields')

/* ── 表单设计 · 冻结字段属性（右属性外壳，方向 direction-ui-completion-020）──
 * 点击设计网格中的字段，右栏只读展示该字段的冻结配置；不写入任何数据。 */
const selectedFieldName = ref<string | null>(null)
const selectedField = computed<FormSchema['fields'][number] | null>(() => {
  if (!schema.value || schema.value.fields.length === 0) return null
  return (
    schema.value.fields.find((f) => f.name === selectedFieldName.value) ?? schema.value.fields[0]
  )
})
let requestGeneration = 0

const fields = computed(() => (schema.value ? flattenSnapshotFields(schema.value) : []))
const constraints = computed(() => buildSnapshotConstraints(fields.value))
const visibility = computed(() => (schema.value ? buildSnapshotVisibility(schema.value) : []))
const permissions = computed(() =>
  schema.value ? buildSnapshotFieldPermissions(schema.value) : [],
)
const actionPermissions = computed(() =>
  Object.entries(schema.value?.actionPermissions ?? {}).map(([action, subjects]) => ({
    action,
    subjects,
  })),
)
const listConfig = computed(() =>
  rawDefinition.value ? extractSnapshotListConfig(rawDefinition.value) : null,
)
const nodes = computed(() => buildSnapshotNodes(processSources.value))
const advancedConfigs = computed(() => buildSnapshotAdvancedConfigs(processSources.value))
const variables = computed(() => buildSnapshotVariables(processSources.value))
const triggers = computed(() => buildSnapshotTriggers(processSources.value))
const scripts = computed(() =>
  schema.value ? buildSnapshotScripts(schema.value, processSources.value) : [],
)
const approvalScripts = computed(() => buildSnapshotApprovalScripts(processSources.value))

type SnapshotConstraintRow = ReturnType<typeof buildSnapshotConstraints>[number]
const scriptDetailVisible = ref(false)
const scriptDetailTitle = ref('')
const scriptDetailCode = ref('')
const scriptDetailMeta = ref('')
const validationDetailVisible = ref(false)
const validationDetailTitle = ref('')
const validationDetailRow = ref<SnapshotConstraintRow | null>(null)

function openScriptDetail(row: SnapshotScriptView): void {
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

function openValidationDetail(row: SnapshotConstraintRow): void {
  validationDetailTitle.value = `${row.label} · ${validationLabel(row.kind)}`
  validationDetailRow.value = row
  validationDetailVisible.value = true
}

const effectiveSnapshot = computed<FormSnapshotDTO | null>(() => {
  if (!props.snapshot) return null
  return { ...props.snapshot, ...(detail.value ?? {}) }
})
const snapshotVersionText = computed(() => {
  const snapshot = effectiveSnapshot.value
  if (!snapshot) return '—'
  return String(snapshot.versionLabel || snapshot.formVersion)
})
const snapshotTitle = computed(
  () => schema.value?.title?.trim() || effectiveSnapshot.value?.versionLabel || props.formKey,
)
const rawDefinitionText = computed(() =>
  rawDefinition.value ? prettyJson(rawDefinition.value) : '',
)

const viewerTabs = computed(() =>
  (
    [
      ['fields', 'tabFields'],
      ['design', 'tabDesign'],
      ['process', 'tabProcess'],
      ['numbering', 'tabNumbering'],
      ['settings', 'tabSettings'],
    ] as const
  ).map(([key, labelKey]) => ({ key, label: t(`form.snapshotViewer.${labelKey}`) })),
)

/* ── 流程设计页签：左列流程版本、中列节点配置、右列选中节点只读属性 ── */
const selectedProcessKey = ref<string | null>(null)
const selectedNodeId = ref<string | null>(null)

const selectedProcess = computed<SnapshotProcessSource | null>(() => {
  const list = processSources.value
  if (list.length === 0) return null
  return list.find((p) => `${p.defId}:${p.graphVersion}` === selectedProcessKey.value) ?? list[0]
})

const processNodes = computed(() =>
  selectedProcess.value
    ? nodes.value.filter(
        (node) =>
          node.processKey === selectedProcess.value!.processKey &&
          node.graphVersion === selectedProcess.value!.graphVersion,
      )
    : [],
)

const selectedNode = computed(() => {
  if (processNodes.value.length === 0) return null
  return (
    processNodes.value.find((node) => node.id === selectedNodeId.value) ?? processNodes.value[0]
  )
})

/* ── G14（272:1518）冻结消费者：冻结图渲染 / 通知 / 编号 / 表单事件 / 字段类型属性 ── */

type FrozenGraphNode = { id: string; type: string; label: string; x: number; y: number }
type FrozenGraphEdge = {
  id: string
  source: string
  target: string
  waypoints: Array<{ x: number; y: number }>
}
const FROZEN_EVENT_TYPES = new Set(['START', 'END'])
const FROZEN_GATEWAY_TYPES = new Set(['GATEWAY', 'CONDITION', 'PARALLEL_GATEWAY'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const frozenGraph = computed<{ nodes: FrozenGraphNode[]; edges: FrozenGraphEdge[] }>(() => {
  const graph = asRecord(selectedProcess.value?.graph)
  const elements = Array.isArray(graph?.elements) ? (graph?.elements as unknown[]) : []
  const nodes: FrozenGraphNode[] = []
  const edges: FrozenGraphEdge[] = []
  for (const entry of elements) {
    const el = asRecord(entry)
    const id = el && typeof el.id === 'string' ? el.id : ''
    if (!el || !id) continue
    if (el.kind === 'node') {
      const config = asRecord(el.config) ?? {}
      nodes.push({
        id,
        type: typeof el.type === 'string' ? el.type : 'NODE',
        label: typeof config.name === 'string' && config.name ? config.name : id,
        x: typeof el.x === 'number' ? el.x : 0,
        y: typeof el.y === 'number' ? el.y : 0,
      })
    } else if (el.kind === 'edge') {
      edges.push({
        id,
        source: typeof el.source === 'string' ? el.source : '',
        target: typeof el.target === 'string' ? el.target : '',
        waypoints: Array.isArray(el.waypoints)
          ? (el.waypoints as Array<Record<string, unknown>>).map((w) => ({
              x: Number(w.x) || 0,
              y: Number(w.y) || 0,
            }))
          : [],
      })
    }
  }
  return { nodes, edges }
})

const nodeById = computed(() => new Map(frozenLayoutNodes.value.map((n) => [n.id, n])))

/* 272:1518（执行提示14）：缺坐标的冻结节点仅在查看层按真实拓扑确定性分离（不写回版本）；
   有真实坐标的节点原样保留。 */
type FrozenLayoutNode = FrozenGraphNode & { derived: boolean }

const frozenLayoutNodes = computed<FrozenLayoutNode[]>(() => {
  const { nodes, edges } = frozenGraph.value
  const laid: FrozenLayoutNode[] = nodes.map((n) => ({ ...n, derived: n.x === 0 && n.y === 0 }))
  if (!laid.some((n) => n.derived)) return laid
  const layerOf = new Map<string, number>()
  for (const n of laid) layerOf.set(n.id, 0)
  let changed = true
  while (changed) {
    changed = false
    for (const e of edges) {
      const sourceLayer = layerOf.get(e.source)
      if (sourceLayer == null) continue
      const targetLayer = layerOf.get(e.target)
      if (targetLayer == null || targetLayer < sourceLayer + 1) {
        layerOf.set(e.target, sourceLayer + 1)
        changed = true
      }
    }
  }
  const rowsPerLayer = new Map<number, number>()
  for (const n of laid) {
    if (!n.derived) continue
    const layer = layerOf.get(n.id) ?? 0
    const row = rowsPerLayer.get(layer) ?? 0
    rowsPerLayer.set(layer, row + 1)
    n.x = 140 + layer * 300
    n.y = 80 + row * 90
  }
  return laid
})

function frozenNodeCenter(id: string): { x: number; y: number } | null {
  const node = nodeById.value.get(id)
  return node ? { x: node.x, y: node.y } : null
}

function frozenEdgePoints(edge: FrozenGraphEdge): Array<{ x: number; y: number }> {
  const source = frozenNodeCenter(edge.source)
  const target = frozenNodeCenter(edge.target)
  if (!source || !target) return []
  return [source, ...edge.waypoints, target]
}

const frozenViewBoxRect = computed<{ x: number; y: number; w: number; h: number } | null>(() => {
  const nodes = frozenLayoutNodes.value
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const node of nodes) {
    const halfW = FROZEN_EVENT_TYPES.has(node.type)
      ? 64
      : FROZEN_GATEWAY_TYPES.has(node.type)
        ? 14
        : 115
    grow(node.x - halfW, node.y - 22)
    grow(node.x + halfW, node.y + 22)
  }
  for (const edge of frozenGraph.value.edges) for (const p of frozenEdgePoints(edge)) grow(p.x, p.y)
  if (!Number.isFinite(minX)) return null
  return { x: minX - 40, y: minY - 40, w: maxX - minX + 80, h: maxY - minY + 80 }
})

/* 初始展示 1:1：宽高属性等于视盒尺寸，不做放大。 */
const frozenViewBox = computed<string | null>(() => {
  const r = frozenViewBoxRect.value
  return r ? [r.x, r.y, r.w, r.h].join(' ') : null
})

const frozenNotification = computed<Record<string, unknown> | null>(() => {
  const graph = asRecord(selectedProcess.value?.graph)
  return asRecord(graph?.notification)
})

function notificationText(key: string): string {
  const value = frozenNotification.value?.[key]
  if (key === 'channels') {
    return Array.isArray(value) && value.length
      ? value
          .map((c) => (c === 'IN_APP' ? t('form.snapshotViewer.channelInApp') : String(c)))
          .join('、')
      : t('form.snapshotViewer.propNotConfigured')
  }
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
  return value ? String(value) : t('form.snapshotViewer.propNotConfigured')
}

const frozenNumbering = computed<unknown>(() => {
  const raw = asRecord(rawDefinition.value)
  return raw?.numbering ?? null
})

const frozenFormEvents = computed<
  Array<{
    kind: string
    rows: Array<{ id: string; name: string; script: string; enabled: boolean }>
  }>
>(() => {
  const events = asRecord(asRecord(rawDefinition.value)?.events)
  if (!events) return []
  const kinds: Array<[string, string]> = [
    ['onLoad', 'eventOnLoad'],
    ['beforeSubmitHandler', 'eventBeforeSubmit'],
    ['afterSubmitHandler', 'eventAfterSubmit'],
  ]
  return kinds
    .map(([key, labelKey]) => ({
      kind: t('form.snapshotViewer.' + labelKey),
      rows: (Array.isArray(events[key]) ? (events[key] as unknown[]) : [])
        .map((row) => asRecord(row))
        .filter((row): row is Record<string, unknown> => !!row)
        .map((row) => ({
          id: typeof row.id === 'string' ? row.id : '',
          name: typeof row.name === 'string' ? row.name : '',
          script: typeof row.script === 'string' ? row.script : '',
          enabled: row.enabled !== false,
        })),
    }))
    .filter((group) => group.rows.length > 0)
})

function fieldConstraintsOf(path: string) {
  return constraints.value.filter((row) => row.path === path)
}

function fieldScriptOf(name: string): string {
  const field = asRecord(schema.value?.fields.find((f) => f.name === name))
  const script = asRecord(field?.script)
  return typeof script?.code === 'string' ? script.code : ''
}

function fieldVisibilityOf(name: string): VisibilityRule | null {
  return schema.value?.rules?.visibility?.find((rule) => rule.target === name) ?? null
}

type FrozenFieldPropRow = {
  label: string
  value: string
  detail?: 'validation' | 'script' | 'visibility'
}

function labelPositionText(field: FormSchema['fields'][number]): string {
  const raw = (field as { labelPosition?: string }).labelPosition
  if (raw === 'left') return t('form.labelPositionLeft')
  if (raw === 'right') return t('form.labelPositionRight')
  return t('form.labelPositionTopLeft')
}

function buildFrozenFieldPropRows(field: FormSchema['fields'][number]): FrozenFieldPropRow[] {
  const basic: FrozenFieldPropRow[] = [
    { label: t('form.snapshotViewer.propFieldName'), value: field.label || field.name },
    {
      label: t('form.snapshotViewer.propColWidth'),
      value: String(Math.round(((field.colSpan ?? 24) / 24) * 100)) + '%',
    },
    { label: t('form.snapshotViewer.propLabelPos'), value: labelPositionText(field) },
    {
      label: t('form.snapshotViewer.propPlaceholder'),
      value: field.placeholder || t('form.snapshotViewer.propNotConfigured'),
    },
    {
      label: t('form.snapshotViewer.propRequired'),
      value: field.required ? t('common.yes') : t('common.no'),
    },
  ]
  const ruleRows: FrozenFieldPropRow[] = [
    { label: t('form.snapshotViewer.propFieldKey'), value: field.name },
    { label: t('form.snapshotViewer.propType'), value: field.type },
    {
      label: t('form.snapshotViewer.propMaxLength'),
      value:
        'length' in field && field.length
          ? String(field.length)
          : t('form.snapshotViewer.propNotConfigured'),
    },
    {
      label: t('form.snapshotViewer.propValidation'),
      value: fieldConstraintsOf(field.name).length
        ? fieldConstraintsOf(field.name).length + ' ' + t('form.snapshotViewer.propCount')
        : t('form.snapshotViewer.propNotConfigured'),
      detail: fieldConstraintsOf(field.name).length ? 'validation' : undefined,
    },
    {
      label: t('form.snapshotViewer.propValueScript'),
      value: fieldScriptOf(field.name)
        ? t('form.snapshotViewer.propConfigured')
        : t('form.snapshotViewer.propNotConfigured'),
      detail: fieldScriptOf(field.name) ? 'script' : undefined,
    },
    {
      label: t('form.snapshotViewer.propShowCondition'),
      value: fieldVisibilityOf(field.name)
        ? t('form.snapshotViewer.propConfigured')
        : t('form.snapshotViewer.propNotConfigured'),
      detail: fieldVisibilityOf(field.name) ? 'visibility' : undefined,
    },
  ]
  return [...basic, ...ruleRows]
}

const frozenFieldPropRows = computed<FrozenFieldPropRow[]>(() =>
  selectedField.value ? buildFrozenFieldPropRows(selectedField.value) : [],
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

/* ── 流程设置页签（审查23 S14-E）：左200导航 通知/监听 + 变量/脚本额外分支 ── */
type SettingsBranch = 'notification' | 'listeners' | 'variables' | 'approvalScripts'
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

const listenerRows = computed(() => [
  ...triggers.value.map((row) => ({
    key: `${row.processKey}:${row.graphVersion}:${row.trigger.triggerId}`,
    name: row.trigger.name || row.trigger.triggerId,
    timing: eventLabel(row.trigger.event),
    enabled:
      row.trigger.enabled === false
        ? t('form.snapshotViewer.disabled')
        : t('form.snapshotViewer.enabled'),
    view: () => {
      scriptDetailTitle.value =
        (row.trigger.name || row.trigger.triggerId) + ' · ' + eventLabel(row.trigger.event)
      scriptDetailCode.value = row.trigger.script || '—'
      scriptDetailMeta.value = `${row.processName} · v${row.graphVersion}`
      scriptDetailVisible.value = true
    },
  })),
  ...frozenFormEvents.value.flatMap((group) =>
    group.rows.map((row) => ({
      key: `${group.kind}:${row.id}`,
      name: row.name || row.id,
      timing: group.kind,
      enabled: row.enabled ? t('form.snapshotViewer.enabled') : t('form.snapshotViewer.disabled'),
      view: () => {
        scriptDetailTitle.value = (row.name || row.id) + ' · ' + group.kind
        scriptDetailCode.value = row.script || '—'
        scriptDetailMeta.value = ''
        scriptDetailVisible.value = true
      },
    })),
  ),
])

const propsDialogVisible = ref(false)
const propsDialogField = ref<FormSchema['fields'][number] | null>(null)
const propsDialogRows = computed<FrozenFieldPropRow[]>(() =>
  propsDialogField.value ? buildFrozenFieldPropRows(propsDialogField.value) : [],
)

function openFieldProps(path: string): void {
  const field = schema.value?.fields.find((f) => f.name === path.split('.')[0])
  if (!field) return
  propsDialogField.value = field
  propsDialogVisible.value = true
}

function openFrozenDetail(row: FrozenFieldPropRow): void {
  const field = propsDialogField.value ?? selectedField.value
  if (!field) return
  if (row.detail === 'validation') {
    const first = fieldConstraintsOf(field.name)[0]
    if (first) openValidationDetail(first)
  } else if (row.detail === 'script') {
    const view = scripts.value.find((s) => s.key === field.name || s.nodeKey === field.name)
    if (view) openScriptDetail(view)
  } else if (row.detail === 'visibility') {
    const rule = fieldVisibilityOf(field.name)
    if (rule) {
      scriptDetailTitle.value =
        t('form.snapshotViewer.visibility') + ' · ' + (field.label || field.name)
      scriptDetailCode.value = JSON.stringify(rule, null, 2)
      scriptDetailMeta.value = rule.target
      scriptDetailVisible.value = true
    }
  }
}

function sectionLabel(label: string): string {
  return t(`form.snapshotViewer.${label}`)
}

function selectTab(key: SnapshotTab): void {
  activeTab.value = key
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseRawDefinition(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('snapshot definition must be an object')
  }
  return parsed as Record<string, unknown>
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'msg' in error) {
    const message = (error as { msg?: unknown }).msg
    if (typeof message === 'string' && message.trim()) return message
  }
  return error instanceof Error ? error.message : String(error)
}

function toProcessSource(
  candidate: SnapshotProcessVersionCandidate,
  graph: unknown,
): SnapshotProcessSource {
  return {
    defId: String(candidate.def.id),
    defName: candidate.def.name || candidate.def.processKey,
    processKey: candidate.def.processKey,
    graphVersion: candidate.version.graphVersion,
    versionName: candidate.version.name || candidate.def.name,
    status: candidate.version.status,
    formVersion: candidate.version.formVersion,
    publishedAt: candidate.version.publishedAt || candidate.version.updateTime,
    publisherName: candidate.version.publisherName,
    graph,
  }
}

async function loadRelatedProcessSnapshots(
  generation: number,
  snapshot: FormSnapshotDTO,
): Promise<void> {
  try {
    const candidates = await loadSnapshotProcessVersionCandidates(props.formKey)
    if (generation !== requestGeneration) return
    warnings.value.push(...candidates.failures)
    const matches = candidates.items.filter((candidate) =>
      matchesSnapshotFormVersion(
        snapshot.formVersion,
        snapshot.versionLabel,
        candidate.version.formVersion,
      ),
    )
    const settled = await Promise.allSettled(
      matches.map(async (candidate) => ({
        candidate,
        graph: await loadSnapshotProcessVersionGraph(
          candidate.def.id,
          candidate.version.graphVersion,
        ),
      })),
    )
    if (generation !== requestGeneration) return
    const sources: SnapshotProcessSource[] = []
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sources.push(toProcessSource(result.value.candidate, result.value.graph))
        return
      }
      const candidate = matches[index]
      warnings.value.push(
        t('form.snapshotViewer.processReadFailed', {
          name: candidate?.def.name ?? candidate?.def.processKey ?? 'process',
          message: errorText(result.reason),
        }),
      )
    })
    processSources.value = sources.sort(
      (left, right) =>
        left.defName.localeCompare(right.defName) || left.graphVersion - right.graphVersion,
    )
  } catch (error) {
    if (generation === requestGeneration) {
      warnings.value.push(t('form.snapshotViewer.processLoadFailed', { message: errorText(error) }))
    }
  }
}

async function loadSnapshot(): Promise<void> {
  const snapshot = props.snapshot
  if (!visible.value || !snapshot) return
  const generation = ++requestGeneration
  loading.value = true
  loadError.value = ''
  warnings.value = []
  detail.value = null
  schema.value = null
  rawDefinition.value = null
  processSources.value = []
  activeTab.value = 'fields'
  selectedFieldName.value = null
  selectedProcessKey.value = null
  selectedNodeId.value = null
  try {
    const loaded = await getFormSnapshotDefinition(props.formId, snapshot.formVersion)
    if (generation !== requestGeneration) return
    const raw = parseRawDefinition(loaded.definition)
    const parsed = parseDefinition(loaded.definition)
    detail.value = loaded
    rawDefinition.value = raw
    schema.value = parsed
    await loadRelatedProcessSnapshots(generation, snapshot)
  } catch (error) {
    if (generation === requestGeneration) {
      loadError.value = `${t('form.snapshotViewer.loadFailed')}: ${errorText(error)}`
    }
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

function principalText(values: string[] | undefined): string {
  return values?.length ? values.join('、') : t('form.snapshotViewer.unrestricted')
}

function validationLabel(kind: string): string {
  const keys: Record<string, string> = {
    required: 'constraintRequired',
    minLength: 'constraintMinLength',
    maxLength: 'constraintMaxLength',
    pattern: 'constraintPattern',
    patternMessage: 'constraintPatternMessage',
  }
  return t(`form.snapshotViewer.${keys[kind] ?? 'rawValue'}`)
}

function scriptKindLabel(kind: SnapshotScriptKind): string {
  return t(`form.snapshotViewer.scriptKind.${kind}`)
}

function scriptSourceLabel(row: SnapshotScriptView): string {
  if (row.source === 'FORM_FIELD') return t('form.snapshotViewer.formFieldSource')
  if (row.source === 'FORM_EVENT') return t('form.snapshotViewer.formEventSource')
  return row.source
}

function eventLabel(event: string | undefined): string {
  if (!event) return '—'
  return t(`form.snapshotViewer.event.${event}`, event)
}

watch(
  () => [visible.value, props.formId, props.formKey, props.snapshot?.formVersion] as const,
  () => {
    if (visible.value) void loadSnapshot()
  },
  { immediate: true },
)
</script>

<template>
  <DetailDialog
    v-model="visible"
    class="published-snapshot-dialog"
    :title="t('form.snapshotViewer.title')"
    :loading="loading"
    :error="loadError"
    fullscreen
    appearance="design"
    :show-footer="false"
    append-to-body
  >
    <div v-if="loading" class="snapshot-loading">{{ t('form.snapshotViewer.loading') }}</div>
    <div
      v-else-if="effectiveSnapshot && schema"
      class="snapshot-viewer"
      data-testid="published-snapshot-viewer"
    >
      <header class="snapshot-topbar">
        <div class="snapshot-topbar__identity">
          <strong class="snapshot-topbar__title">{{ t('form.snapshotViewer.title') }}</strong>
          <span class="snapshot-topbar__name">{{ snapshotTitle }}</span>
          <span class="snapshot-topbar__version">v{{ snapshotVersionText }}</span>
          <span class="snapshot-topbar__badge">{{ t('form.snapshotViewer.frozenBadge') }}</span>
        </div>
        <button
          type="button"
          class="snapshot-topbar__close"
          :aria-label="t('common.close')"
          @click="visible = false"
        >
          <el-icon :size="16"><Close /></el-icon>
        </button>
      </header>

      <nav class="snapshot-tabs" :aria-label="t('form.snapshotViewer.sections')">
        <button
          v-for="tab in viewerTabs"
          :key="tab.key"
          type="button"
          class="snapshot-tabs__item"
          :class="{ 'is-active': activeTab === tab.key }"
          :aria-current="activeTab === tab.key ? 'page' : undefined"
          @click="selectTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div v-if="warnings.length" class="snapshot-warning" role="status">
        <p v-for="warning in warnings" :key="warning">{{ warning }}</p>
      </div>

      <div class="snapshot-body">
        <!-- ═══ 字段清单（审查23 S14-F）：主面单一冻结字段表；概览/原始定义收独立详情入口 ═══ -->
        <div v-if="activeTab === 'fields'" class="snapshot-tabbody snapshot-tabbody--full">
          <!-- 审查23 S14-F：字段表从页签下 20 起，34 表头 / 46 行 -->
          <section class="snapshot-section snapshot-fields-section">
            <p v-if="fields.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <table v-else class="snapshot-table snapshot-fields-table">
              <thead>
                <tr>
                  <th class="snapshot-table__index">#</th>
                  <th>{{ t('fieldList.colName') }}</th>
                  <th>{{ t('fieldList.colKey') }}</th>
                  <th>{{ t('fieldList.colComponent') }}</th>
                  <th>{{ t('fieldList.colLength') }}</th>
                  <th>{{ t('form.snapshotViewer.required') }}</th>
                  <th>{{ t('common.actions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(field, index) in fields" :key="field.key">
                  <td class="snapshot-table__index">{{ index + 1 }}</td>
                  <td>
                    {{ field.label || '—' }}
                    <small v-if="field.table === 'subtable'">{{ field.parentLabel }}</small>
                  </td>
                  <td>
                    <code>{{ field.path }}</code>
                  </td>
                  <td>
                    <code>{{ field.type }}</code>
                  </td>
                  <td>{{ ('length' in field.field && field.field.length) || '—' }}</td>
                  <td>{{ field.required ? t('common.yes') : t('common.no') }}</td>
                  <td>
                    <el-button link type="primary" size="small" @click="openFieldProps(field.path)">
                      {{ t('form.snapshotViewer.viewProps') }}
                    </el-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <details class="snapshot-raw snapshot-raw--card">
            <summary>{{ sectionLabel('overview') }}</summary>
            <dl class="snapshot-meta">
              <div>
                <dt>{{ t('form.snapshotViewer.formIdentity') }}</dt>
                <dd>
                  <code>{{ formKey }}</code>
                </dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.version') }}</dt>
                <dd>v{{ snapshotVersionText }}</dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.publishedAt') }}</dt>
                <dd>{{ effectiveSnapshot.createTime || '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.status') }}</dt>
                <dd>{{ effectiveSnapshot.status || '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.author') }}</dt>
                <dd>{{ effectiveSnapshot.author || '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.schemaVersion') }}</dt>
                <dd>{{ schema.schemaVersion ?? '—' }}</dd>
              </div>
              <div class="snapshot-meta__wide">
                <dt>{{ t('form.snapshotViewer.note') }}</dt>
                <dd>{{ effectiveSnapshot.note || '—' }}</dd>
              </div>
            </dl>
            <details class="snapshot-raw">
              <summary>{{ t('form.snapshotViewer.rawDefinition') }}</summary>
              <pre>{{ rawDefinitionText }}</pre>
            </details>
          </details>

          <section class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('validation') }}</h3>
              </div>
            </div>
            <p v-if="constraints.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <table v-else class="snapshot-table">
              <thead>
                <tr>
                  <th>{{ t('form.snapshotViewer.fieldPath') }}</th>
                  <th>{{ t('form.snapshotViewer.label') }}</th>
                  <th>{{ t('form.snapshotViewer.rule') }}</th>
                  <th>{{ t('form.snapshotViewer.value') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in constraints" :key="`${row.path}:${row.kind}`">
                  <td>
                    <code>{{ row.path }}</code>
                  </td>
                  <td>{{ row.label }}</td>
                  <td>{{ validationLabel(row.kind) }}</td>
                  <td>
                    <code>{{ row.value }}</code>
                    <el-button link type="primary" size="small" @click="openValidationDetail(row)">
                      {{ t('common.view') }}
                    </el-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('visibility') }}</h3>
              </div>
            </div>
            <p v-if="visibility.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <template v-else>
              <article v-for="rule in visibility" :key="rule.target" class="snapshot-rule">
                <header>
                  <strong>{{ rule.targetLabel }}</strong
                  ><code>{{ rule.target }}</code
                  ><span>{{ rule.logic }}</span>
                </header>
                <ul>
                  <li
                    v-for="(condition, index) in rule.conditions"
                    :key="`${condition.field}:${index}`"
                  >
                    <strong>{{ condition.label }}</strong>
                    <code>{{ condition.field }}</code> {{ condition.op }}
                    <code v-if="condition.value != null">{{ condition.value }}</code>
                  </li>
                </ul>
              </article>
            </template>
          </section>

          <section class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('scripts') }}</h3>
              </div>
            </div>
            <p v-if="scripts.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <template v-else>
              <article v-for="row in scripts" :key="row.key" class="snapshot-code-card">
                <header>
                  <strong>{{ row.label }}</strong>
                  <span>{{ scriptKindLabel(row.kind) }}</span>
                  <span>{{ scriptSourceLabel(row) }}</span>
                  <span v-if="row.event">{{ eventLabel(row.event) }}</span>
                  <span v-if="row.nodeKey">{{ row.nodeKey }}</span>
                  <span v-if="row.enabled != null">
                    {{
                      row.enabled
                        ? t('form.snapshotViewer.enabled')
                        : t('form.snapshotViewer.disabled')
                    }}
                  </span>
                  <el-button link type="primary" size="small" @click="openScriptDetail(row)">
                    {{ t('common.view') }}
                  </el-button>
                </header>
                <pre>{{ row.code }}</pre>
              </article>
            </template>
          </section>

          <section class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('columns') }}</h3>
              </div>
            </div>
            <p v-if="!listConfig" class="snapshot-limitation">
              {{ t('form.snapshotViewer.listConfigMissing') }}
            </p>
            <template v-else>
              <p v-if="listConfig.columns.length === 0" class="snapshot-empty">
                {{ t('form.snapshotViewer.noData') }}
              </p>
              <table v-else class="snapshot-table">
                <thead>
                  <tr>
                    <th>{{ t('form.snapshotViewer.fieldPath') }}</th>
                    <th>{{ t('form.snapshotViewer.label') }}</th>
                    <th>{{ t('form.snapshotViewer.width') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="column in listConfig.columns" :key="column.name">
                    <td>
                      <code>{{ column.name }}</code>
                    </td>
                    <td>{{ column.label || '—' }}</td>
                    <td>{{ column.width ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <dl class="snapshot-meta snapshot-meta--compact">
                <div>
                  <dt>{{ t('form.snapshotViewer.filters') }}</dt>
                  <dd>
                    {{
                      listConfig.filters.map((item) => `${item.name} ${item.op}`).join('、') || '—'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t('form.snapshotViewer.defaultSort') }}</dt>
                  <dd>
                    {{
                      listConfig.defaultSort
                        ? `${listConfig.defaultSort.name} ${listConfig.defaultSort.desc ? 'DESC' : 'ASC'}`
                        : '—'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t('form.snapshotViewer.actions') }}</dt>
                  <dd>{{ listConfig.actions.join('、') || '—' }}</dd>
                </div>
              </dl>
              <details class="snapshot-raw">
                <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
                <pre>{{ prettyJson(listConfig.raw) }}</pre>
              </details>
            </template>
          </section>

          <section class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('permissions') }}</h3>
              </div>
            </div>
            <p v-if="permissions.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noFieldPermissions') }}
            </p>
            <table v-else class="snapshot-table">
              <thead>
                <tr>
                  <th>{{ t('form.snapshotViewer.fieldPath') }}</th>
                  <th>{{ t('form.snapshotViewer.label') }}</th>
                  <th>{{ t('form.snapshotViewer.viewPrincipals') }}</th>
                  <th>{{ t('form.snapshotViewer.editPrincipals') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in permissions" :key="row.field">
                  <td>
                    <code>{{ row.field }}</code>
                  </td>
                  <td>{{ row.label }}</td>
                  <td>{{ principalText(row.rule.view) }}</td>
                  <td>{{ principalText(row.rule.edit) }}</td>
                </tr>
              </tbody>
            </table>
            <h4>{{ t('form.snapshotViewer.actionPermissions') }}</h4>
            <p v-if="actionPermissions.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <ul v-else class="snapshot-principal-list">
              <li v-for="row in actionPermissions" :key="row.action">
                <code>{{ row.action }}</code
                ><span>{{ principalText(row.subjects) }}</span>
              </li>
            </ul>
          </section>
        </div>

        <!-- ═══ 表单设计：左组件列 252 / 冻结表单画布 / 右冻结类型属性 336 ═══ -->
        <div v-else-if="activeTab === 'design'" class="snapshot-tabbody snapshot-tabbody--design">
          <aside class="snapshot-side snapshot-side--fields">
            <h4>{{ t('form.snapshotViewer.componentList') }}</h4>
            <ul class="snapshot-component-list">
              <li v-for="field in schema?.fields ?? []" :key="field.name">
                <button
                  type="button"
                  :class="{ 'is-active': field.name === selectedField?.name }"
                  @click="selectedFieldName = field.name"
                >
                  {{ field.label || field.name }}
                </button>
              </li>
            </ul>
          </aside>
          <div class="snapshot-tabbody__main">
            <section class="snapshot-section">
              <p v-if="!schema || schema.fields.length === 0" class="snapshot-empty">
                {{ t('form.snapshotViewer.noData') }}
              </p>
              <div v-else class="snapshot-design">
                <p v-if="schema.description" class="snapshot-design__description">
                  {{ schema.description }}
                </p>
                <div class="snapshot-design__grid">
                  <div
                    v-for="field in schema.fields"
                    :key="field.name"
                    :class="{
                      'snapshot-design__cell': true,
                      'is-selected': field.name === selectedField?.name,
                    }"
                    :style="{ gridColumn: `span ${getFormFieldColSpan(field)}` }"
                    @click="selectedFieldName = field.name"
                  >
                    <FormPreview :schema="{ title: '', fields: [field] }" mode="design" />
                  </div>
                </div>
              </div>
            </section>
          </div>
          <aside class="snapshot-side snapshot-side--props snapshot-side--props-surface">
            <h4>{{ t('form.snapshotViewer.propsTitle') }}</h4>
            <template v-if="selectedField">
              <div class="snapshot-props-surface">
                <div
                  v-for="row in frozenFieldPropRows.slice(0, 5)"
                  :key="row.label"
                  class="snapshot-props-surface__group"
                >
                  <label class="snapshot-props-surface__label">{{ row.label }}</label>
                  <input class="snapshot-props-surface__input" :value="row.value" readonly />
                </div>
              </div>
              <h4 class="snapshot-props-surface__rules-title">
                {{ t('form.snapshotViewer.propDataRules') }}
              </h4>
              <!-- 501:19159：字段标识/数据类型/最大长度三值承接为原只读输入框 -->
              <div class="snapshot-props-surface snapshot-props-surface--rules">
                <div
                  v-for="row in frozenFieldPropRows.slice(5, 8)"
                  :key="row.label"
                  class="snapshot-props-surface__group"
                >
                  <label class="snapshot-props-surface__label">{{ row.label }}</label>
                  <input class="snapshot-props-surface__input" :value="row.value" readonly />
                </div>
              </div>
              <div class="snapshot-props-surface__rules">
                <template v-for="row in frozenFieldPropRows.slice(8)" :key="row.label">
                  <div class="snapshot-props-surface__rule">
                    <span class="snapshot-props-surface__rule-label">{{ row.label }}</span>
                    <span class="snapshot-props-surface__rule-value">{{ row.value }}</span>
                    <el-button
                      v-if="row.detail"
                      link
                      type="primary"
                      size="small"
                      @click="openFrozenDetail(row)"
                    >
                      {{ t('common.view') }}
                    </el-button>
                  </div>
                  <pre v-if="row.detail === 'script'" class="snapshot-props-surface__script">{{
                    fieldScriptOf(selectedField.name)
                  }}</pre>
                </template>
              </div>
            </template>
            <p v-else class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
          </aside>
        </div>

        <!-- ═══ 流程设计：左流程版本 220 / 冻结图展示点选 / 右选中节点只读属性 336 ═══ -->
        <div v-else-if="activeTab === 'process'" class="snapshot-tabbody snapshot-tabbody--process">
          <aside class="snapshot-side snapshot-side--procs">
            <h4>{{ t('form.snapshotViewer.processSnapshots') }}</h4>
            <p v-if="processSources.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noMatchingProcess') }}
            </p>
            <ul v-else class="snapshot-component-list">
              <li
                v-for="process in processSources"
                :key="`${process.defId}:${process.graphVersion}`"
              >
                <button
                  type="button"
                  :class="{
                    'is-active':
                      `${process.defId}:${process.graphVersion}` ===
                      `${selectedProcess?.defId}:${selectedProcess?.graphVersion}`,
                  }"
                  @click="selectedProcessKey = `${process.defId}:${process.graphVersion}`"
                >
                  <span>{{ process.defName }}</span>
                  <small>v{{ process.graphVersion }}</small>
                </button>
              </li>
            </ul>
          </aside>
          <div class="snapshot-tabbody__main">
            <section class="snapshot-section">
              <div v-if="selectedProcess" class="snapshot-process">
                <div>
                  <strong>{{ selectedProcess.defName }}</strong>
                  <span
                    >{{ selectedProcess.processKey }} · v{{ selectedProcess.graphVersion }}</span
                  >
                </div>
                <div class="snapshot-process__meta">
                  <span>{{ selectedProcess.status }}</span>
                  <span>{{ selectedProcess.publishedAt || '—' }}</span>
                  <span>{{ selectedProcess.publisherName || '—' }}</span>
                </div>
                <details class="snapshot-raw snapshot-raw--card">
                  <summary>{{ t('form.snapshotViewer.rawProcessGraph') }}</summary>
                  <pre>{{ prettyJson(selectedProcess.graph) }}</pre>
                </details>
              </div>
              <div class="snapshot-section__head">
                <div>
                  <h3>{{ sectionLabel('nodes') }}</h3>
                </div>
              </div>
              <p v-if="frozenGraph.nodes.length === 0" class="snapshot-empty">
                {{ t('form.snapshotViewer.noData') }}
              </p>
              <div v-else class="snapshot-frozen-graph">
                <svg
                  :viewBox="frozenViewBox ?? undefined"
                  :width="frozenViewBoxRect ? frozenViewBoxRect.w + 2 : undefined"
                  :height="frozenViewBoxRect ? frozenViewBoxRect.h + 2 : undefined"
                  role="img"
                  :aria-label="sectionLabel('nodes')"
                >
                  <defs>
                    <marker
                      id="frozen-edge-arrow"
                      markerUnits="userSpaceOnUse"
                      markerWidth="8.5"
                      markerHeight="7"
                      refX="8.2"
                      refY="3.5"
                      orient="auto"
                    >
                      <path d="M0,0 L8.5,3.5 L0,7 z" fill="#8996ab" />
                    </marker>
                  </defs>
                  <polyline
                    v-for="edge in frozenGraph.edges"
                    :key="edge.id"
                    class="snapshot-frozen-graph__edge"
                    :points="
                      frozenEdgePoints(edge)
                        .map((p) => `${p.x},${p.y}`)
                        .join(' ')
                    "
                    marker-end="url(#frozen-edge-arrow)"
                  />
                  <g
                    v-for="node in frozenLayoutNodes"
                    :key="node.id"
                    class="snapshot-frozen-graph__node"
                    :class="{
                      'is-selected': selectedNode?.id === node.id,
                      'is-event': FROZEN_EVENT_TYPES.has(node.type),
                      'is-gateway': FROZEN_GATEWAY_TYPES.has(node.type),
                      'is-start': node.type === 'START',
                      'is-end': node.type === 'END',
                    }"
                    @click="selectedNodeId = node.id"
                  >
                    <rect
                      v-if="FROZEN_GATEWAY_TYPES.has(node.type)"
                      :x="node.x - 14"
                      :y="node.y - 14"
                      width="28"
                      height="28"
                      :transform="`rotate(45 ${node.x} ${node.y})`"
                    />
                    <rect
                      v-else-if="FROZEN_EVENT_TYPES.has(node.type)"
                      :x="node.x - 64"
                      :y="node.y - 22"
                      width="128"
                      height="44"
                      rx="22"
                    />
                    <rect
                      v-else
                      :x="node.x - 115"
                      :y="node.y - 22"
                      width="230"
                      height="44"
                      rx="8"
                    />
                    <text
                      v-if="!FROZEN_GATEWAY_TYPES.has(node.type)"
                      :x="node.x"
                      :y="node.y + 5"
                      text-anchor="middle"
                    >
                      {{ node.label }}
                    </text>
                  </g>
                </svg>
                <p class="snapshot-frozen-graph__hint">
                  {{ t('form.snapshotViewer.nodeCountUnit', { count: frozenGraph.nodes.length }) }}
                </p>
              </div>
              <h4>{{ t('form.snapshotViewer.advancedConfig') }}</h4>
              <p v-if="advancedConfigs.length === 0" class="snapshot-empty">
                {{ t('form.snapshotViewer.noData') }}
              </p>
              <template v-else>
                <details
                  v-for="row in advancedConfigs"
                  :key="`${row.processKey}:${row.graphVersion}`"
                  class="snapshot-raw snapshot-raw--card"
                >
                  <summary>{{ row.processName }} · v{{ row.graphVersion }}</summary>
                  <pre>{{ prettyJson(row.config) }}</pre>
                </details>
              </template>
            </section>
          </div>
          <aside class="snapshot-side snapshot-side--props snapshot-side--props-surface">
            <h4 class="snapshot-node-props-title">
              {{ t('form.snapshotViewer.nodePropsTitle') }}
            </h4>
            <template v-if="selectedNode">
              <!-- 502:21715：节点属性五个只读框，值取真实节点/查看层派生坐标与真实图形尺寸 -->
              <div class="snapshot-props-surface">
                <div
                  v-for="row in frozenNodePropRows"
                  :key="row.label"
                  class="snapshot-props-surface__group"
                >
                  <label class="snapshot-props-surface__label">{{ row.label }}</label>
                  <input class="snapshot-props-surface__input" :value="row.value" readonly />
                </div>
              </div>
              <details class="snapshot-raw snapshot-raw--card">
                <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
                <pre>{{ prettyJson(selectedNode.config) }}</pre>
              </details>
            </template>
            <p v-else class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
          </aside>
        </div>

        <!-- ═══ 编号设置：冻结编号规则（无冻结数据时同布局空态） ═══ -->
        <div v-else-if="activeTab === 'numbering'" class="snapshot-tabbody snapshot-tabbody--full">
          <section class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('numbering') }}</h3>
              </div>
            </div>
            <p v-if="!frozenNumbering" class="snapshot-empty">
              {{ t('form.snapshotViewer.numberingMissing') }}
            </p>
            <details v-else class="snapshot-raw snapshot-raw--card">
              <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
              <pre>{{ prettyJson(frozenNumbering) }}</pre>
            </details>
          </section>
        </div>

        <!-- ═══ 流程设置（审查23 S14-E）：左200导航 通知/监听（变量/脚本为额外合法分支） ═══ -->
        <div v-else class="snapshot-tabbody snapshot-settings">
          <aside class="snapshot-settings__nav">
            <button
              v-for="branch in settingsBranches"
              :key="branch.key"
              type="button"
              :class="{ 'is-active': settingsBranch === branch.key }"
              @click="settingsBranch = branch.key"
            >
              {{ branch.label }}
            </button>
          </aside>
          <div class="snapshot-settings__main">
            <section v-if="settingsBranch === 'notification'" class="snapshot-section">
              <div class="snapshot-section__head">
                <div>
                  <h3>{{ sectionLabel('notification') }}</h3>
                </div>
              </div>
              <p v-if="!frozenNotification" class="snapshot-empty">
                {{ t('form.snapshotViewer.notificationMissing') }}
              </p>
              <div v-else class="snapshot-props-surface">
                <div
                  v-for="row in notificationRows"
                  :key="row.label"
                  class="snapshot-props-surface__group"
                >
                  <label class="snapshot-props-surface__label">{{ row.label }}</label>
                  <input class="snapshot-props-surface__input" :value="row.value" readonly />
                </div>
              </div>
            </section>

            <section v-else-if="settingsBranch === 'listeners'" class="snapshot-section">
              <div class="snapshot-section__head">
                <div>
                  <h3>{{ sectionLabel('eventListeners') }}</h3>
                </div>
              </div>
              <p v-if="listenerRows.length === 0" class="snapshot-empty">
                {{ t('form.snapshotViewer.noData') }}
              </p>
              <table v-else class="snapshot-table snapshot-listener-table">
                <thead>
                  <tr>
                    <th>{{ t('form.snapshotViewer.listenerName') }}</th>
                    <th>{{ t('form.snapshotViewer.listenerTiming') }}</th>
                    <th>{{ t('form.snapshotViewer.listenerStatus') }}</th>
                    <th class="snapshot-listener-table__action">
                      {{ t('form.snapshotViewer.listenerAction') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in listenerRows" :key="row.key">
                    <td>{{ row.name }}</td>
                    <td>{{ row.timing }}</td>
                    <td>{{ row.enabled }}</td>
                    <td class="snapshot-listener-table__action">
                      <el-button link type="primary" size="small" @click="row.view()">
                        {{ t('common.view') }}
                      </el-button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section v-else-if="settingsBranch === 'variables'" class="snapshot-section">
              <div class="snapshot-section__head">
                <div>
                  <h3>{{ sectionLabel('variables') }}</h3>
                </div>
              </div>
              <p v-if="variables.length === 0" class="snapshot-empty">
                {{ t('form.snapshotViewer.noData') }}
              </p>
              <table v-else class="snapshot-table">
                <thead>
                  <tr>
                    <th>{{ t('form.snapshotViewer.version') }}</th>
                    <th>{{ t('form.snapshotViewer.variableId') }}</th>
                    <th>{{ t('form.snapshotViewer.label') }}</th>
                    <th>{{ t('form.snapshotViewer.type') }}</th>
                    <th>{{ t('form.snapshotViewer.source') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in variables"
                    :key="`${row.processKey}:${row.graphVersion}:${row.variable.varId}`"
                  >
                    <td>{{ row.processName }} · v{{ row.graphVersion }}</td>
                    <td>
                      <code>{{ row.variable.varId }}</code>
                    </td>
                    <td>{{ row.variable.name }}</td>
                    <td>{{ row.variable.type }}</td>
                    <td>{{ row.variable.source }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section v-else class="snapshot-section">
              <div class="snapshot-section__head">
                <div>
                  <h3>{{ sectionLabel('approvalScripts') }}</h3>
                </div>
              </div>
              <p v-if="approvalScripts.length === 0" class="snapshot-empty">
                {{ t('form.snapshotViewer.noData') }}
              </p>
              <template v-else>
                <article v-for="row in approvalScripts" :key="row.key" class="snapshot-code-card">
                  <header>
                    <strong>{{ row.label }}</strong
                    ><span>{{ scriptKindLabel(row.kind) }}</span
                    ><span>{{ row.nodeKey || '—' }}</span
                    ><span>{{ eventLabel(row.event) }}</span
                    ><span v-if="row.enabled != null">{{
                      row.enabled
                        ? t('form.snapshotViewer.enabled')
                        : t('form.snapshotViewer.disabled')
                    }}</span>
                  </header>
                  <pre>{{ row.code }}</pre>
                </article>
              </template>
            </section>
          </div>
        </div>
      </div>
    </div>

    <DetailDialog
      v-model="propsDialogVisible"
      :title="t('form.snapshotViewer.propsTitle')"
      width="560px"
      :show-footer="false"
      append-to-body
    >
      <p v-if="propsDialogField" class="snapshot-dialog-meta">
        <code>{{ propsDialogField.name }}</code>
      </p>
      <dl class="snapshot-frozen-props">
        <template v-for="row in propsDialogRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>
            {{ row.value }}
            <el-button
              v-if="row.detail"
              link
              type="primary"
              size="small"
              @click="openFrozenDetail(row)"
            >
              {{ t('common.view') }}
            </el-button>
          </dd>
        </template>
      </dl>
    </DetailDialog>
    <DetailDialog
      v-model="scriptDetailVisible"
      :title="scriptDetailTitle"
      width="640px"
      :show-footer="false"
      append-to-body
    >
      <p v-if="scriptDetailMeta" class="snapshot-dialog-meta">{{ scriptDetailMeta }}</p>
      <pre class="snapshot-dialog-code">{{ scriptDetailCode }}</pre>
    </DetailDialog>

    <DetailDialog
      v-model="validationDetailVisible"
      :title="validationDetailTitle"
      width="520px"
      :show-footer="false"
      append-to-body
    >
      <p v-if="validationDetailRow" class="snapshot-dialog-meta">
        <code>{{ validationDetailRow.path }}</code>
      </p>
      <pre class="snapshot-dialog-code">{{ validationDetailRow?.value }}</pre>
    </DetailDialog>
  </DetailDialog>
</template>

<style scoped>
.snapshot-loading {
  display: grid;
  min-height: 360px;
  place-items: center;
  color: var(--sw-text-secondary);
  font-size: 14px;
}

/* 0.2.0 G14（272:1518）：全屏外壳——顶条 56 / 页签 40 / 页签体分栏承接原分区内容 */
.snapshot-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.snapshot-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-16);
  flex: 0 0 56px;
  box-sizing: border-box;
  padding: 0 24px;
  border-bottom: 1px solid var(--sw-border-light);
  background: var(--sw-surface-card);
}

.snapshot-topbar__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.snapshot-topbar__title {
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 600;
}

.snapshot-topbar__name {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--sw-fill-base, #f4f6fb);
  color: var(--sw-text-regular);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.snapshot-topbar__version {
  padding: 2px 8px;
  border-radius: 4px;
  background: #eef2fb;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-topbar__badge {
  padding: 2px 8px;
  border-radius: 4px;
  background: #fdf6ec;
  color: #b88230;
  font-size: 12px;
}

.snapshot-topbar__close {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sw-text-secondary);
  cursor: pointer;
}

.snapshot-topbar__close:hover {
  background: var(--sw-fill-base, #f4f6fb);
  color: var(--sw-text-primary);
}

.snapshot-tabs {
  display: flex;
  align-items: stretch;
  gap: 32px;
  flex: 0 0 40px;
  box-sizing: border-box;
  padding: 0 24px;
  border-bottom: 1px solid var(--sw-border-light);
  background: var(--sw-surface-card);
}

.snapshot-tabs__item {
  position: relative;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 40px;
  cursor: pointer;
}

.snapshot-tabs__item:hover {
  color: var(--sw-color-primary);
}

.snapshot-tabs__item.is-active {
  color: var(--sw-color-primary);
  font-weight: 600;
}

.snapshot-tabs__item.is-active::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--sw-color-primary);
  content: '';
}

.snapshot-warning {
  padding: 10px 14px;
  border: 1px solid var(--sw-warning);
  border-radius: var(--sw-radius-base);
  background: var(--sw-warning-bg);
  color: var(--sw-text-primary);
  font-size: 12px;
}

.snapshot-warning p {
  margin: 0;
}

.snapshot-warning p + p {
  margin-top: 4px;
}

.snapshot-body {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
}

.snapshot-tabbody {
  height: 100%;
  min-height: 0;
}

.snapshot-tabbody--full {
  box-sizing: border-box;
  padding: 20px 24px 24px;
  overflow-y: auto;
}

.snapshot-tabbody--design,
.snapshot-tabbody--process {
  display: flex;
  align-items: stretch;
  min-height: 0;
}

/* 表单设计：左 252 / 右 336；流程设计：左 220 / 右 336（272:1518） */
.snapshot-tabbody--design .snapshot-side--fields {
  flex: 0 0 252px;
}

.snapshot-tabbody--process .snapshot-side--procs {
  flex: 0 0 220px;
}

.snapshot-tabbody--design .snapshot-side--props,
.snapshot-tabbody--process .snapshot-side--props {
  flex: 0 0 336px;
  border-left: 1px solid var(--sw-border-light);
}

.snapshot-tabbody__main {
  flex: 1 1 auto;
  box-sizing: border-box;
  min-width: 0;
  padding: 20px 24px 24px;
  overflow-y: auto;
}

.snapshot-side {
  box-sizing: border-box;
  padding: 20px 16px 24px;
  overflow-y: auto;
  background: var(--sw-surface-card);
}

.snapshot-side--fields,
.snapshot-side--procs {
  border-right: 1px solid var(--sw-border-light);
}

.snapshot-side h4 {
  margin: 0 0 12px;
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.snapshot-component-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.snapshot-component-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-text-regular);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.snapshot-component-list button small {
  color: var(--sw-text-secondary);
  font-size: 11px;
}

.snapshot-component-list button:hover {
  background: var(--sw-color-primary-soft);
}

.snapshot-component-list button.is-active {
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-weight: 600;
}

.snapshot-table__index {
  width: 48px;
  color: var(--sw-text-secondary);
}

/* 272:1518（执行提示13）：冻结图只读渲染（事件胶囊/网关菱形/普通节点 230×44，连线 #8996AB）。 */
/* 执行提示14：svg 宽高属性=视盒尺寸（1:1 初始展示，不放大），容器内滚动承接大图。 */
.snapshot-frozen-graph {
  overflow: auto;
}

.snapshot-frozen-graph svg {
  box-sizing: border-box;
  display: block;
  max-width: none;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: #f8fafe;
}

.snapshot-frozen-graph__edge {
  fill: none;
  stroke: #8996ab;
  stroke-width: 2;
}

.snapshot-frozen-graph__node {
  cursor: pointer;
}

.snapshot-frozen-graph__node rect {
  fill: #fff;
  stroke: #d7dfec;
  stroke-width: 1.4;
}

.snapshot-frozen-graph__node.is-event rect {
  stroke-width: 1.6;
}

.snapshot-frozen-graph__node.is-start rect {
  fill: #eefaf3;
  stroke: #16a77b;
}

.snapshot-frozen-graph__node.is-end rect {
  fill: #fdf0f1;
  stroke: #ef5d71;
}

.snapshot-frozen-graph__node.is-gateway rect {
  fill: #f7a92c;
  stroke: #e79a1f;
}

.snapshot-frozen-graph__node.is-selected rect {
  stroke: var(--sw-color-primary);
  stroke-width: 2;
}

.snapshot-frozen-graph__node text {
  fill: #19233b;
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
}

.snapshot-frozen-graph__node.is-selected text {
  fill: var(--sw-color-primary);
}

/* 冻结画布沿用真实控件形态：多行说明 80 高、日期占所属栏（colSpan 由 FormPreview 承担）。 */
.snapshot-design .el-textarea__inner {
  box-sizing: border-box;
  min-height: 80px;
  height: 80px;
}

.snapshot-frozen-graph__hint {
  margin: 8px 0 0;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

/* 272:1518（执行提示14）：表单右栏只读控件表面——TEXT 前五框 x1604/w296/h32、y188/264/340/416/492，
   标签 14/22 mb6、组距 16（步距 76）、默认边框 #DDE3EF；数据规则/脚本/显隐按真实配置可读承接。 */
.snapshot-tabbody--design .snapshot-side--props-surface,
.snapshot-tabbody--process .snapshot-side--props-surface {
  padding: 20px;
}

.snapshot-props-surface {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 22px;
}

/* 502:21715：节点属性首框 y184（少 8px 顶部空隙） */
.snapshot-tabbody--process .snapshot-props-surface {
  margin-top: 14px;
}

.snapshot-props-surface__group {
  display: flex;
  flex-direction: column;
}

.snapshot-props-surface__label {
  display: block;
  margin-bottom: 6px;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}

.snapshot-props-surface__input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 32px;
  padding: 0 11px;
  border: 1px solid #dde3ef;
  border-radius: 4px;
  background: #fff;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 30px;
  font-family: inherit;
}

.snapshot-props-surface__input[readonly] {
  cursor: default;
}

.snapshot-props-surface--rules {
  margin-top: 0;
}

.snapshot-fields-section {
  margin-top: 0;
}
.snapshot-fields-table th {
  height: 34px;
}
.snapshot-fields-table td {
  height: 46px;
}

.snapshot-settings {
  display: flex;
  gap: 24px;
}
.snapshot-settings__nav {
  flex: 0 0 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.snapshot-settings__nav button {
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  color: #303133;
  text-align: left;
  cursor: pointer;
}
.snapshot-settings__nav button.is-active {
  background: var(--sw-color-primary-soft, #eff6ff);
  color: var(--sw-color-primary);
  font-weight: 500;
}
.snapshot-settings__main {
  flex: 1 1 auto;
  min-width: 0;
}
.snapshot-listener-table th {
  height: 34px;
}
.snapshot-listener-table td {
  height: 46px;
}
.snapshot-listener-table__action {
  width: 88px;
}

.snapshot-side .snapshot-node-props-title {
  margin: 0 0 6px;
  color: var(--sw-text-primary);
  font-size: 16px;
  line-height: 24px;
}

.snapshot-side .snapshot-props-surface__rules-title {
  margin: 22px 0 12px;
}

.snapshot-props-surface__rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.snapshot-props-surface__rule {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snapshot-props-surface__rule-label {
  flex: 0 0 auto;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}

.snapshot-props-surface__rule-value {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.snapshot-props-surface__script {
  box-sizing: border-box;
  width: 100%;
  max-height: 160px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--sw-border-light);
  border-radius: 4px;
  background: #f8fafc;
  color: var(--sw-text-regular);
  font-size: 12px;
  line-height: 18px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 查看属性只读双列。 */
.snapshot-frozen-props {
  display: grid;
  gap: 10px 16px;
  margin: 0;
  grid-template-columns: max-content minmax(0, 1fr);
}

.snapshot-frozen-props dt {
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.snapshot-frozen-props dd {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--sw-text-regular);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.snapshot-node.is-selected {
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 1px var(--sw-color-primary-soft);
  cursor: pointer;
}

.snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

.snapshot-section + .snapshot-section {
  margin-top: var(--sw-space-24);
}

.snapshot-section__head h3 {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
}

/* 执行提示14：中央只读组件画布恢复原白色表面（移除灰色大卡片） */
.snapshot-design {
  padding: 0;
  border: none;
  border-radius: 0;
  background: #fff;
}

.snapshot-design__description {
  margin: 0 0 var(--sw-space-12);
  color: var(--sw-text-regular);
  font-size: var(--sw-font-secondary);
  line-height: 1.6;
}

.snapshot-design__grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: var(--sw-form-row-gap);
}

.snapshot-design__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 264px;
  gap: var(--sw-space-16);
  align-items: start;
}

.snapshot-design__cell {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--sw-radius-base);
  cursor: pointer;
}

.snapshot-design__cell.is-selected {
  border-color: var(--sw-color-primary);
}

.snapshot-design__props {
  box-sizing: border-box;
  padding: var(--sw-space-16);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-card);
}

.snapshot-design__props h4 {
  margin: 0 0 var(--sw-space-8);
  font-size: var(--sw-font-secondary);
  font-weight: 600;
}

.snapshot-design__props-target {
  margin: 0 0 var(--sw-space-8);
  color: var(--sw-color-primary);
  font-size: var(--sw-font-caption);
}

.snapshot-design__props dl {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 6px var(--sw-space-8);
  margin: 0;
}

.snapshot-design__props dt {
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
}

.snapshot-design__props dd {
  margin: 0;
  color: var(--sw-text-regular);
  font-size: var(--sw-font-caption);
  overflow-wrap: anywhere;
}

.snapshot-dialog-meta {
  margin: 0 0 12px;
  color: var(--sw-text-secondary);
  font-size: 13px;
}

.snapshot-dialog-code {
  margin: 0;
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  color: var(--sw-text-primary);
  font-family: var(--sw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.snapshot-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.snapshot-meta > div {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-page);
}

.snapshot-meta__wide {
  grid-column: 1 / -1;
}

.snapshot-meta dt {
  margin-bottom: 5px;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-meta dd {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.snapshot-meta--compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.snapshot-process-list {
  display: grid;
  gap: 10px;
}

.snapshot-process {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
}

.snapshot-process > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.snapshot-process span {
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-process__meta {
  align-items: flex-end;
  text-align: right;
}

.snapshot-process > .snapshot-raw {
  flex: 1 0 100%;
}

.snapshot-empty,
.snapshot-limitation {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.snapshot-limitation {
  border-color: var(--sw-warning);
  background: var(--sw-warning-bg);
  color: var(--sw-text-primary);
}

.snapshot-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.snapshot-table th,
.snapshot-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--sw-border-light);
  color: var(--sw-text-regular);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.snapshot-table th {
  background: var(--sw-fill-base);
  color: var(--sw-text-secondary);
  font-weight: 500;
}

.snapshot-table code,
.snapshot-node code,
.snapshot-rule code {
  color: var(--sw-color-primary);
  font-family: var(--el-font-family-mono, monospace);
}

.snapshot-table small {
  display: block;
  margin-top: 3px;
  color: var(--sw-text-secondary);
}

.snapshot-code-card,
.snapshot-rule,
.snapshot-node {
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  overflow: hidden;
}

.snapshot-code-card header,
.snapshot-rule header,
.snapshot-node header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--sw-fill-base);
}

.snapshot-code-card header span,
.snapshot-rule header span,
.snapshot-node header span {
  color: var(--sw-text-secondary);
  font-size: 11px;
}

.snapshot-code-card pre,
.snapshot-raw pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--sw-text-primary);
  font: 12px/1.65 var(--el-font-family-mono, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--sw-surface-page);
}

.snapshot-code-card details pre {
  border-top: 1px solid var(--sw-border-light);
}

.snapshot-rule ul {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 0;
  padding: 12px;
  list-style: none;
  color: var(--sw-text-regular);
  font-size: 12px;
}

.snapshot-node-list {
  display: grid;
  gap: 10px;
}

.snapshot-node > p {
  margin: 0;
  padding: 8px 12px;
  color: var(--sw-text-secondary);
  font-size: 11px;
}

.snapshot-raw {
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-page);
}

.snapshot-raw summary {
  padding: 9px 12px;
  color: var(--sw-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.snapshot-raw--inline {
  margin-top: 6px;
}

.snapshot-raw--inline summary,
.snapshot-raw--card summary {
  padding: 7px 9px;
}

.snapshot-raw--card {
  margin-bottom: 8px;
}

.snapshot-principal-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.snapshot-principal-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-regular);
  font-size: 12px;
}

/* G14 全屏外壳：接管 el-dialog fullscreen 正文（去 max-height/内距/页头，页签体内部滚动） */
:global(.published-snapshot-dialog.el-dialog) {
  max-width: none;
  padding: 0;
  overflow: hidden;
}

:global(.published-snapshot-dialog .el-dialog__header) {
  display: none;
}

:global(.published-snapshot-dialog .el-dialog__body) {
  max-height: none;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

:global(.published-snapshot-dialog .sw-detail-dialog__body) {
  min-height: 0;
  height: 100%;
}

@media (max-width: 900px) {
  .snapshot-viewer {
    height: auto;
    max-height: 76vh;
  }

  .snapshot-topbar,
  .snapshot-process {
    flex-direction: column;
    align-items: flex-start;
  }

  .snapshot-tabbody--design,
  .snapshot-tabbody--process {
    flex-direction: column;
  }

  .snapshot-tabbody__main,
  .snapshot-tabbody--full {
    max-height: 58vh;
  }

  .snapshot-meta,
  .snapshot-meta--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
