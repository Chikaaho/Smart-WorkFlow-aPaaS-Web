<script setup lang="ts">
/**
 * DesignerNodePropsPanel — 设计器右侧属性面板（P53 节点12/13 几何）：
 * 页签（基础/字段属性/高级）+ 参与人结构化面板 + 动态并行专属面板 + 通用字段渲染 +
 * 监听器只读展示 + 校验错误定位（自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { useI18n } from '@/locales'
import DesignerParticipantPanel from './DesignerParticipantPanel.vue'
import type { DesignerParticipantPanelApi } from './DesignerParticipantPanel.vue'
import type { DesignerGraphExecPanelApi } from './DesignerGraphExecPanel.vue'
import DesignerGraphExecPanel from './DesignerGraphExecPanel.vue'
import DesignerFieldStatesPanel from './DesignerFieldStatesPanel.vue'
import type { DesignerFieldStatesPanelApi } from './DesignerFieldStatesPanel.vue'
import type { Ref, ComputedRef } from 'vue'
import type { GraphValidationError } from '@/modules/workflow/api'
import type { BpmNodeConfigField } from '@/contracts/bpm-node'
import type { PositionedNode } from '@/adapters/process-graph'
import type { TriggerConfig } from '@/contracts/p64'
import type { DynamicParallelFormDraft } from '@/modules/workflow/utils/node-capabilities'
import type { SubflowFormDraft } from '../composables/use-designer-subflow'

const { t } = useI18n()

/**
 * 属性面板绑定包（主文件装配各 composable 返回值；子组件解构后模板与原实现一致）。
 * 参与人子面板 / 字段三态子面板直接复用同一绑定包，故接口聚合两者必需成员
 * （isVersionPreview 来自字段三态 Api；participantField/nodeMeta 等来自参与人 Api）。
 */
export interface DesignerPropsPanelApi
  extends DesignerParticipantPanelApi, DesignerFieldStatesPanelApi, DesignerGraphExecPanelApi {
  /* ── 共享状态 ── */
  selectedNode: ComputedRef<PositionedNode | null>
  selectionId: Ref<string | null>
  validationErrors: Ref<GraphValidationError[]>
  /** 节点类型灰色说明（能力清单 displayName 回退）。 */
  nodeTypeHint: (type: string) => string
  /* ── 页签 ── */
  nodePropsTab: Ref<'basic' | 'fields' | 'advanced'>
  fieldConfigCapable: ComputedRef<boolean>
  advancedConfigCapable: ComputedRef<boolean>
  /* ── 高级页签：节点脚本/子流程/审批意见表单/操作设置 ── */
  nodeTriggerCapable: ComputedRef<boolean>
  nodeTriggerOf: (event: string) => TriggerConfig | null
  nodeTriggerSummary: (event: string) => string
  openNodeTriggerScriptDialog: (event: string) => void
  subflowForm: Ref<SubflowFormDraft>
  subflowSummary: ComputedRef<string>
  onSubflowSwitch: (value: string | number | boolean) => void
  openSubflowWizard: () => void
  nodeFormCapable: ComputedRef<boolean>
  nodeFormSelectVisible: Ref<boolean>
  selectedNodeFormKey: ComputedRef<string>
  selectedNodeFormName: ComputedRef<string>
  clearNodeForm: () => void
  /** 高级页签「操作设置」承载条件（能力 allowedActions 字段）。 */
  allowedActionsField: ComputedRef<BpmNodeConfigField | null>
  allowedActionSummary: ComputedRef<string>
  openOpSettings: () => void
  /* ── 基础页签 ── */
  propForm: Ref<Record<string, unknown>>
  onNodeNameInput: (value: string) => void
  applyProps: () => void
  /* ── 动态并行专属面板 ── */
  dynamicParallelActive: ComputedRef<boolean>
  dynamicParallelSummary: ComputedRef<string>
  openDpSettings: () => void
  dynamicParallelForm: Ref<DynamicParallelFormDraft>
  applyDynamicParallel: () => void
  openDynamicUserPicker: () => void
  dynamicFixedSelectedIdList: ComputedRef<string[]>
  openDynamicDeptPicker: () => void
  onDynamicObjectTypeChange: () => void
  /* ── 通用字段渲染（来源候选成员由参与人 Api 提供） ── */
  genericConfigFields: ComputedRef<BpmNodeConfigField[]>
  returnTargetsValue: ComputedRef<string[]>
  onReturnTargetsChange: (value: string[]) => void
  returnTargetCandidates: ComputedRef<Array<{ id: string; label: string }>>
  consensusModeSegments: ComputedRef<Array<{ value: string; label: string }>>
  onConsensusModeChange: (value: string) => void
  consensusRatioLabel: ComputedRef<string>
  onConsensusRatioChange: (value: number | null | undefined) => void
  isArrayConfigField: (field: BpmNodeConfigField) => boolean
  configArrayValue: (fieldKey: string) => string[]
  configArrayOptions: (field: BpmNodeConfigField) => Array<{ value: string; label: string }>
  onConfigArrayChange: (fieldKey: string, value: unknown) => void
}

