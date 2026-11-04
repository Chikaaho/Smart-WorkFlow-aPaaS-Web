<script setup lang="ts">
/* global Event, HTMLInputElement */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  listModelOptions,
  pageKnowledgeBases,
  retrieveKnowledge,
  uploadKnowledgeDocument,
} from '@/modules/agent/api'
import type {
  AgentModelConfigOption,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeHit,
} from '@/contracts/agent'
import { ApiError } from '@/foundation/request'

const { t } = useI18n()
/**
 * F1 阶段 3 知识库管理：新建知识库（绑定 EMBEDDING 模型 + 切分参数）、
 * 上传/删除文档、查看处理状态与分片数、检索测试。
 */
const loading = ref(false)
const error = ref('')
const knowledgeBases = ref<KnowledgeBase[]>([])
const embeddingModels = ref<AgentModelConfigOption[]>([])
const selected = ref<KnowledgeBase | null>(null)
const documents = ref<KnowledgeDocument[]>([])
const docsLoading = ref(false)

const createVisible = ref(false)
const creating = ref(false)
const createForm = ref({
  name: '',
  description: '',
  embeddingModelId: null as number | string | null,
  chunkSize: 800,
  chunkOverlap: 100,
})

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

const query = ref('')
const topK = ref(5)
const threshold = ref(0)
const retrieving = ref(false)
const hits = ref<KnowledgeHit[]>([])

const total = ref(0)

const selectedModelName = computed(() => {
  if (!selected.value) return '-'
  const model = embeddingModels.value.find(
    (m) => String(m.id) === String(selected.value?.embeddingModelId),
  )
  return model?.name ?? String(selected.value.embeddingModelId)
})

function formatTime(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: t('agent.knowledgeStatusPending'),
    PROCESSING: t('agent.knowledgeStatusProcessing'),
    READY: t('agent.knowledgeStatusReady'),
    FAILED: t('agent.knowledgeStatusFailed'),
  }
  return map[status] ?? status
}

function statusType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'READY') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'PROCESSING') return 'warning'
  return 'info'
}

async function loadKnowledgeBases() {
  loading.value = true
  error.value = ''
  try {
    const page = await pageKnowledgeBases({ pageNum: 1, pageSize: 100 })
    knowledgeBases.value = page.list
    total.value = page.total
    if (selected.value) {
      selected.value =
        knowledgeBases.value.find((kb) => String(kb.id) === String(selected.value?.id)) ?? null
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.msg : t('agent.knowledgeLoadFailed')
  } finally {
    loading.value = false
  }
}

async function loadEmbeddingModels() {
  try {
    embeddingModels.value = await listModelOptions('EMBEDDING')
  } catch {
    embeddingModels.value = []
  }
}

async function selectKnowledgeBase(kb: KnowledgeBase) {
  selected.value = kb
  hits.value = []
  query.value = ''
  await loadDocuments()
}

function onSelectRow(row: unknown) {
  void selectKnowledgeBase(row as KnowledgeBase)
}

function onDeleteRow(row: unknown) {
  void handleDelete(row as KnowledgeBase)
}

function onDeleteDocumentRow(row: unknown) {
  void handleDeleteDocument(row as KnowledgeDocument)
}

async function loadDocuments() {
  if (!selected.value) {
    documents.value = []
    return
  }
  docsLoading.value = true
  try {
    documents.value = await listKnowledgeDocuments(selected.value.id)
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('agent.knowledgeLoadFailed'))
  } finally {
    docsLoading.value = false
  }
}

function openCreate() {
  createForm.value = {
    name: '',
    description: '',
    embeddingModelId: embeddingModels.value[0]?.id ?? null,
    chunkSize: 800,
    chunkOverlap: 100,
  }
  createVisible.value = true
}

async function submitCreate() {
  const form = createForm.value
  if (!form.name.trim() || form.embeddingModelId === null) {
    ElMessage.warning(t('agent.knowledgeCreateRequired'))
    return
  }
  creating.value = true
  try {
    const created = await createKnowledgeBase({
      name: form.name.trim(),
      description: form.description,
      embeddingModelId: form.embeddingModelId,
      chunkSize: Number(form.chunkSize),
      chunkOverlap: Number(form.chunkOverlap),
    })
    ElMessage.success(t('agent.knowledgeCreateSuccess'))
    createVisible.value = false
    await loadKnowledgeBases()
    await selectKnowledgeBase(created)
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('agent.knowledgeCreateFailed'))
  } finally {
    creating.value = false
  }
}

