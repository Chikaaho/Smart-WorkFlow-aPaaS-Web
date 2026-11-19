<script setup lang="ts">
import { useI18n } from '@/locales'
import type {
  SnapshotNodeAdvancedEntry,
  SnapshotNodeFieldPermissionView,
  SnapshotNodeFieldStateView,
  SnapshotNodeOperationView,
  SnapshotNodeView,
} from './published-snapshot'
import { snapshotValueText } from './published-snapshot'
import { useSnapshotLabels } from './use-snapshot-labels'
import type { SnapshotTriggerRow } from './use-snapshot-settings'

/**
 * 流程侧只读弹窗集合：冻结触发器（1100）、节点字段权限（1100）、节点高级/操作配置（1000）。
 * 可见性与触发器选中行 v-model 由宿主持有。
 */
defineProps<{
  triggerRows: SnapshotTriggerRow[]
  selectedTriggerRow: SnapshotTriggerRow | null
  selectedNode: SnapshotNodeView | null
  nodeFieldStateRows: SnapshotNodeFieldStateView[]
  nodeFieldPermissionRows: SnapshotNodeFieldPermissionView[]
  nodeOperations: SnapshotNodeOperationView
  nodeListeners: Record<string, unknown>[]
  nodeAdvancedEntries: SnapshotNodeAdvancedEntry[]
}>()

const triggerDialogVisible = defineModel<boolean>('triggerDialogVisible', { required: true })
const selectedTriggerKey = defineModel<string | null>('selectedTriggerKey', { required: true })
const nodeFieldPermissionVisible = defineModel<boolean>('nodeFieldPermissionVisible', {
  required: true,
})
const nodeAdvancedVisible = defineModel<boolean>('nodeAdvancedVisible', { required: true })

const { t } = useI18n()
const { principalText, actionLabel } = useSnapshotLabels()
</script>