const props = defineProps<{
  api: DesignerPropsPanelApi
}>()

const {
  selectedNode,
  selectionId,
  validationErrors,
  isVersionPreview,
  nodeTypeHint,
  nodePropsTab,
  fieldConfigCapable,
  advancedConfigCapable,
  nodeTriggerCapable,
  nodeTriggerOf,
  nodeTriggerSummary,
  openNodeTriggerScriptDialog,
  subflowForm,
  subflowSummary,
  onSubflowSwitch,
  openSubflowWizard,
  nodeFormCapable,
  nodeFormSelectVisible,
  selectedNodeFormKey,
  selectedNodeFormName,
  clearNodeForm,
  allowedActionsField,
  allowedActionSummary,
  openOpSettings,
  propForm,
  onNodeNameInput,
  applyProps,
  nodeMeta,
  participantField,
  dynamicParallelActive,
  dynamicParallelSummary,
  openDpSettings,
  dynamicParallelForm,
  applyDynamicParallel,
  openDynamicUserPicker,
  dynamicFixedSelectedIdList,
  openDynamicDeptPicker,
  onDynamicObjectTypeChange,
  mainFieldOptionsFor,
  tableFieldOptions,
  tableColumnOptionsFor,
  genericConfigFields,
  returnTargetsValue,
  onReturnTargetsChange,
  returnTargetCandidates,
  consensusModeSegments,
  onConsensusModeChange,
  consensusRatioLabel,
  onConsensusRatioChange,
  isArrayConfigField,
  configArrayValue,
  configArrayOptions,
  onConfigArrayChange,
  graphExecActive,
} = props.api

/** Graph 执行器子面板绑定包：从聚合 api 中取同一段 refs（保持 Ref 形态传给子组件）。 */
const graphExecPanelApi: DesignerGraphExecPanelApi = {
  graphExecActive: props.api.graphExecActive,
  graphs: props.api.graphs,
  graphsLoading: props.api.graphsLoading,
  versions: props.api.versions,
  binding: props.api.binding,
  bindingLoading: props.api.bindingLoading,
  bindingError: props.api.bindingError,
  graphDefId: props.api.graphDefId,
  graphDefVersion: props.api.graphDefVersion,
  inputRows: props.api.inputRows,
  outputRows: props.api.outputRows,
  variableOptions: props.api.variableOptions,
  onGraphChange: props.api.onGraphChange,
  onVersionChange: props.api.onVersionChange,
  applyGraphExec: props.api.applyGraphExec,
}
</script>

