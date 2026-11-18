<script setup lang="ts">
/* global HTMLElement, window,
  KeyboardEvent,
  DragEvent */
/**
 * ProcessDesigner — 第一方流程设计器页（I3 §4.1：节点拖入/移动/连线/选择/删除/
 * 属性配置/缩放平移适配/撤销/保存/校验/发布/错误定位）。
 *
 * 节点面板与配置字段全部来自统一节点能力端点的服务端契约；
 * 前端不维护平行节点目录，也不解释引擎私有格式。
 * 图契约 = ProcessGraph（contractVersion=2 显式坐标），保存/校验/发布/查看同权威。
 *
 * 0.2.x 拆分：画布/工具栏/属性面板/各配置弹窗为 Designer* 子组件，
 * 逻辑按域落在 use-designer-* composables；本文件保留装配、加载与页面骨架。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/locales'
import {
  getProcessDefDefinition,
  getDefVersionGraph,
  getProcessNodeCapabilities,
} from '@/modules/workflow/api'
import type { GraphValidationError, ProcessNotificationConfigPayload } from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import type { BpmNodeCapability } from '@/contracts/bpm-node'
import type { BpmVariableDef, TriggerConfig } from '@/contracts/p64'
import type { DesignerModel, PositionedNode } from '@/adapters/process-graph'
import { createDesignerModel } from '@/adapters/process-graph'
// 节点图标字形与面板分组投影：与表单工作台空状态节点库共用同一份展示层定义（Q56 抽取共享）
import { groupPaletteCapabilities, nodeIconPaths } from '@/modules/workflow/utils/designer-palette'
import ProcessGraphView from '@/components/ProcessGraphView.vue'
import ScriptDialog from '@/components/ScriptDialog.vue'
import { PROCESS_SCRIPT_FUNCTIONS } from '@/components/script-catalog'
import FormSelectDialog from './FormSelectDialog.vue'
import ThemeRuleDialog from './ThemeRuleDialog.vue'
import DesignerProcessToolbar from '../components/DesignerProcessToolbar.vue'
import DesignerCanvas from '../components/DesignerCanvas.vue'
import DesignerNodePropsPanel from '../components/DesignerNodePropsPanel.vue'
import DesignerAdvancedConfigDialog from '../components/DesignerAdvancedConfigDialog.vue'
import DesignerSubflowWizard from '../components/DesignerSubflowWizard.vue'
import DesignerNodeOpSettingsDialog from '../components/DesignerNodeOpSettingsDialog.vue'
import DesignerDynamicParallelSettingsDialog from '../components/DesignerDynamicParallelSettingsDialog.vue'
import DesignerVariablesDialog from '../components/DesignerVariablesDialog.vue'
import DesignerTriggersDialog from '../components/DesignerTriggersDialog.vue'
import DesignerParticipantPickers from '../components/DesignerParticipantPickers.vue'
import DesignerLeaveConfirmDialog from '../components/DesignerLeaveConfirmDialog.vue'
import type { DesignerGraph, GraphAdvancedConfig } from '../composables/designer-graph'
import type { ProcessGraphDocument } from '@/contracts/process-graph'
import type { PaletteDrag } from '../composables/use-designer-canvas'
import {
  P53_NODE_WIDTH,
  P53_NODE_HEIGHT,
  P53_GATEWAY_RADIUS,
} from '../composables/use-designer-canvas'
import { useDesignerSave } from '../composables/use-designer-save'
import { useDesignerFormFields } from '../composables/use-designer-form-fields'
import { useDesignerParticipant } from '../composables/use-designer-participant'
import { useDesignerDynamicParallel } from '../composables/use-designer-dynamic-parallel'
import { useDesignerPropsForm } from '../composables/use-designer-props-form'
import { useDesignerVariablesTriggers } from '../composables/use-designer-variables-triggers'
import { useDesignerSubflow } from '../composables/use-designer-subflow'
import { useDesignerScriptDialog } from '../composables/use-designer-script-dialog'
import { useDesignerVersions } from '../composables/use-designer-versions'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const defId = computed(() => String(route.params.defId))
/** 从表单工作台进入时，左上角返回该表单的「关联流程」页签。 */
const returnFormId = computed(() =>
  route.query?.from === 'form-workbench' && typeof route.query?.formId === 'string'
    ? route.query.formId
    : '',
)
/** 从应用管理「表单上下文」进入时，返回同一上下文（应用/表单级）。 */
const returnAppForm = computed(() =>
  route.query?.from === 'app-form' &&
  typeof route.query?.appId === 'string' &&
  typeof route.query?.formId === 'string'
    ? { appId: route.query.appId, formId: route.query.formId }
    : null,
)

