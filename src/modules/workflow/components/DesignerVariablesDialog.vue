<script setup lang="ts">
/**
 * DesignerVariablesDialog — P64 阶段Ⅰ 流程变量配置弹窗。
 * 审查28 Q10：窗口 960 宽；表头底色带 42 高、行内输入 32 高
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { ListActionsColumn } from '@/components/page-layout'
import type { Ref, ComputedRef } from 'vue'
import {
  BPM_AGGREGATIONS,
  BPM_SYSTEM_FIELDS,
  BPM_VARIABLE_SOURCES,
  BPM_VARIABLE_TYPES,
} from '@/modules/workflow/utils/p64-orchestration'
import type { VariableDraft } from '@/modules/workflow/utils/p64-orchestration'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import type { DesignerGraph } from '../composables/designer-graph'

/** 流程变量弹窗绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerVariablesDialogApi {
  /** 弹窗可见性。 */
  variablesVisible: Ref<boolean>
  /** 图文档（已定义变量表）。 */
  graph: Ref<DesignerGraph | null>
  /** 变量草稿。 */
  variableDraft: Ref<VariableDraft>
  /** 编辑中的变量下标（null=新增）。 */
  variableEditIndex: Ref<number | null>
  /** 草稿校验错误。 */
  variableErrors: Ref<string[]>
  /** 行操作列（编辑/删除）。 */
  variableActions: (row: unknown) => ListAction[]
  /** 重置草稿（新增变量）。 */
  resetVariableDraft: () => void
  /** 校验并保存到图文档。 */
  saveVariable: () => void
  /** 类型/来源/聚合展示名。 */
  VARIABLE_TYPE_LABELS: Record<string, string>
  VARIABLE_SOURCE_LABELS: Record<string, string>
  VARIABLE_AGGREGATION_LABELS: Record<string, string>
  /** 来源表单字段联动回显。 */
  variableSourceFormKey: ComputedRef<string>
  onVariableSourceChange: () => void
  onVariableSourceFieldChange: (fieldName: string) => void
  onVariableSourceNodeChange: (nodeKey: string) => void
  onVariableNodeFieldChange: (fieldName: string) => void
  /** 主表单字段（MAIN_FORM 候选）。 */
  mainFormFields: Ref<Array<{ name: string; type: string; label?: string }>>
  /** 节点业务表单绑定（NODE_FORM 候选）。 */
  nodeFormBindings: ComputedRef<Array<{ nodeKey: string; formKey: string; nodeName: string }>>
  /** 节点表单字段候选。 */
  formFieldOptions: (formKey?: string) => Array<{ name: string; type: string; label?: string }>
}

const props = defineProps<{
  api: DesignerVariablesDialogApi
}>()

const {
  variablesVisible,
  graph,
  variableDraft,
  variableEditIndex,
  variableErrors,
  variableActions,
  resetVariableDraft,
  saveVariable,
  VARIABLE_TYPE_LABELS,
  VARIABLE_SOURCE_LABELS,
  VARIABLE_AGGREGATION_LABELS,
  variableSourceFormKey,
  onVariableSourceChange,
  onVariableSourceFieldChange,
  onVariableSourceNodeChange,
  onVariableNodeFieldChange,
  mainFormFields,
  nodeFormBindings,
  formFieldOptions,
} = props.api
</script>

