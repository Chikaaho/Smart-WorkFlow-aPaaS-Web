<script setup lang="ts">
/**
 * DesignerAdvancedConfigDialog — P53 节点13 流程高级配置弹窗：
 * 只读呈现定义元数据（统一监听器/通知/前置/后置），不新增任何端点
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { useI18n } from '@/locales'
import { Document, EditPen, Monitor, Setting } from '@element-plus/icons-vue'
import type { Ref, ComputedRef } from 'vue'
import type { GraphAdvancedConfig } from '../composables/designer-graph'

const { t } = useI18n()

/** 高级配置弹窗绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerAdvancedConfigDialogApi {
  /** 弹窗可见性。 */
  advancedConfigVisible: Ref<boolean>
  /** 定义 payload 的 advancedConfig 元数据。 */
  advConfig: ComputedRef<GraphAdvancedConfig | undefined>
  /** 通知渠道清单。 */
  advChannels: ComputedRef<string[]>
  /** 保存中（footer 按钮 loading）。 */
  saving: Ref<boolean>
  /** 保存配置（关闭弹窗并走既有草稿保存链路）。 */
  onSaveAdvancedConfig: () => void
}

const props = defineProps<{
  api: DesignerAdvancedConfigDialogApi
}>()

const { advancedConfigVisible, advConfig, advChannels, saving, onSaveAdvancedConfig } = props.api
</script>