const loading = ref(false)
const errorMsg = ref('')
const graph = ref<DesignerGraph | null>(null)
/** 表单工作台上下文：提供三类页签，画布与表单页签共享同一顶部切换。 */
const workbenchFormId = computed(
  () => returnFormId.value || returnAppForm.value?.formId || graph.value?.formDefId || '',
)
const capabilities = ref<BpmNodeCapability[]>([])
const modelRef = shallowRef<DesignerModel | null>(null)
const version = ref(0) // 触发视图刷新的快照 serial

function snapshot() {
  version.value++
}

/** 历史版本预览：非空时画布与属性面板切换为只读快照。 */
const previewVersion = ref<number | null>(null)
const isVersionPreview = computed(() => previewVersion.value != null)

const themeRuleVisible = ref(false)
/** 编号设置弹窗只读取定义身份；编辑与保存继续由既有共用弹窗承接。 */
const themeRuleDef = computed<ProcessDef | null>(() => {
  if (!graph.value || !Number.isFinite(Number(defId.value))) return null
  return {
    id: Number(defId.value),
    processKey: graph.value.processKey,
    name: graph.value.name,
    formKey: graph.value.formKey,
    defVersion: graph.value.version ?? 0,
    status: 'DRAFT',
    createTime: '',
    updateTime: '',
  }
})

/* ─────────── 选中节点（主文件侧画布节点投影；与画布子组件同源快照 serial） ─────────── */

const selectionId = ref<string | null>(null)
const canvasNodes = computed(() => {
  void version.value
  return (modelRef.value?.state().nodes ?? []) as PositionedNode[]
})
const selectedNode = computed(() =>
  selectionId.value ? (canvasNodes.value.find((n) => n.id === selectionId.value) ?? null) : null,
)
const selectedCapability = computed(() => {
  const node = selectedNode.value as PositionedNode | null
  return node ? (capabilities.value.find((cap) => cap.type === node.type) ?? null) : null
})

function selectNode(id: string | null) {
  selectionId.value = id
  modelRef.value?.select(id)
}

/** 画布子组件选中同步（模型内部选中态已在子组件内落账）。 */
function onCanvasSelect(id: string | null) {
  selectionId.value = id
}

/** 节点类型灰色说明（与选择器同一能力清单的 displayName，缺省回退通用文案）。 */
const NODE_TYPE_LABEL_KEYS: Record<string, string> = {
  START: 'workflow.nodeTypeStart',
  END: 'workflow.nodeTypeEnd',
  APPROVAL: 'workflow.approvalNode',
  CONSENSUS: 'workflow.nodeTypeConsensus',
  COPY: 'workflow.ccNode',
  CONDITION: 'workflow.nodeTypeCondition',
  NOTIFICATION: 'workflow.nodeTypeNotification',
}

function nodeTypeHint(type: string): string {
  const labelKey = NODE_TYPE_LABEL_KEYS[type]
  if (labelKey) return t(labelKey)
  const capability = capabilities.value.find((item) => item.type === type)
  return capability?.displayName
    ? t('workflow.nodeTypeGeneric', { name: capability.displayName })
    : t('workflow.nodeTypeUnknown')
}

/* ─────────── 0.1.7 重构：节点面板分组 / 撤销 / 整理布局 ─────────── */

/** 节点面板分组：服务端能力契约 → 设计稿分组的纯投影（共享模块，画布与空状态节点库同源）。 */
const paletteGroups = computed(() =>
  groupPaletteCapabilities(capabilities.value, (labelKey) => t(labelKey)),
)

/** 撤销可用性（version 每次画布变更自增，用于驱动按钮态）。 */
const undoAvailable = computed(() => {
  void version.value
  return modelRef.value?.canUndo() ?? false
})

/** 撤销上一次画布编辑（与快捷键同源：模型内部历史）。 */
function undoLast() {
  if (!modelRef.value?.canUndo()) return
  modelRef.value.undo()
  snapshot()
}

