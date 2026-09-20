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
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listFormSnapshots,
  getFormSnapshotDefinition,
  type FormSnapshotDTO,
} from '../api/form-def'
import { saveDraftDefinition } from './draft-actions'
import { parseDefinition } from '@/adapters/form-designer'
import type { FormSchema } from '@/contracts/form-schema'
import PreviewModal from './PreviewModal.vue'

const props = defineProps<{
  formId: string
  formKey: string
  formVersion?: number | null
  formVersionLabel?: string | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ restored: [] }>()

const snapshots = ref<FormSnapshotDTO[]>([])
const loading = ref(false)
const selectedVersion = ref<number | null>(null)
const selectedSnapshot = computed(
  () => snapshots.value.find((r) => r.formVersion === selectedVersion.value) ?? null,
)

/* ── 只读对比预览（历史版本标识经 PreviewModal badge 呈现） ── */
const previewVisible = ref(false)
const previewSchema = ref<FormSchema | null>(null)
const previewVersion = ref<number | null>(null)

async function loadSnapshots() {
  loading.value = true
  try {
    snapshots.value = await listFormSnapshots(props.formId)
    selectedVersion.value = snapshots.value[1]?.formVersion ?? snapshots.value[0]?.formVersion ?? null
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
  return typeof value === 'string' && value.length >= 16 ? value.slice(0, 16) : value
}

/** 徽标：已发布快照显示版本，首条草稿=当前草稿，其余=历史草稿。 */
function badgeOf(row: FormSnapshotDTO, index: number): string {
  if (row.status === 'PUBLISHED') {
    return t('form.publishedSnapshotBadge', { version: row.versionLabel ?? row.formVersion })
  }
  if (row.status === 'DRAFT' && index === 0) return t('form.currentDraftBadge')
  return t('form.historyDraftBadge')
}

function badgeClass(row: FormSnapshotDTO, index: number): string {
  if (row.status === 'PUBLISHED') return 'history-card__badge--published'
  if (row.status === 'DRAFT' && index === 0) return 'history-card__badge--current'
  return 'history-card__badge--draft'
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
    width="538px"
    append-to-body
    class="history-dialog"
    modal-class="p53-dialog-overlay-35"
  >
    <p class="history-dialog__hint">
      {{ t('form.draftHistorySubtitle') }}
    </p>

    <div class="history-dialog__current">
      <span>{{
        t('form.currentDraftHeader', {
          version: props.formVersionLabel ?? props.formVersion ?? 1,
        })
      }}</span>
      <span class="history-card__badge history-card__badge--draft">{{
        t('form.unpublishedBadge')
      }}</span>
    </div>

    <div v-if="loading" class="history-dialog__loading">{{ t('common.loading') }}</div>
    <div v-else-if="snapshots.length === 0" class="history-dialog__empty">
      {{ t('form.noHistoryVersions') }}
    </div>
    <div v-else class="history-dialog__list">
      <button
        v-for="(row, i) in snapshots"
        :key="row.formVersion"
        type="button"
        class="history-card"
        :class="{ 'history-card--active': row.formVersion === selectedVersion }"
        @click="selectedVersion = row.formVersion"
      >
        <span class="history-card__head">
          <b class="history-card__time">{{ formatTime(row.createTime) }}</b>
          <span class="history-card__badge" :class="badgeClass(row, i)">{{
            badgeOf(row, i)
          }}</span>
        </span>
        <span v-if="row.author" class="history-card__meta">{{
          t('form.snapshotAuthorScope', { author: row.author })
        }}</span>
        <span v-if="row.note" class="history-card__note">{{ row.note }}</span>
      </button>
    </div>

    <div v-if="selectedSnapshot" class="history-dialog__summary">
      <p class="history-dialog__summary-time">
        {{ t('form.selectedSnapshotPrefix', { time: selectedSnapshot.createTime }) }}
      </p>
      <p class="history-dialog__summary-note">{{ t('form.restoreDraftNote') }}</p>
    </div>

    <template #footer>
      <div class="history-dialog__footer">
        <el-button :disabled="selectedVersion == null" @click="openCompare"
          >{{ t('form.compareCurrent') }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</el-button
        >
        <el-button
          type="primary"
          :disabled="selectedVersion == null"
          class="history-dialog__restore"
          @click="restoreSelected"
          >&nbsp;&nbsp;{{ t('form.restoreDraft') }}&nbsp;&nbsp;</el-button
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
  </el-dialog>
</template>

<style scoped>
.history-dialog__hint {
  /* 设计（节点14）：header 区节奏 168（弹窗顶→卡1顶） */
  margin: 6px 0 20px;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
  transform: translateY(-25px);
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
  margin: 0 0 22px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-text-primary);
  transform: translateY(-4px);
}

/* 版本卡片列表 */
.history-dialog__list {
  display: flex;
  flex-direction: column;
  /* 设计（节点14）：卡节距 124（卡高 107 + 间隙 17） */
  gap: 16px;
}

.history-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  /* 锁定稿卡框 108px 高；内容行仍落在 y277/401/525/649。 */
  padding: 12px 14px 20px;
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
  background: #fbf8ff;
  box-shadow: 0 0 0 2px var(--sw-color-primary-soft, #ece9ff);
}

.history-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-card__time {
  font-size: 14px;
  line-height: 19px;
  color: var(--sw-text-primary);
}

.history-card__badge {
  width: 106px;
  height: 24px;
  box-sizing: border-box;
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 6px;
  line-height: 20px;
  white-space: nowrap;
}

.history-dialog__current .history-card__badge {
  width: 82px;
  padding: 4px 9px;
  line-height: 16px;
}

.history-card__badge--current {
  color: #6f2dff;
  background: #eee7ff;
}

.history-card__badge--draft {
  color: #6f2dff;
  background: #f0eaff;
}

.history-card__badge--published {
  color: #15a77f;
  background: #e6f8f2;
}

.history-card__meta {
  font-size: 12px;
  color: #8a96ad;
  transform: translateY(2px);
}

.history-card__note {
  font-size: 13px;
  color: var(--sw-text-regular);
  transform: translateY(1px);
}

/* 选中摘要 */
.history-dialog__summary {
  /* 设计（节点14）：summary 卡位于卡区下方 24px，高 73 */
  margin-top: 25px;
  min-height: 73px;
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid #e0e6f2;
  border-radius: 10px;
  background: #fff;
}

.history-dialog__summary-time {
  margin: 0 0 11px;
  font-size: 13px;
  color: var(--sw-text-primary);
}

.history-dialog__summary-note {
  margin: 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}

.history-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.history-dialog__restore {
  min-width: 110px;
}
</style>
