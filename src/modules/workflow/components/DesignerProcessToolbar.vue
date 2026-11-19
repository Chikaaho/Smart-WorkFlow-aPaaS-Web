<script setup lang="ts">
/**
 * DesignerProcessToolbar — 设计器顶部工具栏：返回/面包屑/工作区页签 + 草稿状态 +
 * 编号设置、历史版本下拉、预览/保存/发布（自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { useI18n } from '@/locales'
import { ArrowLeft } from '@element-plus/icons-vue'
import type { Ref, ComputedRef } from 'vue'
import type { ProcessDefVersionInfo } from '@/modules/workflow/api'
import type { DesignerGraph } from '../composables/designer-graph'

const { t } = useI18n()

/** 工具栏绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerToolbarApi {
  /** 返回上一页。 */
  goBack: () => void
  /** 图文档（面包屑名称/版本）。 */
  graph: Ref<DesignerGraph | null>
  /** 页面加载中（预览按钮禁用）。 */
  loading: Ref<boolean>
  /** 历史版本预览态。 */
  isVersionPreview: ComputedRef<boolean>
  /** 预览版本号。 */
  previewVersion: Ref<number | null>
  /** 未保存标记。 */
  dirty: Ref<boolean>
  /** 草稿保存时间文案。 */
  savedAtText: Ref<string>
  /** 工作台表单上下文 id（显示页签/预览入口）。 */
  workbenchFormId: ComputedRef<string>
  /** 顶部三类页签跳转。 */
  goWorkbenchTab: (tab: 'fields' | 'design' | 'processes') => void
  /** 编号设置弹窗可见性。 */
  themeRuleVisible: Ref<boolean>
  /** 历史版本清单。 */
  versionHistory: Ref<ProcessDefVersionInfo[]>
  /** 历史版本装载中。 */
  versionsLoading: Ref<boolean>
  /** 版本启停进行中的版本 id。 */
  changingVersionId: Ref<number | string | null>
  /** 版本时间格式化。 */
  formatVersionTime: (value?: string | null) => string
  /** 版本下拉命令。 */
  onVersionCommand: (command: unknown) => void
  /** 版本下拉展开（装载清单）。 */
  onVersionMenuVisible: (visible: boolean) => void
  /** 版本启停切换。 */
  toggleVersionAvailability: (item: ProcessDefVersionInfo) => Promise<void>
  /** 返回编辑。 */
  backToEditing: () => void
  /** 流程预览弹窗可见性。 */
  processPreviewVisible: Ref<boolean>
  /** 保存中。 */
  saving: Ref<boolean>
  /** 保存草稿。 */
  save: () => Promise<boolean>
  /** 发布中。 */
  publishing: Ref<boolean>
  /** 发布。 */
  publish: () => Promise<void>
}

const props = defineProps<{
  api: DesignerToolbarApi
}>()

const {
  goBack,
  graph,
  loading,
  isVersionPreview,
  previewVersion,
  dirty,
  savedAtText,
  workbenchFormId,
  goWorkbenchTab,
  themeRuleVisible,
  versionHistory,
  versionsLoading,
  changingVersionId,
  formatVersionTime,
  onVersionCommand,
  onVersionMenuVisible,
  toggleVersionAvailability,
  backToEditing,
  processPreviewVisible,
  saving,
  save,
  publishing,
  publish,
} = props.api
</script>

