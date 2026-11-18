<script setup lang="ts">
import { computed, ref } from 'vue'
import { Close } from '@element-plus/icons-vue'
import DetailDialog from '@/components/DetailDialog.vue'
import { useI18n } from '@/locales'
import type { FormSnapshotDTO } from '../api/form-def'
import PublishedSnapshotDesignTab from './PublishedSnapshotDesignTab.vue'
import PublishedSnapshotFieldsTab from './PublishedSnapshotFieldsTab.vue'
import PublishedSnapshotFormDialogs from './PublishedSnapshotFormDialogs.vue'
import PublishedSnapshotNumberingTab from './PublishedSnapshotNumberingTab.vue'
import PublishedSnapshotProcessDialogs from './PublishedSnapshotProcessDialogs.vue'
import PublishedSnapshotProcessTab from './PublishedSnapshotProcessTab.vue'
import PublishedSnapshotSettingsTab from './PublishedSnapshotSettingsTab.vue'
import { useSnapshotFieldProps } from './use-snapshot-field-props'
import { useSnapshotFrozenGraph } from './use-snapshot-frozen-graph'
import { useSnapshotNodeConfig } from './use-snapshot-node-config'
import { useSnapshotScriptDetail } from './use-snapshot-script-detail'
import { useSnapshotSettings } from './use-snapshot-settings'
import { useSnapshotViewerData, type SnapshotTab } from './use-snapshot-viewer-data'

/**
 * PublishedSnapshotViewer — one read-only surface for a frozen form + workflow version.
 *
 * The form snapshot is authoritative for the form definition. Related process
 * definitions are found through the adapter seam, then only versions whose
 * formVersion matches the selected form snapshot are loaded from the immutable
 * workflow version endpoint. Missing data is displayed as missing; current
 * mutable configuration is never substituted for a frozen value.
 *
 * 结构：本文件保留全屏外壳（顶条/页签/警告）与页签分发；
 * 数据与派生逻辑在 use-snapshot-* 组合式函数，各页签与只读弹窗在 PublishedSnapshot* 子组件。
 */

