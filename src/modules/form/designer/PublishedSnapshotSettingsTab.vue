<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'
import type { SnapshotScriptView, SnapshotVariableView } from './published-snapshot'
import { useSnapshotLabels } from './use-snapshot-labels'
import type { SettingsBranch, SnapshotTriggerRow } from './use-snapshot-settings'

/**
 * 流程设置页签（审查23 S14-E）：左200导航 通知/监听（变量/脚本为额外合法分支）。
 * 分支切换与触发器弹窗开关经 v-model 由宿主持有，审批人脚本「查看」冒泡。
 */
defineProps<{
  frozenNotification: Record<string, unknown> | null
  notificationRows: Array<{ label: string; value: string }>
  listenerRows: Array<{
    key: string
    name: string
    timing: string
    enabled: string
    view: () => void
  }>
  triggerRows: SnapshotTriggerRow[]
  variables: SnapshotVariableView[]
  approvalScripts: SnapshotScriptView[]
}>()

const emit = defineEmits<{
  'open-approval-script': [row: SnapshotScriptView]
}>()

const settingsBranch = defineModel<SettingsBranch>('branch', { required: true })
const triggerDialogVisible = defineModel<boolean>('triggerDialogVisible', { required: true })

const { t } = useI18n()
const { scriptKindLabel, eventLabel, sectionLabel } = useSnapshotLabels()

const settingsBranches = computed(() => [
  { key: 'notification' as const, label: t('form.snapshotViewer.notificationNav') },
  { key: 'listeners' as const, label: t('form.snapshotViewer.listenersNav') },
  { key: 'variables' as const, label: t('form.snapshotViewer.variables') },
  { key: 'approvalScripts' as const, label: t('form.snapshotViewer.approvalScripts') },
])
</script>

