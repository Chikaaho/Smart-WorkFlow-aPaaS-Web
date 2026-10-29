<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * HistoryVersionsDialog — 草稿历史版本（P52 工作台 · P53 节点14 重构）。
 *
 * 设计结构：当前草稿头 + 版本卡片列表（当前草稿/历史草稿/已发布徽标）+ 选中摘要
 * + 「对比当前 / 恢复此草稿」。
 *
 * 契约（方向 §3.3）：
 *   - 列表数据 = 服务端快照（formVersion + createTime + 可选 status/author/note 元数据）；
 *   - 对比当前 = 只读预览选中版本（PreviewModal，带历史标识）；
 *   - 恢复此草稿 = 以快照 definition 保存为**新的草稿**（saveDraftDefinition 既有契约），
 *     不覆盖已发布版本；恢复后由宿主重新加载工作台。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listFormSnapshots,
  getFormSnapshotDefinition,
  type FormDefStatus,
  type FormSnapshotDTO,
} from '../api/form-def'
import { saveDraftDefinition } from './draft-actions'
import { getFormDefinition } from '../api/form'
import { buildSnapshotScripts, type SnapshotScriptView } from './published-snapshot'
import { parseDefinition } from '@/adapters/form-designer'
import type { FormSchema } from '@/contracts/form-schema'
import PreviewModal from './PreviewModal.vue'
import PublishedSnapshotViewer from './PublishedSnapshotViewer.vue'

const props = defineProps<{
  formId: string
  formKey: string
  formVersion?: number | null
  formVersionLabel?: string | null
  formStatus?: FormDefStatus
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ restored: [] }>()

const snapshots = ref<FormSnapshotDTO[]>([])
const loading = ref(false)
const selectedVersion = ref<number | null>(null)
const fullSnapshotVisible = ref(false)
const fullSnapshotRow = ref<FormSnapshotDTO | null>(null)

/* ── 只读对比预览（历史版本标识经 PreviewModal badge 呈现） ── */
const previewVisible = ref(false)
const previewSchema = ref<FormSchema | null>(null)
const previewVersion = ref<number | null>(null)

async function loadSnapshots() {
  loading.value = true
  try {
    snapshots.value = await listFormSnapshots(props.formId)
    selectedVersion.value =
      snapshots.value[1]?.formVersion ?? snapshots.value[0]?.formVersion ?? null
  } catch {
    ElMessage.error(t('form.historyLoadFailed'))
  } finally {
    loading.value = false
  }
}

watch(
  visible,
  (open) => {
    if (open) {
      snapshots.value = []
      previewVisible.value = false
      previewSchema.value = null
      previewVersion.value = null
      selectedVersion.value = null
      loadSnapshots()
    }
  },
  { immediate: true },
)

/** 快照时间展示：截到分钟（后端携带秒，设计/产品口径为分钟粒度）。 */
function formatTime(value: string): string {
  if (typeof value !== 'string') return ''
  const normalized = value.replace('T', ' ')
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized
}

function eventLabel(event: string | undefined): string {
  if (!event) return '—'
  return t(`form.snapshotViewer.event.${event}`, event)
}

const currentVersionText = computed(() => props.formVersionLabel ?? props.formVersion ?? 1)
const currentFormStatus = computed<FormDefStatus>(() => props.formStatus ?? 'DRAFT')
const currentVersionHeader = computed(() =>
  currentFormStatus.value === 'DRAFT'
    ? t('form.currentDraftHeader', { version: currentVersionText.value })
    : t('form.currentVersionHeader', { version: currentVersionText.value }),
)
const currentVersionBadge = computed(() => {
  if (currentFormStatus.value === 'PUBLISHED') return t('form.publishedBadge')
  if (currentFormStatus.value === 'DISABLED') return t('form.disabledBadge')
  return t('form.unpublishedBadge')
})
const currentVersionBadgeClass = computed(() => {
  if (currentFormStatus.value === 'PUBLISHED') return 'history-card__badge--published'
  if (currentFormStatus.value === 'DISABLED') return 'history-card__badge--disabled'
  return 'history-card__badge--draft'
})

/** 服务端快照只在 publish/publishNewVersion 时插入；缺省 status 即历史已发布版本。 */
function badgeOf(row: FormSnapshotDTO, index: number): string {
  if (row.status === 'DRAFT' && index === 0) return t('form.currentDraftBadge')
  if (row.status === 'DRAFT') return t('form.historyDraftBadge')
  return t('form.publishedSnapshotBadge', { version: row.versionLabel ?? row.formVersion })
}

function badgeClass(row: FormSnapshotDTO, index: number): string {
  if (row.status === 'DRAFT' && index === 0) return 'history-card__badge--current'
  if (row.status === 'DRAFT') return 'history-card__badge--draft'
  return 'history-card__badge--published'
}

async function openCompare() {
  if (selectedVersion.value == null) return
  try {
    const detail = await getFormSnapshotDefinition(props.formId, selectedVersion.value)
    previewSchema.value = parseDefinition(detail.definition)
    previewVersion.value = selectedVersion.value
    previewVisible.value = true
  } catch {
    ElMessage.error(t('form.historyReadFailed'))
  }
}

