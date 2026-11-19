<script setup lang="ts">
import { useI18n } from '@/locales'
import type { FormSchema } from '@/contracts/form-schema'
import DetailDialog from '@/components/DetailDialog.vue'
import type { SnapshotConstraintView } from './published-snapshot'
import { useSnapshotLabels } from './use-snapshot-labels'
import type { FrozenFieldPropRow } from './use-snapshot-field-props'

/**
 * 表单侧只读弹窗集合：字段查看属性（560）、脚本/监听详情（640/1200）、
 * 校验详情（520）、校验规则（800）、TABLE 明细列（1100）。
 * 可见性全部 v-model 由宿主持有；属性行「查看」经 frozen-detail 冒泡。
 */
defineProps<{
  propsDialogField: FormSchema['fields'][number] | null
  propsDialogRows: FrozenFieldPropRow[]
  scriptDetailTitle: string
  scriptDetailMode: 'summary' | 'code'
  scriptDetailMeta: string
  scriptDetailCode: string
  scriptDetailLines: string[]
  validationDetailTitle: string
  validationDetailRow: SnapshotConstraintView | null
  validationRuleRow: SnapshotConstraintView | null
  detailColumnsField: FormSchema['fields'][number] | null
  detailColumnRows: Array<{
    key: string
    label: string
    component: string
    name: string
    width: string
    required: boolean
  }>
}>()

const emit = defineEmits<{
  'frozen-detail': [row: FrozenFieldPropRow]
}>()

const propsDialogVisible = defineModel<boolean>('propsDialogVisible', { required: true })
const scriptDetailVisible = defineModel<boolean>('scriptDetailVisible', { required: true })
const validationDetailVisible = defineModel<boolean>('validationDetailVisible', { required: true })
const validationRuleVisible = defineModel<boolean>('validationRuleVisible', { required: true })
const detailColumnsVisible = defineModel<boolean>('detailColumnsVisible', { required: true })

const { t } = useI18n()
const { validationLabel } = useSnapshotLabels()
</script>

