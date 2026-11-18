<script setup lang="ts">
/**
 * DesignerSubflowWizard — BF20261013-027 发起子流程向导（触发方式 → 子流程 → 初始值）。
 * 0.2.0 Q12（278:1634/1669/1719）：三步共用外壳 1000 宽，控件 32 高、映射表头 34 高
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import type { Ref, ComputedRef } from 'vue'
import type { FormSchemaField } from '@/modules/workflow/api'
import type { SubflowFormDraft, SubflowMappingDraft } from '../composables/use-designer-subflow'

/** 子流程向导绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerSubflowWizardApi {
  /** 向导可见性。 */
  subflowWizardVisible: Ref<boolean>
  /** 当前步骤（0 触发方式 / 1 子流程 / 2 初始值）。 */
  subflowWizardStep: Ref<number>
  /** 三步共用表头。 */
  subflowStepTitles: readonly string[]
  /** 面板草稿（完成时统一落节点配置与触发/等待块）。 */
  subflowForm: Ref<SubflowFormDraft>
  /** 目标子流程绑定表单字段（第③步候选）。 */
  subflowTargetFields: Ref<Array<{ name: string; type: string; label?: string }>>
  /** 步骤推进校验。 */
  subflowStepReady: ComputedRef<boolean>
  /** 当前行是否来自表格列（显示派发粒度）。 */
  subflowHasRowSource: ComputedRef<boolean>
  /** 向导关闭（不隐式改开关）。 */
  onSubflowWizardClose: () => void
  /** 统一脚本编辑弹窗（判断脚本/初始值脚本）。 */
  openProcessScriptDialog: (
    title: string,
    code: string,
    target:
      | { kind: 'triggerDraft' }
      | { kind: 'subflow' }
      | { kind: 'subflowMapping'; mapping: SubflowMappingDraft }
      | { kind: 'expression' }
      | { kind: 'nodeTrigger'; event: string },
  ) => void
  /** 第①步 触发字段变更。 */
  onSubflowTriggerFieldChange: (fieldName: string) => void
  /** 第②步 目标子流程变更。 */
  onSubflowTargetChange: (defKey: string) => void
  /** 第③步 初始值映射行增删与来源切换。 */
  addSubflowMapping: () => void
  removeSubflowMapping: (index: number) => void
  onSubflowMappingSourceChange: (mapping: SubflowMappingDraft) => void
  subflowMappingSourceValue: (mapping: SubflowMappingDraft) => string
  onSubflowMappingFieldChange: (mapping: SubflowMappingDraft, value: string) => void
  /** 结果回写映射行（行级/主记录）。 */
  addSubflowWbRow: (kind: 'row' | 'main') => void
  removeSubflowWbRow: (kind: 'row' | 'main', index: number) => void
  /** 完成（应用并关闭）。 */
  finishSubflowWizard: () => void
  /** 主表单字段（触发字段/来源字段候选）。 */
  mainFormFields: Ref<Array<{ name: string; type: string; label?: string }>>
  /** 表格字段候选（来源分组）。 */
  tableFieldOptions: ComputedRef<FormSchemaField[]>
  /** 已发布目标选项（第②步候选）。 */
  publishedTargetOptions: Ref<{
    defs: Array<{ key: string; name: string; formKey?: string }>
    forms: Array<{ key: string; name: string }>
  }>
}

const props = defineProps<{
  api: DesignerSubflowWizardApi
}>()

const {
  subflowWizardVisible,
  subflowWizardStep,
  subflowStepTitles,
  subflowForm,
  subflowTargetFields,
  subflowStepReady,
  subflowHasRowSource,
  onSubflowWizardClose,
  openProcessScriptDialog,
  onSubflowTriggerFieldChange,
  onSubflowTargetChange,
  addSubflowMapping,
  removeSubflowMapping,
  onSubflowMappingSourceChange,
  subflowMappingSourceValue,
  onSubflowMappingFieldChange,
  addSubflowWbRow,
  removeSubflowWbRow,
  finishSubflowWizard,
  mainFormFields,
  tableFieldOptions,
  publishedTargetOptions,
} = props.api
</script>