/** 新旧脚本并列（A12）：历史快照与当前已保存定义各自解析，分别列出自身脚本。 */
const scriptCompareVisible = ref(false)
const scriptCompareLoading = ref(false)
const oldScripts = ref<SnapshotScriptView[]>([])
const newScripts = ref<SnapshotScriptView[]>([])
const scriptCompareVersion = ref<number | null>(null)

async function openScriptCompare() {
  if (selectedVersion.value == null) return
  scriptCompareLoading.value = true
  try {
    const [detail, current] = await Promise.all([
      getFormSnapshotDefinition(props.formId, selectedVersion.value),
      getFormDefinition(props.formKey),
    ])
    oldScripts.value = buildSnapshotScripts(parseDefinition(detail.definition), [])
    newScripts.value = buildSnapshotScripts(current, [])
    scriptCompareVersion.value = selectedVersion.value
    scriptCompareVisible.value = true
  } catch {
    ElMessage.error(t('form.historyReadFailed'))
  } finally {
    scriptCompareLoading.value = false
  }
}

function openFullSnapshot() {
  const selected = snapshots.value.find((row) => row.formVersion === selectedVersion.value)
  if (!selected) return
  fullSnapshotRow.value = selected
  fullSnapshotVisible.value = true
}

/** 恢复此草稿：以快照 definition 保存为新草稿（不覆盖已发布版本），宿主随后重载。 */
async function restoreSelected() {
  if (selectedVersion.value == null) return
  try {
    await ElMessageBox.confirm(t('form.restoreDraftNote'), t('form.restoreDraft'), {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    const detail = await getFormSnapshotDefinition(props.formId, selectedVersion.value)
    const schema = parseDefinition(detail.definition)
    await saveDraftDefinition(schema, props.formId, props.formKey)
    ElMessage.success(t('form.restoreDraftSuccess'))
    visible.value = false
    emit('restored')
  } catch {
    ElMessage.error(t('form.restoreDraftFailed'))
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('form.draftHistoryTitle')"
    width="1000px"
    append-to-body
    class="history-dialog"
    modal-class="p53-dialog-overlay-35"
  >
    <div class="history-dialog__current">
      <span>{{ currentVersionHeader }}</span>
      <span class="history-card__badge" :class="currentVersionBadgeClass">
        {{ currentVersionBadge }}
      </span>
    </div>

    <div v-if="loading" class="history-dialog__loading">{{ t('common.loading') }}</div>
    <div v-else-if="snapshots.length === 0" class="history-dialog__empty">
      {{ t('form.noHistoryVersions') }}
    </div>
    <!-- 审查23 S14-H：版本列表还原 1000 宽表格（34 表头 / 46 行），值绑真实快照 -->
    <table v-else class="history-table">
      <thead>
        <tr>
          <th class="history-table__version">{{ t('form.historyColVersion') }}</th>
          <th>{{ t('form.historyColTime') }}</th>
          <th>{{ t('form.historyColPublisher') }}</th>
          <th class="history-table__note">{{ t('form.historyColNote') }}</th>
          <th class="history-table__status">{{ t('form.historyColStatus') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, i) in snapshots"
          :key="row.formVersion"
          :class="{ 'is-active': row.formVersion === selectedVersion }"
          @click="selectedVersion = row.formVersion"
        >
          <td class="history-table__version">v{{ row.versionLabel ?? row.formVersion }}</td>
          <td>{{ formatTime(row.createTime) }}</td>
          <td>{{ row.author || '—' }}</td>
          <td class="history-table__note">{{ row.note || '—' }}</td>
          <td class="history-table__status">
            <span class="history-card__badge" :class="badgeClass(row, i)">{{
              badgeOf(row, i)
            }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <template #footer>
      <div class="history-dialog__footer">
        <el-button :disabled="selectedVersion == null" @click="openFullSnapshot">{{
          t('form.snapshotViewer.open')
        }}</el-button>
        <el-button :disabled="selectedVersion == null" @click="openCompare">{{
          t('form.compareCurrent')
        }}</el-button>
        <el-button
          :disabled="selectedVersion == null"
          :loading="scriptCompareLoading"
          @click="openScriptCompare"
          >{{ t('form.compareScripts') }}</el-button
        >
        <el-button
          type="primary"
          :disabled="selectedVersion == null"
          class="history-dialog__restore"
          @click="restoreSelected"
          >{{ t('form.restoreDraft') }}</el-button
        >
      </div>
    </template>

    <!-- 历史版本只读对比：明确的历史标识，关闭后回到当前草稿 -->
    <PreviewModal
      v-if="previewSchema"
      v-model:visible="previewVisible"
      :schema="previewSchema"
      :badge="t('form.historyBadge', { previewVersion })"
    />
    <PublishedSnapshotViewer
      v-if="fullSnapshotRow"
      v-model:visible="fullSnapshotVisible"
      :form-id="formId"
      :form-key="formKey"
      :snapshot="fullSnapshotRow"
    />

    <!-- 新旧脚本并列：左右各自读取快照/当前定义的脚本对象，不做合并或补全 -->
    <el-dialog
      v-model="scriptCompareVisible"
      :title="t('form.scriptCompareTitle', { version: scriptCompareVersion ?? '' })"
      width="880px"
      append-to-body
      class="script-compare-dialog"
    >
      <div class="script-compare">
        <section class="script-compare__column">
          <h4>{{ t('form.scriptCompareOld', { version: scriptCompareVersion ?? '' }) }}</h4>
          <p v-if="oldScripts.length === 0" class="script-compare__empty">
            {{ t('form.scriptCompareEmpty') }}
          </p>
          <article v-for="row in oldScripts" :key="row.key" class="script-compare__item">
            <header>
              <strong>{{ row.label }}</strong>
              <span>{{ row.event ? eventLabel(row.event) : row.source }}</span>
            </header>
            <pre>{{ row.code }}</pre>
          </article>
        </section>
        <section class="script-compare__column">
          <h4>{{ t('form.scriptCompareNew') }}</h4>
          <p v-if="newScripts.length === 0" class="script-compare__empty">
            {{ t('form.scriptCompareEmpty') }}
          </p>
          <article v-for="row in newScripts" :key="row.key" class="script-compare__item">
            <header>
              <strong>{{ row.label }}</strong>
              <span>{{ row.event ? eventLabel(row.event) : row.source }}</span>
            </header>
            <pre>{{ row.code }}</pre>
          </article>
        </section>
      </div>
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
.script-compare {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sw-space-16);
}

.script-compare__column h4 {
  margin: 0 0 var(--sw-space-8);
  font-size: var(--sw-font-secondary);
  font-weight: 600;
}

.script-compare__empty {
  margin: 0 0 var(--sw-space-8);
  color: var(--sw-text-secondary);
  font-size: 13px;
}

.script-compare__item {
  margin-bottom: var(--sw-space-12);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  overflow: hidden;
}

.script-compare__item header {
  display: flex;
  gap: var(--sw-space-8);
  align-items: center;
  padding: 8px 12px;
  background: var(--sw-fill-base);
  font-size: 13px;
}

.script-compare__item pre {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.history-dialog__loading,
.history-dialog__empty {
  padding: var(--sw-space-24) 0;
  text-align: center;
  font-size: 13px;
  color: var(--sw-text-secondary);
}

/* 当前草稿头 */
.history-dialog__current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 14px;
  min-height: 24px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

/* 版本卡片列表 */
.history-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid #ebeef5;
}
.history-table th {
  height: 40px;
  box-sizing: border-box;
  padding: 0 12px;
  background: #f4f6fb;
  color: #606266;
  font-size: 13px;
  font-weight: 400;
  line-height: 22px;
  text-align: left;
  white-space: nowrap;
}
.history-table td {
  height: 49px;
  box-sizing: border-box;
  padding: 0 12px;
  border-top: 1px solid #ebeef5;
  color: #303133;
  font-size: 13px;
  line-height: 22px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.history-table tbody tr.is-active td {
  background: var(--sw-color-primary-soft, #eff6ff);
}
.history-table__version {
  width: 120px;
}
.history-table__note {
  width: auto;
}
.history-table__status {
  width: 150px;
}

.history-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-height: 72px;
  box-sizing: border-box;
  padding: 14px 16px;
  text-align: left;
  background: #fff;
  border: 1px solid #e0e6f2;
  border-radius: 10px;
  cursor: pointer;
}

.history-card--active,
.history-card:hover {
  border-color: var(--sw-color-primary);
}

.history-card--active {
  background: var(--sw-color-primary-softer);
  box-shadow: 0 0 0 2px var(--sw-color-primary-soft);
}

.history-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.history-card__time {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

.history-card__badge {
  flex: none;
  min-width: 72px;
  height: 24px;
  box-sizing: border-box;
  padding: 0 10px;
  font-size: 12px;
  line-height: 24px;
  text-align: center;
  border-radius: 6px;
  white-space: nowrap;
}

.history-dialog__current .history-card__badge {
  min-width: 64px;
  height: 24px;
  padding: 0 10px;
  line-height: 24px;
}

.history-card__badge--current {
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
}

.history-card__badge--draft {
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
}

.history-card__badge--published {
  color: #15a77f;
  background: #e6f8f2;
}

.history-card__badge--disabled {
  color: var(--sw-text-secondary);
  background: var(--sw-fill-base);
}

.history-card__meta {
  font-size: 12px;
  line-height: 18px;
  color: #8a96ad;
}

.history-card__note {
  font-size: 13px;
  line-height: 20px;
  color: var(--sw-text-regular);
}

.history-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.history-dialog__footer :deep(.el-button) {
  min-width: 112px;
  margin: 0;
}

.history-dialog__restore {
  min-width: 110px;
}
</style>