/** 整理布局：默认走向「自上而下」重排全部节点（一次撤销单元；不同连线允许交叉）。 */
function arrangeTopDown() {
  if (!modelRef.value || isVersionPreview.value) return
  modelRef.value.layoutTopDown()
  snapshot()
  canvasRef.value?.fitViewport()
}

function removeSelected() {
  if (!modelRef.value || !selectionId.value || isVersionPreview.value) return
  modelRef.value.removeSelection()
  selectionId.value = null
  snapshot()
}

function undoEdit() {
  if (isVersionPreview.value) return
  modelRef.value?.undo()
  selectionId.value = null
  snapshot()
}

/** 画布子组件命令面（视口适配 / 错误定位居中 / 面板点选添加）。 */
const canvasRef = ref<{
  fitViewport: () => void
  centerOnNode: (elementId: string) => void
  addNodeFromCapability: (cap: BpmNodeCapability) => void
} | null>(null)

const processPreviewVisible = ref(false)

/* ─────────── 领域 composables（装配共享状态；子组件经绑定包消费） ─────────── */

const {
  dirty,
  savedAtText,
  onModelChanged,
  beforeUnloadGuard,
  leaveConfirmVisible,
  settleLeaveConfirm,
  confirmLeaveIfDirty,
  saveAndLeave,
  saving,
  validating,
  publishing,
  validationErrors,
  resetSaveBaseline,
  save,
  validate,
  publish,
} = useDesignerSave({
  defId,
  graph,
  model: modelRef,
  isVersionPreview,
  errorMsg,
  reload: load,
})

const formFieldsResult = useDesignerFormFields({
  graph,
  model: modelRef,
  version,
  snapshot,
  onModelChanged,
  selectedNode,
  returnFormId,
})
const { nodeFormSelectVisible, selectedNodeFormKey, resolveNodeFormName, onNodeFormSelected } =
  formFieldsResult

const participantResult = useDesignerParticipant({
  graph,
  selectedNode,
  selectedCapability,
  model: modelRef,
  isVersionPreview,
})
const dpResult = useDesignerDynamicParallel({
  selectedNode,
  model: modelRef,
  isVersionPreview,
  mainFieldOptionsFor: participantResult.mainFieldOptionsFor,
  tableFieldOptions: participantResult.tableFieldOptions,
  tableColumnOptionsFor: participantResult.tableColumnOptionsFor,
})

const propsFormResult = useDesignerPropsForm({
  selectedNode,
  selectedCapability,
  nodeFormCapable: () => formFieldsResult.nodeFormCapable.value,
  canvasNodes: () => canvasNodes.value,
  selectionId,
  isVersionPreview,
  participantField: () => participantResult.participantField.value,
  dynamicParallelActive: () => dpResult.dynamicParallelActive.value,
  mainFormFields: () => formFieldsResult.mainFormFields.value,
  graph,
  model: modelRef,
  snapshot,
  save,
})
const { advancedConfigVisible } = propsFormResult

const varsTriggersResult = useDesignerVariablesTriggers({
  graph,
  onModelChanged,
  mainFormFields: () => formFieldsResult.mainFormFields.value,
  nodeFormBindings: formFieldsResult.nodeFormBindings,
  ensureFormFields: formFieldsResult.ensureFormFields,
  formFieldOptions: formFieldsResult.formFieldOptions,
  formFieldLabel: formFieldsResult.formFieldLabel,
  graphNodes: formFieldsResult.graphNodes,
})
const { openVariables, openTriggers } = varsTriggersResult

const subflowResult = useDesignerSubflow({
  graph,
  model: modelRef,
  selectedNode,
  mainFormFields: () => formFieldsResult.mainFormFields.value,
  formSchemaFields: () => participantResult.formSchemaFields.value,
  publishedTargetOptions: varsTriggersResult.publishedTargetOptions,
  ensurePublishedTargets: varsTriggersResult.ensurePublishedTargets,
  onModelChanged,
})

const scriptDialogResult = useDesignerScriptDialog({
  graph,
  selectedNode,
  dirty,
  participantForm: participantResult.participantForm,
  applyParticipant: participantResult.applyParticipant,
  triggerDraft: varsTriggersResult.triggerDraft,
  subflowForm: subflowResult.subflowForm,
  applySubflow: subflowResult.applySubflow,
})
const {
  scriptDialogVisible,
  scriptDialogTitle,
  scriptDialogCode,
  openProcessScriptDialog,
  simulateProcessScript,
  onScriptDialogSave,
} = scriptDialogResult

