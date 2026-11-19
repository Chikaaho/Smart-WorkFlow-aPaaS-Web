import { computed, ref, watch } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import type { ApproverCandidate, FormSchemaField } from '@/modules/workflow/api'
import type { PositionedNode, DesignerModel } from '@/adapters/process-graph'
import {
  buildDynamicParallelConfig,
  buildDynamicParallelFormDraft,
} from '@/modules/workflow/utils/node-capabilities'
import type { DynamicParallelFormDraft } from '@/modules/workflow/utils/node-capabilities'

/** useDesignerDynamicParallel 入参。 */
export interface DesignerDynamicParallelOptions {
  /** 当前选中节点。 */
  selectedNode: ComputedRef<PositionedNode | null>
  /** 画布模型（非响应式实例）。 */
  model: ShallowRef<DesignerModel | null>
  /** 版本预览态（预览只读）。 */
  isVersionPreview: ComputedRef<boolean>
  /** 主表字段候选（按对象类型过滤）。 */
  mainFieldOptionsFor: (objectType: string) => FormSchemaField[]
  /** 表格字段候选。 */
  tableFieldOptions: ComputedRef<FormSchemaField[]>
  /** 选中表格的列候选。 */
  tableColumnOptionsFor: (tableField: string, objectType: string) => FormSchemaField[]
}

/**
 * P63 动态并行专属面板 + 820 设置面（Q11，273:1332）：面板只回显真实配置摘要；
 * 编辑在弹窗内写本地草稿，取消丢弃、确定写回面板并落节点配置
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
export function useDesignerDynamicParallel(options: DesignerDynamicParallelOptions) {
  const {
    selectedNode,
    model,
    isVersionPreview,
    mainFieldOptionsFor,
    tableFieldOptions,
    tableColumnOptionsFor,
  } = options

  const dynamicParallelActive = computed(() => selectedNode.value?.type === 'DYNAMIC_PARALLEL')
  const dynamicParallelForm = ref<DynamicParallelFormDraft>(buildDynamicParallelFormDraft(null))

  /** 动态并行面板提交：勾选新语义写 semanticVersion:2，旧语义不写该键（透传语义不受影响）。 */
  function applyDynamicParallel() {
    if (!selectedNode.value || !model.value || isVersionPreview.value) return
    model.value.updateNodeConfig(selectedNode.value.id, {
      ...buildDynamicParallelConfig(dynamicParallelForm.value),
    })
  }

  /* ── Q11（273:1332）：动态并行 820 设置面状态（先声明，供候选弹窗回写草稿）。 ── */
  const dpSettingsVisible = ref(false)
  const dpDraft = ref<DynamicParallelFormDraft>(buildDynamicParallelFormDraft(null))

  /* 动态并行「固定值」直接选择：复用审批人候选弹窗（人员多选/部门树），保存稳定对象 ID。 */
  const dynamicUserPickerVisible = ref(false)
  const dynamicDeptPickerVisible = ref(false)
  const dynamicFixedSelectedIdList = computed(() =>
    dynamicParallelForm.value.sourceValue
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  )
  const dynamicFixedSelectedIds = computed(() =>
    dynamicFixedSelectedIdList.value.map(Number).filter((id) => Number.isFinite(id)),
  )
  function openDynamicUserPicker() {
    dynamicUserPickerVisible.value = true
  }
  function openDynamicDeptPicker() {
    dynamicDeptPickerVisible.value = true
  }
  function onDynamicUsersPicked(candidates: ApproverCandidate[]) {
    const joined = candidates.map((candidate) => String(candidate.id)).join(',')
    // Q11（273:1332）：820 设置面打开时，候选结果写本地草稿，不落节点配置
    if (dpSettingsVisible.value) {
      dpDraft.value.sourceValue = joined
      return
    }
    dynamicParallelForm.value.sourceValue = joined
    applyDynamicParallel()
  }
  function onDynamicDeptsPicked(depts: Array<{ id: string; name: string }>) {
    const joined = depts.map((dept) => dept.id).join(',')
    if (dpSettingsVisible.value) {
      dpDraft.value.sourceValue = joined
      return
    }
    dynamicParallelForm.value.sourceValue = joined
    applyDynamicParallel()
  }
  /** 对象类型切换：人员/部门 ID 命名空间不同，清空旧取值避免把人员 ID 当部门 ID 保存。 */
  function onDynamicObjectTypeChange() {
    dynamicParallelForm.value.sourceValue = ''
    applyDynamicParallel()
  }

  /* ── Q11（273:1332）：动态并行 820 设置面。复用 Q12 node-op-dialog 图样：
       面板只回显真实配置摘要；编辑在弹窗内写本地草稿，取消丢弃、确定写回面板并落节点配置。 ── */
  /** 面板回显摘要：真实分支来源 / 完成模式 / 取值范围。 */
  const dynamicParallelSummary = computed(() => {
    const form = dynamicParallelForm.value
    const sourceTypeLabels: Record<string, string> = {
      FORM_FIELD: '表单字段',
      VARIABLE: '流程变量',
      FIXED: '固定值',
    }
    const modeLabels: Record<string, string> = {
      ALL: '全部通过',
      ANY: '任一通过',
      RATIO: '按比例通过',
      VETO: '一票否决',
    }
    const scopeLabel = form.scope === 'TABLE' ? '表格字段' : '主表字段'
    return `${sourceTypeLabels[form.sourceType] ?? form.sourceType} · ${
      modeLabels[form.mode] ?? form.mode
    } · ${scopeLabel}`
  })

  function openDpSettings(): void {
    if (!dynamicParallelActive.value || isVersionPreview.value) return
    dpDraft.value = { ...dynamicParallelForm.value }
    dpSettingsVisible.value = true
  }

  function confirmDpSettings(): void {
    dynamicParallelForm.value = { ...dpDraft.value }
    dpSettingsVisible.value = false
    applyDynamicParallel()
  }

  /* 草稿内的联动（与面板同语义，但只改草稿）：换表格字段清列、选列回填来源、切对象类型清取值。 */
  function onDpDraftTableFieldChange(): void {
    dpDraft.value.column = ''
  }
  function onDpDraftColumnChange(): void {
    dpDraft.value.sourceValue = dpDraft.value.column
  }
  function onDpDraftObjectTypeChange(): void {
    dpDraft.value.sourceValue = ''
  }

  /** 选中节点 → 面板草稿回显（原统一 watch 的动态并行切片）。 */
  watch(selectedNode, (node) => {
    if (!node) return
    dynamicParallelForm.value = buildDynamicParallelFormDraft(node.config)
  })

  return {
    dynamicParallelActive,
    dynamicParallelForm,
    applyDynamicParallel,
    dpSettingsVisible,
    dpDraft,
    dynamicUserPickerVisible,
    dynamicDeptPickerVisible,
    dynamicFixedSelectedIdList,
    dynamicFixedSelectedIds,
    openDynamicUserPicker,
    openDynamicDeptPicker,
    onDynamicUsersPicked,
    onDynamicDeptsPicked,
    onDynamicObjectTypeChange,
    dynamicParallelSummary,
    openDpSettings,
    confirmDpSettings,
    onDpDraftTableFieldChange,
    onDpDraftColumnChange,
    onDpDraftObjectTypeChange,
    mainFieldOptionsFor,
    tableFieldOptions,
    tableColumnOptionsFor,
  }
}
