<script setup lang="ts">
/**
 * DesignerParticipantPanel — P63 参与人结构化面板（APPROVAL/CONSENSUS）：
 * 审批人来源分段 + 按策略取值编辑（自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { ArrowDown } from '@element-plus/icons-vue'
import WorkspaceFieldPickerDialog from './WorkspaceFieldPickerDialog.vue'
import type { Ref, ComputedRef } from 'vue'
import type { BpmNodeConfigField } from '@/contracts/bpm-node'
import type { FormSchemaField } from '@/modules/workflow/api'
import type { ParticipantFormDraft } from '@/modules/workflow/utils/node-capabilities'

/** 参与人面板绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerParticipantPanelApi {
  /** 参与人字段（能力 configFields 命中的 participant/approver/兼容字段）。 */
  participantField: ComputedRef<BpmNodeConfigField | null>
  /** 参与人面板草稿。 */
  participantForm: Ref<ParticipantFormDraft>
  /** 面板提交（写入 participant 配置）。 */
  applyParticipant: () => void
  /** 主行分段（指定人员/表单组件/表达式）。 */
  participantMainSourceSegments: ComputedRef<Array<{ value: string; label: string }>>
  /** 次级分段（角色/部门/岗位等额外合法策略）。 */
  participantExtraSourceSegments: ComputedRef<Array<{ value: string; label: string }>>
  /** 次级来源展开态。 */
  participantExtraSourcesOpen: Ref<boolean>
  /** 打开主字段 680 分组选择窗（提示32 Q17）。 */
  openParticipantFieldPicker: () => void
  /** 打开人员多选。 */
  openParticipantUserPicker: () => void
  /** 节点 config 元数据（approverName 只读回显）。 */
  nodeMeta: ComputedRef<{
    nodeKey: string
    approveMode: string
    approveModeLabel: string
    approverName: string
    listeners: Array<{ phase: string; label: string; bean: string; note: string }>
  }>
  /** 打开部门多选。 */
  openParticipantDeptPicker: () => void
  /** 主字段分组选择窗可见性。 */
  participantFieldPickerVisible: Ref<boolean>
  /** 主字段分组候选。 */
  participantFieldPickerGroups: ComputedRef<
    Array<{
      key: string
      label: string
      tag?: string
      fields: Array<{ name: string; label: string; type: string }>
    }>
  >
  /** 选择窗提示文案。 */
  participantFieldHint: ComputedRef<string>
  /** 主字段回显。 */
  participantFieldDisplay: ComputedRef<string>
  /** 主字段选定回写。 */
  onParticipantFieldPicked: (fieldName: string, groupKey: string) => void
  /** 表格字段候选。 */
  tableFieldOptions: ComputedRef<FormSchemaField[]>
  /** 选中表格的列候选。 */
  tableColumnOptionsFor: (tableField: string, objectType: string) => FormSchemaField[]
  /** 图节点清单（NODE_FORM_AGGREGATE 来源节点候选）。 */
  graphNodes: ComputedRef<Array<{ id: string; type: string; name: string }>>
  /** 节点选项文案。 */
  graphNodeLabel: (node: { id: string; name: string }) => string
  /** 主表字段候选（按对象类型过滤）。 */
  mainFieldOptionsFor: (objectType: string) => FormSchemaField[]
  /** 表达式摘要（288×32 只读槽）。 */
  participantExpressionSummary: ComputedRef<string>
  /** 表达式已配置。 */
  participantExpressionConfigured: ComputedRef<boolean>
  /** 打开表达式脚本弹窗。 */
  openExpressionScriptDialog: () => void
  /** 旧数据兼容提示。 */
  participantLegacyNote: ComputedRef<string>
}

const props = defineProps<{
  api: DesignerParticipantPanelApi
}>()

const {
  participantForm,
  applyParticipant,
  participantMainSourceSegments,
  participantExtraSourceSegments,
  participantExtraSourcesOpen,
  openParticipantUserPicker,
  nodeMeta,
  openParticipantDeptPicker,
  openParticipantFieldPicker,
  participantFieldPickerVisible,
  participantFieldPickerGroups,
  participantFieldHint,
  participantFieldDisplay,
  onParticipantFieldPicked,
  tableFieldOptions,
  tableColumnOptionsFor,
  graphNodes,
  graphNodeLabel,
  mainFieldOptionsFor,
  participantExpressionSummary,
  participantExpressionConfigured,
  openExpressionScriptDialog,
  participantLegacyNote,
} = props.api
</script>