async function handleDelete(kb: KnowledgeBase) {
  try {
    await ElMessageBox.confirm(t('agent.knowledgeDeleteConfirm'), t('agent.knowledgeDelete'), {
      type: 'warning',
    })
    await deleteKnowledgeBase(kb.id)
    ElMessage.success(t('agent.knowledgeDeleteSuccess'))
    if (String(selected.value?.id) === String(kb.id)) {
      selected.value = null
      documents.value = []
      hits.value = []
    }
    await loadKnowledgeBases()
  } catch (err) {
    if (err && err !== 'cancel') {
      ElMessage.error(err instanceof ApiError ? err.msg : t('agent.knowledgeDeleteFailed'))
    }
  }
}

function chooseFile() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !selected.value) return
  uploading.value = true
  try {
    await uploadKnowledgeDocument(selected.value.id, file)
    ElMessage.success(t('agent.knowledgeUploadSuccess'))
    await loadDocuments()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('agent.knowledgeUploadFailed'))
    await loadDocuments()
  } finally {
    uploading.value = false
  }
}

async function handleDeleteDocument(doc: KnowledgeDocument) {
  if (!selected.value) return
  try {
    await ElMessageBox.confirm(t('agent.knowledgeDeleteConfirm'), t('agent.knowledgeDocuments'), {
      type: 'warning',
    })
    await deleteKnowledgeDocument(selected.value.id, doc.id)
    await loadDocuments()
  } catch (err) {
    if (err && err !== 'cancel') {
      ElMessage.error(err instanceof ApiError ? err.msg : t('agent.knowledgeDeleteFailed'))
    }
  }
}

async function runRetrieval() {
  if (!selected.value || !query.value.trim()) return
  retrieving.value = true
  try {
    hits.value = await retrieveKnowledge(selected.value.id, {
      query: query.value.trim(),
      topK: Number(topK.value),
      similarityThreshold: Number(threshold.value),
    })
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('agent.knowledgeRetrieveFailed'))
    hits.value = []
  } finally {
    retrieving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadKnowledgeBases(), loadEmbeddingModels()])
})
</script>

