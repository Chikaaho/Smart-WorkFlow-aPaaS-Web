import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { FormSchema, VisibilityRule } from '@/contracts/form-schema'
import { useI18n } from '@/locales'
import type { SnapshotConstraintView, SnapshotScriptView } from './published-snapshot'
import { asRecord, prettyJson, snapshotComponentLabel } from './use-snapshot-labels'
import type { SnapshotScriptDetailApi } from './use-snapshot-script-detail'

export type FrozenFieldPropRow = {
  label: string
  value: string
  detail?: 'validation' | 'script' | 'visibility' | 'subfields'
}

export interface SnapshotFieldPropsDeps {
  schema: Ref<FormSchema | null>
  selectedField: ComputedRef<FormSchema['fields'][number] | null>
  constraints: ComputedRef<SnapshotConstraintView[]>
  scripts: ComputedRef<SnapshotScriptView[]>
  scriptDetail: SnapshotScriptDetailApi
}

/**
 * 冻结字段的只读属性投影：设计页签右栏属性行、字段查看弹窗与 TABLE 明细列弹窗。
 * 全部取冻结 schema 的真实值，缺值明确「未配置」。
 */
export function useSnapshotFieldProps(deps: SnapshotFieldPropsDeps) {
  const { t } = useI18n()
  const { schema, selectedField, constraints, scripts, scriptDetail } = deps

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

  function labelPositionText(field: FormSchema['fields'][number]): string {
    const raw = (field as { labelPosition?: string }).labelPosition
    if (raw === 'left') return t('form.labelPositionLeft')
    if (raw === 'right') return t('form.labelPositionRight')
    return t('form.labelPositionTopLeft')
  }

  /** Q30（501:19847/20595/20958/22382）：默认值按冻结值原样展示，空值明确「未配置」。 */
  function frozenDefaultValueText(value: unknown): string {
    if (value === null || value === undefined) return t('form.snapshotViewer.propNotConfigured')
    if (typeof value === 'string') {
      return value.trim() ? value : t('form.snapshotViewer.propNotConfigured')
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
      const items = value
        .map((item) =>
          item !== null && typeof item === 'object' ? prettyJson(item) : String(item),
        )
        .filter((item) => item.trim())
      return items.length ? items.join('、') : t('form.snapshotViewer.propNotConfigured')
    }
    const json = prettyJson(value)
    return json && json !== '{}' ? json : t('form.snapshotViewer.propNotConfigured')
  }

  /**
   * Q30 类型专属只读项：只按实际冻结 schema 投影，不为未配置项填入演示值。
   * DICT → 选项来源/选项/选择方式/默认值；DATE → 日期格式/默认值；
   * DEPT → 选择范围（部门 + 单多选）/默认值；ATTACHMENT → 文件类型/文件大小/数量上限。
   */
  function buildFrozenTypePropRows(field: FormSchema['fields'][number]): FrozenFieldPropRow[] {
    const notConfigured = t('form.snapshotViewer.propNotConfigured')
    const single = t('form.snapshotViewer.modeSingle')
    const multi = t('form.snapshotViewer.modeMulti')
    const rows: FrozenFieldPropRow[] = []
    if (field.type === 'DICT') {
      const source = field.source ?? 'dict'
      const dictType = field.dictType?.trim()
      rows.push({
        label: t('form.snapshotViewer.propOptionSource'),
        value:
          source === 'custom'
            ? t('form.optionSourceCustom')
            : `${t('form.snapshotViewer.dictSource')}${dictType ? ` · ${dictType}` : ''}`,
      })
      if (source === 'custom') {
        const options = (field.options ?? [])
          .map((option) => option.value?.trim() || option.key?.trim() || '')
          .filter(Boolean)
        rows.push({
          label: t('form.snapshotViewer.propOptions'),
          value: options.length ? options.join(' / ') : notConfigured,
        })
      } else {
        rows.push({
          label: t('form.snapshotViewer.propOptions'),
          value: dictType || notConfigured,
        })
      }
      rows.push({
        label: t('form.snapshotViewer.propSelectMode'),
        value: field.multiple ? multi : single,
      })
      rows.push({
        label: t('form.snapshotViewer.propDefault'),
        value: frozenDefaultValueText(field.defaultValue),
      })
    } else if (field.type === 'DATE') {
      const format = field.format?.trim()
      rows.push({
        label: t('form.snapshotViewer.propDateFormat'),
        value:
          format === 'datetime'
            ? t('form.snapshotViewer.dateFormatDatetime')
            : format || t('form.snapshotViewer.dateFormatDate'),
      })
      rows.push({
        label: t('form.snapshotViewer.propDefault'),
        value: frozenDefaultValueText(field.defaultValue),
      })
    } else if (field.type === 'DEPT') {
      rows.push({
        label: t('form.snapshotViewer.propSelectRange'),
        value: `${t('form.snapshotViewer.deptRange')}，${field.multiple ? multi : single}`,
      })
      rows.push({
        label: t('form.snapshotViewer.propDefault'),
        value: frozenDefaultValueText(field.defaultValue),
      })
    } else if (field.type === 'ATTACHMENT') {
      // 冻结 ATTACHMENT 契约没有文件类型/大小/数量键；真实值缺省即明确未配置，不填演示值。
      rows.push({
        label: t('form.snapshotViewer.propFileType'),
        value: notConfigured,
      })
      rows.push({
        label: t('form.snapshotViewer.propFileSize'),
        value: notConfigured,
      })
      rows.push({
        label: t('form.snapshotViewer.propFileCount'),
        value: notConfigured,
      })
    }
    return rows
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
    /* Q24（509:18903）：冻结 TABLE 的既有只读属性直接给出「明细列」查看入口；
       读取同一冻结 schema 的 subFields，不另造列。 */
    const tableRows: FrozenFieldPropRow[] =
      field.type === 'TABLE'
        ? [
            {
              label: t('form.snapshotViewer.propDetailColumns'),
              value: field.subFields.length
                ? `${field.subFields.length} ${t('form.snapshotViewer.propColumnUnit')}`
                : t('form.snapshotViewer.propNotConfigured'),
              detail: 'subfields',
            },
          ]
        : []
    /* 类型专属项排在字段标识/类型/最大长度之后、校验规则之前，与冻结属性原顺序一致。 */
    return [
      ...basic,
      ...ruleRows.slice(0, 3),
      ...buildFrozenTypePropRows(field),
      ...tableRows,
      ...ruleRows.slice(3),
    ]
  }

  const frozenFieldPropRows = computed<FrozenFieldPropRow[]>(() =>
    selectedField.value ? buildFrozenFieldPropRows(selectedField.value) : [],
  )

  /* Q24（509:18903）：冻结 TABLE 明细列——1100 宽只读窗，列/类型/宽度/必填全部取同一冻结 schema。 */
  const detailColumnsVisible = ref(false)
  const detailColumnsField = ref<FormSchema['fields'][number] | null>(null)
  const detailColumnRows = computed(() => {
    const field = detailColumnsField.value
    if (!field || field.type !== 'TABLE') return []
    return field.subFields.map((sub) => {
      const raw = sub as typeof sub & { colSpan?: number; width?: number }
      let width = t('form.snapshotViewer.propNotConfigured')
      if (typeof raw.colSpan === 'number' && raw.colSpan > 0) {
        width = `${Math.round((raw.colSpan / 24) * 100)}%`
      } else if (typeof raw.width === 'number' && raw.width > 0) {
        width = `${raw.width}px`
      }
      return {
        key: sub.name,
        label: sub.label?.trim() || sub.name,
        component: snapshotComponentLabel(sub),
        name: sub.name,
        width,
        required: sub.required === true,
      }
    })
  })

  function openDetailColumns(field: FormSchema['fields'][number]): void {
    if (field.type !== 'TABLE') return
    detailColumnsField.value = field
    detailColumnsVisible.value = true
  }

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
      if (first) scriptDetail.openValidationDetail(first)
    } else if (row.detail === 'script') {
      const view = scripts.value.find((s) => s.key === field.name || s.nodeKey === field.name)
      if (view) scriptDetail.openScriptDetail(view)
    } else if (row.detail === 'visibility') {
      const rule = fieldVisibilityOf(field.name)
      if (rule) {
        scriptDetail.scriptDetailMode.value = 'summary'
        scriptDetail.scriptDetailTitle.value =
          t('form.snapshotViewer.visibility') + ' · ' + (field.label || field.name)
        scriptDetail.scriptDetailCode.value = JSON.stringify(rule, null, 2)
        scriptDetail.scriptDetailMeta.value = rule.target
        scriptDetail.scriptDetailVisible.value = true
      }
    } else if (row.detail === 'subfields') {
      openDetailColumns(field)
    }
  }

  return {
    fieldConstraintsOf,
    fieldScriptOf,
    fieldVisibilityOf,
    frozenFieldPropRows,
    detailColumnsVisible,
    detailColumnsField,
    detailColumnRows,
    openDetailColumns,
    propsDialogVisible,
    propsDialogField,
    propsDialogRows,
    openFieldProps,
    openFrozenDetail,
  }
}