<template>
  <div class="designer-toolbar">
    <el-button class="toolbar-settings" @click="goBack">
      <el-icon><ArrowLeft /></el-icon>
      <span>{{ t('common.back') }}</span>
    </el-button>
    <span class="designer-crumb">
      / {{ graph?.formName || graph?.name || t('router.processDesigner') }} /
      {{ graph?.name || t('router.processDesigner')
      }}{{ isVersionPreview ? ` v${previewVersion}` : graph?.version ? ` v${graph.version}` : '' }}
    </span>
    <nav v-if="workbenchFormId" class="designer-workbench-tabs" aria-label="工作区切换">
      <button type="button" class="designer-workbench-tab" @click="goWorkbenchTab('fields')">
        {{ t('fieldList.button') }}
      </button>
      <button type="button" class="designer-workbench-tab" @click="goWorkbenchTab('design')">
        {{ t('form.tabDesign') }}
      </button>
      <button
        type="button"
        class="designer-workbench-tab is-active"
        aria-current="page"
        @click="goWorkbenchTab('processes')"
      >
        {{ t('form.tabProcesses') }}
      </button>
    </nav>
    <span class="spacer" />
    <span v-if="isVersionPreview" class="designer-saved designer-saved--readonly">
      {{ t('workflow.versionPreviewTag', { version: previewVersion }) }}
    </span>
    <span v-else class="designer-saved">{{
      dirty
        ? t('form.unsavedChanges')
        : savedAtText
          ? t('form.draftSavedAt', { time: savedAtText })
          : ''
    }}</span>
    <div class="toolbar-actions">
      <el-button
        v-if="workbenchFormId"
        size="small"
        class="toolbar-number"
        @click="themeRuleVisible = true"
      >
        {{ t('workflow.designerNumberShort') }}
      </el-button>
      <el-dropdown
        trigger="click"
        placement="bottom-end"
        popper-class="version-history-popper"
        @command="onVersionCommand"
        @visible-change="onVersionMenuVisible"
      >
        <el-button size="small" class="toolbar-versions">
          {{ workbenchFormId ? t('workflow.designerVersionShort') : t('workflow.versionHistory') }}
        </el-button>
        <template #dropdown>
          <el-dropdown-menu class="version-menu">
            <el-dropdown-item v-if="versionsLoading" disabled>
              {{ t('workflow.versionHistoryLoading') }}
            </el-dropdown-item>
            <el-dropdown-item v-else-if="versionHistory.length === 0" disabled>
              {{ t('workflow.versionHistoryEmpty') }}
            </el-dropdown-item>
            <template v-else>
              <el-dropdown-item
                v-for="item in versionHistory"
                :key="item.id"
                :command="item"
                :class="{
                  'is-current': isVersionPreview && previewVersion === item.graphVersion,
                }"
              >
                <span class="version-entry">
                  <span class="version-entry__no">v{{ item.graphVersion }}</span>
                  <span class="version-entry__time">{{
                    formatVersionTime(item.publishedAt || item.updateTime)
                  }}</span>
                  <span class="version-entry__author">{{ item.publisherName || '—' }}</span>
                  <el-tag v-if="item.status === 'SUSPENDED'" type="warning" size="small">{{
                    t('workflow.versionSuspended')
                  }}</el-tag>
                  <el-button
                    link
                    :loading="changingVersionId === item.id"
                    @click.stop="toggleVersionAvailability(item)"
                  >
                    {{
                      t(
                        item.status === 'PUBLISHED'
                          ? 'workflow.suspendVersion'
                          : 'workflow.activateVersion',
                      )
                    }}
                  </el-button>
                </span>
              </el-dropdown-item>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <template v-if="isVersionPreview">
        <el-button size="small" type="primary" @click="backToEditing">
          {{ t('workflow.backToEditing') }}
        </el-button>
      </template>
      <template v-else>
        <el-button
          v-if="workbenchFormId"
          size="small"
          :disabled="!graph || loading"
          @click="processPreviewVisible = true"
        >
          {{ t('common.preview') }}
        </el-button>
        <el-button size="small" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        <el-button size="small" type="primary" :loading="publishing" @click="publish">{{
          t('common.publish')
        }}</el-button>
      </template>
    </div>
  </div>

  <style scoped>
    /* ── 上下文栏（设计 42:4：48px 白底 + 居中工作区页签） ── */
    .designer-toolbar {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      flex: 0 0 48px;
      box-sizing: border-box;
      background: #fff;
      box-shadow: inset 0 -1px 0 #dde3ef;
      color: #8b98af;
      font-size: 12px;
    }
    /* 设计09：右侧操作组 = 草稿历史 88 / 保存 64 / 发布 64，高 28，间距 8 */
    .designer-saved {
      line-height: 16px;
      color: #7e89a1;
    }
    .designer-saved--readonly {
      color: var(--sw-color-primary);
    }
    /* R5/G6b：窄视口面包屑单行省略，不逐字竖排挤压工具栏；为居中页签预留中部空间 */
    .designer-crumb {
      flex: 1 1 auto;
      min-width: 0;
      max-width: 24%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .designer-workbench-tabs {
      position: absolute;
      left: 50%;
      top: 0;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      height: 48px;
      gap: 0;
    }
    .designer-workbench-tab {
      position: relative;
      width: 120px;
      height: 48px;
      padding: 0;
      border: 0;
      background: transparent;
      font-size: 14px;
      line-height: 20px;
      color: #8a96ad;
      cursor: pointer;
    }
    .designer-workbench-tab:hover {
      color: var(--sw-color-primary);
    }
    .designer-workbench-tab.is-active {
      color: var(--sw-color-primary);
    }
    .designer-workbench-tab.is-active::after {
      position: absolute;
      bottom: 0;
      left: 20px;
      width: 80px;
      height: 2px;
      border-radius: 1px;
      background: var(--sw-color-primary);
      content: '';
    }
    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toolbar-actions :deep(.el-button + .el-button) {
      margin-left: 0;
    }
    :global(.version-history-popper .el-dropdown-menu) {
      min-width: 360px;
      padding: 6px;
    }
    :global(.version-history-popper .el-dropdown-menu__item) {
      padding: 8px 12px;
    }
    :global(.version-history-popper .el-dropdown-menu__item.is-current) {
      color: var(--sw-color-primary);
      background: var(--sw-color-primary-soft);
    }
    :global(.version-history-popper .version-entry) {
      display: grid;
      grid-template-columns: 48px 132px minmax(80px, 1fr);
      gap: 12px;
      align-items: center;
      width: 100%;
    }
    :global(.version-history-popper .version-entry__no) {
      font-weight: 600;
      color: #344164;
    }
    :global(.version-history-popper .version-entry__time),
    :global(.version-history-popper .version-entry__author) {
      font-size: 12px;
      color: #5f6b85;
    }
    :global(.version-history-popper .version-entry__author) {
      overflow: hidden;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .designer-toolbar :deep(.el-divider--vertical) {
      border-left-color: #d7deed;
    }
    .designer-title {
      font-size: 13px;
      font-weight: 600;
      color: #344164;
    }
    .designer-key {
      color: #8393b5;
      font-size: 12px;
    }
    .designer-version.el-tag {
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary);
      border-color: transparent;
      border-radius: 6px;
      font-size: 11px;
    }
    .toolbar-validation {
      color: var(--el-color-danger);
      font-size: 12px;
    }
    .designer-toolbar :deep(.el-button.toolbar-iconbtn) {
      width: 28px;
      padding: 0;
    }
    /* 参考 UI：第一行按钮统一 28 高、4px 圆角、浅灰描边 */
    .designer-toolbar :deep(.el-button) {
      height: 28px;
      padding: 0 12px;
      border: 1px solid #d8e0ec;
      border-radius: 4px;
      background: #fff;
      color: #4a5873;
      font-size: 12px;
    }
    .designer-toolbar :deep(.el-button.toolbar-back) {
      height: 28px;
      padding: 0 16px;
    }
    .designer-toolbar :deep(.el-button--primary) {
      background: var(--sw-color-primary);
      border-color: var(--sw-color-primary);
      color: #fff;
    }
    .designer-toolbar :deep(.el-button--primary:hover),
    .designer-toolbar :deep(.el-button--primary:focus) {
      background: var(--sw-color-primary-dark);
      border-color: var(--sw-color-primary-dark);
      color: #fff;
    }
    .spacer {
      flex: 1;
    }
  </style>
</template>