<template>
  <div class="knowledge-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ t('agent.knowledgeTitle') }}</h2>
        <p class="page-subtitle">{{ t('agent.knowledgeSubtitle') }}</p>
      </div>
      <el-button type="primary" @click="openCreate">{{ t('agent.knowledgeCreate') }}</el-button>
    </div>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />

    <el-card v-loading="loading" shadow="never" class="section-card">
      <template #header>
        <div class="section-title">
          {{ t('agent.knowledgeTitle') }}
          <span class="muted">（{{ total }}）</span>
        </div>
      </template>
      <el-table :data="knowledgeBases" empty-text="-">
        <el-table-column prop="name" :label="t('agent.knowledgeName')" min-width="160" />
        <el-table-column :label="t('agent.knowledgeEmbeddingModel')" min-width="160">
          <template #default="{ row }">
            {{
              embeddingModels.find((m) => String(m.id) === String(row.embeddingModelId))?.name ??
              row.embeddingModelId
            }}
          </template>
        </el-table-column>
        <el-table-column prop="chunkSize" :label="t('agent.knowledgeChunkSize')" width="120" />
        <el-table-column
          prop="chunkOverlap"
          :label="t('agent.knowledgeChunkOverlap')"
          width="120"
        />
        <el-table-column :label="t('agent.createTimeLabel')" width="180">
          <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="onSelectRow(row)">
              {{ t('agent.knowledgeDocuments') }}
            </el-button>
            <el-button link type="danger" @click="onDeleteRow(row)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-empty v-if="!selected" :description="t('agent.knowledgeSelectKb')" />

    <template v-else>
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="section-title-row">
            <div class="section-title">
              {{ selected.name }}
              <span class="muted">· {{ selectedModelName }}</span>
            </div>
            <div class="upload-actions">
              <span class="muted">{{ t('agent.knowledgeUploadHint') }}</span>
              <el-button :loading="uploading" @click="chooseFile">
                {{ t('agent.knowledgeUpload') }}
              </el-button>
              <input
                ref="fileInput"
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.markdown"
                class="hidden-file"
                @change="onFileSelected"
              />
            </div>
          </div>
        </template>
        <el-table
          v-loading="docsLoading"
          :data="documents"
          :empty-text="t('agent.knowledgeNoDocuments')"
        >
          <el-table-column prop="name" :label="t('common.name')" min-width="220" />
          <el-table-column :label="t('agent.knowledgeStatus')" width="120">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            prop="chunkCount"
            :label="t('agent.knowledgeChunkCount')"
            width="110"
            align="right"
          />
          <el-table-column :label="t('agent.createTimeLabel')" width="180">
            <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="100" fixed="right">
            <template #default="{ row }">
              <el-button link type="danger" @click="onDeleteDocumentRow(row)">
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="section-title">{{ t('agent.knowledgeRetrievalTest') }}</div>
        </template>
        <div class="retrieval-form">
          <el-input
            v-model="query"
            :placeholder="t('agent.knowledgeQueryPlaceholder')"
            style="flex: 1"
            @keyup.enter="runRetrieval"
          />
          <el-input-number v-model="topK" :min="1" :max="20" :label="t('agent.knowledgeTopK')" />
          <el-input-number
            v-model="threshold"
            :min="0"
            :max="1"
            :step="0.05"
            :precision="2"
            :label="t('agent.knowledgeThreshold')"
          />
          <el-button type="primary" :loading="retrieving" @click="runRetrieval">
            {{ t('agent.knowledgeRetrieve') }}
          </el-button>
        </div>
        <el-empty v-if="hits.length === 0" :description="t('agent.knowledgeNoHits')" />
        <div v-else class="hit-list">
          <div v-for="hit in hits" :key="hit.chunkId" class="hit-item">
            <div class="hit-head">
              <span class="hit-doc">{{ hit.documentName || '-' }}</span>
              <span class="hit-meta">
                #{{ hit.chunkIndex }} · {{ t('agent.knowledgeSimilarity') }}
                {{ (hit.similarity * 100).toFixed(1) }}%
              </span>
            </div>
            <pre class="hit-content">{{ hit.content }}</pre>
          </div>
        </div>
      </el-card>
    </template>

    <el-dialog v-model="createVisible" :title="t('agent.knowledgeCreate')" width="520px">
      <el-form label-width="120px">
        <el-form-item :label="t('agent.knowledgeName')" required>
          <el-input v-model="createForm.name" maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('agent.knowledgeDescription')">
          <el-input v-model="createForm.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-form-item :label="t('agent.knowledgeEmbeddingModel')" required>
          <el-select v-model="createForm.embeddingModelId" style="width: 100%">
            <el-option
              v-for="model in embeddingModels"
              :key="model.id"
              :label="model.name"
              :value="model.id"
            />
          </el-select>
          <div v-if="embeddingModels.length === 0" class="muted model-empty">
            {{ t('agent.knowledgeNoEmbeddingModel') }}
          </div>
        </el-form-item>
        <el-form-item :label="t('agent.knowledgeChunkSize')">
          <el-input-number v-model="createForm.chunkSize" :min="100" :max="4000" :step="100" />
        </el-form-item>
        <el-form-item :label="t('agent.knowledgeChunkOverlap')">
          <el-input-number v-model="createForm.chunkOverlap" :min="0" :max="3999" :step="50" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.knowledge-page {
  padding: var(--sw-space-24);
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--sw-space-20);
}

.page-title {
  margin: 0;
  font-size: 20px;
  color: var(--sw-text-primary);
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: #909399;
}

.section-card {
  margin-bottom: var(--sw-space-16);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.muted {
  color: #909399;
  font-size: 12px;
  font-weight: 400;
}

.upload-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hidden-file {
  display: none;
}

.retrieval-form {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.hit-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hit-item {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px;
  background: #fafafa;
}

.hit-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
}

.hit-doc {
  font-weight: 600;
  color: var(--sw-text-primary);
}

.hit-meta {
  color: #909399;
}

.hit-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
}

.model-empty {
  margin-top: 6px;
}
</style>
