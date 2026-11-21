<script setup lang="ts">
/**
 * DesignerDynamicParallelSettingsDialog — Q11（273:1332）动态并行 820 设置面。
 * 复用 node-op-dialog 几何（820 宽、32 高控件、原底栏 80×32）；编辑只写本地草稿，
 * 取消丢弃，确定写回面板并落节点配置（自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { useI18n } from '@/locales'
import type { Ref, ComputedRef } from 'vue'
import type { FormSchemaField } from '@/modules/workflow/api'
import type { DynamicParallelFormDraft } from '@/modules/workflow/utils/node-capabilities'

const { t } = useI18n()

/** 动态并行设置弹窗绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerDynamicParallelSettingsDialogApi {
  /** 弹窗可见性。 */
  dpSettingsVisible: Ref<boolean>
  /** 弹窗内本地草稿（取消丢弃、确定写回面板）。 */
  dpDraft: Ref<DynamicParallelFormDraft>
  /** 打开人员候选弹窗（草稿内直接选择）。 */
  openDynamicUserPicker: () => void
  /** 打开部门候选弹窗。 */
  openDynamicDeptPicker: () => void
  /** 主表字段候选（按对象类型过滤）。 */
  mainFieldOptionsFor: (objectType: string) => FormSchemaField[]
  /** 表格字段候选。 */
  tableFieldOptions: ComputedRef<FormSchemaField[]>
  /** 选中表格的列候选。 */
  tableColumnOptionsFor: (tableField: string, objectType: string) => FormSchemaField[]
  /** 草稿内联动：换表格字段清列。 */
  onDpDraftTableFieldChange: () => void
  /** 草稿内联动：选列回填来源。 */
  onDpDraftColumnChange: () => void
  /** 草稿内联动：切对象类型清取值。 */
  onDpDraftObjectTypeChange: () => void
  /** 确定：写回面板并落节点配置。 */
  confirmDpSettings: () => void
}

const props = defineProps<{
  api: DesignerDynamicParallelSettingsDialogApi
}>()

const {
  dpSettingsVisible,
  dpDraft,
  openDynamicUserPicker,
  openDynamicDeptPicker,
  mainFieldOptionsFor,
  tableFieldOptions,
  tableColumnOptionsFor,
  onDpDraftTableFieldChange,
  onDpDraftColumnChange,
  onDpDraftObjectTypeChange,
  confirmDpSettings,
} = props.api
</script>