<template>
  <!-- ═══ BF20261013-027：发起子流程向导（触发方式 → 子流程 → 初始值）。
     0.2.0 Q12（278:1634/1669/1719）：三步共用外壳 1000 宽，控件 32 高、映射表头 34 高。 ═══ -->
  <el-dialog
    v-model="subflowWizardVisible"
    title="发起子流程"
    width="min(1000px, 94vw)"
    class="p64-dialog subflow-wizard"
    append-to-body
    @close="onSubflowWizardClose"
  >
    <div class="subflow-steps" data-testid="subflow-steps">
      <span
        v-for="(stepTitle, stepIndex) in subflowStepTitles"
        :key="stepTitle"
        class="subflow-step"
        :class="{ 'is-active': subflowWizardStep === stepIndex }"
        >{{ stepIndex + 1 }} {{ stepTitle }}</span
      >
    </div>

    <!-- 第①步：触发方式（始终发起 / 写脚本 / 选字段） -->
    <el-form v-show="subflowWizardStep === 0" label-position="top">
      <el-form-item label="触发方式">
        <el-radio-group v-model="subflowForm.triggerMode">
          <el-radio value="ALWAYS">始终发起</el-radio>
          <el-radio value="SCRIPT">写脚本</el-radio>
          <el-radio value="FIELD">选字段</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="subflowForm.triggerMode === 'SCRIPT'" label="是否发起判断脚本">
        <div class="participant-picker-row">
          <el-button
            @click="
              openProcessScriptDialog('是否发起判断脚本', subflowForm.script, { kind: 'subflow' })
            "
          >
            {{ subflowForm.script?.trim() ? '编辑脚本' : '编写脚本' }}
          </el-button>
          <small v-if="subflowForm.script?.trim()" class="participant-hint"> 已配置 </small>
        </div>
      </el-form-item>
      <el-form-item
        v-else-if="subflowForm.triggerMode === 'FIELD'"
        label="触发字段（字段值为真即发起）"
      >
        <el-select
          v-model="subflowForm.triggerField"
          filterable
          placeholder="选择主表单字段"
          style="width: 100%"
          @change="onSubflowTriggerFieldChange"
        >
          <el-option
            v-for="field in mainFormFields"
            :key="field.name"
            :label="field.label || '未命名字段'"
            :value="field.name"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <!-- 第②步：选择子流程 -->
    <el-form v-show="subflowWizardStep === 1" label-position="top">
      <el-form-item label="子流程">
        <el-select
          v-model="subflowForm.targetProcessDefKey"
          filterable
          placeholder="选择流程"
          style="width: 100%"
          @change="onSubflowTargetChange"
        >
          <el-option
            v-for="item in publishedTargetOptions.defs"
            :key="item.key"
            :label="item.name || '未命名流程'"
            :value="item.key"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <!-- 第③步：初始值（脚本 / 选字段 / 自由填写）+ 汇总/单独 -->
    <div v-show="subflowWizardStep === 2">
      <div class="p64-toolbar">
        <span class="p64-subtitle">初始值（带入子流程表单）</span>
        <el-button @click="addSubflowMapping">添加一行</el-button>
      </div>
      <!-- Q12（278:1669）：初始值映射为 34 高表头 + 32 高控件行 -->
      <div class="subflow-map">
        <div class="subflow-map__head" data-testid="subflow-map-head">
          <span>子流程表单字段</span>
          <span>取值方式</span>
          <span>取值</span>
          <span class="subflow-map__op">操作</span>
        </div>
        <div
          v-for="(mapping, mappingIndex) in subflowForm.mappings"
          :key="mappingIndex"
          class="subflow-map__row"
        >
          <el-select
            v-model="mapping.targetField"
            class="subflow-map__control"
            filterable
            placeholder="选择字段"
          >
            <el-option
              v-for="field in subflowTargetFields"
              :key="field.name"
              :label="field.label || '未命名字段'"
              :value="field.name"
            />
          </el-select>
          <el-select
            v-model="mapping.source"
            class="subflow-map__control"
            @change="onSubflowMappingSourceChange(mapping)"
          >
            <el-option label="选字段" value="FIELD" />
            <el-option label="自由填写" value="LITERAL" />
            <el-option label="脚本" value="SCRIPT" />
          </el-select>
          <el-select
            v-if="mapping.source === 'FIELD'"
            :model-value="subflowMappingSourceValue(mapping)"
            class="subflow-map__control"
            filterable
            placeholder="选择来源字段"
            @change="(value: string) => onSubflowMappingFieldChange(mapping, value)"
          >
            <el-option-group label="主表单字段">
              <el-option
                v-for="field in mainFormFields"
                :key="`main:${field.name}`"
                :label="field.label || '未命名字段'"
                :value="`main:${field.name}`"
              />
            </el-option-group>
            <el-option-group
              v-for="table in tableFieldOptions"
              :key="table.name"
              :label="table.label || '未命名表格'"
            >
              <el-option
                v-for="column in table.subFields ?? []"
                :key="`table:${table.name}:${column.name}`"
                :label="column.label || '未命名字段'"
                :value="`table:${table.name}:${column.name}`"
              />
            </el-option-group>
          </el-select>
          <el-input
            v-else-if="mapping.source === 'LITERAL'"
            v-model="mapping.literal"
            class="subflow-map__control"
            placeholder="自由填写"
          />
          <div v-else class="participant-picker-row subflow-map__control">
            <el-button
              @click="
                openProcessScriptDialog('初始值脚本', mapping.script, {
                  kind: 'subflowMapping',
                  mapping,
                })
              "
            >
              {{ mapping.script.trim() ? '编辑脚本' : '编写脚本' }}
            </el-button>
          </div>
          <el-button link type="danger" @click="removeSubflowMapping(mappingIndex)">删除</el-button>
        </div>
      </div>
      <el-form-item v-if="subflowHasRowSource" label="派发粒度">
        <el-radio-group v-model="subflowForm.aggregate">
          <el-radio value="EACH">单独（逐行各发一条）</el-radio>
          <el-radio value="GROUPED">汇总（相同值合并一条）</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-divider />
      <div class="p64-grid">
        <el-form-item label="编排方式">
          <el-radio-group v-model="subflowForm.orchestration">
            <el-radio value="CHILD">主子流程</el-radio>
            <el-radio value="INDEPENDENT">独立关联</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="subflowForm.orchestration === 'CHILD'" label="等待策略">
          <el-select v-model="subflowForm.waitPolicy">
            <el-option label="全部完成" value="ALL" />
            <el-option label="任一完成" value="ANY" />
            <el-option label="达到数量" value="COUNT" />
            <el-option label="不等待" value="NONE" />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="subflowForm.orchestration === 'CHILD' && subflowForm.waitPolicy === 'COUNT'"
          label="等待数量"
        >
          <el-input-number v-model="subflowForm.waitCount" :min="1" :max="200" />
        </el-form-item>
        <el-form-item v-if="subflowForm.orchestration === 'CHILD'" label="结果回写">
          <el-switch v-model="subflowForm.wbEnabled" />
        </el-form-item>
      </div>
      <template v-if="subflowForm.orchestration === 'CHILD' && subflowForm.wbEnabled">
        <div class="p64-grid">
          <el-form-item label="结果节点">
            <el-input
              v-model="subflowForm.wbResultNodeKey"
              placeholder="子流程中产出结果的节点（如 node_result）"
            />
          </el-form-item>
          <el-form-item label="子表单结果表">
            <el-input
              v-model="subflowForm.wbTableField"
              placeholder="行级回写时填写（子表单里的表格字段）"
            />
          </el-form-item>
          <el-form-item label="来源行标识列">
            <el-input v-model="subflowForm.wbRowKeyField" placeholder="记录来源行标识的列名" />
          </el-form-item>
          <el-form-item label="本表单的来源表">
            <el-select v-model="subflowForm.wbParentTableField" filterable clearable>
              <el-option
                v-for="table in tableFieldOptions"
                :key="table.name"
                :label="table.label || table.name"
                :value="table.name"
              />
            </el-select>
          </el-form-item>
        </div>
        <div class="p64-toolbar">
          <span class="p64-subtitle">行级回写</span>
          <el-button @click="addSubflowWbRow('row')">添加一行</el-button>
        </div>
        <div class="subflow-map subflow-map--wb">
          <div class="subflow-map__head" data-testid="subflow-wb-row-head">
            <span>子流程字段</span>
            <span>本表单字段</span>
            <span class="subflow-map__op">操作</span>
          </div>
          <div
            v-for="(row, rowIndex) in subflowForm.wbFields"
            :key="`wb-row-${rowIndex}`"
            class="subflow-map__row"
          >
            <el-input
              v-model="row.fromField"
              class="subflow-map__control"
              placeholder="子流程结果字段/列"
            />
            <el-input
              v-model="row.toField"
              class="subflow-map__control"
              placeholder="本表单回写字段/列"
            />
            <el-button link type="danger" @click="removeSubflowWbRow('row', rowIndex)"
              >删除</el-button
            >
          </div>
        </div>
        <div class="p64-toolbar">
          <span class="p64-subtitle">主记录回写</span>
          <el-button @click="addSubflowWbRow('main')">添加一行</el-button>
        </div>
        <div class="subflow-map subflow-map--wb">
          <div class="subflow-map__head" data-testid="subflow-wb-main-head">
            <span>子流程字段</span>
            <span>本表单字段</span>
            <span class="subflow-map__op">操作</span>
          </div>
          <div
            v-for="(row, rowIndex) in subflowForm.wbMainFields"
            :key="`wb-main-${rowIndex}`"
            class="subflow-map__row"
          >
            <el-input
              v-model="row.fromField"
              class="subflow-map__control"
              placeholder="子流程结果字段"
            />
            <el-input v-model="row.toField" class="subflow-map__control" placeholder="本表单字段" />
            <el-button link type="danger" @click="removeSubflowWbRow('main', rowIndex)"
              >删除</el-button
            >
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <el-button @click="subflowWizardVisible = false">取消</el-button>
      <el-button v-if="subflowWizardStep > 0" @click="subflowWizardStep--">上一步</el-button>
      <el-button
        v-if="subflowWizardStep < 2"
        type="primary"
        :disabled="!subflowStepReady"
        @click="subflowWizardStep++"
        >下一步</el-button
      >
      <el-button v-else type="primary" @click="finishSubflowWizard">完成</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* ── P64 工具条/分区（与变量/触发器弹窗同源；随弹窗模板迁入本组件） ── */