const versionsResult = useDesignerVersions({
  defId,
  previewVersion,
  dirty,
  confirmLeaveIfDirty,
  load,
})

/* ─────────── 子组件绑定包（主文件装配；子组件解构后模板与原实现一致） ─────────── */

const toolbarApi = {
  goBack,
  graph,
  loading,
  dirty,
  savedAtText,
  workbenchFormId,
  goWorkbenchTab,
  themeRuleVisible,
  // isVersionPreview/previewVersion 由 versionsResult 携带（同一 previewVersion ref 派生，语义一致）
  ...versionsResult,
  processPreviewVisible,
  saving,
  save,
  publishing,
  publish,
}

const propsPanelApi = {
  ...propsFormResult,
  ...participantResult,
  ...dpResult,
  ...formFieldsResult,
  ...subflowResult,
  ...scriptDialogResult,
  selectedNode,
  selectionId,
  validationErrors,
  isVersionPreview,
  nodeTypeHint,
}

const advancedConfigApi = { ...propsFormResult, saving }

const subflowWizardApi = {
  ...subflowResult,
  openProcessScriptDialog,
  mainFormFields: formFieldsResult.mainFormFields,
  tableFieldOptions: participantResult.tableFieldOptions,
  publishedTargetOptions: varsTriggersResult.publishedTargetOptions,
}

const opSettingsApi = { ...propsFormResult }

const dpSettingsApi = { ...dpResult }

const variablesApi = {
  ...varsTriggersResult,
  graph,
  mainFormFields: formFieldsResult.mainFormFields,
  nodeFormBindings: formFieldsResult.nodeFormBindings,
  formFieldOptions: formFieldsResult.formFieldOptions,
}

const triggersApi = {
  ...varsTriggersResult,
  graph,
  graphNodeName: formFieldsResult.graphNodeName,
  formFieldOptions: formFieldsResult.formFieldOptions,
  formFieldLabel: formFieldsResult.formFieldLabel,
  ensureFormFields: formFieldsResult.ensureFormFields,
  openProcessScriptDialog,
}

const pickersApi = { ...participantResult, ...dpResult }

/* ─────────── 节点面板（palette 留守主文件：tokens.spec 断言其样式锚点） ─────────── */

/** 节点面板拖拽载荷（画布 drop 侧按同一 JSON 契约解析）。 */
function onPaletteDragStart(event: DragEvent, capability: BpmNodeCapability) {
  if (!capability.supports.design) {
    event.preventDefault()
    return
  }
  const drag: PaletteDrag = { capability }
  event.dataTransfer?.setData('application/json', JSON.stringify(drag))
}

/** V011-BUG-020：组件库点击添加（拖拽之外的可见创建路径），落点为画布中心。 */
function onWorkbarClick(cap: BpmNodeCapability) {
  canvasRef.value?.addNodeFromCapability(cap)
}

/** 错误定位：聚焦错误对象（节点/边居中并高亮选择）。 */
function focusError(error: GraphValidationError) {
  const elementId = error.nodeKey ?? error.edgeKey ?? error.elementId ?? ''
  if (!elementId) return
  if (error.edgeKey) {
    selectionId.value = null
    return
  }
  selectNode(elementId)
  canvasRef.value?.centerOnNode(elementId)
}