<template>
  <!-- ═══ P64 阶段Ⅰ：流程变量配置弹窗 ═══ -->
  <!-- 审查28 Q10：窗口 960 宽；表头底色带 42 高、行内输入 32 高（样式见文件尾 p64-dialog 全局块） -->
  <el-dialog
    v-model="variablesVisible"
    title="流程变量"
    width="min(960px, 94vw)"
    class="p64-dialog"
    append-to-body
  >
    <div class="p64-toolbar">
      <el-button size="small" type="primary" @click="resetVariableDraft">新增变量</el-button>
    </div>
    <el-table :data="graph?.variables ?? []" size="small" class="p64-table">
      <el-table-column prop="name" label="变量名称" min-width="200" />
      <!-- B021-012：操作列复用 ListActionsColumn（分隔线 + ⋯ 收纳，宽度钳制） -->
      <ListActionsColumn :actions="variableActions" :width="140" />
    </el-table>
    <el-divider />
    <!-- 审查28 Q10：去掉 small 尺寸（输入框/选择器统一 32 高），配置能力原样保留 -->
    <el-form label-position="top">
      <div class="p64-grid">
        <el-form-item label="变量标识">
          <el-input
            v-model="variableDraft.varId"
            placeholder="var_example"
            :disabled="variableEditIndex !== null"
          />
        </el-form-item>
        <el-form-item label="变量名称">
          <el-input v-model="variableDraft.name" />
        </el-form-item>
        <el-form-item label="变量类型">
          <el-select v-model="variableDraft.type">
            <el-option
              v-for="type in BPM_VARIABLE_TYPES"
              :key="type"
              :label="VARIABLE_TYPE_LABELS[type] ?? type"
              :value="type"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="数据来源">
          <el-select v-model="variableDraft.source" @change="onVariableSourceChange">
            <el-option
              v-for="source in BPM_VARIABLE_SOURCES"
              :key="source"
              :label="VARIABLE_SOURCE_LABELS[source] ?? source"
              :value="source"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="variableDraft.source === 'MAIN_FORM'" label="主表字段">
          <el-select
            v-model="variableDraft.sourceField"
            filterable
            @change="onVariableSourceFieldChange"
          >
            <el-option
              v-for="field in mainFormFields"
              :key="field.name"
              :label="`${field.label || field.name}（${field.name}）`"
              :value="field.name"
            />
          </el-select>
        </el-form-item>
        <template v-else-if="variableDraft.source === 'NODE_FORM'">
          <el-form-item label="来源节点">
            <el-select v-model="variableDraft.sourceNodeKey" @change="onVariableSourceNodeChange">
              <el-option
                v-for="binding in nodeFormBindings"
                :key="binding.nodeKey"
                :label="`${binding.nodeName}（${binding.nodeKey}）`"
                :value="binding.nodeKey"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="节点表单字段">
            <el-select
              v-model="variableDraft.sourceFormField"
              filterable
              @change="onVariableNodeFieldChange"
            >
              <el-option
                v-for="field in formFieldOptions(variableSourceFormKey)"
                :key="field.name"
                :label="`${field.label || field.name}（${field.name}）`"
                :value="field.name"
              />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item v-else label="系统字段">
          <el-select v-model="variableDraft.sourceField" filterable>
            <el-option
              v-for="field in BPM_SYSTEM_FIELDS"
              :key="field"
              :label="field"
              :value="field"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="聚合方式">
          <el-select v-model="variableDraft.aggregation">
            <el-option
              v-for="item in BPM_AGGREGATIONS"
              :key="item"
              :label="VARIABLE_AGGREGATION_LABELS[item] ?? item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="允许空值">
          <el-switch v-model="variableDraft.nullable" />
        </el-form-item>
      </div>
      <div v-if="variableErrors.length" class="p64-errors">
        <p v-for="item in variableErrors" :key="item" role="alert">{{ item }}</p>
      </div>
      <el-button size="small" type="primary" @click="saveVariable">
        {{ variableEditIndex === null ? '添加' : '保存修改' }}
      </el-button>
    </el-form>
  </el-dialog>
</template>

<style scoped>
/* ── P64 弹窗内分区样式（与触发器弹窗同源；随弹窗模板迁入本组件） ── */
.p64-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.p64-table {
  width: 100%;
}
.p64-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  column-gap: 16px;
}
.p64-errors {
  margin: 8px 0;
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
}
.p64-errors p {
  margin: 2px 0;
}
</style>