const props = defineProps<{
  formId: string
  formKey: string
  snapshot: FormSnapshotDTO | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const { t } = useI18n()

/* 0.2.0 G14（272:1518）：全屏外壳五页签——原 12 分区按实际内容归入对应页签。 */
const activeTab = ref<SnapshotTab>('fields')
const viewerTabs = computed(() =>
  (
    [
      ['fields', 'tabFields'],
      ['design', 'tabDesign'],
      ['process', 'tabProcess'],
      ['numbering', 'tabNumbering'],
      ['settings', 'tabSettings'],
    ] as const
  ).map(([key, labelKey]) => ({ key, label: t(`form.snapshotViewer.${labelKey}`) })),
)

function selectTab(key: SnapshotTab): void {
  activeTab.value = key
}

/* ── 数据面：加载与派生清单、字段/流程选中态 ── */
const {
  loading,
  loadError,
  warnings,
  schema,
  rawDefinition,
  processSources,
  fields,
  constraints,
  visibility,
  permissions,
  actionPermissions,
  listConfig,
  nodes,
  advancedConfigs,
  variables,
  triggers,
  scripts,
  approvalScripts,
  effectiveSnapshot,
  snapshotVersionText,
  snapshotTitle,
  rawDefinitionText,
  selectedFieldName,
  selectedField,
  selectedProcessKey,
  selectedNodeId,
  selectedProcess,
  selectedNode,
} = useSnapshotViewerData(props, visible, activeTab)

/* ── 脚本/校验只读详情弹窗（单实例，多处入口共享） ── */
const scriptDetail = useSnapshotScriptDetail()
const {
  scriptDetailVisible,
  scriptDetailTitle,
  scriptDetailCode,
  scriptDetailMeta,
  scriptDetailMode,
  scriptDetailLines,
  validationDetailVisible,
  validationDetailTitle,
  validationDetailRow,
  validationRuleVisible,
  validationRuleRow,
  openScriptDetail,
  openApprovalScript,
  openValidationDetail,
  openValidationRule,
} = scriptDetail

/* ── G14（272:1518）冻结消费者：冻结图渲染 / 通知 / 编号 / 表单事件 ── */
const {
  frozenGraph,
  nodeById,
  frozenLayoutNodes,
  frozenEdgePoints,
  frozenViewBoxRect,
  frozenViewBox,
  frozenNotification,
  notificationText,
  frozenNumbering,
  frozenFormEvents,
} = useSnapshotFrozenGraph(selectedProcess, rawDefinition)

/* ── 表单设计：冻结字段属性投影 + 查看属性/TABLE 明细列弹窗 ── */
const {
  fieldScriptOf,
  frozenFieldPropRows,
  detailColumnsVisible,
  detailColumnsField,
  detailColumnRows,
  propsDialogVisible,
  propsDialogField,
  propsDialogRows,
  openFieldProps,
  openFrozenDetail,
} = useSnapshotFieldProps({
  schema,
  selectedField,
  constraints,
  scripts,
  scriptDetail,
})

/* ── 流程设计：选中节点只读属性 + 字段权限/高级配置弹窗 ── */
const {
  nodeFieldStateRows,
  nodeFieldPermissionRows,
  nodeOperations,
  nodeListeners,
  nodeAdvancedEntries,
  frozenNodeConfigRows,
  frozenNodePropRows,
  nodeFieldPermissionVisible,
  nodeAdvancedVisible,
  openNodeConfigDetail,
} = useSnapshotNodeConfig({
  selectedNode,
  selectedProcess,
  nodeById,
  scriptDetail,
})

/* ── 流程设置：通知/监听/变量/审批人脚本分支 + 触发器弹窗 ── */
const {
  settingsBranch,
  notificationRows,
  listenerRows,
  selectedTriggerKey,
  triggerDialogVisible,
  triggerRows,
  selectedTriggerRow,
} = useSnapshotSettings({
  triggers,
  nodes,
  frozenFormEvents,
  notificationText,
  scriptDetail,
})

function selectField(name: string): void {
  selectedFieldName.value = name
}

function selectProcess(key: string): void {
  selectedProcessKey.value = key
}

function selectNode(id: string): void {
  selectedNodeId.value = id
}

/* 校验详情弹窗由 openFrozenDetail 内部调用；此处保留顶层绑定供测试经 vm 直访。 */
defineExpose({ openValidationDetail })
</script>

<template>
  <DetailDialog
    v-model="visible"
    class="published-snapshot-dialog"
    :title="t('form.snapshotViewer.title')"
    :loading="loading"
    :error="loadError"
    fullscreen
    appearance="design"
    :show-footer="false"
    append-to-body
  >
    <div v-if="loading" class="snapshot-loading">{{ t('form.snapshotViewer.loading') }}</div>
    <div
      v-else-if="effectiveSnapshot && schema"
      class="snapshot-viewer"
      data-testid="published-snapshot-viewer"
    >
      <header class="snapshot-topbar">
        <div class="snapshot-topbar__identity">
          <strong class="snapshot-topbar__title">{{ t('form.snapshotViewer.title') }}</strong>
          <span class="snapshot-topbar__name">{{ snapshotTitle }}</span>
          <span class="snapshot-topbar__version">v{{ snapshotVersionText }}</span>
          <span class="snapshot-topbar__badge">{{ t('form.snapshotViewer.frozenBadge') }}</span>
        </div>
        <button
          type="button"
          class="snapshot-topbar__close"
          :aria-label="t('common.close')"
          @click="visible = false"
        >
          <el-icon :size="16"><Close /></el-icon>
        </button>
      </header>

      <nav class="snapshot-tabs" :aria-label="t('form.snapshotViewer.sections')">
        <button
          v-for="tab in viewerTabs"
          :key="tab.key"
          type="button"
          class="snapshot-tabs__item"
          :class="{ 'is-active': activeTab === tab.key }"
          :aria-current="activeTab === tab.key ? 'page' : undefined"
          @click="selectTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div v-if="warnings.length" class="snapshot-warning" role="status">
        <p v-for="warning in warnings" :key="warning">{{ warning }}</p>
      </div>

      <div class="snapshot-body">
        <!-- ═══ 字段清单 ═══ -->
        <PublishedSnapshotFieldsTab
          v-if="activeTab === 'fields'"
          :fields="fields"
          :form-key="formKey"
          :snapshot-version-text="snapshotVersionText"
          :effective-snapshot="effectiveSnapshot"
          :schema="schema"
          :raw-definition-text="rawDefinitionText"
          :constraints="constraints"
          :visibility="visibility"
          :scripts="scripts"
          :list-config="listConfig"
          :permissions="permissions"
          :action-permissions="actionPermissions"
          @open-field-props="openFieldProps"
          @open-validation-rule="openValidationRule"
          @open-script-detail="openScriptDetail"
        />

        <!-- ═══ 表单设计 ═══ -->
        <PublishedSnapshotDesignTab
          v-else-if="activeTab === 'design'"
          :schema="schema"
          :selected-field="selectedField"
          :frozen-field-prop-rows="frozenFieldPropRows"
          :field-script-of="fieldScriptOf"
          @select-field="selectField"
          @open-detail="openFrozenDetail"
        />

        <!-- ═══ 流程设计 ═══ -->
        <PublishedSnapshotProcessTab
          v-else-if="activeTab === 'process'"
          :process-sources="processSources"
          :selected-process="selectedProcess"
          :selected-node="selectedNode"
          :frozen-graph="frozenGraph"
          :frozen-layout-nodes="frozenLayoutNodes"
          :frozen-view-box="frozenViewBox"
          :frozen-view-box-rect="frozenViewBoxRect"
          :advanced-configs="advancedConfigs"
          :frozen-node-prop-rows="frozenNodePropRows"
          :frozen-node-config-rows="frozenNodeConfigRows"
          :frozen-edge-points="frozenEdgePoints"
          @select-process="selectProcess"
          @select-node="selectNode"
          @open-node-config="openNodeConfigDetail"
        />

        <!-- ═══ 编号设置 ═══ -->
        <PublishedSnapshotNumberingTab
          v-else-if="activeTab === 'numbering'"
          :frozen-numbering="frozenNumbering"
        />

        <!-- ═══ 流程设置 ═══ -->
        <PublishedSnapshotSettingsTab
          v-else
          v-model:branch="settingsBranch"
          v-model:trigger-dialog-visible="triggerDialogVisible"
          :frozen-notification="frozenNotification"
          :notification-rows="notificationRows"
          :listener-rows="listenerRows"
          :trigger-rows="triggerRows"
          :variables="variables"
          :approval-scripts="approvalScripts"
          @open-approval-script="openApprovalScript"
        />
      </div>
    </div>

    <!-- 表单侧只读弹窗：查看属性 / 脚本·监听详情 / 校验详情 / 校验规则 / TABLE 明细列 -->
    <PublishedSnapshotFormDialogs
      v-model:props-dialog-visible="propsDialogVisible"
      v-model:script-detail-visible="scriptDetailVisible"
      v-model:validation-detail-visible="validationDetailVisible"
      v-model:validation-rule-visible="validationRuleVisible"
      v-model:detail-columns-visible="detailColumnsVisible"
      :props-dialog-field="propsDialogField"
      :props-dialog-rows="propsDialogRows"
      :script-detail-title="scriptDetailTitle"
      :script-detail-mode="scriptDetailMode"
      :script-detail-meta="scriptDetailMeta"
      :script-detail-code="scriptDetailCode"
      :script-detail-lines="scriptDetailLines"
      :validation-detail-title="validationDetailTitle"
      :validation-detail-row="validationDetailRow"
      :validation-rule-row="validationRuleRow"
      :detail-columns-field="detailColumnsField"
      :detail-column-rows="detailColumnRows"
      @frozen-detail="openFrozenDetail"
    />

    <!-- 流程侧只读弹窗：冻结触发器 / 节点字段权限 / 节点高级与操作配置 -->
    <PublishedSnapshotProcessDialogs
      v-model:trigger-dialog-visible="triggerDialogVisible"
      v-model:selected-trigger-key="selectedTriggerKey"
      v-model:node-field-permission-visible="nodeFieldPermissionVisible"
      v-model:node-advanced-visible="nodeAdvancedVisible"
      :trigger-rows="triggerRows"
      :selected-trigger-row="selectedTriggerRow"
      :selected-node="selectedNode"
      :node-field-state-rows="nodeFieldStateRows"
      :node-field-permission-rows="nodeFieldPermissionRows"
      :node-operations="nodeOperations"
      :node-listeners="nodeListeners"
      :node-advanced-entries="nodeAdvancedEntries"
    />
  </DetailDialog>
</template>

<style scoped>
.snapshot-loading {
  display: grid;
  min-height: 360px;
  place-items: center;
  color: var(--sw-text-secondary);
  font-size: 14px;
}

/* 0.2.0 G14（272:1518）：全屏外壳——顶条 56 / 页签 40 / 页签体分栏承接原分区内容 */
.snapshot-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.snapshot-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-16);
  flex: 0 0 56px;
  box-sizing: border-box;
  padding: 0 24px;
  border-bottom: 1px solid var(--sw-border-light);
  background: var(--sw-surface-card);
}

