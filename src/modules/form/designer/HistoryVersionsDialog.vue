<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * HistoryVersionsDialog — 历史发布版本（P52 工作台）。
 *
 * 只读契约（方向 §3.3）：
 *   - 列表展示版本号 + 发布时间，版本号倒序，草稿不会混入（数据源仅发布快照）；
 *   - 预览为只读，带明确「历史版本」标识（PreviewModal badge）；
 *   - 关闭预览返回列表，历史内容绝不写回当前草稿（本组件零回写路径）。
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { listFormSnapshots, getFormSnapshotDefinition, type FormSnapshotDTO } from '../api/form-def'
import { parseDefinition } from '@/adapters/form-designer'
import type { FormSchema } from '@/contracts/form-schema'
import PreviewModal from './PreviewModal.vue'

const props = defineProps<{ formId: string; formKey: string }>()
const visible = defineModel<boolean>('visible', { required: true })

const snapshots = ref<FormSnapshotDTO[]>([])
const loading = ref(false)

/* ── 只读预览（历史版本标识经 PreviewModal badge 呈现） ── */
const previewVisible = ref(false)
const previewSchema = ref<FormSchema | null>(null)
const previewVersion = ref<number | null>(null)

async function loadSnapshots() {
  loading.value = true
  try {
    snapshots.value = await listFormSnapshots(props.formId)
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
      loadSnapshots()
    }
  },
  { immediate: true },
)

async function openPreview(version: number) {
  try {
    const detail = await getFormSnapshotDefinition(props.formId, version)
    previewSchema.value = parseDefinition(detail.definition)
    previewVersion.value = version
    previewVisible.value = true
  } catch {
    ElMessage.error(t('form.historyReadFailed'))
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('form.versionHistory')"
    width="640px"
    append-to-body
    class="history-dialog"
  >
    <p class="history-dialog__hint">
      {{ t('form.historyPreviewNote') }}
    </p>

    <div v-if="loading" class="history-dialog__loading">{{ t('common.loading') }}</div>
    <div v-else-if="snapshots.length === 0" class="history-dialog__empty">
      {{ t('form.noHistoryVersions') }}
    </div>
    <el-table v-else :data="snapshots" size="default">
      <el-table-column :label="t('form.versionNumber')" width="120">
        <template #default="{ row }">
          <el-tag size="small" type="info">V{{ row.formVersion }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('form.publishStatus')" width="120">
        <template #default>{{ t('common.statusPublished') }}</template>
      </el-table-column>
      <el-table-column prop="createTime" :label="t('form.publishTime')" />
      <el-table-column :label="t('common.actions')" width="120" align="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openPreview(row.formVersion)">{{
            t('form.readonlyPreview')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 历史版本只读预览：明确的历史标识，关闭后回到当前草稿 -->
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
  margin: 0 0 var(--sw-space-12);
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}

.history-dialog__loading,
.history-dialog__empty {
  padding: var(--sw-space-24) 0;
  text-align: center;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}
</style>
