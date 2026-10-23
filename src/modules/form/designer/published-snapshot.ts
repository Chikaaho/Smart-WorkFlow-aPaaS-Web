import type {
  FieldPermissionRule,
  FormSchema,
  FormSchemaField,
  TableSubField,
  VisibilityRule,
} from '@/contracts/form-schema'
import type { BpmVariableDef, TriggerConfig } from '@/contracts/p64'

export interface SnapshotFieldView {
  key: string
  path: string
  table: 'main' | 'subtable'
  parentLabel?: string
  field: FormSchemaField | TableSubField
  name: string
  label: string
  type: string
  required: boolean
  width?: number
  description?: string
}

export interface SnapshotConstraintView {
  path: string
  label: string
  kind: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'patternMessage'
  value: string
}

export interface SnapshotVisibilityView {
  target: string
  targetLabel: string
  logic: VisibilityRule['logic']
  conditions: Array<{ field: string; label: string; op: string; value?: string }>
}

export interface SnapshotColumnView {
  name: string
  label?: string
  width?: number
}

export interface SnapshotListConfigView {
  raw: unknown
  columns: SnapshotColumnView[]
  filters: Array<{ name: string; op: string }>
  defaultSort?: { name: string; desc: boolean }
  actions: string[]
}

export interface SnapshotFieldPermissionView {
  field: string
  label: string
  rule: FieldPermissionRule
}

export interface SnapshotProcessSource {
  defId: string
  defName: string
  processKey: string
  graphVersion: number
  versionName: string
  status: string
  formVersion?: string | null
  publishedAt?: string | null
  publisherName?: string | null
  graph: unknown
}

export interface SnapshotNodeView {
  processName: string
  processKey: string
  graphVersion: number
  id: string
  type: string
  name: string
  config: Record<string, unknown>
  listeners: Array<Record<string, unknown>>
}

export interface SnapshotVariableView {
  processName: string
  processKey: string
  graphVersion: number
  variable: BpmVariableDef
}

export interface SnapshotTriggerView {
  processName: string
  processKey: string
  graphVersion: number
  trigger: TriggerConfig
}

export type SnapshotScriptKind =
  | 'field'
  | 'formEvent'
  | 'nodeTrigger'
  | 'nodeConfig'
  | 'approverExpression'

export interface SnapshotScriptView {
  key: string
  kind: SnapshotScriptKind
  source: string
  label: string
  event?: string
  nodeKey?: string
  enabled?: boolean
  code: string
}

export interface SnapshotAdvancedConfigView {
  processName: string
  processKey: string
  graphVersion: number
  config: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function fieldLabelLookup(schema: FormSchema): Map<string, string> {
  const labels = new Map<string, string>()
  for (const field of schema.fields) {
    labels.set(field.name, field.label?.trim() || field.name)
    if (field.type !== 'TABLE') continue
    for (const sub of field.subFields) {
      labels.set(`${field.name}.${sub.name}`, sub.label?.trim() || `${field.name}.${sub.name}`)
    }
  }
  return labels
}

export function flattenSnapshotFields(schema: FormSchema): SnapshotFieldView[] {
  const rows: SnapshotFieldView[] = []
  for (const field of schema.fields) {
    rows.push({
      key: field.name,
      path: field.name,
      table: 'main',
      field,
      name: field.name,
      label: field.label?.trim() || field.name,
      type: field.type,
      required: field.required === true,
      width: field.colSpan,
      description: field.description,
    })
    if (field.type !== 'TABLE') continue
    for (const sub of field.subFields) {
      rows.push({
        key: `${field.name}.${sub.name}`,
        path: `${field.name}.${sub.name}`,
        table: 'subtable',
        parentLabel: field.label?.trim() || field.name,
        field: sub,
        name: sub.name,
        label: sub.label?.trim() || sub.name,
        type: sub.type,
        required: sub.required === true,
        description: sub.description,
      })
    }
  }
  return rows
}

export function buildSnapshotConstraints(fields: SnapshotFieldView[]): SnapshotConstraintView[] {
  const rows: SnapshotConstraintView[] = []
  for (const row of fields) {
    const field = row.field
    if (field.required) rows.push({ ...row, kind: 'required', value: 'true' })
    if (typeof field.minLength === 'number') {
      rows.push({ ...row, kind: 'minLength', value: String(field.minLength) })
    }
    if (typeof field.length === 'number') {
      rows.push({ ...row, kind: 'maxLength', value: String(field.length) })
    }
    if (field.pattern?.trim()) rows.push({ ...row, kind: 'pattern', value: field.pattern })
    if (field.patternMessage?.trim()) {
      rows.push({ ...row, kind: 'patternMessage', value: field.patternMessage })
    }
  }
  return rows
}

export function buildSnapshotVisibility(schema: FormSchema): SnapshotVisibilityView[] {
  const labels = fieldLabelLookup(schema)
  return (schema.rules?.visibility ?? []).map((rule) => ({
    target: rule.target,
    targetLabel: labels.get(rule.target) ?? rule.target,
    logic: rule.logic,
    conditions: rule.conditions.map((condition) => ({
      field: condition.field,
      label: labels.get(condition.field) ?? condition.field,
      op: condition.op,
      value: condition.value,
    })),
  }))
}

export function buildSnapshotFieldPermissions(schema: FormSchema): SnapshotFieldPermissionView[] {
  const labels = fieldLabelLookup(schema)
  return Object.entries(schema.fieldPermissions ?? {}).map(([field, rule]) => ({
    field,
    label: labels.get(field) ?? field,
    rule,
  }))
}

export function extractSnapshotListConfig(
  rawDefinition: Record<string, unknown>,
): SnapshotListConfigView | null {
  const keys = ['listConfig', 'list_config', 'listConfigJson', 'list_config_json'] as const
  const candidateKey = keys.find((key) => rawDefinition[key] != null)
  if (!candidateKey) return null
  const rawCandidate = rawDefinition[candidateKey]
  const config = parseObject(rawCandidate)
  if (!config) return null

  const columns = asArray(config.columns).flatMap((entry): SnapshotColumnView[] => {
    if (typeof entry === 'string' && entry.trim()) return [{ name: entry.trim() }]
    if (!isRecord(entry) || typeof entry.name !== 'string' || !entry.name.trim()) return []
    return [
      {
        name: entry.name.trim(),
        label: typeof entry.label === 'string' ? entry.label : undefined,
        width: typeof entry.width === 'number' ? entry.width : undefined,
      },
    ]
  })
  const filters = asArray(config.filters).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string') return []
    return [{ name: entry.name, op: typeof entry.op === 'string' ? entry.op : '' }]
  })
  const sort = isRecord(config.defaultSort) ? config.defaultSort : null
  const defaultSort =
    sort && typeof sort.name === 'string'
      ? { name: sort.name, desc: sort.desc === true }
      : undefined
  const actions = asArray(config.actions).filter(
    (entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()),
  )
  return { raw: rawCandidate, columns, filters, defaultSort, actions }
}

