import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { publishedFormDefinition } from '@/modules/workflow/api'
import type { PositionedNode, DesignerModel } from '@/adapters/process-graph'
import type { DesignerGraph } from './designer-graph'

/** useDesignerFormFields 入参。 */
export interface DesignerFormFieldsOptions {
  /** 设计器图文档（响应式）。 */
  graph: Ref<DesignerGraph | null>
  /** 画布模型（非响应式实例）。 */
  model: ShallowRef<DesignerModel | null>
  /** 快照 serial（model 非响应式：依赖快照 serial 驱动重算）。 */
  version: Ref<number>
  /** 画布变更后的快照回调。 */
  snapshot: () => void
  /** 模型变更（文档级配置变更）回调。 */
  onModelChanged: () => void
  /** 当前选中节点。 */
  selectedNode: ComputedRef<PositionedNode | null>
  /** 表单工作台上下文 formId（草稿定义 by-id 直取）。 */
  returnFormId: ComputedRef<string>
}

/**
 * P64 阶段Ⅰ：节点业务表单绑定 + 主表单字段 + 表单字段缓存 + 图节点清单
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
export function useDesignerFormFields(options: DesignerFormFieldsOptions) {
  const { graph, model, version, snapshot, onModelChanged, selectedNode, returnFormId } = options
  /** 可绑定节点业务表单的人工节点类型（与后端 NODE_FORM_CAPABLE_TYPES 一致）。 */
  const NODE_FORM_CAPABLE_TYPES = ['APPROVAL', 'CONSENSUS', 'DYNAMIC_PARALLEL']
  const nodeFormCapable = computed(
    () =>
      selectedNode.value != null && NODE_FORM_CAPABLE_TYPES.includes(selectedNode.value.type ?? ''),
  )
  const nodeFormSelectVisible = ref(false)

  /** 选中节点已绑定的节点业务表单 formKey（回显）。 */
  const selectedNodeFormKey = computed(() => {
    const config = selectedNode.value?.config as Record<string, unknown> | undefined
    const nodeForm = config?.nodeForm as { formKey?: string } | undefined
    return nodeForm?.formKey ?? ''
  })

  /** formKey → 业务表单名称：界面只展示名称，不向业务人员暴露内部标识。 */
  const nodeFormNames = ref<Record<string, string>>({})

  async function resolveNodeFormName(formKey?: string) {
    if (!formKey || nodeFormNames.value[formKey]) return
    try {
      const schema = await publishedFormDefinition(formKey)
      nodeFormNames.value = {
        ...nodeFormNames.value,
        [formKey]: schema.title?.trim() || '已绑定表单',
      }
    } catch {
      nodeFormNames.value = { ...nodeFormNames.value, [formKey]: '已绑定表单' }
    }
  }

  const selectedNodeFormName = computed(() =>
    selectedNodeFormKey.value
      ? (nodeFormNames.value[selectedNodeFormKey.value] ?? '已绑定表单')
      : '未绑定',
  )

  function applyNodeForm(formKey: string) {
    if (!selectedNode.value) return
    model.value?.updateNodeConfig(selectedNode.value.id, {
      nodeForm: formKey ? { formKey } : {},
    })
    snapshot()
    onModelChanged()
  }

  function onNodeFormSelected(formKey: string, formName: string) {
    nodeFormSelectVisible.value = false
    if (formName.trim()) {
      nodeFormNames.value = { ...nodeFormNames.value, [formKey]: formName.trim() }
    } else {
      void resolveNodeFormName(formKey)
    }
    applyNodeForm(formKey)
  }

  function clearNodeForm() {
    applyNodeForm('')
  }

  /** 主表单字段（变量来源选择器；经动态 import 读表单定义，模块边界惯例）。 */
  const mainFormFields = ref<
    Array<{ name: string; type: string; label?: string; multiple?: boolean; required?: boolean }>
  >([])
  watch(
    () => graph.value?.formKey,
    async (formKey) => {
      mainFormFields.value = []
      if (!formKey) return
      try {
        const { getFormDefinition } = await import('@/adapters/form-runtime')
        // BF20261013-013：草稿表单 by-key 端点不可用（仅发布后可用），
        // 从表单工作台进入时按 formId 直取草稿定义（by-id），否则回退 by-key。
        const workbenchFormId = graph.value?.formDefId || returnFormId.value
        let schema
        if (workbenchFormId) {
          const { getFormDefinitionById } = await import('@/adapters/form-catalog')
          schema = await getFormDefinitionById(workbenchFormId)
        } else {
          schema = await getFormDefinition(formKey)
        }
        mainFormFields.value = (schema.fields ?? []) as Array<{
          name: string
          type: string
          label?: string
          multiple?: boolean
          required?: boolean
        }>
      } catch {
        mainFormFields.value = []
      }
    },
    { immediate: true },
  )

  /** 节点业务表单绑定清单（nodeKey → formKey）：NODE_FORM 来源候选。 */
  const nodeFormBindings = computed<Array<{ nodeKey: string; formKey: string; nodeName: string }>>(
    () => {
      void version.value // model 非响应式：依赖快照 serial 驱动重算
      const result: Array<{ nodeKey: string; formKey: string; nodeName: string }> = []
      for (const node of model.value?.serialize().elements ?? []) {
        if (node.kind !== 'node') continue
        const config = node.config as Record<string, unknown> | undefined
        const nodeForm = config?.nodeForm as { formKey?: string } | undefined
        if (nodeForm?.formKey) {
          // 变量来源节点按业务名展示（节点名优先，未命名回退节点 ID）
          const nodeName =
            typeof config?.name === 'string' && config.name.trim() ? config.name.trim() : node.id
          result.push({ nodeKey: node.id, formKey: nodeForm.formKey, nodeName })
        }
      }
      return result
    },
  )

  /** 表单字段缓存（节点表单/主表/动作目标表单的字段选择器共用；按 formKey 惰性加载）。 */
  const formFieldCache = ref<Record<string, Array<{ name: string; type: string; label?: string }>>>(
    {},
  )
  const loadingFormKeys = new Set<string>()

  async function ensureFormFields(formKey?: string) {
    if (!formKey || formFieldCache.value[formKey] || loadingFormKeys.has(formKey)) return
    loadingFormKeys.add(formKey)
    try {
      const { getFormDefinition } = await import('@/adapters/form-runtime')
      const schema = await getFormDefinition(formKey)
      formFieldCache.value = {
        ...formFieldCache.value,
        [formKey]: (schema.fields ?? []) as Array<{ name: string; type: string; label?: string }>,
      }
    } catch {
      // 失败不写缓存：瞬时失败（网络/会话刷新/HMR）下次仍可重试，避免空白选项被固化
    } finally {
      loadingFormKeys.delete(formKey)
    }
  }

  watch(
    nodeFormBindings,
    (bindings) => {
      for (const binding of bindings) void ensureFormFields(binding.formKey)
    },
    { immediate: true },
  )

  function formFieldOptions(formKey?: string) {
    return (formKey ? formFieldCache.value[formKey] : undefined) ?? []
  }

  function formFieldLabel(field: { name: string; label?: string }) {
    return field.label || '未命名字段'
  }

  const graphNodes = computed(() => {
    void version.value // model 非响应式：依赖快照 serial 驱动重算
    return (model.value?.serialize().elements ?? [])
      .filter((element) => element.kind === 'node')
      .map((element) => {
        const config = element.config as Record<string, unknown> | undefined
        // 触发器源节点按业务名展示（节点名优先，未命名回退节点 ID）
        const name =
          typeof config?.name === 'string' && config.name.trim() ? config.name.trim() : ''
        return { id: element.id, type: element.type ?? '', name }
      })
  })

  /** 触发器源节点选项文案：业务名(nodeId)，未命名仅 nodeId。 */
  function graphNodeLabel(node: { id: string; name: string }) {
    return node.name && node.name !== node.id ? node.name : '未命名节点'
  }

  /** 触发器表源节点列：节点业务名（未命名回退 nodeId）。 */
  function graphNodeName(nodeKey?: string) {
    if (!nodeKey) return ''
    const hit = graphNodes.value.find((item) => item.id === nodeKey)
    return hit ? graphNodeLabel(hit) : nodeKey
  }

  return {
    nodeFormCapable,
    nodeFormSelectVisible,
    selectedNodeFormKey,
    selectedNodeFormName,
    nodeFormNames,
    resolveNodeFormName,
    applyNodeForm,
    onNodeFormSelected,
    clearNodeForm,
    mainFormFields,
    nodeFormBindings,
    ensureFormFields,
    formFieldOptions,
    formFieldLabel,
    graphNodes,
    graphNodeLabel,
    graphNodeName,
  }
}