/* ─────────── 加载 ─────────── */

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const versionToPreview = previewVersion.value
    const [definition, caps] = await Promise.all([
      versionToPreview == null
        ? getProcessDefDefinition(defId.value)
        : getDefVersionGraph(defId.value, versionToPreview),
      getProcessNodeCapabilities(),
    ])
    // BF20261013-019：子流程不再是独立节点——发起子流程配置在审批节点上，等待块由设计器自动生成
    capabilities.value = caps.filter((cap) => cap.type !== 'SUBFLOW_WAIT')
    graph.value = {
      processKey: definition.processKey,
      name: definition.name ?? '',
      formKey: definition.formKey ?? '',
      version: definition.version ?? versionToPreview ?? undefined,
      contractVersion: (definition as { contractVersion?: number }).contractVersion,
      formName: (definition as { formName?: string }).formName,
      formDefId: (definition as { formDefId?: string }).formDefId,
      advancedConfig: (definition as { advancedConfig?: GraphAdvancedConfig }).advancedConfig,
      variables: (definition as { variables?: BpmVariableDef[] }).variables ?? [],
      triggers: ((definition as { triggers?: TriggerConfig[] }).triggers ?? []).map((trigger) => ({
        ...trigger,
        enabled: trigger.enabled !== false,
      })),
      notification: (definition as { notification?: ProcessNotificationConfigPayload })
        .notification,
      elements: (definition.elements ??
        []) as import('@/contracts/process-graph').ProcessGraphElement[],
      canvas: definition.canvas ?? {},
    } as ProcessGraphDocument
    await nextTick()
    if (!graph.value) {
      errorMsg.value = t('workflow.graphDataEmpty')
      return
    }
    modelRef.value = createDesignerModel(
      graph.value,
      { width: P53_NODE_WIDTH, height: P53_NODE_HEIGHT },
      P53_GATEWAY_RADIUS,
    )
    // 复核02 G6a：订阅模型变更驱动脏状态与自动保存；加载时刻重置为真实未保存前状态
    modelRef.value.subscribe(onModelChanged)
    resetSaveBaseline()
    // 已绑定审批意见表单的节点：预先解析业务名称，属性面板不展示 formKey
    for (const element of graph.value.elements ?? []) {
      const nodeForm = (element.config as Record<string, unknown> | undefined)?.nodeForm as
        | { formKey?: string }
        | undefined
      void resolveNodeFormName(nodeForm?.formKey)
    }
    selectNode(null)
    snapshot()
    canvasRef.value?.fitViewport()
  } catch (err) {
    if (isVersionPreview.value) {
      graph.value = null
      modelRef.value = null
      selectionId.value = null
      snapshot()
    }
    errorMsg.value =
      (err as { msg?: string }).msg ??
      (isVersionPreview.value
        ? t('workflow.versionGraphLoadFailed')
        : t('workflow.processDefLoadFailed'))
  } finally {
    loading.value = false
  }
}

watch(
  defId,
  () => {
    previewVersion.value = null
    void load()
  },
  { immediate: true },
)

function onKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.tagName?.match?.(/input|textarea|select/i)) return
  if (isVersionPreview.value) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectionId.value) {
      event.preventDefault()
      removeSelected()
    }
  }
  // 设计09：撤销入口收敛为快捷键（工具栏按设计稿只保留草稿历史/保存/发布）
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undoEdit()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // BF20261013-022⑤：未保存时刷新/关闭走浏览器原生确认（画布 ResizeObserver 随画布子组件）
  window.addEventListener('beforeunload', beforeUnloadGuard)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', beforeUnloadGuard)
})

function goBack() {
  router.back()
}

/** 顶部三类页签：字段清单 / 表单设计 / 流程设计（当前页）。 */
function goWorkbenchTab(tab: 'fields' | 'design' | 'processes') {
  if (tab === 'processes' || !workbenchFormId.value) return
  void router.push({
    path: `/form/designer/${workbenchFormId.value}`,
    query: tab === 'fields' ? { tab: 'fields' } : {},
  })
}

/** 流程设置页入口（工具栏第二行）。 */
function openProcessSettings() {
  void router.push(`/workflow/defs/${defId.value}/settings`)
}

const modelGet = () => modelRef.value
const versionGet = () => version.value
</script>