.snapshot-topbar__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.snapshot-topbar__title {
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 600;
}

.snapshot-topbar__name {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--sw-fill-base, #f4f6fb);
  color: var(--sw-text-regular);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.snapshot-topbar__version {
  padding: 2px 8px;
  border-radius: 4px;
  background: #eef2fb;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-topbar__badge {
  padding: 2px 8px;
  border-radius: 4px;
  background: #fdf6ec;
  color: #b88230;
  font-size: 12px;
}

.snapshot-topbar__close {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sw-text-secondary);
  cursor: pointer;
}

.snapshot-topbar__close:hover {
  background: var(--sw-fill-base, #f4f6fb);
  color: var(--sw-text-primary);
}

.snapshot-tabs {
  display: flex;
  align-items: stretch;
  gap: 32px;
  flex: 0 0 40px;
  box-sizing: border-box;
  padding: 0 24px;
  border-bottom: 1px solid var(--sw-border-light);
  background: var(--sw-surface-card);
}

.snapshot-tabs__item {
  position: relative;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 40px;
  cursor: pointer;
}

.snapshot-tabs__item:hover {
  color: var(--sw-color-primary);
}

.snapshot-tabs__item.is-active {
  color: var(--sw-color-primary);
  font-weight: 600;
}

.snapshot-tabs__item.is-active::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--sw-color-primary);
  content: '';
}

.snapshot-warning {
  padding: 10px 14px;
  border: 1px solid var(--sw-warning);
  border-radius: var(--sw-radius-base);
  background: var(--sw-warning-bg);
  color: var(--sw-text-primary);
  font-size: 12px;
}

.snapshot-warning p {
  margin: 0;
}

.snapshot-warning p + p {
  margin-top: 4px;
}

.snapshot-body {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
}

/* G14 全屏外壳：接管 el-dialog fullscreen 正文（去 max-height/内距/页头，页签体内部滚动） */
:global(.published-snapshot-dialog.el-dialog) {
  max-width: none;
  padding: 0;
  overflow: hidden;
}

:global(.published-snapshot-dialog .el-dialog__header) {
  display: none;
}

:global(.published-snapshot-dialog .el-dialog__body) {
  max-height: none;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

:global(.published-snapshot-dialog .sw-detail-dialog__body) {
  min-height: 0;
  height: 100%;
}

@media (max-width: 900px) {
  .snapshot-viewer {
    height: auto;
    max-height: 76vh;
    flex-direction: column;
    align-items: flex-start;
  }

  .snapshot-topbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