<template>
  <el-dialog
    v-model="advancedConfigVisible"
    class="advanced-config-dialog"
    :title="t('workflow.advancedConfigTitle')"
    width="1054px"
    modal-class="p53-dialog-overlay-37"
  >
    <template #header>
      <div class="advanced-config-heading">
        <h2>{{ t('workflow.advancedConfigTitle') }}</h2>
        <p>{{ t('workflow.advancedConfigSubtitle') }}</p>
      </div>
    </template>
    <div class="advanced-config-grid">
      <section class="advanced-card">
        <div class="advanced-card__head">
          <div class="advanced-card__title">
            <el-icon class="advanced-card__icon"><Setting /></el-icon>
            <h3>{{ t('workflow.advListenersTitle') }}</h3>
          </div>
          <span class="advanced-card__badge">{{ t('workflow.advEnabledBadge') }}</span>
        </div>
        <div class="advanced-rows">
          <span class="advanced-rows__cap">{{ t('workflow.advProcessEvent') }}</span>
          <span>{{ t('workflow.advExecutorListener') }}</span>
          <span class="advanced-rows__cap">{{ t('workflow.advBeforeStart') }}</span>
          <span class="advanced-rows__bean">{{ advConfig?.startListener || '—' }}</span>
          <span class="advanced-rows__cap">{{ t('workflow.advAfterComplete') }}</span>
          <span class="advanced-rows__bean">{{ advConfig?.completeListener || '—' }}</span>
        </div>
        <div class="advanced-card__add">{{ t('workflow.advAddListener') }}</div>
      </section>
      <section class="advanced-card">
        <div class="advanced-card__head">
          <div class="advanced-card__title">
            <el-icon class="advanced-card__icon"><Document /></el-icon>
            <h3>{{ t('workflow.advNotifyTitle') }}</h3>
          </div>
        </div>
        <label>{{ t('workflow.advNotifyTargets') }}</label>
        <div class="static-value">{{ advConfig?.notifyTargets || '—' }}</div>
        <label>{{ t('workflow.advNotifyChannels') }}</label>
        <div class="advanced-chips">
          <span v-for="c in advChannels" :key="c" class="advanced-chips__item">{{ c }}</span>
        </div>
        <p class="advanced-card__meta">{{ t('workflow.advTriggerMoments') }}</p>
        <p class="advanced-card__meta">
          {{ t('workflow.advTemplateLabel', { template: advConfig?.notifyTemplate || '—' }) }}
        </p>
      </section>
      <section class="advanced-card">
        <div class="advanced-card__head">
          <div class="advanced-card__title">
            <el-icon class="advanced-card__icon"><EditPen /></el-icon>
            <h3>{{ t('workflow.advPreProcessTitle') }}</h3>
          </div>
        </div>
        <label>{{ t('workflow.advExecMode') }}</label>
        <div class="static-value">{{ advConfig?.preMode || '—' }}</div>
        <label>{{ t('workflow.advHandler') }}</label>
        <div class="static-value">{{ advConfig?.preHandler || '—' }}</div>
        <p class="advanced-card__meta">{{ advConfig?.prePurpose || '—' }}</p>
        <p class="advanced-card__meta">{{ advConfig?.preFailure || '—' }}</p>
      </section>
      <section class="advanced-card">
        <div class="advanced-card__head">
          <div class="advanced-card__title">
            <el-icon class="advanced-card__icon"><Monitor /></el-icon>
            <h3>{{ t('workflow.advPostProcessTitle') }}</h3>
          </div>
        </div>
        <label>{{ t('workflow.advExecMode') }}</label>
        <div class="static-value">{{ advConfig?.postMode || '—' }}</div>
        <label>{{ t('workflow.advHandler') }}</label>
        <div class="static-value">{{ advConfig?.postHandler || '—' }}</div>
        <p class="advanced-card__meta">{{ advConfig?.postPurpose || '—' }}</p>
        <p class="advanced-card__meta">{{ advConfig?.postFailure || '—' }}</p>
      </section>
    </div>
    <template #footer>
      <div class="advanced-config-footer">
        <el-button size="small" @click="advancedConfigVisible = false"
          >&nbsp;&nbsp;&nbsp;&nbsp;{{ t('common.cancel') }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</el-button
        >
        <el-button
          size="small"
          type="primary"
          class="advanced-config-save"
          :loading="saving"
          @click="onSaveAdvancedConfig"
          >&nbsp;&nbsp;&nbsp;&nbsp;{{
            t('workflow.advSaveConfig')
          }}&nbsp;&nbsp;&nbsp;&nbsp;</el-button
        >
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.advanced-config-heading h2 {
  margin: 0;
  font-size: 22px;
  line-height: 29px;
  color: #19233b;
}
.advanced-config-heading p {
  margin: 8px 0 0;
  color: #8c9ab1;
  font-size: 12px;
  position: relative;
  top: -1px;
}

.advanced-config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 268px 276px;
  column-gap: 24px;
  row-gap: 24px;
}
.advanced-config-grid section {
  box-sizing: border-box;
  min-height: 0;
  height: 100%;
  border: 1px solid #dde3ef;
  border-radius: 9.5px;
  padding: 20px;
}

/* 节点13 四卡组内部元素 */
.advanced-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.advanced-card__title {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 10px;
}

.advanced-card__icon {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  color: var(--sw-color-primary);
  font-size: 22px;
  position: relative;
  top: -2px;
}