<template>
  角色/部门/岗位等额外合法策略移入次级切换，展开后仍可达（32 高）。 -->
  <el-form-item label="审批人来源">
    <div class="participant-source-area">
      <el-radio-group
        v-model="participantForm.strategy"
        class="participant-source-seg participant-source-seg--split"
        @change="() => applyParticipant()"
      >
        <el-radio-button
          v-for="option in participantMainSourceSegments"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </el-radio-button>
      </el-radio-group>
      <div v-if="participantExtraSourceSegments.length > 0" class="participant-source-extra">
        <el-radio-group
          v-show="participantExtraSourcesOpen"
          v-model="participantForm.strategy"
          class="participant-source-seg participant-source-seg--split"
          @change="() => applyParticipant()"
        >
          <el-radio-button
            v-for="option in participantExtraSourceSegments"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </el-radio-button>
        </el-radio-group>
        <button
          type="button"
          class="participant-source-extra__toggle"
          @click="participantExtraSourcesOpen = !participantExtraSourcesOpen"
        >
          {{
            participantExtraSourcesOpen
              ? '收起其他来源'
              : `其他来源（${participantExtraSourceSegments
                  .map((option) => option.label)
                  .join('/')}）`
          }}
          <el-icon
            class="participant-source-extra__arrow"
            :class="{ 'is-open': participantExtraSourcesOpen }"
          >
            <ArrowDown />
          </el-icon>
        </button>
      </div>
    </div>
  </el-form-item>
  <!-- FIXED_USER：人员多选（复用审批人候选弹窗人员页签；id 数组保持精度） -->
  <el-form-item v-if="participantForm.strategy === 'FIXED_USER'" label="指定人员">
    <div class="participant-picker-row">
      <el-button @click="openParticipantUserPicker">
        {{
          participantForm.userIds.length > 0
            ? `已选 ${participantForm.userIds.length} 人（点击修改）`
            : '选择审批人'
        }}
      </el-button>
      <small v-if="nodeMeta.approverName" class="participant-hint">
        {{ nodeMeta.approverName }}
      </small>
    </div>
  </el-form-item>
  <!-- DEPT_LEADER：部门多选（复用弹窗部门树勾选，运行期服务端解析唯一负责人） -->
  <el-form-item v-else-if="participantForm.strategy === 'DEPT_LEADER'" label="部门多选">
    <el-button @click="openParticipantDeptPicker">
      {{
        participantForm.deptIds.length > 0
          ? `已选 ${participantForm.deptIds.length} 个部门（点击修改）`
          : '选择部门'
      }}
    </el-button>
  </el-form-item>
  <!-- FORM_FIELD：来源表单（objectType + scope + 字段绑定） -->
  <template v-else-if="participantForm.strategy === 'FORM_FIELD'">
    <el-form-item label="对象类型">
      <el-radio-group v-model="participantForm.formField.objectType" @change="applyParticipant">
        <el-radio value="USER">人员（所选人员审批）</el-radio>
        <el-radio value="DEPT">部门（解析唯一负责人）</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="取值范围">
      <el-radio-group v-model="participantForm.formField.scope" @change="applyParticipant">
        <el-radio value="MAIN">主表字段</el-radio>
        <el-radio value="TABLE">表格字段</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="主字段">
      <!-- 提示32 Q17（574:27788）：主字段改 680 分组选择窗入口，真实候选与选中回显 -->
      <button
        type="button"
        class="participant-field-trigger"
        data-testid="participant-field-trigger"
        @click="openParticipantFieldPicker"
      >
        <span class="participant-field-trigger__name">
          {{
            participantFieldDisplay ||
            (participantForm.formField.scope === 'TABLE' ? '选择表格字段' : '选择主表字段')
          }}
        </span>
        <span class="participant-field-trigger__action">选择</span>
      </button>
      <WorkspaceFieldPickerDialog
        v-model="participantFieldPickerVisible"
        :groups="participantFieldPickerGroups"
        compact
        :hint="participantFieldHint"
        :current-field="participantForm.formField.field || null"
        title="选择表单组件"
        @select-group="onParticipantFieldPicked"
      />
    </el-form-item>
    <template v-if="participantForm.formField.scope === 'TABLE'">
      <el-form-item label="表格字段">
        <el-select
          v-model="participantForm.formField.tableField"
          filterable
          placeholder="选择表格字段"
          @change="
            () => {
              participantForm.formField.column = ''
              applyParticipant()
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
          v-model="participantForm.formField.column"
          filterable
          placeholder="选择表格列"
          @change="applyParticipant"
        >
          <el-option
            v-for="option in tableColumnOptionsFor(
              participantForm.formField.tableField,
              participantForm.formField.objectType,
            )"
            :key="option.name"
            :label="option.label || '未命名字段'"
            :value="option.name"
          />
        </el-select>
      </el-form-item>
    </template>
  </template>
  <!-- NODE_FORM_AGGREGATE：来源节点 + 人员字段 + 轮次口径（P64 A07 聚合会签） -->
  <template v-else-if="participantForm.strategy === 'NODE_FORM_AGGREGATE'">
    <el-form-item label="来源节点">
      <el-select
        v-model="participantForm.aggregate.nodeKey"
        filterable
        placeholder="选择来源节点（读取该节点本轮全部有效最终提交）"
        @change="applyParticipant"
      >
        <el-option
          v-for="node in graphNodes"
          :key="node.id"
          :label="graphNodeLabel(node)"
          :value="node.id"
        />
      </el-select>
    </el-form-item>
    <el-form-item label="人员字段">
      <el-select
        v-model="participantForm.aggregate.formField"
        filterable
        allow-create
        placeholder="选择或填写人员字段名（并集去重生成下一轮参与人）"
        @change="applyParticipant"
      >
        <el-option
          v-for="option in mainFieldOptionsFor('USER')"
          :key="option.name"
          :label="option.label || '未命名字段'"
          :value="option.name"
        />
      </el-select>
    </el-form-item>
    <el-form-item label="轮次口径">
      <el-radio-group v-model="participantForm.aggregate.round" @change="applyParticipant">
        <el-radio value="">当前轮（缺省）</el-radio>
        <el-radio value="PREVIOUS">上一轮</el-radio>
      </el-radio-group>
    </el-form-item>
  </template>
  <!-- BF20261013-022②④：表达式走脚本弹窗；ROLE/POST 保留逗号取值 -->
  <el-form-item v-else-if="participantForm.strategy === 'EXPRESSION'" label="表达式（脚本）">
    <!-- 提示32 Q54（572:26514）：288×32 只读摘要/状态槽 + 既有编写脚本入口 -->
    <div class="participant-script">
      <el-input
        class="participant-script__summary"
        :model-value="participantExpressionSummary"
        readonly
        data-testid="participant-script-summary"
      />
      <div class="participant-script__status-row">
        <small class="participant-hint" data-testid="participant-script-status">
          {{ participantExpressionConfigured ? '已配置' : '未配置' }}
        </small>
        <el-button
          class="participant-script__edit"
          data-testid="participant-script-edit"
          @click="openExpressionScriptDialog"
        >
          {{ participantExpressionConfigured ? '编辑脚本' : '编写脚本' }}
        </el-button>
      </div>
    </div>
  </el-form-item>
  <el-form-item v-else label="取值">
    <el-input
      v-model="participantForm.genericValue"
      placeholder="多个取值用英文逗号分隔"
      @change="applyParticipant"
      @blur="applyParticipant"
    />
  </el-form-item>
  <el-alert
    v-if="participantLegacyNote"
    :title="participantLegacyNote"
    type="info"
    :closable="false"
    class="participant-legacy-note"
  />