export function buildSnapshotNodes(processes: SnapshotProcessSource[]): SnapshotNodeView[] {
  return processes.flatMap((process) => {
    const graph = parseObject(process.graph)
    const elements = asArray(graph?.elements)
    return elements.flatMap((entry): SnapshotNodeView[] => {
      if (!isRecord(entry) || entry.kind !== 'node' || typeof entry.id !== 'string') return []
      const config = isRecord(entry.config) ? entry.config : {}
      const listeners = asArray(config.listeners).filter(isRecord)
      return [
        {
          processName: process.defName,
          processKey: process.processKey,
          graphVersion: process.graphVersion,
          id: entry.id,
          type: text(entry.type, 'NODE'),
          name: text(config.name, text(config.nodeKey, entry.id)),
          config,
          listeners,
        },
      ]
    })
  })
}

export function buildSnapshotVariables(processes: SnapshotProcessSource[]): SnapshotVariableView[] {
  return processes.flatMap((process) => {
    const graph = parseObject(process.graph)
    return asArray(graph?.variables).flatMap((entry): SnapshotVariableView[] => {
      if (!isRecord(entry) || typeof entry.varId !== 'string') return []
      return [
        {
          processName: process.defName,
          processKey: process.processKey,
          graphVersion: process.graphVersion,
          variable: entry as unknown as BpmVariableDef,
        },
      ]
    })
  })
}

export function buildSnapshotTriggers(processes: SnapshotProcessSource[]): SnapshotTriggerView[] {
  return processes.flatMap((process) => {
    const graph = parseObject(process.graph)
    return asArray(graph?.triggers).flatMap((entry): SnapshotTriggerView[] => {
      if (!isRecord(entry) || typeof entry.triggerId !== 'string') return []
      return [
        {
          processName: process.defName,
          processKey: process.processKey,
          graphVersion: process.graphVersion,
          trigger: entry as unknown as TriggerConfig,
        },
      ]
    })
  })
}

export function buildSnapshotAdvancedConfigs(
  processes: SnapshotProcessSource[],
): SnapshotAdvancedConfigView[] {
  return processes.flatMap((process): SnapshotAdvancedConfigView[] => {
    const graph = parseObject(process.graph)
    const config = isRecord(graph?.advancedConfig) ? graph.advancedConfig : null
    if (!config) return []
    return [
      {
        processName: process.defName,
        processKey: process.processKey,
        graphVersion: process.graphVersion,
        config,
      },
    ]
  })
}