<template>
  <div class="designer-page">
    <DesignerProcessToolbar :api="toolbarApi" />

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      class="designer-alert"
    />

    <!-- 0.1.7 重构：第二行工具栏（撤销 / 整理布局 / 变量 / 触发器 / 高级配置 / 校验） -->
    <div v-if="!isVersionPreview" class="designer-toolbar2">
      <el-button size="small" :disabled="!undoAvailable" @click="undoLast">{{
        t('common.undo')
      }}</el-button>
      <el-button size="small" @click="arrangeTopDown">{{ t('workflow.arrangeTopDown') }}</el-button>
      <span class="spacer" />
      <el-button size="small" class="workbar-advance" @click="openVariables">变量</el-button>
      <el-button size="small" class="workbar-advance" @click="openTriggers">触发器</el-button>
      <el-button size="small" class="workbar-advance" @click="openProcessSettings">{{
        t('workflow.processSettings')
      }}</el-button>
      <el-button
        size="small"
        class="workbar-advance"
        :aria-label="t('workflow.advancedConfig')"
        @click="advancedConfigVisible = true"
        >{{ t('workflow.designerAdvancedShort') }}</el-button
      >
      <el-button
        size="small"
        class="workbar-verify"
        :loading="validating"
        :aria-label="t('workflow.validateFlow')"
        @click="validate"
        >{{ t('workflow.designerValidateShort') }}</el-button
      >
    </div>

    <div class="designer-main">
      <!-- 0.1.7 重构：节点面板移到左侧竖栏（分组 + 图标块，拖拽/点击添加） -->
      <aside v-if="!isVersionPreview" class="designer-palette">
        <h3 class="palette-title">{{ t('workflow.nodePalette') }}</h3>
        <section v-for="group in paletteGroups" :key="group.category" class="palette-group">
          <h4 class="palette-group__title">{{ group.label }}</h4>
          <div class="palette-group__grid">
            <button
              v-for="cap in group.items"
              :key="cap.type"
              type="button"
              class="palette-item"
              :class="{ 'palette-item--disabled': !cap.supports.design }"
              :data-node-type="cap.type"
              :draggable="cap.supports.design"
              @dragstart="onPaletteDragStart($event, cap)"
              @click="onWorkbarClick(cap)"
            >
              <svg
                class="workbar-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  v-for="(pathData, pathIndex) in nodeIconPaths(cap.type)"
                  :key="pathIndex"
                  :d="pathData"
                />
              </svg>
              <span class="palette-item__name">{{ cap.displayName }}</span>
            </button>
          </div>
        </section>
      </aside>

      <div class="designer-body">
        <DesignerCanvas
          ref="canvasRef"
          :model-get="modelGet"
          :version-get="versionGet"
          :selection-id="selectionId"
          :validation-errors="validationErrors"
          :is-version-preview="isVersionPreview"
          :snapshot="snapshot"
          @select="onCanvasSelect"
        />

        <!-- 属性面板：字段由服务端能力 configFields + 参与人策略驱动 -->
        <DesignerNodePropsPanel :api="propsPanelApi" />
      </div>
    </div>

    <!-- 流程高级配置弹窗（P53 节点13 · 只读呈现定义元数据：统一监听器/通知/前置/后置） -->
    <DesignerAdvancedConfigDialog :api="advancedConfigApi" />

    <!-- ═══ BF20261013-022②：统一脚本编辑弹窗（流程脚本函数目录） ═══ -->
    <ScriptDialog
      v-model:visible="scriptDialogVisible"
      :title="scriptDialogTitle"
      :code="scriptDialogCode"
      :functions="PROCESS_SCRIPT_FUNCTIONS"
      :simulate="simulateProcessScript"
      @save="onScriptDialogSave"
    />

    <!-- ═══ BF20261013-027：发起子流程向导（触发方式 → 子流程 → 初始值） ═══ -->
    <DesignerSubflowWizard :api="subflowWizardApi" />

    <!-- ═══ 0.2.0 Q12（278:1567）：节点操作 820 设置面 ═══ -->
    <DesignerNodeOpSettingsDialog :api="opSettingsApi" />

    <!-- ═══ Q11（273:1332）：动态并行 820 设置面 ═══ -->
    <DesignerDynamicParallelSettingsDialog :api="dpSettingsApi" />

    <!-- ═══ P64 阶段Ⅰ：流程变量配置弹窗 ═══ -->
    <DesignerVariablesDialog :api="variablesApi" />

    <!-- ═══ P64 阶段Ⅰ：触发规则配置弹窗 ═══ -->
    <DesignerTriggersDialog :api="triggersApi" />

    <!-- ═══ P64 阶段Ⅰ：节点业务表单选择弹窗（复用已发布表单选择器） ═══ -->
    <FormSelectDialog
      v-model:visible="nodeFormSelectVisible"
      :current-form-key="selectedNodeFormKey"
      @select="onNodeFormSelected"
    />

    <!-- P63 参与人策略 / 动态并行「固定值」候选弹窗宿主 -->
    <DesignerParticipantPickers :api="pickersApi" />

    <!-- 校验错误面板（含 nodeKey/edgeKey 定位入口） -->
    <el-card v-if="validationErrors.length" class="designer-errors">
      <template #header
        ><span>{{
          t('workflow.validationSummary', { count: validationErrors.length })
        }}</span></template
      >
      <div v-for="(err, index) in validationErrors" :key="index" class="designer-error-row">
        <el-tag size="small" type="danger">{{ err.errorCode }}</el-tag>
        <span class="error-message">{{ err.message }}</span>
        <el-button size="small" link type="primary" @click="focusError(err)">
          {{ t('workflow.validationLocateLabel', { target: err.nodeKey ?? err.edgeKey ?? '-' }) }}
        </el-button>
      </div>
    </el-card>

    <el-dialog
      v-model="processPreviewVisible"
      :title="t('workflow.designerPreviewTitle')"
      width="1440px"
      class="process-preview-dialog"
    >
      <ProcessGraphView v-if="graph" :graph="graph" :height="640" />
    </el-dialog>

    <!-- 0.2.0 Q55（设计 272:1575）：未保存离开确认，保存成功后才离开。 -->
    <DesignerLeaveConfirmDialog
      v-model="leaveConfirmVisible"
      :saving="saving"
      @settle="settleLeaveConfirm"
      @save="saveAndLeave"
    />

    <ThemeRuleDialog v-model:visible="themeRuleVisible" :def="themeRuleDef" @saved="load" />
  </div>