.advanced-card__title h3 {
  flex: 1;
  position: relative;
  top: -5px;
}
.advanced-config-grid section:nth-child(n + 3) .advanced-card__title h3 {
  top: -5px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__title,
.advanced-config-grid section:nth-child(4) .advanced-card__title {
  position: relative;
  left: -1px;
}

.advanced-card__badge {
  box-sizing: border-box;
  width: 82px;
  height: 24px;
  padding: 2px 9px;
  font-size: 12px;
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
  border-radius: 6px;
  position: relative;
  left: 3px;
  top: -14px;
}

.advanced-rows {
  display: grid;
  grid-template-columns: 143px 1fr;
  /* 设计（节点13）：监听器行距 51 */
  gap: 29px 18px;
  align-items: center;
  font-size: 13px;
  color: var(--sw-text-primary, #303a55);
  transform: translate(-3px, -3px);
}
.advanced-rows > :nth-child(3),
.advanced-rows > :nth-child(4) {
  position: relative;
  top: -9px;
}
.advanced-rows > :nth-child(5),
.advanced-rows > :nth-child(6) {
  position: relative;
  top: -3px;
}

.advanced-rows__cap {
  color: #8393b5;
}

.advanced-rows__bean {
  color: var(--sw-color-primary);
}

.advanced-card__note {
  margin: 12px 0 0;
  font-size: 12px;
  color: #8c99b0;
  position: relative;
  left: -3px;
  top: 0;
}

.advanced-card__add {
  margin-top: 17px;
  padding: 9px 12px;
  border: 1px solid #ccd5e5;
  border-radius: 7px;
  font-size: 13px;
  color: #303a55;
  transform: translateX(-3px);
  position: relative;
  top: -1px;
}

.advanced-chips {
  display: flex;
  gap: 8px;
}

.advanced-chips__item {
  flex: 1 1 0;
  padding: 5px 0;
  padding-left: 7px;
  box-sizing: border-box;
  text-align: left;
  font-size: 12px;
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
  border-radius: 5px;
}

.advanced-card__meta {
  margin: 10px 0 0;
  font-size: 12px;
  color: #5f6f92;
  position: relative;
  left: -3px;
}

.advanced-config-footnote {
  margin: 27px 0 0;
  font-size: 12px;
  color: #8c9ab1;
}
.advanced-config-grid h3 {
  margin: 0 0 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ccd5e5;
  font-size: 16px;
  color: #19233b;
}
.advanced-config-grid section:nth-child(n + 3) h3 {
  margin-bottom: 1px;
}
.advanced-config-grid label {
  display: block;
  color: #8393b5;
  font-size: 12px;
  margin: 12px 0 6px;
}
.advanced-config-grid section:nth-child(2) label,
.advanced-config-grid section:nth-child(2) .static-value {
  position: relative;
  left: -3px;
  width: calc(100% + 6px);
}
.advanced-config-grid section:nth-child(2) label:first-of-type {
  top: -15px;
}
.advanced-config-grid section:nth-child(2) .static-value {
  top: -12px;
}
.advanced-config-grid section:nth-child(2) label:nth-of-type(2) {
  position: relative;
  top: -8px;
}
.advanced-config-grid section:nth-child(2) .advanced-chips {
  position: relative;
  top: -2px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__meta:last-child {
  top: 1px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__meta:first-of-type {
  top: -2px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label {
  margin-top: 23px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value {
  top: 2px;
}
.advanced-config-grid section:nth-child(n + 3) > label:first-of-type {
  top: -1px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label {
  top: -2px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label + .static-value {
  top: 1px;
}
.advanced-config-grid section:nth-child(n + 3) .advanced-card__meta {
  top: 7px;
}
.advanced-config-grid section:nth-child(n + 3) label,
.advanced-config-grid section:nth-child(n + 3) .static-value,
.advanced-config-grid section:nth-child(n + 3) .advanced-card__meta {
  position: relative;
  left: -3px;
  width: calc(100% + 6px);
}
.advanced-config-grid .static-value {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  border: 1px solid #dde3ef;
  border-radius: 6px;
  background: #fafbfe;
  color: #19233b;
  padding: 7px 10px 0;
  display: flex;
  align-items: flex-start;
  font-size: 13px;
}

.advanced-config-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  height: 53px;
  box-sizing: border-box;
  padding: 0 27px;
}
.advanced-config-footer :deep(.el-button) {
  height: 36px;
  min-width: 88px;
  border: 1px solid #cbd6e8;
  border-radius: 6px;
  background: #fff;
  color: #344164;
  position: relative;
  top: 7.5px;
  font-size: 14px;
  line-height: 17px;
}
.advanced-config-footer :deep(.advanced-config-save) {
  width: 110px;
  min-width: 110px;
}
.advanced-config-footer :deep(.el-button > span) {
  position: relative;
  top: -3px;
}
.advanced-config-footer :deep(.el-button:first-child > span) {
  position: relative;
  left: 11.5px;
}
</style>