</template>

<style scoped>
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
/* 审查28 D08-B：来源主行按原图拆为三枚独立分段（等宽 + 8px 间隔），32 高单行；
 * 仅修饰来源分段（--split），不改变共用 participant-source-seg（通过条件）的连体几何。 */
.participant-source-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.participant-source-seg--split {
  gap: 8px;
}
.participant-source-seg--split :deep(.el-radio-button) {
  flex: 1 1 0;
  min-width: 0;
}
.participant-source-seg--split :deep(.el-radio-button__inner) {
  border-radius: 6px;
  border: 1px solid #cbd6e8;
  box-shadow: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.participant-source-seg--split :deep(.el-radio-button__original:checked + .el-radio-button__inner) {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  box-shadow: none;
}
/* 次级来源切换：展开后与主行同构（32 高），收起时仅留一行低键量切换入口 */
.participant-source-extra {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.participant-source-extra__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  line-height: 18px;
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.participant-source-extra__toggle:hover {
  color: var(--sw-color-primary);
}
.participant-source-extra__arrow {
  font-size: 12px;
  transition: transform 0.2s ease;
}
.participant-source-extra__arrow.is-open {
  transform: rotate(180deg);
}

.participant-field-trigger {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #cbd6e8;
  border-radius: 6px;
  background: #fbfcff;
  cursor: pointer;
}
.participant-field-trigger:hover {
  border-color: var(--sw-color-primary);
}
.participant-field-trigger__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #19233b;
  font-size: 13px;
  text-align: left;
}
.participant-field-trigger__action {
  flex: 0 0 auto;
  color: var(--sw-color-primary);
  font-size: 12px;
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

/* 提示32 Q54：EXPRESSION 脚本摘要 288×32，状态行左侧状态/右侧 88×32 编辑入口 */
.participant-script {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.participant-script__summary {
  width: 288px;
  max-width: 100%;
}
.participant-script__status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.participant-script__status-row .participant-hint {
  margin-top: 0;
}
.participant-script__edit {
  width: 88px;
  height: 32px;
  padding: 0;
  border-color: #cbd6e8;
  color: var(--sw-color-primary);
  background: #fff;
}

.participant-legacy-note {
  margin-bottom: 15px;
}
</style>