</template>

<style scoped>
.designer-page {
  display: flex;
  flex-direction: column;
  /* 页面从一级顶栏下方开始；二级导航和工作条属于页面自身，画布必须铺到视口底。 */
  height: calc(100vh - 64px);
  min-height: 560px;
  background: #f7fafc;
  color: #1f2a44;
  font-family: Arial, 'Microsoft YaHei', sans-serif;
  font-size: 14px;
}
.spacer {
  flex: 1;
}
.designer-alert {
  margin: 8px 12px;
}

/* ── 左栏节点面板（条目 = 服务端能力契约的真实节点类型） ── */
.designer-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
/* ── 0.1.7 重构：第二行工具栏（撤销 / 整理布局 / 文档级配置 / 校验） ── */
.designer-toolbar2 {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  box-sizing: border-box;
  flex: 0 0 40px;
  padding: 4px 16px;
  background: #fff;
  box-shadow: inset 0 -1px 0 #e1e5ef;
}
/* 参考 UI：第二行为文字按钮（无边框），悬停浅底；间距统一由容器 gap 8px 承接 */
.designer-toolbar2 :deep(.el-button--small) {
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #4a5873;
  font-size: 12px;
}
.designer-toolbar2 :deep(.el-button--small:hover) {
  background: #f2f5fb;
  color: var(--sw-color-primary);
}
.designer-toolbar2 :deep(.el-button--small.is-disabled) {
  background: transparent;
  color: #b9c2d2;
}
.designer-toolbar2 :deep(.el-button + .el-button) {
  margin-left: 0;
}
/* ── 设计 42:4：224px 节点库（画布内框从 x236 起），分组内单列 188×34 节点入口 ── */
.designer-main {
  display: flex;
  flex: 1;
  min-height: 0;
}
.designer-palette {
  box-sizing: border-box;
  flex: 0 0 224px;
  width: 224px;
  padding: 16px;
  overflow-y: auto;
  background: #fff;
  border-right: 1px solid #e1e5ef;
}
.palette-title {
  margin: 0 0 12px;
  color: #1f2a44;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.palette-group + .palette-group {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef1f6;
}
.palette-group__title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #7e89a1;
}
.palette-group__grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.palette-item {
  --palette-accent: var(--sw-color-primary);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #344164;
  font-size: 12px;
  line-height: 16px;
  cursor: grab;
}
.palette-item:hover {
  background: #f2f5fb;
}
.palette-item:active {
  cursor: grabbing;
}
.palette-item--disabled {
  cursor: default;
  opacity: 0.55;
}
.palette-item__name {
  font-size: 13px;
  font-weight: 400;
  line-height: 22px;
  white-space: nowrap;
}
.palette-item .workbar-icon {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  display: block;
}
.palette-item .workbar-icon path {
  fill: none;
  stroke: var(--palette-accent);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.palette-item[data-node-type='START'] {
  --palette-accent: #12805c;
}
.palette-item[data-node-type='END'] {
  --palette-accent: #c2303a;
}
.palette-item[data-node-type='CONDITION'],
.palette-item[data-node-type='PARALLEL_GATEWAY'] {
  --palette-accent: #d98c10;
}
.palette-item[data-node-type='CONSENSUS'] {
  --palette-accent: var(--sw-process-consensus);
}
.palette-item[data-node-type='DYNAMIC_PARALLEL'] {
  --palette-accent: var(--sw-process-dynamic-parallel);
}
.palette-item[data-node-type='NOTIFICATION'],
.palette-item[data-node-type='IOT_COMMAND'] {
  --palette-accent: var(--sw-process-consensus);
}

/* 0.1.7：开始/结束小圆形图标节点（无卡片盒） */

/* ── 校验错误面板 ── */
.designer-errors {
  max-height: 180px;
  overflow: auto;
  margin: 0 12px 8px;
  border-color: #d7deed;
  border-radius: 8px;
}
.designer-error-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed #e2e8f4;
  font-size: 13px;
}
.error-message {
  color: #344164;
}