<template>
  <!-- ═══ Q11（273:1332）：动态并行 820 设置面。复用 node-op-dialog 几何（820 宽、
     32 高控件、原底栏 80×32）；编辑只写本地草稿，取消丢弃，确定写回面板并落节点配置。 ═══ -->
  <el-dialog
    v-model="dpSettingsVisible"
    title="并行分支设置"
    width="820px"
    class="node-op-dialog dynamic-parallel-dialog"
    append-to-body
  >
    <div class="node-op-dialog__body dynamic-parallel-dialog__body">
      <el-form label-position="top" class="dynamic-parallel-dialog__form">
        <el-form-item label="分支来源类型">
          <el-select v-model="dpDraft.sourceType" data-testid="dp-dialog-source-type">
            <el-option label="表单字段" value="FORM_FIELD" />
            <el-option label="流程变量" value="VARIABLE" />
            <el-option label="固定值" value="FIXED" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="dpDraft.sourceType === 'FIXED'" label="固定值">
          <div v-if="dpDraft.objectSemantic" class="participant-picker-row">
            <el-button v-if="dpDraft.objectType === 'USER'" @click="openDynamicUserPicker">
              {{
                dpDraft.sourceValue
                  ? `已选 ${dpDraft.sourceValue.split(',').filter(Boolean).length} 人（点击修改）`
                  : '选择人员'
              }}
            </el-button>
            <el-button v-else @click="openDynamicDeptPicker">
              {{
                dpDraft.sourceValue
                  ? `已选 ${dpDraft.sourceValue.split(',').filter(Boolean).length} 个部门（点击修改）`
                  : '选择部门'
              }}
            </el-button>
          </div>
          <el-input v-else v-model="dpDraft.sourceValue" placeholder="多个取值用英文逗号分隔" />
        </el-form-item>
        <el-form-item v-else-if="dpDraft.sourceType === 'VARIABLE'" label="变量名">
          <el-input v-model="dpDraft.sourceValue" placeholder="请输入变量名" />
        </el-form-item>
        <el-form-item v-else-if="dpDraft.scope === 'MAIN'" label="主字段">
          <el-select v-model="dpDraft.sourceValue" filterable placeholder="选择主表字段">
            <el-option
              v-for="option in mainFieldOptionsFor(dpDraft.objectType)"
              :key="option.name"
              :label="option.label || '未命名字段'"
              :value="option.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="dpDraft.objectSemantic" label="对象类型">
          <el-radio-group v-model="dpDraft.objectType" @change="onDpDraftObjectTypeChange">
            <el-radio value="USER">人员（逐人分支）</el-radio>
            <el-radio value="DEPT">部门（逐部门分支）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="取值范围">
          <el-radio-group v-model="dpDraft.scope">
            <el-radio value="MAIN">主表字段</el-radio>
            <el-radio value="TABLE">表格字段</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="dpDraft.scope === 'TABLE'">
          <el-form-item label="表格字段">
            <el-select
              v-model="dpDraft.tableField"
              filterable
              placeholder="选择表格字段"
              data-testid="dp-dialog-table-field"
              @change="onDpDraftTableFieldChange"
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
              v-model="dpDraft.column"
              filterable
              placeholder="选择表格列"
              data-testid="dp-dialog-table-column"
              @change="onDpDraftColumnChange"
            >
              <el-option
                v-for="option in tableColumnOptionsFor(dpDraft.tableField, dpDraft.objectType)"
                :key="option.name"
                :label="option.label || '未命名字段'"
                :value="option.name"
              />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item label="完成模式">
          <el-select v-model="dpDraft.mode" data-testid="dp-dialog-mode">
            <el-option label="全部通过" value="ALL" />
            <el-option label="任一通过" value="ANY" />
            <el-option label="按比例通过" value="RATIO" />
            <el-option label="一票否决" value="VETO" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="dpDraft.mode === 'RATIO'" label="通过比例">
          <el-input-number v-model="dpDraft.ratio" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="最大分支数">
          <el-input-number v-model="dpDraft.maxBranches" :min="1" />
        </el-form-item>
        <el-form-item label="空来源处置">
          <el-select v-model="dpDraft.emptyStrategy">
            <el-option label="阻断" value="BLOCK" />
            <el-option label="放行" value="PROCEED" />
          </el-select>
        </el-form-item>
        <el-form-item label="无效值处置">
          <el-select v-model="dpDraft.invalidStrategy">
            <el-option label="阻断" value="BLOCK" />
            <el-option label="跳过" value="SKIP" />
          </el-select>
        </el-form-item>
        <el-form-item label="分支语义">
          <div class="participant-picker-row">
            <el-checkbox v-model="dpDraft.objectSemantic">
              {{ t('workflow.branchPerObject') }}
            </el-checkbox>
          </div>
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button data-testid="dp-dialog-cancel" @click="dpSettingsVisible = false">取消</el-button>
      <el-button type="primary" data-testid="dp-dialog-confirm" @click="confirmDpSettings">
        确定
      </el-button>
    </template>
  </el-dialog>

  <!-- P64 弹窗可达性全局规则：append-to-body 传送后不带 scoped 属性，需全局选择器。 -->
  <style>
    /* ═══ Q11（273:1332）：动态并行 820 设置面——复用 node-op-dialog 几何；
     表单纵向可自然增长滚动，控件统一 32 高。 ═══ */
    .el-dialog.dynamic-parallel-dialog {
      display: flex;
      flex-direction: column;
      max-height: 88vh;
      margin-top: 6vh;
      margin-bottom: 6vh;
    }
    .el-dialog.dynamic-parallel-dialog .el-dialog__body {
      overflow: auto;
    }
    .dynamic-parallel-dialog__form .el-form-item {
      margin-bottom: 16px;
    }
    .dynamic-parallel-dialog__form .el-form-item__label {
      margin-bottom: 4px;
      line-height: 22px;
    }
    .dynamic-parallel-dialog__form .el-select,
    .dynamic-parallel-dialog__form .el-input,
    .dynamic-parallel-dialog__form .el-input-number,
    .dynamic-parallel-dialog__form .el-radio-group {
      width: 100%;
    }
    .dynamic-parallel-dialog__form .el-select__wrapper,
    .dynamic-parallel-dialog__form .el-input__wrapper {
      min-height: 32px;
    }
    .dynamic-parallel-dialog__form .el-input__inner {
      height: 32px;
      line-height: 32px;
    }
    .dynamic-parallel-dialog__form .el-input-number {
      height: 32px;
    }
    .dynamic-parallel-dialog__form .el-input-number .el-input__inner {
      text-align: left;
    }
  </style>
</template>

<style scoped>
/* ── 参与人面板共用行样式副本（随弹窗模板迁入本组件） ── */
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
</style>
