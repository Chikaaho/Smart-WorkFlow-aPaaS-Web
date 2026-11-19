<script setup lang="ts">
/**
 * DesignerNodeOpSettingsDialog — 0.2.0 Q12（278:1567）节点操作 820 设置面。
 * 8 个真实选项；取消只丢本地草稿，不改空集合默认含义、可用操作策略或保存契约
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { useI18n } from '@/locales'
import type { Ref, ComputedRef } from 'vue'

const { t } = useI18n()

/** 节点操作设置弹窗绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerNodeOpSettingsDialogApi {
  /** 弹窗可见性。 */
  opSettingsVisible: Ref<boolean>
  /** 弹窗内本地草稿（取消丢弃）。 */
  opDraft: Ref<string[]>
  /** 节点操作选项（能力契约 allowedActions）。 */
  opOptions: ComputedRef<Array<{ value: string; label: string }>>
  /** 确定：有改动才写回 allowedActions。 */
  confirmOpSettings: () => void
}

const props = defineProps<{
  api: DesignerNodeOpSettingsDialogApi
}>()

const { opSettingsVisible, opDraft, opOptions, confirmOpSettings } = props.api
</script>

<template>
  <!-- ═══ 0.2.0 Q12（278:1567）：节点操作 820 设置面。8 个真实选项；
     取消只丢本地草稿，不改空集合默认含义、可用操作策略或保存契约。 ═══ -->
  <el-dialog
    v-model="opSettingsVisible"
    :title="t('workflow.operationSettings')"
    width="820px"
    class="node-op-dialog"
    append-to-body
  >
    <div class="node-op-dialog__body">
      <div class="node-op-dialog__label">节点操作</div>
      <el-checkbox-group v-model="opDraft" class="node-op-grid">
        <el-checkbox-button
          v-for="option in opOptions"
          :key="option.value"
          :value="option.value"
          :data-testid="`node-op-option-${option.value}`"
        >
          {{ option.label }}
        </el-checkbox-button>
      </el-checkbox-group>
      <small class="node-op-dialog__hint">{{ t('workflow.allowedActionsHint') }}</small>
    </div>
    <template #footer>
      <el-button @click="opSettingsVisible = false">取消</el-button>
      <el-button type="primary" @click="confirmOpSettings">确定</el-button>
    </template>
  </el-dialog>

  <!-- P64 弹窗可达性全局规则：append-to-body 传送后不带 scoped 属性，需全局选择器。 -->
  <style>
    /* ═══ 0.2.0 Q12（278:1567）：节点操作 820 设置面——820 宽、32 高选项控件、原底栏 80×32。 ═══ */
    .el-dialog.node-op-dialog {
      --el-dialog-padding-primary: 0px;
      box-sizing: border-box;
      width: 820px;
      max-width: calc(100vw - 32px);
      padding: 0;
      border: 1px solid var(--sw-border-light, #e4e7ed);
      border-radius: 12px;
    }
    .el-dialog.node-op-dialog .el-dialog__header,
    .el-dialog.node-op-dialog .el-dialog__header.show-close {
      box-sizing: border-box;
      margin: 0;
      padding: 24px 56px 0 24px;
    }
    .el-dialog.node-op-dialog .el-dialog__title {
      font-size: 16px;
      font-weight: 500;
      line-height: 24px;
      color: var(--sw-text-primary, #172033);
    }
    .el-dialog.node-op-dialog .el-dialog__headerbtn {
      top: 24px;
      right: 24px;
      width: 24px;
      height: 24px;
    }
    .el-dialog.node-op-dialog .el-dialog__body {
      padding: 16px 24px 0;
    }
    .el-dialog.node-op-dialog .el-dialog__footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 20px 24px 24px;
    }
    .el-dialog.node-op-dialog .el-dialog__footer .el-button {
      box-sizing: border-box;
      width: 80px;
      height: 32px;
      margin: 0;
      padding: 0;
    }
    .node-op-dialog__label {
      margin-bottom: 8px;
      font-size: 14px;
      line-height: 22px;
      color: var(--sw-text-regular, #606266);
    }
    .node-op-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      width: 100%;
    }
    .node-op-grid .el-checkbox-button {
      display: block;
      margin: 0;
    }
    .node-op-grid .el-checkbox-button__inner {
      box-sizing: border-box;
      display: block;
      width: 100%;
      height: 32px;
      padding: 0 10px;
      line-height: 30px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .node-op-dialog__hint {
      display: block;
      margin-top: 12px;
      color: var(--sw-text-secondary, #8c9ab1);
      font-size: 11px;
      line-height: 17px;
    }
  </style>
</template>