<template>
  <!-- Q28（509:19394）：冻结触发器 1100 遮罩只读窗——仅真实 trigger 记录，含执行方式/判断脚本；
       复用既有只读弹窗外壳（只读标识 + 关闭 80×32），记录多时正文内部滚动（DetailDialog 72vh） -->
  <DetailDialog
    v-model="triggerDialogVisible"
    :title="t('form.snapshotViewer.triggers')"
    width="1100px"
    class="snapshot-triggers-dialog"
    append-to-body
  >
    <p class="snapshot-dialog-meta snapshot-script-view__meta">
      <span>{{ selectedTriggerRow?.meta || t('form.snapshotViewer.triggers') }}</span>
      <span class="snapshot-script-view__badge">
        {{ t('form.snapshotViewer.readonlyBadge') }}
      </span>
    </p>
    <p v-if="triggerRows.length === 0" class="snapshot-empty">
      {{ t('form.snapshotViewer.triggerMissing') }}
    </p>
    <template v-else>
      <table class="snapshot-table snapshot-trigger-table" data-testid="snapshot-trigger-table">
        <thead>
          <tr>
            <th>{{ t('form.snapshotViewer.listenerName') }}</th>
            <th>{{ t('form.snapshotViewer.listenerTiming') }}</th>
            <th>{{ t('form.snapshotViewer.triggerNode') }}</th>
            <th>{{ t('form.snapshotViewer.triggerAction') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in triggerRows"
            :key="row.key"
            :class="{ 'is-selected': selectedTriggerRow?.key === row.key }"
            @click="selectedTriggerKey = row.key"
          >
            <td>{{ row.name }}</td>
            <td>{{ row.timing }}</td>
            <td>{{ row.nodeName }}</td>
            <td>{{ row.actionText }}</td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="selectedTriggerRow"
        class="snapshot-trigger-detail"
        data-testid="snapshot-trigger-detail"
      >
        <div class="snapshot-trigger-detail__field">
          <span class="snapshot-trigger-detail__label">
            {{ t('form.snapshotViewer.triggerOrchestration') }}
          </span>
          <input
            class="snapshot-trigger-detail__input"
            :value="selectedTriggerRow.orchestrationText"
            readonly
          />
        </div>
        <div class="snapshot-trigger-detail__field">
          <span class="snapshot-trigger-detail__label">
            {{ t('form.snapshotViewer.triggerScript') }}
          </span>
          <div class="snapshot-trigger-detail__row">
            <input
              class="snapshot-trigger-detail__input"
              :value="selectedTriggerRow.script || t('form.snapshotViewer.propNotConfigured')"
              readonly
            />
            <el-button
              link
              type="primary"
              size="small"
              data-testid="snapshot-trigger-script-view"
              @click="selectedTriggerRow.viewScript()"
            >
              {{ t('common.view') }}
            </el-button>
          </div>
        </div>
      </div>
    </template>
  </DetailDialog>

  <!-- Q25（509:19020）：选中冻结节点的字段权限 1100 只读面——优先节点字段三态，其次字段主体权限；无值不凑空表 -->
  <DetailDialog
    v-model="nodeFieldPermissionVisible"
    :title="t('form.snapshotViewer.nodeFieldPermissionsTitle')"
    width="1100px"
    class="snapshot-node-permission-dialog"
    append-to-body
  >
    <p class="snapshot-dialog-meta snapshot-script-view__meta">
      <span>{{ selectedNode?.name }}</span>
      <span class="snapshot-script-view__badge">
        {{ t('form.snapshotViewer.readonlyBadge') }}
      </span>
    </p>
    <table
      v-if="nodeFieldStateRows.length"
      class="snapshot-table snapshot-node-permission-table"
      data-testid="snapshot-node-field-states"
    >
      <thead>
        <tr>
          <th>{{ t('form.snapshotViewer.propFieldName') }}</th>
          <th>{{ t('form.snapshotViewer.fieldStateRequired') }}</th>
          <th>{{ t('form.snapshotViewer.fieldStateEditable') }}</th>
          <th>{{ t('form.snapshotViewer.fieldStateHidden') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in nodeFieldStateRows" :key="row.field">
          <td>
            <code>{{ row.field }}</code>
          </td>
          <td>{{ row.required ? t('common.yes') : t('common.no') }}</td>
          <td>{{ row.editable ? t('common.yes') : t('common.no') }}</td>
          <td>{{ row.hidden ? t('common.yes') : t('common.no') }}</td>
        </tr>
      </tbody>
    </table>
    <table
      v-else-if="nodeFieldPermissionRows.length"
      class="snapshot-table snapshot-node-permission-table"
      data-testid="snapshot-node-field-permissions"
    >
      <thead>
        <tr>
          <th>{{ t('form.snapshotViewer.propFieldName') }}</th>
          <th>{{ t('form.snapshotViewer.viewPrincipals') }}</th>
          <th>{{ t('form.snapshotViewer.editPrincipals') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in nodeFieldPermissionRows" :key="row.field">
          <td>
            <code>{{ row.field }}</code>
          </td>
          <td>{{ principalText(row.view) }}</td>
          <td>{{ principalText(row.edit) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="snapshot-empty">
      {{ t('form.snapshotViewer.propNotConfigured') }}
    </p>
  </DetailDialog>

  <!-- Q26（509:19229）：选中冻结节点的高级/操作配置 1000 只读面——操作、监听器与其他冻结配置真实值 -->
  <DetailDialog
    v-model="nodeAdvancedVisible"
    :title="t('form.snapshotViewer.nodeAdvancedConfigTitle')"
    width="1000px"
    class="snapshot-node-advanced-dialog"
    append-to-body
  >
    <p class="snapshot-dialog-meta snapshot-script-view__meta">
      <span>{{ selectedNode?.name }}</span>
      <span class="snapshot-script-view__badge">
        {{ t('form.snapshotViewer.readonlyBadge') }}
      </span>
    </p>
    <div class="snapshot-node-advanced" data-testid="snapshot-node-advanced">
      <section class="snapshot-node-advanced__section">
        <h4>{{ t('form.snapshotViewer.nodeAdvancedOperations') }}</h4>
        <dl class="snapshot-meta snapshot-meta--compact">
          <div>
            <dt>{{ t('form.snapshotViewer.nodeAllowedActions') }}</dt>
            <dd>
              {{
                nodeOperations.allowedActions.map((action) => actionLabel(action)).join('、') ||
                t('form.snapshotViewer.propNotConfigured')
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t('form.snapshotViewer.nodeReturnTargets') }}</dt>
            <dd>
              {{
                nodeOperations.returnTargets.join('、') ||
                t('form.snapshotViewer.propNotConfigured')
              }}
            </dd>
          </div>
        </dl>
      </section>
      <section v-if="nodeListeners.length" class="snapshot-node-advanced__section">
        <h4>{{ t('form.snapshotViewer.nodeListeners') }}</h4>
        <table class="snapshot-table">
          <thead>
            <tr>
              <th>{{ t('form.snapshotViewer.listenerName') }}</th>
              <th>{{ t('form.snapshotViewer.listenerTiming') }}</th>
              <th>{{ t('form.snapshotViewer.nodeListenerNote') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(listener, index) in nodeListeners" :key="index">
              <td>
                {{
                  snapshotValueText(listener.label) ||
                  snapshotValueText(listener.bean) ||
                  `#${index + 1}`
                }}
              </td>
              <td>
                {{
                  String(listener.phase ?? '').toLowerCase() === 'after'
                    ? t('form.snapshotViewer.nodeListenerAfter')
                    : t('form.snapshotViewer.nodeListenerBefore')
                }}
              </td>
              <td>
                {{
                  snapshotValueText(listener.note) ||
                  snapshotValueText(listener.script) ||
                  t('form.snapshotViewer.propNotConfigured')
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <section v-if="nodeAdvancedEntries.length" class="snapshot-node-advanced__section">
        <h4>{{ t('form.snapshotViewer.nodeOtherConfig') }}</h4>
        <table class="snapshot-table">
          <thead>
            <tr>
              <th>{{ t('form.snapshotViewer.nodeConfigKey') }}</th>
              <th>{{ t('form.snapshotViewer.value') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in nodeAdvancedEntries" :key="entry.key">
              <td>
                <code>{{ entry.key }}</code>
              </td>
              <td class="snapshot-node-advanced__value">
                {{ snapshotValueText(entry.value) || t('form.snapshotViewer.propNotConfigured') }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </DetailDialog>
</template>

<style scoped>
.snapshot-dialog-meta {
  margin: 0 0 12px;
  color: var(--sw-text-secondary);
  font-size: 13px;
}

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

/* 触发器 1100 只读窗：关闭 80×32（与既有只读窗同款）。 */
:global(.snapshot-triggers-dialog .el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
  margin: 0;
  padding: 0;
}

.snapshot-trigger-table th {
  box-sizing: border-box;
  height: 36px;
  padding-top: 8px;
  padding-bottom: 8px;
}

.snapshot-trigger-table td {
  height: 46px;
  cursor: pointer;
}

.snapshot-trigger-table tbody tr.is-selected {
  background: var(--sw-color-primary-soft, #eff6ff);
}

.snapshot-trigger-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 8px;
}

.snapshot-trigger-detail__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.snapshot-trigger-detail__label {
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}

.snapshot-trigger-detail__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.snapshot-trigger-detail__input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 32px;
  padding: 0 11px;
  border: 1px solid #dde3ef;
  border-radius: 4px;
  background: #f7f8fa;
  color: var(--sw-text-regular);
  font-family: inherit;
  font-size: 14px;
  line-height: 30px;
}

/* Q25：节点字段权限 1100 只读表与 80×32 关闭页脚。 */
.snapshot-node-permission-table th,
.snapshot-node-permission-table td {
  box-sizing: border-box;
  height: 44px;
}

:global(.snapshot-node-permission-dialog .el-dialog__footer .el-button),
:global(.snapshot-node-advanced-dialog .el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
  margin: 0;
  padding: 0;
}

/* Q26：节点高级/操作 1000 只读面分区。 */
.snapshot-node-advanced {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.snapshot-node-advanced__section h4 {
  margin: 0 0 10px;
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.snapshot-node-advanced__value {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.snapshot-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.snapshot-meta > div {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-page);
}

.snapshot-meta dt {
  margin-bottom: 5px;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-meta dd {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.snapshot-meta--compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

@media (max-width: 900px) {
  .snapshot-meta,
  .snapshot-meta--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