<template>
  <div class="designer-props">
    <template v-if="selectedNode">
      <!-- 0.1.10：去掉「节点属性」大标题，面板直接以页签/表单开始 -->

      <!-- BF20261013-013：页签（字段属性仅非结束节点） -->
      <div v-if="fieldConfigCapable" class="props-tabs">
        <button
          type="button"
          class="props-tab"
          :class="{ 'is-active': nodePropsTab === 'basic' }"
          @click="nodePropsTab = 'basic'"
        >
          {{ t('workflow.basicPropsSection') }}
        </button>
        <button
          type="button"
          class="props-tab"
          :class="{ 'is-active': nodePropsTab === 'fields' }"
          @click="nodePropsTab = 'fields'"
        >
          {{ t('workflow.fieldPropsTab') }}
        </button>
        <button
          v-if="advancedConfigCapable"
          type="button"
          class="props-tab"
          :class="{ 'is-active': nodePropsTab === 'advanced' }"
          @click="nodePropsTab = 'advanced'"
        >
          {{ t('workflow.advancedPropsTab') }}
        </button>
      </div>

      <template v-if="nodePropsTab === 'advanced' && advancedConfigCapable">
        <el-form label-position="top" :inert="isVersionPreview">
          <template v-if="nodeTriggerCapable">
            <div class="props-section props-section--advanced">
              {{ t('workflow.nodeScriptSection') }}
            </div>
            <el-form-item :label="t('workflow.nodeScriptBefore')">
              <div class="participant-picker-row">
                <el-button @click="openNodeTriggerScriptDialog('NODE_ENTERING')">
                  {{
                    nodeTriggerOf('NODE_ENTERING')?.script?.trim()
                      ? t('form.scriptEdit')
                      : t('form.scriptWrite')
                  }}
                </el-button>
                <small class="participant-hint">{{ nodeTriggerSummary('NODE_ENTERING') }}</small>
              </div>
            </el-form-item>
            <el-form-item :label="t('workflow.nodeScriptAfter')">
              <div class="participant-picker-row">
                <el-button @click="openNodeTriggerScriptDialog('NODE_ROUND_COMPLETED')">
                  {{
                    nodeTriggerOf('NODE_ROUND_COMPLETED')?.script?.trim()
                      ? t('form.scriptEdit')
                      : t('form.scriptWrite')
                  }}
                </el-button>
                <small class="participant-hint">{{
                  nodeTriggerSummary('NODE_ROUND_COMPLETED')
                }}</small>
              </div>
            </el-form-item>
          </template>

          <template v-if="selectedNode?.type === 'APPROVAL'">
            <div class="props-section props-section--advanced">
              {{ t('workflow.subflowSection') }}
            </div>
            <el-form-item :label="t('workflow.startSubflow')">
              <div class="participant-picker-row">
                <el-switch v-model="subflowForm.enabled" @change="onSubflowSwitch" />
                <el-button v-if="subflowForm.enabled" @click="openSubflowWizard">
                  {{ subflowForm.targetProcessDefKey ? '修改配置' : '配置子流程' }}
                </el-button>
                <small v-if="subflowSummary" class="participant-hint">{{ subflowSummary }}</small>
              </div>
            </el-form-item>
          </template>

          <div class="props-section props-section--advanced">
            {{ t('workflow.nodeOperationSection') }}
          </div>
          <el-form-item v-if="nodeFormCapable" :label="t('workflow.approvalOpinionForm')">
            <div class="nodeform-row">
              <el-input :model-value="selectedNodeFormName" disabled />
              <el-button @click="nodeFormSelectVisible = true">
                {{ selectedNodeFormKey ? '更换' : '设置' }}
              </el-button>
              <el-button v-if="selectedNodeFormKey" @click="clearNodeForm">清除</el-button>
            </div>
          </el-form-item>
          <el-form-item v-if="allowedActionsField" :label="t('workflow.operationSettings')">
            <!-- 0.2.0 Q12（278:1567）：操作设置改由 820 设置面承载；此处只回显真实选中/空值 -->
            <div class="node-op-row">
              <el-input
                :model-value="allowedActionSummary"
                readonly
                data-testid="node-op-summary"
                @click="openOpSettings"
              />
              <el-button data-testid="node-op-open" @click="openOpSettings">设置</el-button>
            </div>
            <small class="config-array-hint">{{ t('workflow.allowedActionsHint') }}</small>
          </el-form-item>
        </el-form>
      </template>

      <template v-if="nodePropsTab === 'basic' || !fieldConfigCapable">
        <div v-if="!fieldConfigCapable" class="props-section">
          {{ t('workflow.basicPropsSection') }}
        </div>
        <!-- 0.1.7 #36（Owner）：面板内不再混用 small 尺寸——输入框/选择器/按钮统一 32px 高 -->
        <el-form class="designer-props__basic" label-position="top" :inert="isVersionPreview">
          <div v-if="selectedNode" class="props-node-type">
            {{ nodeTypeHint(selectedNode.type) }}
          </div>
          <el-form-item :label="t('workflow.nodeName')">
            <el-input
              :model-value="propForm.name as string"
              @input="onNodeNameInput"
              @change="applyProps"
              @blur="applyProps"
              @keyup.enter="applyProps"
            />
          </el-form-item>
          <!-- 节点编号 / 审批方式（定义 config 元数据；只读展示） -->
          <el-form-item v-if="nodeMeta.approveMode" :label="t('workflow.approveModeLabel')">
            <el-input :model-value="nodeMeta.approveModeLabel" disabled />
          </el-form-item>
          <!-- ═══ P63 参与人结构化面板（APPROVAL/CONSENSUS）：策略下拉 + 按策略取值编辑 ═══ -->
          <DesignerParticipantPanel v-if="participantField" :api="api" />
          <!-- ═══ 1.2.0 P67（E1-1）Graph 执行器面板：绑定已发布图 + 固定版本 + 参数映射 ═══ -->
          <DesignerGraphExecPanel v-if="graphExecActive" :api="graphExecPanelApi" />
          <!-- ═══ P63 动态并行专属面板（semanticVersion 开关 = 新语义按对象分支） ═══ -->
          <template v-if="dynamicParallelActive">
            <!-- Q11（273:1332）：并行分支配置入口——面板回显摘要，编辑走 820 设置面 -->
            <el-form-item label="并行分支配置">
              <div class="node-op-row">
                <el-input
                  :model-value="dynamicParallelSummary"
                  readonly
                  data-testid="dp-config-summary"
                  @click="openDpSettings"
                />
                <el-button data-testid="dp-config-open" @click="openDpSettings">设置</el-button>
              </div>
            </el-form-item>
            <el-form-item label="分支来源类型">
              <el-select v-model="dynamicParallelForm.sourceType" @change="applyDynamicParallel">
                <el-option label="表单字段" value="FORM_FIELD" />
                <el-option label="流程变量" value="VARIABLE" />
                <el-option label="固定值" value="FIXED" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="dynamicParallelForm.sourceType === 'FIXED'" label="固定值">
              <!-- 新语义下直接选择人员/部门对象（稳定 ID）；旧语义保留手填取值形状 -->
              <div v-if="dynamicParallelForm.objectSemantic" class="participant-picker-row">
                <el-button
                  v-if="dynamicParallelForm.objectType === 'USER'"
                  @click="openDynamicUserPicker"
                >
                  {{
                    dynamicFixedSelectedIdList.length > 0
                      ? `已选 ${dynamicFixedSelectedIdList.length} 人（点击修改）`
                      : '选择人员'
                  }}
                </el-button>
                <el-button v-else @click="openDynamicDeptPicker">
                  {{
                    dynamicFixedSelectedIdList.length > 0
                      ? `已选 ${dynamicFixedSelectedIdList.length} 个部门（点击修改）`
                      : '选择部门'
                  }}
                </el-button>
              </div>
              <el-input
                v-else
                v-model="dynamicParallelForm.sourceValue"
                placeholder="多个取值用英文逗号分隔"
                @change="applyDynamicParallel"
                @blur="applyDynamicParallel"
              />
            </el-form-item>
            <el-form-item v-else-if="dynamicParallelForm.sourceType === 'VARIABLE'" label="变量名">
              <el-input
                v-model="dynamicParallelForm.sourceValue"
                placeholder="请输入变量名"
                @change="applyDynamicParallel"
                @blur="applyDynamicParallel"
              />
            </el-form-item>
            <el-form-item v-else-if="dynamicParallelForm.scope === 'MAIN'" label="主字段">
              <el-select
                v-model="dynamicParallelForm.sourceValue"
                filterable
                placeholder="选择主表字段"
                @change="applyDynamicParallel"
              >
                <el-option
                  v-for="option in mainFieldOptionsFor(dynamicParallelForm.objectType)"
                  :key="option.name"
                  :label="option.label || '未命名字段'"
                  :value="option.name"
                />
              </el-select>
            </el-form-item>
            <!-- 对象类型仅按对象分支时使用，随 semanticVersion 开关显示 -->
            <el-form-item v-if="dynamicParallelForm.objectSemantic" label="对象类型">
              <el-radio-group
                v-model="dynamicParallelForm.objectType"
                @change="onDynamicObjectTypeChange"
              >
                <el-radio value="USER">人员（逐人分支）</el-radio>
                <el-radio value="DEPT">部门（逐部门分支）</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="取值范围">
              <el-radio-group v-model="dynamicParallelForm.scope" @change="applyDynamicParallel">
                <el-radio value="MAIN">主表字段</el-radio>
                <el-radio value="TABLE">表格字段</el-radio>
              </el-radio-group>
            </el-form-item>
            <template v-if="dynamicParallelForm.scope === 'TABLE'">
              <el-form-item label="表格字段">
                <el-select
                  v-model="dynamicParallelForm.tableField"
                  filterable
                  placeholder="选择表格字段"
                  @change="
                    () => {
                      dynamicParallelForm.column = ''
                      applyDynamicParallel()
                    }
                  "
                >
                  <el-option
                    v-for="option in tableFieldOptions"
                    :key="option.name"
                    :label="option.label || '未命名字段'"
                    :value="option.name"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="表格列">
                <el-select
                  v-model="dynamicParallelForm.column"
                  filterable
                  placeholder="选择表格列"
                  @change="
                    () => {
                      dynamicParallelForm.sourceValue = dynamicParallelForm.column
                      applyDynamicParallel()
                    }
                  "
                >
                  <el-option
                    v-for="option in tableColumnOptionsFor(
                      dynamicParallelForm.tableField,
                      dynamicParallelForm.objectType,
                    )"
                    :key="option.name"
                    :label="option.label || '未命名字段'"
                    :value="option.name"
                  />
                </el-select>
              </el-form-item>
            </template>
            <el-form-item label="完成模式">
              <el-select v-model="dynamicParallelForm.mode" @change="applyDynamicParallel">
                <el-option label="全部通过" value="ALL" />
                <el-option label="任一通过" value="ANY" />
                <el-option label="按比例通过" value="RATIO" />
                <el-option label="一票否决" value="VETO" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="dynamicParallelForm.mode === 'RATIO'" label="通过比例">
              <el-input-number
                v-model="dynamicParallelForm.ratio"
                :min="1"
                :max="100"
                @change="applyDynamicParallel"
              />
            </el-form-item>
            <el-form-item label="最大分支数">
              <el-input-number
                v-model="dynamicParallelForm.maxBranches"
                :min="1"
                @change="applyDynamicParallel"
              />
            </el-form-item>
            <el-form-item label="空来源处置">
              <el-select v-model="dynamicParallelForm.emptyStrategy" @change="applyDynamicParallel">
                <el-option label="阻断" value="BLOCK" />
                <el-option label="放行" value="PROCEED" />
              </el-select>
            </el-form-item>
            <el-form-item label="无效值处置">
              <el-select
                v-model="dynamicParallelForm.invalidStrategy"
                @change="applyDynamicParallel"
              >
                <el-option label="阻断" value="BLOCK" />
                <el-option label="跳过" value="SKIP" />
              </el-select>
            </el-form-item>
            <el-form-item label="分支语义">
              <div class="participant-picker-row">
                <el-checkbox
                  v-model="dynamicParallelForm.objectSemantic"
                  @change="applyDynamicParallel"
                >
                  {{ t('workflow.branchPerObject') }}
                </el-checkbox>
              </div>
            </el-form-item>
          </template>
          <template v-for="field in genericConfigFields" :key="field.key">
            <!-- BF20261013-022③④：object 型 JSON 配置与「审批人（兼容）」不再渲染
             （审批人统一由「审批人策略」结构化面板承载） -->
            <!-- BF20261013-027：可退回节点=本流程节点多选（不手填） -->
            <el-form-item v-if="field.key === 'returnTargets'" :label="field.label">
              <el-select
                :model-value="returnTargetsValue"
                multiple
                filterable
                clearable
                placeholder="选择节点"
                style="width: 100%"
                @update:model-value="onReturnTargetsChange"
              >
                <el-option
                  v-for="item in returnTargetCandidates"
                  :key="item.id"
                  :label="item.label"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item
              v-else-if="field.key === 'mode' && selectedNode?.type === 'CONSENSUS'"
              :label="field.label"
            >
              <!-- 审查23 D08-B：通过条件按原图分段（全员/比例/人数在前，额外合法条件保留） -->
              <el-radio-group
                class="participant-source-seg"
                :model-value="String(propForm.mode ?? 'ALL')"
                @change="
                  (value: string | number | boolean | undefined) =>
                    onConsensusModeChange(String(value))
                "
              >
                <el-radio-button
                  v-for="option in consensusModeSegments"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
            <template v-else-if="field.key === 'ratio' && selectedNode?.type === 'CONSENSUS'">
              <el-form-item
                v-if="propForm.mode === 'COUNT' || propForm.mode === 'RATIO'"
                :label="consensusRatioLabel"
              >
                <el-input-number
                  :model-value="Number(propForm.ratio ?? 1)"
                  :min="1"
                  :max="propForm.mode === 'RATIO' ? 100 : undefined"
                  @update:model-value="onConsensusRatioChange"
                />
              </el-form-item>
            </template>
            <el-form-item v-else-if="isArrayConfigField(field)" :label="field.label">
              <el-select
                :model-value="configArrayValue(field.key)"
                multiple
                filterable
                clearable
                style="width: 100%"
                @update:model-value="(value: unknown) => onConfigArrayChange(field.key, value)"
              >
                <el-option
                  v-for="option in configArrayOptions(field)"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <small v-if="field.key === 'allowedActions'" class="config-array-hint">
                {{ t('workflow.allowedActionsHint') }}
              </small>
            </el-form-item>
            <el-form-item v-else-if="field.type === 'string'" :label="field.label">
              <el-input
                v-model="propForm[field.key] as string"
                @change="applyProps"
                @blur="applyProps"
              />
            </el-form-item>
            <el-form-item v-else :label="field.label">
              <el-input
                v-model="propForm[field.key] as string"
                @change="applyProps"
                @blur="applyProps"
              />
            </el-form-item>
          </template>
          <el-form-item
            v-if="validationErrors.some((e) => e.nodeKey === selectionId)"
            :label="t('workflow.validationIssues')"
          >
            <el-alert
              v-for="err in validationErrors.filter((e) => e.nodeKey === selectionId)"
              :key="String(err.nodeKey) + err.errorCode"
              type="error"
              :closable="false"
              :title="err.message"
            />
          </el-form-item>
        </el-form>

        <!-- 高级属性 · 监听器配置（定义 config.listeners 元数据；只读展示） -->
        <template v-if="nodeMeta.listeners.length">
          <div class="props-section props-section--advanced">
            {{ t('workflow.listenerSectionTitle') }}
          </div>
          <div
            v-for="(listener, index) in nodeMeta.listeners"
            :key="listener.phase + String(index)"
            class="listener-row"
          >
            <span class="listener-row__phase" :class="'listener-row__phase--' + listener.phase">
              {{
                listener.phase === 'before'
                  ? t('workflow.listenerBefore')
                  : t('workflow.listenerAfter')
              }}
            </span>
            <span class="listener-row__desc">{{ listener.label }}</span>
            <span v-if="listener.bean" class="listener-row__bean">{{ listener.bean }}</span>
            <span class="listener-row__note">{{ listener.note }}</span>
          </div>
          <div class="listener-add">{{ t('workflow.listenerAdd') }}</div>
        </template>
      </template>

      <!-- BF20261013-013：字段属性——该节点对每个表单字段的必填/编辑/隐藏三态 -->
      <DesignerFieldStatesPanel v-else :api="api" />
    </template>
    <el-empty v-else :description="t('workflow.selectNodeToConfigure')" />
  </div>