.p64-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.p64-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-color-primary);
}

.p64-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  column-gap: 16px;
}

/* ── 参与人面板共用行样式副本（随向导模板迁入本组件） ── */
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
</style>

<!-- P64 弹窗可达性全局规则：append-to-body 传送后不带 scoped 属性，需全局选择器。 -->
<style>
/* ═══ 0.2.0 Q12（278:1634/1669/1719）：子流程三步共用窗——1000 宽、控件 32 高、表头 34 高。
   三步仍为既有触发方式/子流程/初始值，只调整共用外壳尺寸。 ═══ */
.el-dialog.subflow-wizard .subflow-steps {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 34px;
  margin-bottom: 16px;
}
.subflow-step {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 34px;
  color: var(--sw-color-primary, #2563eb);
}
.subflow-step.is-active {
  background: var(--sw-color-primary, #2563eb);
  color: #fff;
}
.subflow-wizard .el-input__wrapper,
.subflow-wizard .el-select__wrapper,
.subflow-wizard .el-textarea__inner {
  box-sizing: border-box;
  min-height: 32px;
  height: 32px;
}
.subflow-wizard .el-input-number {
  box-sizing: border-box;
  height: 32px;
}
.subflow-wizard .el-form-item {
  margin-bottom: 16px;
}
.subflow-map {
  margin-bottom: 8px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 6px;
  overflow: hidden;
}
.subflow-map__head,
.subflow-map__row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 160px minmax(220px, 1.2fr) 60px;
  column-gap: 12px;
  align-items: center;
}
.subflow-map--wb .subflow-map__head,
.subflow-map--wb .subflow-map__row {
  grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr) 60px;
}
.subflow-map__head {
  box-sizing: border-box;
  height: 34px;
  padding: 0 12px;
  background: #f4f6fb;
  font-size: 13px;
  line-height: 34px;
  color: #7c8390;
}
.subflow-map__row {
  padding: 8px 12px;
  border-top: 1px solid #eef1f7;
}
.subflow-map__control {
  width: 100%;
}
.subflow-map__op {
  color: #7c8390;
}
</style>
