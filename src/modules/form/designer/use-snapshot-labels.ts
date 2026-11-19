import { useI18n } from '@/locales'
import { getFieldTypeDescriptor, getFieldTypeStorage } from './field-types'
import type { FieldType } from '@/contracts/form-schema'
import type { SnapshotScriptKind, SnapshotScriptView } from './published-snapshot'

/* ── 快照查看器共用文本工具与标签函数 ──
 * 纯函数（不依赖 i18n 实例）直接导出；依赖 t 的标签函数经 useSnapshotLabels 提供，
 * 主文件与各 PublishedSnapshot* 子组件共用同一份语义。 */

/** 审查27 S14-F：主表列=名称/组件/字段标识/数据类型/宽度/必填/查看；序号/长度在查看详情 */
export function snapshotComponentLabel(field: { type: FieldType }): string {
  return getFieldTypeDescriptor(field.type)?.label ?? field.type
}

export function snapshotStorageLabel(type: string): string {
  return getFieldTypeStorage(type)
}

export function snapshotWidthText(colSpan: number | undefined): string {
  return colSpan ? `${Math.round((colSpan / 24) * 100)}%` : '—'
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/* 内置动作摘要（如 `设置流程变量('k','v')`）为单行函数调用、无 JS 语句结构 → 保持摘要弹窗；
   含 return/块语句/箭头函数或多行的函数体按 JS 代码窗展示。 */
export function isJsBody(code: string): boolean {
  const trimmed = code.trim()
  if (!trimmed || trimmed === '—') return false
  if (/[\r\n]/.test(trimmed)) return true
  return /\breturn\b|=>|[;{}]/.test(trimmed)
}

export function parseRawDefinition(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('snapshot definition must be an object')
  }
  return parsed as Record<string, unknown>
}

export function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'msg' in error) {
    const message = (error as { msg?: unknown }).msg
    if (typeof message === 'string' && message.trim()) return message
  }
  return error instanceof Error ? error.message : String(error)
}

export function useSnapshotLabels() {
  const { t } = useI18n()

  function sectionLabel(label: string): string {
    return t(`form.snapshotViewer.${label}`)
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

  function actionLabel(action: string): string {
    const labels: Record<string, string> = {
      APPROVE: t('common.approve'),
      DISAPPROVE: t('workflow.disapprove'),
      REJECT: t('common.reject'),
      RETURN: t('common.returnBack'),
      TRANSFER: t('workflow.transferOwnTask'),
      DELEGATE: t('workflow.delegateAction'),
      COMMUNICATE: t('workflow.consultTask'),
      ADD_SIGN: t('workflow.addSign'),
    }
    return labels[action] ?? action
  }

  return {
    t,
    sectionLabel,
    principalText,
    validationLabel,
    scriptKindLabel,
    scriptSourceLabel,
    eventLabel,
    actionLabel,
  }
}