/* BF20261013-021：脚本内置函数参考（触发器判断脚本下方） */
.script-help {
  margin: -6px 0 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--sw-color-primary-softer);
  border: 1px solid var(--sw-color-primary-light);
}
.script-help__title {
  margin: 0 0 4px;
  font-size: 12px;
  color: #5b5470;
  line-height: 18px;
}
.script-help__item {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 18px;
}
.script-help__item code {
  color: #6d5bd0;
}

/* ── P53 节点13：流程高级配置弹窗外壳（append 前缀规则：弹窗渲染在 .designer-page 内） ── */
.designer-page :deep(.advanced-config-dialog) {
  --el-dialog-margin-top: 110px;
  width: 1056px !important;
  height: 804px;
  max-width: calc(100vw - 48px);
  padding: 0;
  border: 1px solid #dde3ef;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__header) {
  box-sizing: border-box;
  min-height: 94px;
  padding: 22px 27px 18px;
  border-bottom: 1px solid #dde3ef;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__headerbtn) {
  top: 24px;
  right: 28px;
  font-size: 20px;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__body) {
  padding: 23px 27px;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__footer) {
  padding: 0;
  border-top: 1px solid #dde3ef;
}
@media (max-height: 980px) {
  .designer-page :deep(.advanced-config-dialog) {
    --el-dialog-margin-top: 40px;
  }
}
</style>

<!-- P64 弹窗可达性全局规则：append-to-body 传送后不带 scoped 属性，需全局选择器。 -->
<style>
.el-dialog.p64-dialog {
  display: flex;
  flex-direction: column;
  max-height: 88vh;
  margin-top: 6vh;
  margin-bottom: 6vh;
}
.el-dialog.p64-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
/* ═══ 审查28 Q10：变量/触发器弹窗表格表头底色带 42 高（设计原图 #f4f6fb 色带）；
   table-cell 高度必须 box-sizing:border-box。仅作用于本文件两个 p64 弹窗，
   不影响流程设置页（ProcessSettings）的事件监听表格。 ═══ */
.el-dialog.p64-dialog .p64-table {
  --el-table-header-bg-color: #f4f6fb;
  --el-table-header-text-color: #7c8390;
}
.el-dialog.p64-dialog .p64-table th.el-table__cell {
  box-sizing: border-box;
  height: 42px;
  padding: 4px 0;
  font-weight: 400;
}

/* ═══ Q18（272:1814 / 273:2049）：校验通过与发布成功轻提示——280×48、顶部 84、
   水平居中、浅绿成功表面。仅本文件两处成功反馈传入该专用类，全局 .el-message 不变。 ═══ */
.el-message.designer-feedback-toast {
  box-sizing: border-box;
  width: 280px;
  min-width: 280px;
  height: 48px;
  padding: 0;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: var(--sw-success-bg, #eafbf7);
  color: var(--sw-success-text, #12805c);
}

.el-message.designer-feedback-toast .el-message__content {
  color: var(--sw-success-text, #12805c);
  font-size: 14px;
  line-height: 22px;
}

/* 原表面为纯文字提示，无状态图标。 */
.el-message.designer-feedback-toast .el-message__icon {
  display: none;
}
</style>