<template>
  <!-- ═══ 流程设置（审查23 S14-E）：左200导航 通知/监听（变量/脚本为额外合法分支） ═══ -->
  <div class="snapshot-tabbody snapshot-settings">
    <aside class="snapshot-settings__nav">
      <button
        v-for="branch in settingsBranches"
        :key="branch.key"
        type="button"
        :class="{ 'is-active': settingsBranch === branch.key }"
        @click="settingsBranch = branch.key"
      >
        {{ branch.label }}
      </button>
    </aside>
    <div class="snapshot-settings__main">
      <!-- 执行提示28 S14-E：分支内容各成白卡（浅底 main 只做定位，卡内距 24） -->
      <section
        v-if="settingsBranch === 'notification'"
        class="snapshot-section snapshot-settings__card snapshot-settings__card--notify"
      >
        <div class="snapshot-section__head">
          <div>
            <h3>{{ sectionLabel('notification') }}</h3>
          </div>
        </div>
        <p v-if="!frozenNotification" class="snapshot-empty">
          {{ t('form.snapshotViewer.notificationMissing') }}
        </p>
        <div v-else class="snapshot-props-surface">
          <div
            v-for="row in notificationRows"
            :key="row.label"
            class="snapshot-props-surface__group"
          >
            <label class="snapshot-props-surface__label">{{ row.label }}</label>
            <input class="snapshot-props-surface__input" :value="row.value" readonly />
          </div>
        </div>
      </section>

      <template v-else-if="settingsBranch === 'listeners'">
        <!-- Q28（509:19394）：冻结触发器 1100 只读内容宿主到遮罩只读弹窗（snapshot-triggers-dialog），
             页内仅保留入口卡片；表/明细本体见下方 DetailDialog。 -->
        <section class="snapshot-section snapshot-settings__card snapshot-settings__card--triggers">
          <div class="snapshot-section__head">
            <div>
              <h3>{{ sectionLabel('triggers') }}</h3>
            </div>
          </div>
          <div class="snapshot-trigger-entry">
            <p v-if="triggerRows.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.triggerMissing') }}
            </p>
            <el-button
              v-else
              type="primary"
              data-testid="snapshot-trigger-open"
              @click="triggerDialogVisible = true"
            >
              {{ t('common.view') }}
            </el-button>
          </div>
        </section>

        <section class="snapshot-section snapshot-settings__card">
          <div class="snapshot-section__head">
            <div>
              <h3>{{ sectionLabel('eventListeners') }}</h3>
            </div>
          </div>
          <p v-if="listenerRows.length === 0" class="snapshot-empty">
            {{ t('form.snapshotViewer.noData') }}
          </p>
          <table v-else class="snapshot-table snapshot-listener-table">
            <thead>
              <tr>
                <th>{{ t('form.snapshotViewer.listenerName') }}</th>
                <th>{{ t('form.snapshotViewer.listenerTiming') }}</th>
                <th>{{ t('form.snapshotViewer.listenerStatus') }}</th>
                <th class="snapshot-listener-table__action">
                  {{ t('form.snapshotViewer.listenerAction') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in listenerRows" :key="row.key">
                <td>{{ row.name }}</td>
                <td>{{ row.timing }}</td>
                <td>{{ row.enabled }}</td>
                <td class="snapshot-listener-table__action">
                  <el-button link type="primary" size="small" @click="row.view()">
                    {{ t('common.view') }}
                  </el-button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>

      <section
        v-else-if="settingsBranch === 'variables'"
        class="snapshot-section snapshot-settings__card"
      >
        <div class="snapshot-section__head">
          <div>
            <h3>{{ sectionLabel('variables') }}</h3>
          </div>
        </div>
        <p v-if="variables.length === 0" class="snapshot-empty">
          {{ t('form.snapshotViewer.noData') }}
        </p>
        <table v-else class="snapshot-table">
          <thead>
            <tr>
              <th>{{ t('form.snapshotViewer.version') }}</th>
              <th>{{ t('form.snapshotViewer.variableId') }}</th>
              <th>{{ t('form.snapshotViewer.label') }}</th>
              <th>{{ t('form.snapshotViewer.type') }}</th>
              <th>{{ t('form.snapshotViewer.source') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in variables"
              :key="`${row.processKey}:${row.graphVersion}:${row.variable.varId}`"
            >
              <td>{{ row.processName }} · v{{ row.graphVersion }}</td>
              <td>
                <code>{{ row.variable.varId }}</code>
              </td>
              <td>{{ row.variable.name }}</td>
              <td>{{ row.variable.type }}</td>
              <td>{{ row.variable.source }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-else class="snapshot-section snapshot-settings__card">
        <div class="snapshot-section__head">
          <div>
            <h3>{{ sectionLabel('approvalScripts') }}</h3>
          </div>
        </div>
        <p v-if="approvalScripts.length === 0" class="snapshot-empty">
          {{ t('form.snapshotViewer.noData') }}
        </p>
        <template v-else>
          <article v-for="row in approvalScripts" :key="row.key" class="snapshot-code-card">
            <header>
              <strong>{{ row.label }}</strong
              ><span>{{ scriptKindLabel(row.kind) }}</span
              ><span>{{ row.nodeKey || '—' }}</span
              ><span v-if="row.event">{{ eventLabel(row.event) }}</span
              ><span v-if="row.enabled != null">{{
                row.enabled ? t('form.snapshotViewer.enabled') : t('form.snapshotViewer.disabled')
              }}</span>
              <el-button
                link
                type="primary"
                size="small"
                data-testid="approval-script-view"
                @click="emit('open-approval-script', row)"
              >
                {{ t('common.view') }}
              </el-button>
            </header>
            <pre>{{ row.code }}</pre>
          </article>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.snapshot-settings {
  box-sizing: border-box;
  display: flex;
  gap: 24px;
  background: var(--sw-surface-page, #f4f6fb);
}
.snapshot-settings__nav {
  flex: 0 0 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.snapshot-settings__nav button {
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  color: #303133;
  text-align: left;
  cursor: pointer;
}
.snapshot-settings__nav button.is-active {
  background: var(--sw-color-primary-soft, #eff6ff);
  color: var(--sw-color-primary);
  font-weight: 500;
}
/* 审查27 S14-E（执行提示28）：设置内容区分两层——main 只是浅底定位容器（页面底=浅色），
   白卡由各分支 section 自身承担；内边距按 1920 实测几何落位（main x225/y98 → 卡 x244/y120）。 */
.snapshot-settings__main {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  align-self: flex-start;
  padding: 22px 23px 24px 19px;
}
.snapshot-settings__card {
  box-sizing: border-box;
  padding: 24px;
  border-radius: var(--sw-radius-base, 8px);
  background: var(--sw-surface-card, #fff);
}
/* 通知分支白卡固定 1160 宽（505:23296）；空态按真实配置自然增高 */
.snapshot-settings__card--notify {
  width: 1160px;
  max-width: 100%;
}
/* 冻结事件监听表头 36 高（border-box，含 1px 底边；505:23398）；
   行高不动，保持真实行步长 65 与 12 条记录。 */
.snapshot-listener-table th {
  box-sizing: border-box;
  height: 36px;
  padding-top: 8px;
  padding-bottom: 8px;
}
.snapshot-listener-table td {
  height: 46px;
}
.snapshot-listener-table__action {
  width: 88px;
}

/* Q28（509:19394）：触发器内容宿主到 1100 遮罩只读窗；页内仅保留入口卡片。 */
.snapshot-settings__card--triggers {
  max-width: 100%;
}

.snapshot-trigger-entry {
  display: flex;
  align-items: center;
  gap: 12px;
}

.snapshot-props-surface {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 22px;
}

.snapshot-props-surface__group {
  display: flex;
  flex-direction: column;
}

.snapshot-props-surface__label {
  display: block;
  margin-bottom: 6px;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}

.snapshot-props-surface__input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 32px;
  padding: 0 11px;
  border: 1px solid #dde3ef;
  border-radius: 4px;
  background: #fff;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 30px;
  font-family: inherit;
}

.snapshot-props-surface__input[readonly] {
  cursor: default;
}

.snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

.snapshot-section + .snapshot-section {
  margin-top: var(--sw-space-24);
}

.snapshot-section__head h3 {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
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

.snapshot-table code,
.snapshot-rule code {
  color: var(--sw-color-primary);
  font-family: var(--el-font-family-mono, monospace);
}

.snapshot-code-card,
.snapshot-rule {
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  overflow: hidden;
}

.snapshot-code-card header,
.snapshot-rule header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--sw-fill-base);
}

.snapshot-code-card header span,
.snapshot-rule header span {
  color: var(--sw-text-secondary);
  font-size: 11px;
}

.snapshot-code-card pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--sw-text-primary);
  font: 12px/1.65 var(--el-font-family-mono, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--sw-surface-page);
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