</template>

<style scoped>
/* ── 右侧属性面板（fixture props：336px 白底 + 18px 标题 + 类型徽标；几何按设计09像素实测） ── */
.designer-props {
  width: 336px;
  flex: 0 0 336px;
  box-sizing: border-box;
  background: #fff;
  border-left: 1px solid #d7deed;
  padding: 19px 24px 22px;
  overflow: auto;
  /* 0.1.7 #36（Owner）：属性面板内所有选择/填写框统一 32px 高（含曾用 small 的控件），
     与 .el-input__inner 30px + 上下各 1px 的行盒口径一致 */
  --el-component-size: 32px;
  --el-component-size-small: 32px;
}
/* 节点13设计：监听器行（before/after 徽标 + bean 名）与添加框 */
.listener-row {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px 12px;
  padding: 13px 12px 21px;
  margin-bottom: 0;
  border: 1px solid #dde3ef;
  border-radius: 8px;
  background: #fff;
}

.listener-row + .listener-row {
  margin-top: 14px;
}

.listener-row__phase {
  min-width: 74px;
  box-sizing: border-box;
  padding: 3.5px 9px;
  font-size: 12px;
  line-height: 15px;
  text-align: left;
  border-radius: 5px;
}

.listener-row__phase--before {
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
}

.listener-row__phase--after {
  color: #15a77f;
  background: #e6f8f2;
}