<template>
  <DetailDialog
    v-model="propsDialogVisible"
    :title="t('form.snapshotViewer.propsTitle')"
    width="560px"
    :show-footer="false"
    append-to-body
  >
    <p v-if="propsDialogField" class="snapshot-dialog-meta">
      <code>{{ propsDialogField.name }}</code>
    </p>
    <dl class="snapshot-frozen-props">
      <template v-for="row in propsDialogRows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>
          {{ row.value }}
          <el-button
            v-if="row.detail"
            link
            type="primary"
            size="small"
            @click="emit('frozen-detail', row)"
          >
            {{ t('common.view') }}
          </el-button>
        </dd>
      </template>
    </dl>
  </DetailDialog>
  <!-- Q21（509:18714）：JS 监听脚本 → 1200 宽只读代码窗（冻结全文 + 行号 + 只读标识 + 关闭 80×32）；
       内置动作摘要 → 原有 640 宽短摘要弹窗。两模式同一 DetailDialog 宿主。 -->
  <DetailDialog
    v-model="scriptDetailVisible"
    class="snapshot-script-dialog"
    :title="scriptDetailTitle"
    :width="scriptDetailMode === 'code' ? '1200px' : '640px'"
    :show-footer="scriptDetailMode === 'code'"
    append-to-body
  >
    <template v-if="scriptDetailMode === 'code'">
      <p class="snapshot-dialog-meta snapshot-script-view__meta">
        <span>{{ scriptDetailMeta }}</span>
        <span class="snapshot-script-view__badge">
          {{ t('form.snapshotViewer.readonlyBadge') }}
        </span>
      </p>
      <div class="snapshot-script-code" data-testid="snapshot-script-code">
        <p class="snapshot-script-code__lang">JavaScript</p>
        <div class="snapshot-script-code__lines">
          <div
            v-for="(line, index) in scriptDetailLines"
            :key="index"
            class="snapshot-script-code__line"
          >
            <span class="snapshot-script-code__no">{{ index + 1 }}</span>
            <span class="snapshot-script-code__text">{{ line === '' ? ' ' : line }}</span>
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <p v-if="scriptDetailMeta" class="snapshot-dialog-meta">{{ scriptDetailMeta }}</p>
      <pre class="snapshot-dialog-code">{{ scriptDetailCode }}</pre>
    </template>
  </DetailDialog>

  <DetailDialog
    v-model="validationDetailVisible"
    :title="validationDetailTitle"
    width="520px"
    :show-footer="false"
    append-to-body
  >
    <p v-if="validationDetailRow" class="snapshot-dialog-meta">
      <code>{{ validationDetailRow.path }}</code>
    </p>
    <pre class="snapshot-dialog-code">{{ validationDetailRow?.value }}</pre>
  </DetailDialog>

  <!-- Q22（509:18825）：冻结校验规则查看——800 宽只读窗：规则名 + 只读值（32 高）+ 关闭 80×32；
       不改冻结 JSON / 校验引擎。 -->
  <DetailDialog
    v-model="validationRuleVisible"
    :title="t('form.snapshotViewer.propValidation')"
    width="800px"
    class="snapshot-validation-dialog"
    append-to-body
  >
    <p class="snapshot-dialog-meta snapshot-script-view__meta">
      <span>{{ validationRuleRow ? validationLabel(validationRuleRow.kind) : '' }}</span>
      <span class="snapshot-script-view__badge">
        {{ t('form.snapshotViewer.readonlyBadge') }}
      </span>
    </p>
    <div class="snapshot-validation-value" data-testid="snapshot-validation-value">
      {{ validationRuleRow?.value?.trim() || t('form.snapshotViewer.propNotConfigured') }}
    </div>
  </DetailDialog>

  <!-- Q24（509:18903）：冻结 TABLE 明细列 1100 只读窗——列/组件/标识/宽度/必填取同一冻结 schema -->
  <DetailDialog
    v-model="detailColumnsVisible"
    :title="t('form.snapshotViewer.detailColumnsTitle')"
    width="1100px"
    class="snapshot-detail-columns-dialog"
    append-to-body
  >
    <p class="snapshot-dialog-meta snapshot-script-view__meta">
      <span>{{ detailColumnsField?.label || detailColumnsField?.name }}</span>
      <span class="snapshot-script-view__badge">
        {{ t('form.snapshotViewer.readonlyBadge') }}
      </span>
    </p>
    <p v-if="detailColumnRows.length === 0" class="snapshot-empty">
      {{ t('form.snapshotViewer.propNotConfigured') }}
    </p>
    <table
      v-else
      class="snapshot-table snapshot-detail-columns-table"
      data-testid="snapshot-detail-columns"
    >
      <thead>
        <tr>
          <th>{{ t('form.snapshotViewer.columnName') }}</th>
          <th>{{ t('form.snapshotViewer.columnComponent') }}</th>
          <th>{{ t('form.snapshotViewer.propFieldKey') }}</th>
          <th>{{ t('form.snapshotViewer.width') }}</th>
          <th>{{ t('form.snapshotViewer.required') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in detailColumnRows" :key="row.key">
          <td>{{ row.label }}</td>
          <td>{{ row.component }}</td>
          <td>
            <code>{{ row.name }}</code>
          </td>
          <td>{{ row.width }}</td>
          <td>{{ row.required ? t('common.yes') : t('common.no') }}</td>
        </tr>
      </tbody>
    </table>
  </DetailDialog>
</template>

<style scoped>
.snapshot-dialog-meta {
  margin: 0 0 12px;
  color: var(--sw-text-secondary);
  font-size: 13px;
}

.snapshot-dialog-code {
  margin: 0;
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  color: var(--sw-text-primary);
  font-family: var(--sw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 查看属性只读双列。 */
.snapshot-frozen-props {
  display: grid;
  gap: 10px 16px;
  margin: 0;
  grid-template-columns: max-content minmax(0, 1fr);
}

.snapshot-frozen-props dt {
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.snapshot-frozen-props dd {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--sw-text-regular);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

/* Q21（509:18714）：JS 监听脚本只读代码窗——行号列 + 等宽正文，不提供运行/应用入口。 */
.snapshot-script-view__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.snapshot-script-view__badge {
  flex: 0 0 auto;
  padding: 1px 8px;
  border-radius: 4px;
  background: #fdf6ec;
  color: #b88230;
  font-size: 12px;
  line-height: 18px;
}

.snapshot-script-code {
  box-sizing: border-box;
  padding: 12px 16px 16px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base, 8px);
  background: #fff;
}

.snapshot-script-code__lang {
  margin: 0 0 8px;
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.snapshot-script-code__lines {
  max-height: 56vh;
  overflow: auto;
  color: var(--sw-text-primary);
  font-family: var(--sw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 13px;
  line-height: 22px;
}

.snapshot-script-code__line {
  display: flex;
}

.snapshot-script-code__no {
  flex: 0 0 32px;
  padding-right: 12px;
  color: var(--sw-text-secondary);
  text-align: right;
  user-select: none;
}

.snapshot-script-code__text {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 代码窗 footer「关闭」80×32（509:18714）；teleport 弹层样式落真实弹窗根。 */
:global(.snapshot-script-dialog .el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
  margin: 0;
  padding: 0;
}

/* Q22（509:18825）：校验规则只读窗——32 高只读值框、关闭 80×32（与代码窗同款页脚）。 */
:global(.snapshot-validation-dialog .el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
  margin: 0;
  padding: 0;
}

.snapshot-validation-value {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--sw-border-light);
  border-radius: 4px;
  background: #f7f8fa;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 20px;
  overflow-wrap: anywhere;
  user-select: none;
}

/* Q24（509:18903）：明细列只读窗页脚「关闭」80×32（与既有只读窗同款）。 */
:global(.snapshot-detail-columns-dialog .el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
  margin: 0;
  padding: 0;
}

.snapshot-detail-columns-table th {
  box-sizing: border-box;
  height: 44px;
}

.snapshot-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.snapshot-table th,
.snapshot-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--sw-border-light);
  color: var(--sw-text-regular);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.snapshot-table th {
  background: var(--sw-fill-base);
  color: var(--sw-text-secondary);
  font-weight: 500;
}

.snapshot-table code {
  color: var(--sw-color-primary);
  font-family: var(--el-font-family-mono, monospace);
}

.snapshot-empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
}
</style>