function nodeInlineScripts(
  process: SnapshotProcessSource,
  node: SnapshotNodeView,
): SnapshotScriptView[] {
  const rows: SnapshotScriptView[] = []
  for (const [key, value] of Object.entries(node.config)) {
    if (typeof value !== 'string' || !value.trim()) continue
    if (!/(script|expression)$/i.test(key)) continue
    rows.push({
      key: `${process.defId}:${process.graphVersion}:${node.id}:${key}`,
      kind: /participant|approver/i.test(key) ? 'approverExpression' : 'nodeConfig',
      source: `${process.defName} · v${process.graphVersion}`,
      label: `${node.name} · ${key}`,
      nodeKey: node.id,
      code: value,
    })
  }

  const participant = parseObject(node.config.participant ?? node.config.approver)
  const strategy = text(participant?.strategy ?? participant?.type)
  if (strategy === 'EXPRESSION') {
    const expression = participant?.value ?? participant?.expression ?? participant?.script
    const code = typeof expression === 'string' ? expression : JSON.stringify(expression ?? '')
    if (code.trim()) {
      rows.push({
        key: `${process.defId}:${process.graphVersion}:${node.id}:approver-expression`,
        kind: 'approverExpression',
        source: `${process.defName} · v${process.graphVersion}`,
        label: node.name,
        nodeKey: node.id,
        code,
      })
    }
  }
  node.listeners.forEach((listener, listenerIndex) => {
    for (const [key, value] of Object.entries(listener)) {
      if (typeof value !== 'string' || !value.trim()) continue
      if (!/(script|expression)$/i.test(key)) continue
      rows.push({
        key: `${process.defId}:${process.graphVersion}:${node.id}:listener:${listenerIndex}:${key}`,
        kind: 'nodeConfig',
        source: `${process.defName} · v${process.graphVersion}`,
        label: `${node.name} · ${text(listener.label, `listener ${listenerIndex + 1}`)} · ${key}`,
        nodeKey: node.id,
        code: value,
      })
    }
  })
  return rows
}

export function buildSnapshotScripts(
  schema: FormSchema,
  processes: SnapshotProcessSource[],
): SnapshotScriptView[] {
  const rows: SnapshotScriptView[] = []
  for (const field of schema.fields) {
    const code = field.script?.code?.trim()
    if (!code) continue
    rows.push({
      key: `field:${field.name}`,
      kind: 'field',
      source: 'FORM_FIELD',
      label: field.label?.trim() || field.name,
      code,
    })
  }

  for (const [event, actions] of Object.entries(schema.events ?? {})) {
    for (const action of actions ?? []) {
      if (!action.script?.trim()) continue
      rows.push({
        key: `form-event:${event}:${action.id}`,
        kind: 'formEvent',
        source: 'FORM_EVENT',
        label: action.name || action.id,
        event,
        enabled: action.enabled,
        code: action.script,
      })
    }
  }

  for (const process of processes) {
    for (const node of buildSnapshotNodes([process])) {
      rows.push(...nodeInlineScripts(process, node))
    }
  }

  for (const item of buildSnapshotTriggers(processes)) {
    if (!item.trigger.script?.trim()) continue
    rows.push({
      key: `trigger:${item.processKey}:${item.graphVersion}:${item.trigger.triggerId}`,
      kind: 'nodeTrigger',
      source: `${item.processName} · v${item.graphVersion}`,
      label: item.trigger.name || item.trigger.triggerId,
      event: item.trigger.event,
      nodeKey: item.trigger.nodeKey,
      enabled: item.trigger.enabled !== false,
      code: item.trigger.script,
    })
  }
  return dedupeScripts(rows)
}

export function buildSnapshotApprovalScripts(
  processes: SnapshotProcessSource[],
): SnapshotScriptView[] {
  return buildSnapshotScripts({ title: '', fields: [] }, processes).filter(
    (row) =>
      row.kind === 'approverExpression' ||
      (row.kind === 'nodeTrigger' &&
        (row.event === 'NODE_ENTERING' || row.event === 'NODE_ROUND_COMPLETED')),
  )
}

export function matchesSnapshotFormVersion(
  snapshotFormVersion: number,
  snapshotVersionLabel: string | null | undefined,
  processFormVersion: string | null | undefined,
): boolean {
  if (!processFormVersion?.trim()) return false
  const candidate = normalizeVersion(processFormVersion)
  return [String(snapshotFormVersion), snapshotVersionLabel ?? '']
    .filter(Boolean)
    .some((version) => normalizeVersion(version) === candidate)
}

function normalizeVersion(value: string): string {
  return value.trim().toLowerCase().replace(/^v/, '')
}

function dedupeScripts(rows: SnapshotScriptView[]): SnapshotScriptView[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.kind}|${row.source}|${row.label}|${row.event ?? ''}|${row.code}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