.listener-row__desc {
  font-size: 13px;
  line-height: 17px;
  color: #5f6f92;
}

.listener-row__bean {
  grid-column: 1 / -1;
  font-size: 13px;
  line-height: 18px;
  color: #1f2a44;
}

.listener-row__note {
  grid-column: 1 / -1;
  font-size: 12px;
  line-height: 16px;
  color: #8c9ab1;
}

.listener-add {
  padding: 7px 12px;
  margin-top: 17px;
  border: 1px solid #ccd5e5;
  border-radius: 7px;
  font-size: 13px;
  line-height: 17px;
  color: #303a55;
}
.props-section {
  font-size: 13px;
  line-height: 19px;
  color: #344164;
  margin: 0 0 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #d7deed;
}
.props-section--advanced {
  margin-bottom: 15px;
}
.props-node-type {
  margin: 0 0 6px;
  color: #8a98b0;
  font-size: 12px;
  line-height: 17px;
}
/* BF20261013-014：节点属性页签——一行占满的分段式切换（替代独立药丸按钮） */
.props-tabs {
  display: flex;
  width: 100%;
  margin: 0 0 16px;
  border: 1px solid #e3e8f4;
  border-radius: 6px;
  overflow: hidden;
  background: #f7f9fe;
}
.props-tab {
  flex: 1 1 0;
  padding: 7px 0;
  border: 0;
  background: transparent;
  color: #8795ad;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.props-tab + .props-tab {
  border-left: 1px solid #e3e8f4;
}
.props-tab.is-active {
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-weight: 500;
}
.designer-props :deep(.el-form-item) {
  margin-bottom: 17.5px;
}
.designer-props :deep(.el-form-item__label) {
  color: #8795ad !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: 17px;
  padding-bottom: 4px;
  margin-bottom: 4px;
}
/* 审查23 D08-B：基础分支标签 14/22 */
.designer-props__basic :deep(.el-form-item__label) {
  font-size: 14px !important;
  line-height: 22px;
}
/* 审查23 D08-B：来源/通过条件分段通栏、32 高（通过条件等共用分段保持连体样式） */
.participant-source-seg {
  display: flex;
  width: 100%;
}
.participant-source-seg .el-radio-button {
  flex: 1 1 0;
}
.participant-source-seg :deep(.el-radio-button__inner) {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 6px;
  line-height: 30px;
}
.designer-props :deep(.el-input.is-disabled .el-input__inner) {
  color: #19233b;
  -webkit-text-fill-color: #19233b;
}
.designer-props :deep(.el-input__wrapper) {
  background: #fbfcff;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #cbd6e8 inset;
}
.designer-props :deep(.el-input__inner) {
  height: 30px;
  color: #19233b;
}
.participant-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.participant-picker-row :deep(.el-button) {
  border-color: #cbd6e8;
  color: var(--sw-color-primary);
  background: #fff;
}
.participant-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 16px;
  color: #99a5bb;
  white-space: normal;
}
.config-array-hint {
  display: block;
  margin-top: 5px;
  color: var(--sw-text-secondary);
  font-size: 11px;
  line-height: 17px;
}
/* 面板内选择/单选组占满 336px 面板宽（与既有输入框对齐） */
.designer-props :deep(.el-select),
.designer-props :deep(.el-radio-group) {
  width: 100%;
}
.designer-props :deep(.el-radio) {
  margin-right: 14px;
}
/* ─────────── P64 阶段Ⅰ：节点表单绑定 / 变量 / 触发器 ─────────── */
.nodeform-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
/* 0.1.7 #36（Owner）：值框占满整行、动作按钮靠右定宽（不再出现「窄框 + 悬浮按钮」） */
.nodeform-row :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
.nodeform-row :deep(.el-button) {
  flex: none;
  margin: 0;
}
/* Q12（278:1567）：操作设置回显行与审批意见表单同构（值框占满、设置按钮靠右） */
.node-op-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.node-op-row :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
.node-op-row :deep(.el-input__wrapper) {
  box-sizing: border-box;
  height: 32px;
}
.node-op-row :deep(.el-button) {
  flex: none;
  margin: 0;
}
</style>
